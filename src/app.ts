import "dotenv/config";

import express, { Request, Response, NextFunction } from "express";
import path from "path";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import expressLayouts from "express-ejs-layouts";

import { prisma } from "./lib/prisma";
import { getRequiredUserId, loadCurrentUser, requireAuth } from "./middleware/auth";
import { formatDateUs, formatDateTimeUs } from "./utils/dateFormat";

import authRoutes from "./routes/auth.routes";
import profileRoutes from "./routes/profile.routes";
import coffeeBeanRoutes from "./routes/coffeeBean.routes";
import grinderRoutes from "./routes/grinder.routes";
import brewerRoutes from "./routes/brewer.routes";
import brewSessionRoutes from "./routes/brewSession.routes";
import adminRoutes from "./routes/admin.routes";
import analyticsRoutes from "./routes/analytics.routes";

const app = express();
app.set("trust proxy", 1);
const port = Number(process.env.PORT || 3000);
const sessionSecret = process.env.SESSION_SECRET || "change-this-session-secret";
const sessionMaxAgeDays = Number(process.env.SESSION_MAX_AGE_DAYS || 30);
const sessionMaxAgeMilliseconds = sessionMaxAgeDays * 24 * 60 * 60 * 1000;
const PgSessionStore = connectPgSimple(session);
const sessionStore = new PgSessionStore({
    conString: process.env.DATABASE_URL,
    tableName: "session"
});

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "..", "views"));

app.use(expressLayouts);
app.set("layout", "layouts/main");

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(
    session({
        name: "track-my-brews.sid",
        store: sessionStore,
        secret: sessionSecret,
        resave: false,
        saveUninitialized: false,
        rolling: true,
        cookie: {
            httpOnly: true,
            sameSite: "lax",
            secure: process.env.COOKIE_SECURE === "true",
            maxAge: sessionMaxAgeMilliseconds
        }
    })
);

app.use(express.static(path.join(__dirname, "..", "public")));

app.use(loadCurrentUser);

app.use(function (req: Request, res: Response, next: NextFunction) {
    res.locals.currentPath = req.path;
    res.locals.successMessage = "";
    res.locals.errorMessage = "";
    res.locals.formatDateUs = formatDateUs;
    res.locals.formatDateTimeUs = formatDateTimeUs;
    next();
});

/*
    Public auth routes.

    Everything after app.use(requireAuth) requires login.
*/
app.use("/auth", authRoutes);

app.use(requireAuth);

app.get("/", async function (req: Request, res: Response, next: NextFunction) {
    try {
        const userId = getRequiredUserId(req);

        const [
            totalBeans,
            activeBeans,
            totalGrinders,
            totalBrewers,
            totalBrews,
            recentBrews,
            beansWithCounts
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

            prisma.grinder.count({
                where: {
                    userId: userId
                }
            }),

            prisma.brewer.count({
                where: {
                    userId: userId
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
                    brewDate: "desc"
                },
                take: 5,
                include: {
                    coffeeBean: true,
                    grinder: true,
                    brewer: true
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
            })
        ]);

        const topBeans = beansWithCounts
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
                    isActive: bean.isActive,
                    brewCount: bean._count.brewSessions
                };
            });

        res.render("home/index", {
            title: "Dashboard",
            dashboard: {
                totalBeans: totalBeans,
                activeBeans: activeBeans,
                inactiveBeans: totalBeans - activeBeans,
                totalGrinders: totalGrinders,
                totalBrewers: totalBrewers,
                totalBrews: totalBrews,
                recentBrews: recentBrews.map(function (brew) {
                    return {
                        id: brew.id,
                        brewDate: formatDateUs(brew.brewDate),
                        beanName: brew.coffeeBean.beanName,
                        roasterName: brew.coffeeBean.roasterName || "",
                        grinderName: brew.grinder ? brew.grinder.name : "",
                        brewerName: brew.brewer ? brew.brewer.name : "",
                        overallRating: brew.overallRating === null ? null : Number(brew.overallRating)
                    };
                }),
                topBeans: topBeans
            }
        });
    } catch (error) {
        next(error);
    }
});

app.use("/profile", profileRoutes);
app.use("/coffee-beans", coffeeBeanRoutes);
app.use("/grinders", grinderRoutes);
app.use("/brewers", brewerRoutes);
app.use("/brew-sessions", brewSessionRoutes);
app.use("/analytics", analyticsRoutes);
app.use("/admin", adminRoutes);

app.use(function (req: Request, res: Response) {
    res.status(404).render("error", {
        title: "Page Not Found",
        message: "The page you requested was not found."
    });
});

app.use(function (error: unknown, req: Request, res: Response, next: NextFunction) {
    console.error(error);

    res.status(500).render("error", {
        title: "Server Error",
        message: "Something went wrong. Please try again."
    });
});

app.listen(port, function () {
    console.log(`Brew. Track. Improve. is running at http://localhost:${port}`);
});
