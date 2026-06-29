import { Router, Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";
import { getRequiredUserId, requireAuth } from "../middleware/auth";
import { buildLastMonthKeys, formatDateOnlyUs, formatMonthKeyFromDateOnly } from "../utils/dateFormat";
import { normalizeTimeZone } from "../utils/timeZone";

const router = Router();

router.use(requireAuth);

function getCurrentTimeZone(res: Response): string {
    const currentUser = res.locals.currentUser as { timeZone?: string } | null | undefined;

    return normalizeTimeZone(currentUser && currentUser.timeZone ? currentUser.timeZone : "America/Los_Angeles");
}


function toNumber(value: unknown): number {
    if (value === null || typeof value === "undefined") {
        return 0;
    }

    if (typeof value === "number") {
        return value;
    }

    return Number(value);
}

function round(value: number, decimals: number): number {
    const multiplier = Math.pow(10, decimals);
    return Math.round(value * multiplier) / multiplier;
}

function formatMonthLabel(monthKey: string): string {
    const parts = monthKey.split("-");
    const year = Number(parts[0]);
    const monthIndex = Number(parts[1]) - 1;
    const date = new Date(Date.UTC(year, monthIndex, 1));

    return date.toLocaleString("default", {
        month: "short",
        year: "numeric",
        timeZone: "UTC"
    });
}


router.get("/", async function (req: Request, res: Response, next: NextFunction) {
    try {
        const userId = getRequiredUserId(req);
        const timeZone = getCurrentTimeZone(res);

        const [
            totalBeans,
            activeBeans,
            totalBrews,
            brewSessions,
            allBeans,
            allGrinders,
            allBrewers
        ] = await Promise.all([
            prisma.coffeeBean.count({
                where: {
                    userId: userId
                }
            }),

            prisma.coffeeBean.count({
                where: {
                    userId: userId,
                    isActive: true
                }
            }),

            prisma.brewSession.count({
                where: {
                    userId: userId
                }
            }),

            prisma.brewSession.findMany({
                where: {
                    userId: userId
                },
                orderBy: {
                    brewDate: "asc"
                },
                include: {
                    coffeeBean: true,
                    grinder: true,
                    brewer: true,
                    tastingScore: true
                }
            }),

            prisma.coffeeBean.findMany({
                where: {
                    userId: userId
                },
                include: {
                    _count: {
                        select: {
                            brewSessions: true
                        }
                    }
                }
            }),

            prisma.grinder.findMany({
                where: {
                    userId: userId
                },
                include: {
                    _count: {
                        select: {
                            brewSessions: true
                        }
                    }
                }
            }),

            prisma.brewer.findMany({
                where: {
                    userId: userId
                },
                include: {
                    _count: {
                        select: {
                            brewSessions: true
                        }
                    }
                }
            })
        ]);

        const ratedSessions = brewSessions.filter(function (session) {
            return session.overallRating !== null;
        });

        const averageRating = ratedSessions.length > 0
            ? round(
                ratedSessions.reduce(function (sum, session) {
                    return sum + toNumber(session.overallRating);
                }, 0) / ratedSessions.length,
                2
            )
            : 0;

        const lastSixMonthKeys = buildLastMonthKeys(6, timeZone);

        const brewCountByMonthMap = new Map<string, number>();
        const ratingByMonthMap = new Map<string, { total: number; count: number }>();

        lastSixMonthKeys.forEach(function (monthKey) {
            brewCountByMonthMap.set(monthKey, 0);
            ratingByMonthMap.set(monthKey, {
                total: 0,
                count: 0
            });
        });

        brewSessions.forEach(function (session) {
            const monthKey = formatMonthKeyFromDateOnly(session.brewDate);

            if (brewCountByMonthMap.has(monthKey)) {
                brewCountByMonthMap.set(monthKey, (brewCountByMonthMap.get(monthKey) || 0) + 1);
            }

            if (ratingByMonthMap.has(monthKey) && session.overallRating !== null) {
                const ratingBucket = ratingByMonthMap.get(monthKey);

                if (ratingBucket) {
                    ratingBucket.total += toNumber(session.overallRating);
                    ratingBucket.count += 1;
                }
            }
        });

        const monthlyLabels = lastSixMonthKeys.map(formatMonthLabel);

        const monthlyBrewCounts = lastSixMonthKeys.map(function (monthKey) {
            return brewCountByMonthMap.get(monthKey) || 0;
        });

        const monthlyAverageRatings = lastSixMonthKeys.map(function (monthKey) {
            const ratingBucket = ratingByMonthMap.get(monthKey);

            if (!ratingBucket || ratingBucket.count === 0) {
                return 0;
            }

            return round(ratingBucket.total / ratingBucket.count, 2);
        });

        const tastingScoreSessions = brewSessions.filter(function (session) {
            return !!session.tastingScore;
        });

        const tastingAverages = {
            richness: 0,
            sweetness: 0,
            aftertaste: 0,
            aroma: 0,
            acidity: 0
        };

        if (tastingScoreSessions.length > 0) {
            tastingAverages.richness = round(
                tastingScoreSessions.reduce(function (sum, session) {
                    return sum + (session.tastingScore ? session.tastingScore.richness : 0);
                }, 0) / tastingScoreSessions.length,
                2
            );

            tastingAverages.sweetness = round(
                tastingScoreSessions.reduce(function (sum, session) {
                    return sum + (session.tastingScore ? session.tastingScore.sweetness : 0);
                }, 0) / tastingScoreSessions.length,
                2
            );

            tastingAverages.aftertaste = round(
                tastingScoreSessions.reduce(function (sum, session) {
                    return sum + (session.tastingScore ? session.tastingScore.aftertaste : 0);
                }, 0) / tastingScoreSessions.length,
                2
            );

            tastingAverages.aroma = round(
                tastingScoreSessions.reduce(function (sum, session) {
                    return sum + (session.tastingScore ? session.tastingScore.aroma : 0);
                }, 0) / tastingScoreSessions.length,
                2
            );

            tastingAverages.acidity = round(
                tastingScoreSessions.reduce(function (sum, session) {
                    return sum + (session.tastingScore ? session.tastingScore.acidity : 0);
                }, 0) / tastingScoreSessions.length,
                2
            );
        }

        const topBeans = allBeans
            .slice()
            .sort(function (a, b) {
                return b._count.brewSessions - a._count.brewSessions;
            })
            .slice(0, 5)
            .map(function (bean) {
                return {
                    id: bean.id,
                    beanName: bean.beanName,
                    roasterName: bean.roasterName || "",
                    brewCount: bean._count.brewSessions
                };
            });

        const grinderUsageById = new Map<number, { brewCount: number; totalGroundGrams: number }>();

        brewSessions.forEach(function (session) {
            if (!session.grinderId) {
                return;
            }

            const currentUsage = grinderUsageById.get(session.grinderId) || {
                brewCount: 0,
                totalGroundGrams: 0
            };

            currentUsage.brewCount += 1;
            currentUsage.totalGroundGrams += Number(session.coffeeDoseGrams || 0);

            grinderUsageById.set(session.grinderId, currentUsage);
        });

        const topGrinders = allGrinders
            .map(function (grinder) {
                const usage = grinderUsageById.get(grinder.id) || {
                    brewCount: 0,
                    totalGroundGrams: 0
                };

                return {
                    id: grinder.id,
                    name: grinder.name,
                    brand: grinder.brand || "",
                    brewCount: usage.brewCount,
                    totalGroundGrams: round(usage.totalGroundGrams, 1)
                };
            })
            .filter(function (grinder) {
                return grinder.brewCount > 0;
            })
            .sort(function (a, b) {
                if (b.totalGroundGrams !== a.totalGroundGrams) {
                    return b.totalGroundGrams - a.totalGroundGrams;
                }

                if (b.brewCount !== a.brewCount) {
                    return b.brewCount - a.brewCount;
                }

                return a.name.localeCompare(b.name);
            })
            .slice(0, 5);

        const brewerUsageById = new Map<number, { brewCount: number; totalBeanGrams: number }>();

        brewSessions.forEach(function (session) {
            if (!session.brewerId) {
                return;
            }

            const currentUsage = brewerUsageById.get(session.brewerId) || {
                brewCount: 0,
                totalBeanGrams: 0
            };

            currentUsage.brewCount += 1;
            currentUsage.totalBeanGrams += Number(session.coffeeDoseGrams || 0);

            brewerUsageById.set(session.brewerId, currentUsage);
        });

        const topBrewers = allBrewers
            .map(function (brewer) {
                const usage = brewerUsageById.get(brewer.id) || {
                    brewCount: 0,
                    totalBeanGrams: 0
                };

                return {
                    id: brewer.id,
                    name: brewer.name,
                    brand: brewer.brand || "",
                    locationName: brewer.locationName || "",
                    brewCount: usage.brewCount,
                    totalBeanGrams: round(usage.totalBeanGrams, 1)
                };
            })
            .filter(function (brewer) {
                return brewer.brewCount > 0;
            })
            .sort(function (a, b) {
                if (b.totalBeanGrams !== a.totalBeanGrams) {
                    return b.totalBeanGrams - a.totalBeanGrams;
                }

                if (b.brewCount !== a.brewCount) {
                    return b.brewCount - a.brewCount;
                }

                return a.name.localeCompare(b.name);
            })
            .slice(0, 5);

        const recentBrews = brewSessions
            .slice()
            .sort(function (a, b) {
                return b.brewDate.getTime() - a.brewDate.getTime();
            })
            .slice(0, 8)
            .map(function (session) {
                return {
                    id: session.id,
                    brewDate: formatDateOnlyUs(session.brewDate),
                    coffeeName: session.coffeeBean.beanName,
                    roasterName: session.coffeeBean.roasterName || "",
                    grinderName: session.grinder ? session.grinder.name : "",
                    brewerName: session.brewer ? session.brewer.name : "",
                    overallRating: session.overallRating !== null ? toNumber(session.overallRating) : null
                };
            });

        res.render("analytics/index", {
            title: "Analytics",
            summary: {
                totalBeans: totalBeans,
                activeBeans: activeBeans,
                inactiveBeans: totalBeans - activeBeans,
                totalBrews: totalBrews,
                averageRating: averageRating
            },
            topBeans: topBeans,
            topGrinders: topGrinders,
            topBrewers: topBrewers,
            recentBrews: recentBrews,
            chartData: {
                monthlyLabels: monthlyLabels,
                monthlyBrewCounts: monthlyBrewCounts,
                monthlyAverageRatings: monthlyAverageRatings,
                tastingLabels: ["Richness", "Sweetness", "Aftertaste", "Aroma", "Acidity"],
                tastingAverages: [
                    tastingAverages.richness,
                    tastingAverages.sweetness,
                    tastingAverages.aftertaste,
                    tastingAverages.aroma,
                    tastingAverages.acidity
                ]
            }
        });
    } catch (error) {
        next(error);
    }
});

export default router;
