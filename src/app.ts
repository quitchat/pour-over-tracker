import "dotenv/config";
import path from "path";
import express, { Request, Response } from "express";
import expressLayouts from "express-ejs-layouts";
import session from "express-session";
import { prisma } from "./lib/prisma";
import { loadCurrentUser, requireAuth, requireAdmin, getRequiredUserId } from "./middleware/auth";
import authRoutes from "./routes/auth.routes";
import profileRoutes from "./routes/profile.routes";
import adminRoutes from "./routes/admin.routes";
import coffeeBeanRoutes from "./routes/coffeeBean.routes";
import grinderRoutes from "./routes/grinder.routes";
import brewerRoutes from "./routes/brewer.routes";
import brewSessionRoutes from "./routes/brewSession.routes";
import reportRoutes from "./routes/report.routes";

const app = express();
const port = Number(process.env.PORT || 3000);

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "../views"));

app.use(expressLayouts);
app.set("layout", "layouts/main");

app.use(express.static(path.join(__dirname, "../public")));
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: process.env.SESSION_SECRET || "pour-over-tracker-local-dev-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: "lax",
        maxAge: 1000 * 60 * 60 * 24 * 7
    }
}));

app.use(function (req: Request, res: Response, next) {
    res.locals.currentPath = req.path;
    next();
});

app.use(loadCurrentUser);

function formatDateOnly(date: Date): string {
    return date.toLocaleDateString();
}

function formatSeconds(seconds: number | null): string {
    if (seconds === null) {
        return "";
    }

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

function mapDashboardBrewSession(session: any) {
    return {
        id: session.id,
        brewDate: formatDateOnly(session.brewDate),
        beanName: session.coffeeBean.roasterName
            ? `${session.coffeeBean.roasterName} - ${session.coffeeBean.beanName}`
            : session.coffeeBean.beanName,
        grinderName: session.grinder ? session.grinder.name : "",
        brewerName: session.brewer ? session.brewer.name : "",
        coffeeDoseGrams: session.coffeeDoseGrams.toString(),
        totalYieldGrams: session.totalYieldGrams ? session.totalYieldGrams.toString() : "",
        brewRatio: session.brewRatio.toString(),
        totalBrewTime: formatSeconds(session.totalBrewTimeSeconds),
        overallRating: session.overallRating ? session.overallRating.toString() : "",
        wouldRepeat: session.wouldRepeat
    };
}

app.use("/auth", authRoutes);

app.get("/", requireAuth, async function (req: Request, res: Response) {
    const userId = getRequiredUserId(req);

    const [
        coffeeBeanCount,
        grinderCount,
        brewerCount,
        brewSessionCount,
        ratingAggregate,
        recentSessionsFromDatabase,
        topRatedSessionsFromDatabase
    ] = await Promise.all([
        prisma.coffeeBean.count({
            where: {
                userId: userId
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
        prisma.brewSession.aggregate({
            where: {
                userId: userId
            },
            _avg: {
                overallRating: true
            }
        }),
        prisma.brewSession.findMany({
            take: 5,
            where: {
                userId: userId
            },
            include: {
                coffeeBean: true,
                grinder: true,
                brewer: true
            },
            orderBy: {
                brewDate: "desc"
            }
        }),
        prisma.brewSession.findMany({
            take: 5,
            where: {
                userId: userId,
                overallRating: {
                    not: null
                }
            },
            include: {
                coffeeBean: true,
                grinder: true,
                brewer: true
            },
            orderBy: {
                overallRating: "desc"
            }
        })
    ]);

    const recentSessions = recentSessionsFromDatabase.map(function (session) {
        return mapDashboardBrewSession(session);
    });

    const topRatedSessions = topRatedSessionsFromDatabase.map(function (session) {
        return mapDashboardBrewSession(session);
    });

    res.render("home/index", {
        title: "Home",
        stats: {
            coffeeBeanCount: coffeeBeanCount,
            grinderCount: grinderCount,
            brewerCount: brewerCount,
            brewSessionCount: brewSessionCount,
            averageRating: ratingAggregate._avg.overallRating
                ? ratingAggregate._avg.overallRating.toFixed(1)
                : ""
        },
        recentSessions: recentSessions,
        topRatedSessions: topRatedSessions
    });
});

app.use("/profile", requireAuth, profileRoutes);
app.use("/admin", requireAuth, requireAdmin, adminRoutes);
app.use("/coffee-beans", requireAuth, coffeeBeanRoutes);
app.use("/grinders", requireAuth, grinderRoutes);
app.use("/brewers", requireAuth, brewerRoutes);
app.use("/brew-sessions", requireAuth, brewSessionRoutes);
app.use("/reports", requireAuth, reportRoutes);

app.listen(port, function () {
    console.log(`Pour-Over Coffee Tracker is running at http://localhost:${port}`);
});