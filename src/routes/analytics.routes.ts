import { Router, Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";
import { getRequiredUserId, requireAuth } from "../middleware/auth";
import { buildLastMonthKeys, formatDateOnlyUs, formatMonthKeyFromDateOnly, getTodayDateForInput, parseDateOnlyToUtcDate, parseDateOnlyToUtcEndOfDay } from "../utils/dateFormat";
import { normalizeTimeZone } from "../utils/timeZone";
import { getEffectiveTotalCost, getInventoryUsage } from "../services/beanInventory.service";

const router = Router();

router.use(requireAuth);

type CostRangeKey = "last30" | "last90" | "thisYear" | "all";

type CostBucket = {
    total: number;
    count: number;
    grams: number;
};

type CostTotal = {
    currencyCode: string;
    total: number;
};

type CostDisplay = {
    isKnown: boolean;
    isMultipleCurrency: boolean;
    currencyCode: string;
    total: number | null;
    values: CostTotal[];
};

type BrewCostItem = {
    id: number;
    brewDate: Date;
    beanId: number;
    beanName: string;
    roasterName: string;
    brewSummary: string;
    coffeeGrams: number;
    rating: number | null;
    cost: number | null;
    currencyCode: string | null;
};

type PurchaseCostItem = {
    id: number;
    purchaseDate: Date | null;
    cost: number | null;
    currencyCode: string;
};

type InventoryValueDisplay = CostDisplay & {
    knownRecordCount: number;
    totalRecordCount: number;
};

type InventoryRecordItem = {
    id: number;
    beanId: number;
    beanName: string;
    roasterName: string;
    remainingGrams: number;
    startingGrams: number;
    bagSizeGrams: number | null;
    bagSizeLabel: string;
    roastDate: Date | null;
    purchaseDate: Date | null;
    createdAt: Date;
    ageDays: number | null;
    sortDate: Date;
    estimatedValue: number | null;
    costPerGram: number | null;
    currencyCode: string | null;
    lastBrewedDate: Date | null;
};

type BeanInventoryGroupItem = {
    beanId: number;
    beanName: string;
    roasterName: string;
    remainingGrams: number;
    inventoryCount: number;
    knownValueInventoryCount: number;
    lastBrewedDate: Date | null;
    lastReplenishedDate: Date | null;
    valueByCurrency: Map<string, CostBucket>;
    gramsWithKnownCostByCurrency: Map<string, number>;
};

type PurchaseInventoryItem = {
    id: number;
    beanId: number;
    beanName: string;
    roasterName: string;
    purchaseDate: Date | null;
    createdAt: Date;
    quantity: number;
    bagSizeGrams: number | null;
    totalGrams: number;
    cost: number | null;
    currencyCode: string;
};


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

function toOptionalNumber(value: unknown): number | null {
    if (value === null || typeof value === "undefined") {
        return null;
    }

    const numericValue = Number(value);

    if (Number.isNaN(numericValue)) {
        return null;
    }

    return numericValue;
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

function normalizeCostRangeKey(value: unknown): CostRangeKey {
    const text = String(value || "").trim();

    if (text === "last30" || text === "last90" || text === "thisYear" || text === "all") {
        return text;
    }

    return "last90";
}

function addDaysToDateText(dateText: string, days: number): string {
    const date = parseDateOnlyToUtcDate(dateText);
    date.setUTCDate(date.getUTCDate() + days);

    return date.toISOString().substring(0, 10);
}

function buildCostDateRange(rangeKey: CostRangeKey, timeZone: string): { startDate: Date | null; endDate: Date | null; label: string } {
    const todayText = getTodayDateForInput(timeZone);

    if (rangeKey === "all") {
        return {
            startDate: null,
            endDate: null,
            label: "All time"
        };
    }

    if (rangeKey === "thisYear") {
        const year = todayText.substring(0, 4);

        return {
            startDate: parseDateOnlyToUtcDate(`${year}-01-01`),
            endDate: parseDateOnlyToUtcEndOfDay(todayText),
            label: "This year"
        };
    }

    if (rangeKey === "last30") {
        return {
            startDate: parseDateOnlyToUtcDate(addDaysToDateText(todayText, -29)),
            endDate: parseDateOnlyToUtcEndOfDay(todayText),
            label: "Last 30 days"
        };
    }

    return {
        startDate: parseDateOnlyToUtcDate(addDaysToDateText(todayText, -89)),
        endDate: parseDateOnlyToUtcEndOfDay(todayText),
        label: "Last 90 days"
    };
}

function isInCostDateRange(value: Date | null | undefined, startDate: Date | null, endDate: Date | null): boolean {
    if (!value) {
        return false;
    }

    if (startDate && value.getTime() < startDate.getTime()) {
        return false;
    }

    if (endDate && value.getTime() > endDate.getTime()) {
        return false;
    }

    return true;
}

function addCostToBucket(map: Map<string, CostBucket>, currencyCode: string, cost: number, grams: number): void {
    const normalizedCurrencyCode = String(currencyCode || "USD").trim().toUpperCase() || "USD";
    const bucket = map.get(normalizedCurrencyCode) || {
        total: 0,
        count: 0,
        grams: 0
    };

    bucket.total += cost;
    bucket.count += 1;
    bucket.grams += grams;

    map.set(normalizedCurrencyCode, bucket);
}

function buildCostDisplay(map: Map<string, CostBucket>): CostDisplay {
    const values = Array.from(map.entries())
        .map(function ([currencyCode, bucket]) {
            return {
                currencyCode: currencyCode,
                total: round(bucket.total, 2)
            };
        })
        .sort(function (left, right) {
            return left.currencyCode.localeCompare(right.currencyCode);
        });

    return {
        isKnown: values.length > 0,
        isMultipleCurrency: values.length > 1,
        currencyCode: values.length === 1 ? values[0].currencyCode : "",
        total: values.length === 1 ? values[0].total : null,
        values: values
    };
}

function buildAverageCostDisplay(map: Map<string, CostBucket>, denominatorSelector: (bucket: CostBucket) => number): CostDisplay {
    const values = Array.from(map.entries())
        .map(function ([currencyCode, bucket]) {
            const denominator = denominatorSelector(bucket);

            return {
                currencyCode: currencyCode,
                total: denominator > 0 ? round(bucket.total / denominator, 4) : NaN
            };
        })
        .filter(function (value) {
            return !Number.isNaN(value.total);
        })
        .sort(function (left, right) {
            return left.currencyCode.localeCompare(right.currencyCode);
        });

    return {
        isKnown: values.length > 0,
        isMultipleCurrency: values.length > 1,
        currencyCode: values.length === 1 ? values[0].currencyCode : "",
        total: values.length === 1 ? values[0].total : null,
        values: values
    };
}


function formatDateOrNull(value: Date | null | undefined): string {
    if (!value) {
        return "";
    }

    return formatDateOnlyUs(value);
}

function addValueToCurrencyBucket(map: Map<string, CostBucket>, currencyCode: string, value: number): void {
    addCostToBucket(map, currencyCode, value, 0);
}

function buildInventoryValueDisplay(map: Map<string, CostBucket>, knownRecordCount: number, totalRecordCount: number): InventoryValueDisplay {
    const display = buildCostDisplay(map) as InventoryValueDisplay;
    display.knownRecordCount = knownRecordCount;
    display.totalRecordCount = totalRecordCount;

    return display;
}

function getFirstAvailableDate(values: Array<Date | null | undefined>): Date | null {
    for (const value of values) {
        if (value) {
            return value;
        }
    }

    return null;
}

function getDaysBetween(startDate: Date | null, endDate: Date): number | null {
    if (!startDate) {
        return null;
    }

    const millisecondsPerDay = 24 * 60 * 60 * 1000;

    return Math.max(0, Math.floor((endDate.getTime() - startDate.getTime()) / millisecondsPerDay));
}

function getMonthStartDate(timeZone: string): Date {
    const todayText = getTodayDateForInput(timeZone);
    const monthStartText = `${todayText.substring(0, 7)}-01`;

    return parseDateOnlyToUtcDate(monthStartText);
}

function getInventoryCostDetails(inventory: {
    startingGrams: unknown;
    beanPurchase: ({ currencyCode: string | null; quantity: number; inventories: { id: number }[] } & Parameters<typeof getEffectiveTotalCost>[0]) | null;
}): { costPerGram: number | null; bagEffectiveCost: number | null; currencyCode: string | null } {
    const purchase = inventory.beanPurchase;

    if (!purchase) {
        return {
            costPerGram: null,
            bagEffectiveCost: null,
            currencyCode: null
        };
    }

    const purchaseEffectiveTotalCost = getEffectiveTotalCost(purchase);

    if (purchaseEffectiveTotalCost === null) {
        return {
            costPerGram: null,
            bagEffectiveCost: null,
            currencyCode: purchase.currencyCode || "USD"
        };
    }

    const bagCount = Math.max(1, purchase.inventories.length || purchase.quantity || 1);
    const bagEffectiveCost = purchaseEffectiveTotalCost / bagCount;
    const startingGrams = toOptionalNumber(inventory.startingGrams);
    const costPerGram = startingGrams !== null && startingGrams > 0 ? bagEffectiveCost / startingGrams : null;

    return {
        costPerGram: costPerGram,
        bagEffectiveCost: bagEffectiveCost,
        currencyCode: purchase.currencyCode || "USD"
    };
}

function formatBrewTime(totalSeconds: number | null | undefined): string {
    if (totalSeconds === null || typeof totalSeconds === "undefined") {
        return "";
    }

    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatBrewSummary(session: { coffeeDoseGrams: unknown; totalYieldGrams: unknown; waterTemperatureC: unknown; totalBrewTimeSeconds: number | null }): string {
    const parts: string[] = [];
    const coffeeGrams = toOptionalNumber(session.coffeeDoseGrams);
    const yieldGrams = toOptionalNumber(session.totalYieldGrams);
    const waterTemperatureC = toOptionalNumber(session.waterTemperatureC);
    const brewTime = formatBrewTime(session.totalBrewTimeSeconds);

    if (coffeeGrams !== null && yieldGrams !== null) {
        parts.push(`${round(coffeeGrams, 1)}g → ${round(yieldGrams, 1)}g`);
    } else if (coffeeGrams !== null) {
        parts.push(`${round(coffeeGrams, 1)}g coffee`);
    }

    if (waterTemperatureC !== null) {
        parts.push(`@ ${round(waterTemperatureC, 1)}°C`);
    }

    if (brewTime) {
        parts.push(`over ${brewTime}`);
    }

    return parts.length > 0 ? parts.join(" ") : "Brew details not set";
}

router.get("/", async function (req: Request, res: Response, next: NextFunction) {
    try {
        const userId = getRequiredUserId(req);
        const timeZone = getCurrentTimeZone(res);
        const costRangeKey = normalizeCostRangeKey(req.query.costRange);
        const costDateRange = buildCostDateRange(costRangeKey, timeZone);

        const [
            totalBeans,
            activeBeans,
            totalBrews,
            brewSessions,
            allBeans,
            allGrinders,
            allBrewers,
            beanPurchases,
            beanInventories
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
                    tastingScore: true,
                    beanInventory: {
                        include: {
                            beanPurchase: {
                                include: {
                                    inventories: {
                                        select: {
                                            id: true
                                        }
                                    }
                                }
                            }
                        }
                    }
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
            }),

            prisma.beanPurchase.findMany({
                where: {
                    bean: {
                        userId: userId
                    }
                },
                include: {
                    bean: true,
                    inventories: {
                        select: {
                            id: true,
                            startingGrams: true,
                            bagSizeGrams: true
                        }
                    }
                }
            }),

            prisma.beanInventory.findMany({
                where: {
                    bean: {
                        userId: userId
                    }
                },
                include: {
                    bean: true,
                    beanPurchase: {
                        include: {
                            inventories: {
                                select: {
                                    id: true
                                }
                            }
                        }
                    },
                    brewSessions: {
                        select: {
                            id: true,
                            brewDate: true,
                            coffeeDoseGrams: true
                        },
                        orderBy: {
                            brewDate: "desc"
                        }
                    },
                    adjustments: {
                        select: {
                            adjustmentGrams: true
                        }
                    }
                },
                orderBy: [
                    {
                        roastDate: "asc"
                    },
                    {
                        purchaseDate: "asc"
                    },
                    {
                        createdAt: "asc"
                    },
                    {
                        id: "asc"
                    }
                ]
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

        const purchaseCostItems: PurchaseCostItem[] = beanPurchases.map(function (purchase) {
            return {
                id: purchase.id,
                purchaseDate: purchase.purchaseDate,
                cost: getEffectiveTotalCost(purchase),
                currencyCode: purchase.currencyCode || "USD"
            };
        });

        const brewCostItems: BrewCostItem[] = brewSessions.map(function (session) {
            const inventory = session.beanInventory;
            const purchase = inventory ? inventory.beanPurchase : null;
            const purchaseEffectiveTotalCost = purchase ? getEffectiveTotalCost(purchase) : null;
            const bagCount = purchase ? Math.max(1, purchase.inventories.length || purchase.quantity || 1) : 1;
            const bagEffectiveCost = purchaseEffectiveTotalCost === null ? null : purchaseEffectiveTotalCost / bagCount;
            const startingGrams = inventory ? toOptionalNumber(inventory.startingGrams) : null;
            const coffeeGrams = toOptionalNumber(session.coffeeDoseGrams) || 0;
            const costPerGram = bagEffectiveCost !== null && startingGrams !== null && startingGrams > 0 ? bagEffectiveCost / startingGrams : null;
            const brewCost = costPerGram !== null && coffeeGrams > 0 ? coffeeGrams * costPerGram : null;

            return {
                id: session.id,
                brewDate: session.brewDate,
                beanId: session.coffeeBean.id,
                beanName: session.coffeeBean.beanName,
                roasterName: session.coffeeBean.roasterName || "",
                brewSummary: formatBrewSummary(session),
                coffeeGrams: coffeeGrams,
                rating: session.overallRating !== null ? toNumber(session.overallRating) : null,
                cost: brewCost,
                currencyCode: brewCost !== null && purchase ? purchase.currencyCode || "USD" : null
            };
        });

        const rangedBrewCostItems = brewCostItems.filter(function (item) {
            return isInCostDateRange(item.brewDate, costDateRange.startDate, costDateRange.endDate);
        });

        const rangedPurchaseCostItems = purchaseCostItems.filter(function (item) {
            return isInCostDateRange(item.purchaseDate, costDateRange.startDate, costDateRange.endDate);
        });

        const consumedCostByCurrency = new Map<string, CostBucket>();
        const purchasedCostByCurrency = new Map<string, CostBucket>();

        rangedBrewCostItems.forEach(function (item) {
            if (item.cost !== null && item.currencyCode) {
                addCostToBucket(consumedCostByCurrency, item.currencyCode, item.cost, item.coffeeGrams);
            }
        });

        rangedPurchaseCostItems.forEach(function (item) {
            if (item.cost !== null) {
                addCostToBucket(purchasedCostByCurrency, item.currencyCode, item.cost, 0);
            }
        });

        const costByBeanMap = new Map<number, {
            beanId: number;
            beanName: string;
            roasterName: string;
            brewCount: number;
            knownCostBrewCount: number;
            gramsBrewed: number;
            ratingTotal: number;
            ratingCount: number;
            costByCurrency: Map<string, CostBucket>;
        }>();

        rangedBrewCostItems.forEach(function (item) {
            const current = costByBeanMap.get(item.beanId) || {
                beanId: item.beanId,
                beanName: item.beanName,
                roasterName: item.roasterName,
                brewCount: 0,
                knownCostBrewCount: 0,
                gramsBrewed: 0,
                ratingTotal: 0,
                ratingCount: 0,
                costByCurrency: new Map<string, CostBucket>()
            };

            current.brewCount += 1;
            current.gramsBrewed += item.coffeeGrams;

            if (item.rating !== null) {
                current.ratingTotal += item.rating;
                current.ratingCount += 1;
            }

            if (item.cost !== null && item.currencyCode) {
                current.knownCostBrewCount += 1;
                addCostToBucket(current.costByCurrency, item.currencyCode, item.cost, item.coffeeGrams);
            }

            costByBeanMap.set(item.beanId, current);
        });

        const costByBean = Array.from(costByBeanMap.values())
            .filter(function (item) {
                return item.brewCount > 0;
            })
            .map(function (item) {
                return {
                    beanId: item.beanId,
                    beanName: item.beanName,
                    roasterName: item.roasterName,
                    brewCount: item.brewCount,
                    knownCostBrewCount: item.knownCostBrewCount,
                    gramsBrewed: round(item.gramsBrewed, 1),
                    totalCost: buildCostDisplay(item.costByCurrency),
                    averageCostPerBrew: buildAverageCostDisplay(item.costByCurrency, function (bucket) {
                        return bucket.count;
                    }),
                    averageRating: item.ratingCount > 0 ? round(item.ratingTotal / item.ratingCount, 2) : null
                };
            })
            .sort(function (left, right) {
                const leftTotal = left.totalCost.values.reduce(function (sum, value) { return sum + value.total; }, 0);
                const rightTotal = right.totalCost.values.reduce(function (sum, value) { return sum + value.total; }, 0);

                if (rightTotal !== leftTotal) {
                    return rightTotal - leftTotal;
                }

                return left.beanName.localeCompare(right.beanName);
            });

        const costByRoasterMap = new Map<string, {
            roasterName: string;
            beanIds: Set<number>;
            brewCount: number;
            knownCostBrewCount: number;
            gramsBrewed: number;
            ratingTotal: number;
            ratingCount: number;
            costByCurrency: Map<string, CostBucket>;
        }>();

        rangedBrewCostItems.forEach(function (item) {
            const roasterName = item.roasterName || "Unknown roaster";
            const current = costByRoasterMap.get(roasterName) || {
                roasterName: roasterName,
                beanIds: new Set<number>(),
                brewCount: 0,
                knownCostBrewCount: 0,
                gramsBrewed: 0,
                ratingTotal: 0,
                ratingCount: 0,
                costByCurrency: new Map<string, CostBucket>()
            };

            current.beanIds.add(item.beanId);
            current.brewCount += 1;
            current.gramsBrewed += item.coffeeGrams;

            if (item.rating !== null) {
                current.ratingTotal += item.rating;
                current.ratingCount += 1;
            }

            if (item.cost !== null && item.currencyCode) {
                current.knownCostBrewCount += 1;
                addCostToBucket(current.costByCurrency, item.currencyCode, item.cost, item.coffeeGrams);
            }

            costByRoasterMap.set(roasterName, current);
        });

        const costByRoaster = Array.from(costByRoasterMap.values())
            .filter(function (item) {
                return item.brewCount > 0;
            })
            .map(function (item) {
                return {
                    roasterName: item.roasterName,
                    brewCount: item.brewCount,
                    knownCostBrewCount: item.knownCostBrewCount,
                    beanCount: item.beanIds.size,
                    gramsBrewed: round(item.gramsBrewed, 1),
                    totalCost: buildCostDisplay(item.costByCurrency),
                    averageCostPerBrew: buildAverageCostDisplay(item.costByCurrency, function (bucket) {
                        return bucket.count;
                    }),
                    averageRating: item.ratingCount > 0 ? round(item.ratingTotal / item.ratingCount, 2) : null
                };
            })
            .sort(function (left, right) {
                const leftTotal = left.totalCost.values.reduce(function (sum, value) { return sum + value.total; }, 0);
                const rightTotal = right.totalCost.values.reduce(function (sum, value) { return sum + value.total; }, 0);

                if (rightTotal !== leftTotal) {
                    return rightTotal - leftTotal;
                }

                return left.roasterName.localeCompare(right.roasterName);
            });

        const bestValueBeans = costByBean
            .filter(function (item) {
                return item.averageRating !== null
                    && item.knownCostBrewCount >= 2
                    && item.averageCostPerBrew.values.length === 1
                    && item.averageCostPerBrew.values[0].total > 0;
            })
            .map(function (item) {
                const averageCostPerBrew = item.averageCostPerBrew.values[0].total;

                return {
                    beanId: item.beanId,
                    beanName: item.beanName,
                    roasterName: item.roasterName,
                    averageRating: item.averageRating,
                    averageCostPerBrew: item.averageCostPerBrew,
                    brewCount: item.knownCostBrewCount,
                    valueScore: item.averageRating === null ? 0 : round(item.averageRating / averageCostPerBrew, 2)
                };
            })
            .sort(function (left, right) {
                if (right.valueScore !== left.valueScore) {
                    return right.valueScore - left.valueScore;
                }

                return left.beanName.localeCompare(right.beanName);
            })
            .slice(0, 10);

        const mostExpensiveBrews = rangedBrewCostItems
            .filter(function (item) {
                return item.cost !== null && item.currencyCode !== null;
            })
            .sort(function (left, right) {
                if (left.currencyCode !== right.currencyCode) {
                    return String(left.currencyCode || "").localeCompare(String(right.currencyCode || ""));
                }

                return (right.cost || 0) - (left.cost || 0);
            })
            .slice(0, 10)
            .map(function (item) {
                return {
                    id: item.id,
                    brewDate: formatDateOnlyUs(item.brewDate),
                    beanName: item.beanName,
                    roasterName: item.roasterName,
                    brewSummary: item.brewSummary,
                    rating: item.rating,
                    coffeeGrams: round(item.coffeeGrams, 1),
                    cost: item.cost === null ? null : round(item.cost, 2),
                    currencyCode: item.currencyCode || ""
                };
            });

        const lowStockThresholdGrams = 50;
        const todayForInventory = parseDateOnlyToUtcEndOfDay(getTodayDateForInput(timeZone));
        const monthStartDate = getMonthStartDate(timeZone);
        const monthEndDate = parseDateOnlyToUtcEndOfDay(getTodayDateForInput(timeZone));
        const coffeeConsumedThisMonth = brewSessions.reduce(function (sum, session) {
            if (!isInCostDateRange(session.brewDate, monthStartDate, monthEndDate)) {
                return sum;
            }

            return sum + (toOptionalNumber(session.coffeeDoseGrams) || 0);
        }, 0);

        const inventoryRecords: InventoryRecordItem[] = beanInventories.map(function (inventory) {
            const usage = getInventoryUsage(inventory);
            const costDetails = getInventoryCostDetails(inventory);
            const displayRemainingGrams = Math.max(0, usage.remainingGrams);
            const estimatedValue = costDetails.costPerGram !== null ? displayRemainingGrams * costDetails.costPerGram : null;
            const ageDate = getFirstAvailableDate([inventory.roastDate, inventory.purchaseDate, inventory.createdAt]);
            const sortDate = ageDate || inventory.createdAt;
            const bagSizeGrams = inventory.bagSizeGrams === null ? null : round(Number(inventory.bagSizeGrams.toString()), 1);
            const startingGrams = round(toNumber(inventory.startingGrams), 1);
            const bagSizeLabel = bagSizeGrams !== null ? `${bagSizeGrams}g` : `${startingGrams}g`;
            const lastBrewedDate = inventory.brewSessions.length > 0 ? inventory.brewSessions[0].brewDate : null;

            return {
                id: inventory.id,
                beanId: inventory.bean.id,
                beanName: inventory.bean.beanName,
                roasterName: inventory.bean.roasterName || "",
                remainingGrams: round(displayRemainingGrams, 1),
                startingGrams: startingGrams,
                bagSizeGrams: bagSizeGrams,
                bagSizeLabel: bagSizeLabel,
                roastDate: inventory.roastDate,
                purchaseDate: inventory.purchaseDate,
                createdAt: inventory.createdAt,
                ageDays: getDaysBetween(ageDate, todayForInventory),
                sortDate: sortDate,
                estimatedValue: estimatedValue === null ? null : round(estimatedValue, 2),
                costPerGram: costDetails.costPerGram === null ? null : round(costDetails.costPerGram, 4),
                currencyCode: estimatedValue === null ? null : costDetails.currencyCode,
                lastBrewedDate: lastBrewedDate
            };
        });

        const currentInventoryRecords = inventoryRecords
            .filter(function (inventory) {
                return inventory.remainingGrams > 0;
            })
            .sort(function (left, right) {
                if (left.sortDate.getTime() !== right.sortDate.getTime()) {
                    return left.sortDate.getTime() - right.sortDate.getTime();
                }

                return left.beanName.localeCompare(right.beanName);
            });

        const inventoryValueByCurrency = new Map<string, CostBucket>();
        let knownInventoryValueRecordCount = 0;

        currentInventoryRecords.forEach(function (inventory) {
            if (inventory.estimatedValue !== null && inventory.currencyCode) {
                knownInventoryValueRecordCount += 1;
                addValueToCurrencyBucket(inventoryValueByCurrency, inventory.currencyCode, inventory.estimatedValue);
            }
        });

        const inventoryByBeanMap = new Map<number, BeanInventoryGroupItem>();

        inventoryRecords.forEach(function (inventory) {
            const current = inventoryByBeanMap.get(inventory.beanId) || {
                beanId: inventory.beanId,
                beanName: inventory.beanName,
                roasterName: inventory.roasterName,
                remainingGrams: 0,
                inventoryCount: 0,
                knownValueInventoryCount: 0,
                lastBrewedDate: null,
                lastReplenishedDate: null,
                valueByCurrency: new Map<string, CostBucket>(),
                gramsWithKnownCostByCurrency: new Map<string, number>()
            };

            current.remainingGrams += inventory.remainingGrams;
            current.inventoryCount += 1;

            if (inventory.lastBrewedDate && (!current.lastBrewedDate || inventory.lastBrewedDate.getTime() > current.lastBrewedDate.getTime())) {
                current.lastBrewedDate = inventory.lastBrewedDate;
            }

            const replenishedDate = inventory.purchaseDate || inventory.createdAt;

            if (replenishedDate && (!current.lastReplenishedDate || replenishedDate.getTime() > current.lastReplenishedDate.getTime())) {
                current.lastReplenishedDate = replenishedDate;
            }

            if (inventory.estimatedValue !== null && inventory.currencyCode) {
                current.knownValueInventoryCount += 1;
                addValueToCurrencyBucket(current.valueByCurrency, inventory.currencyCode, inventory.estimatedValue);
                current.gramsWithKnownCostByCurrency.set(
                    inventory.currencyCode,
                    (current.gramsWithKnownCostByCurrency.get(inventory.currencyCode) || 0) + inventory.remainingGrams
                );
            }

            inventoryByBeanMap.set(inventory.beanId, current);
        });

        const beanInventoryGroups = Array.from(inventoryByBeanMap.values())
            .map(function (item) {
                const valueDisplay = buildInventoryValueDisplay(item.valueByCurrency, item.knownValueInventoryCount, item.inventoryCount);
                const averageCostValues = valueDisplay.values.map(function (value) {
                    const grams = item.gramsWithKnownCostByCurrency.get(value.currencyCode) || 0;

                    return {
                        currencyCode: value.currencyCode,
                        total: grams > 0 ? round(value.total / grams, 4) : NaN
                    };
                }).filter(function (value) {
                    return !Number.isNaN(value.total);
                });

                return {
                    beanId: item.beanId,
                    beanName: item.beanName,
                    roasterName: item.roasterName,
                    remainingGrams: round(Math.max(0, item.remainingGrams), 1),
                    inventoryCount: item.inventoryCount,
                    knownValueInventoryCount: item.knownValueInventoryCount,
                    lastBrewedDate: formatDateOrNull(item.lastBrewedDate),
                    lastReplenishedDate: formatDateOrNull(item.lastReplenishedDate),
                    valueDisplay: valueDisplay,
                    averageCostPerGram: {
                        isKnown: averageCostValues.length > 0,
                        isMultipleCurrency: averageCostValues.length > 1,
                        currencyCode: averageCostValues.length === 1 ? averageCostValues[0].currencyCode : "",
                        total: averageCostValues.length === 1 ? averageCostValues[0].total : null,
                        values: averageCostValues
                    }
                };
            });

        const beansRunningLow = beanInventoryGroups
            .filter(function (bean) {
                return bean.remainingGrams > 0 && bean.remainingGrams <= lowStockThresholdGrams;
            })
            .sort(function (left, right) {
                if (left.remainingGrams !== right.remainingGrams) {
                    return left.remainingGrams - right.remainingGrams;
                }

                return left.beanName.localeCompare(right.beanName);
            });

        const lowBeanCount = beanInventoryGroups.filter(function (bean) {
            return bean.remainingGrams > 0 && bean.remainingGrams <= lowStockThresholdGrams;
        }).length;

        const outOfStockBeanCount = beanInventoryGroups.filter(function (bean) {
            return bean.remainingGrams <= 0;
        }).length;

        const oldestInventory = currentInventoryRecords.length > 0 ? currentInventoryRecords[0] : null;

        const recentlyReplenished = beanPurchases
            .map(function (purchase): PurchaseInventoryItem {
                const totalGrams = purchase.inventories.reduce(function (sum, inventory) {
                    return sum + toNumber(inventory.startingGrams);
                }, 0);
                const bagSizeGrams = purchase.inventories.length > 0 && purchase.inventories[0].bagSizeGrams !== null
                    ? round(toNumber(purchase.inventories[0].bagSizeGrams), 1)
                    : null;

                return {
                    id: purchase.id,
                    beanId: purchase.bean.id,
                    beanName: purchase.bean.beanName,
                    roasterName: purchase.bean.roasterName || "",
                    purchaseDate: purchase.purchaseDate,
                    createdAt: purchase.createdAt,
                    quantity: purchase.quantity || Math.max(1, purchase.inventories.length),
                    bagSizeGrams: bagSizeGrams,
                    totalGrams: round(totalGrams, 1),
                    cost: getEffectiveTotalCost(purchase),
                    currencyCode: purchase.currencyCode || "USD"
                };
            })
            .sort(function (left, right) {
                const leftDate = left.purchaseDate || left.createdAt;
                const rightDate = right.purchaseDate || right.createdAt;

                return rightDate.getTime() - leftDate.getTime();
            });

        const mostRecentlyReplenished = recentlyReplenished.length > 0 ? recentlyReplenished[0] : null;

        const inventoryValueByBean = beanInventoryGroups
            .filter(function (bean) {
                return bean.remainingGrams > 0;
            })
            .sort(function (left, right) {
                const leftTotal = left.valueDisplay.values.reduce(function (sum, value) { return sum + value.total; }, 0);
                const rightTotal = right.valueDisplay.values.reduce(function (sum, value) { return sum + value.total; }, 0);

                if (rightTotal !== leftTotal) {
                    return rightTotal - leftTotal;
                }

                return left.beanName.localeCompare(right.beanName);
            });

        const formattedCurrentInventoryRecords = currentInventoryRecords.map(function (inventory) {
            return {
                id: inventory.id,
                beanId: inventory.beanId,
                beanName: inventory.beanName,
                roasterName: inventory.roasterName,
                remainingGrams: inventory.remainingGrams,
                bagSizeLabel: inventory.bagSizeLabel,
                roastDate: formatDateOrNull(inventory.roastDate),
                purchaseDate: formatDateOrNull(inventory.purchaseDate),
                ageDays: inventory.ageDays,
                estimatedValue: inventory.estimatedValue,
                currencyCode: inventory.currencyCode || ""
            };
        });

        const formattedRecentlyReplenished = recentlyReplenished.slice(0, 10).map(function (purchase) {
            return {
                id: purchase.id,
                beanId: purchase.beanId,
                beanName: purchase.beanName,
                roasterName: purchase.roasterName,
                purchaseDate: formatDateOrNull(purchase.purchaseDate || purchase.createdAt),
                quantity: purchase.quantity,
                bagSizeGrams: purchase.bagSizeGrams,
                totalGrams: purchase.totalGrams,
                cost: purchase.cost === null ? null : round(purchase.cost, 2),
                currencyCode: purchase.currencyCode
            };
        });

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
            inventoryAnalytics: {
                lowStockThresholdGrams: lowStockThresholdGrams,
                summary: {
                    totalCoffeeOnHandGrams: round(currentInventoryRecords.reduce(function (sum, inventory) { return sum + inventory.remainingGrams; }, 0), 1),
                    beanCountWithInventory: beanInventoryGroups.filter(function (bean) { return bean.remainingGrams > 0; }).length,
                    lowBeanCount: lowBeanCount,
                    outOfStockBeanCount: outOfStockBeanCount,
                    oldestInventory: oldestInventory ? {
                        id: oldestInventory.id,
                        beanId: oldestInventory.beanId,
                        beanName: oldestInventory.beanName,
                        roasterName: oldestInventory.roasterName,
                        remainingGrams: oldestInventory.remainingGrams,
                        ageDays: oldestInventory.ageDays,
                        roastDate: formatDateOrNull(oldestInventory.roastDate),
                        purchaseDate: formatDateOrNull(oldestInventory.purchaseDate)
                    } : null,
                    inventoryValueEstimate: buildInventoryValueDisplay(inventoryValueByCurrency, knownInventoryValueRecordCount, currentInventoryRecords.length),
                    coffeeConsumedThisMonthGrams: round(coffeeConsumedThisMonth, 1),
                    mostRecentlyReplenished: mostRecentlyReplenished ? {
                        id: mostRecentlyReplenished.id,
                        beanId: mostRecentlyReplenished.beanId,
                        beanName: mostRecentlyReplenished.beanName,
                        roasterName: mostRecentlyReplenished.roasterName,
                        replenishedDate: formatDateOrNull(mostRecentlyReplenished.purchaseDate || mostRecentlyReplenished.createdAt)
                    } : null
                },
                beansRunningLow: beansRunningLow,
                currentInventory: formattedCurrentInventoryRecords,
                recentlyReplenished: formattedRecentlyReplenished,
                inventoryValueByBean: inventoryValueByBean
            },
            costAnalytics: {
                selectedRange: costRangeKey,
                selectedRangeLabel: costDateRange.label,
                rangeOptions: [
                    { value: "last30", label: "Last 30 days" },
                    { value: "last90", label: "Last 90 days" },
                    { value: "thisYear", label: "This year" },
                    { value: "all", label: "All time" }
                ],
                summary: {
                    coffeeCost: buildCostDisplay(consumedCostByCurrency),
                    coffeePurchased: buildCostDisplay(purchasedCostByCurrency),
                    averageCostPerBrew: buildAverageCostDisplay(consumedCostByCurrency, function (bucket) {
                        return bucket.count;
                    }),
                    knownCostBrewCount: Array.from(consumedCostByCurrency.values()).reduce(function (sum, bucket) {
                        return sum + bucket.count;
                    }, 0),
                    totalBrewCount: rangedBrewCostItems.length
                },
                costByBean: costByBean,
                costByRoaster: costByRoaster,
                bestValueBeans: bestValueBeans,
                mostExpensiveBrews: mostExpensiveBrews
            },
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
