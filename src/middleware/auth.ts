import { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";

export async function loadCurrentUser(req: Request, res: Response, next: NextFunction) {
    if (!req.session.userId) {
        res.locals.currentUser = null;
        next();
        return;
    }

    const user = await prisma.user.findUnique({
        where: {
            id: req.session.userId
        },
        select: {
            id: true,
            email: true,
            displayName: true,
            role: true,
            isActive: true
        }
    });

    if (!user || !user.isActive) {
        req.session.userId = undefined;
        res.locals.currentUser = null;
        next();
        return;
    }

    res.locals.currentUser = user;
    next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
    if (req.session.userId) {
        next();
        return;
    }

    const returnTo = encodeURIComponent(req.originalUrl || "/");
    res.redirect(`/auth/sign-in?returnTo=${returnTo}`);
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
    const currentUser = res.locals.currentUser;

    if (currentUser && currentUser.role === "Admin" && currentUser.isActive) {
        next();
        return;
    }

    res.status(403).send("Admin access is required.");
}

export function getRequiredUserId(req: Request): number {
    if (!req.session.userId) {
        throw new Error("User is not signed in.");
    }

    return req.session.userId;
}