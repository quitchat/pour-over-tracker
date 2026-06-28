import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { getRequiredUserId } from "../middleware/auth";

const router = Router();

type GroupBucket = {
    name: string;
    count: number;
    ratingCount: number;
    totalRating: number;
    ratioCount: number;
    totalRatio: number;
};

type AnalyticsRow = {
    name: string;
    count: number;
    averageRating: string;
    averageRatio: string;
};

function createBucket(name: string): GroupBucket {
    return {
        name: name,
        count: 0,
        ratingCount: 0,
        totalRating: 0,
        ratioCount: 0,
        totalRatio: 0
    };
}

function addSessionToBucket(bucket: GroupBucket, session: any) {
    bucket.count += 1;

    if (session.overallRating) {
        bucket.ratingCount += 1;
        bucket.totalRating += Number(session.overallRating.toString());
    }


    if (session.brewRatio) {
        bucket.ratioCount += 1;
        bucket.totalRatio += Number(session.brewRatio.toString());
    }
}

function bucketToRow(bucket: GroupBucket): AnalyticsRow {
    const averageRating = bucket.ratingCount > 0
        ? (bucket.totalRating / bucket.ratingCount).toFixed(1)
        : "";

    const averageRatio = bucket.ratioCount > 0
        ? (bucket.totalRatio / bucket.ratioCount).toFixed(2)
        : "";

    return {
        name: bucket.name,
        count: bucket.count,
        averageRating: averageRating,
        averageRatio: averageRatio
    };
}

function sortAnalyticsRows(rows: AnalyticsRow[]): AnalyticsRow[] {
    return rows.sort(function (a, b) {
        const ratingA = a.averageRating ? Number(a.averageRating) : -1;
        const ratingB = b.averageRating ? Number(b.averageRating) : -1;

        if (ratingA !== ratingB) {
            return ratingB - ratingA;
        }

        return b.count - a.count;
    });
}

function buildAnalyticsRows(sessions: any[], getName: (session: any) => string): AnalyticsRow[] {
    const bucketMap = new Map<string, GroupBucket>();

    sessions.forEach(function (session) {
        const name = getName(session);

        if (!bucketMap.has(name)) {
            bucketMap.set(name, createBucket(name));
        }

        const bucket = bucketMap.get(name);

        if (bucket) {
            addSessionToBucket(bucket, session);
        }
    });

    const rows = Array.from(bucketMap.values()).map(function (bucket) {
        return bucketToRow(bucket);
    });

    return sortAnalyticsRows(rows);
}

function buildChartData(rows: AnalyticsRow[]) {
    const topRows = rows
        .filter(function (row) {
            return !!row.averageRating;
        })
        .slice(0, 10);

    return {
        labels: topRows.map(function (row) {
            return row.name;
        }),
        values: topRows.map(function (row) {
            return Number(row.averageRating);
        })
    };
}

router.get("/", async function (req: Request, res: Response) {
    const userId = getRequiredUserId(req);

    const sessions = await prisma.brewSession.findMany({
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
    });

    const beanRows = buildAnalyticsRows(sessions, function (session) {
        return session.coffeeBean.beanName;
    });

    const grinderRows = buildAnalyticsRows(sessions, function (session) {
        return session.grinder ? session.grinder.name : "(No grinder)";
    });

    const brewerRows = buildAnalyticsRows(sessions, function (session) {
        return session.brewer ? session.brewer.name : "(No brewer)";
    });

    const ratedSessions = sessions.filter(function (session) {
        return !!session.overallRating;
    });

    const totalRating = ratedSessions.reduce(function (sum, session) {
        return sum + Number(session.overallRating.toString());
    }, 0);

    const averageRating = ratedSessions.length > 0
        ? (totalRating / ratedSessions.length).toFixed(1)
        : "";

    res.render("reports/index", {
        title: "Analytics",
        summary: {
            brewSessionCount: sessions.length,
            ratedSessionCount: ratedSessions.length,
            averageRating: averageRating
        },
        beanRows: beanRows,
        grinderRows: grinderRows,
        brewerRows: brewerRows,
        beanChart: buildChartData(beanRows),
        grinderChart: buildChartData(grinderRows),
        brewerChart: buildChartData(brewerRows)
    });
});

export default router;