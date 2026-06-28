import { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma";

type CurrentUser = {
    id: number;
    email: string;
    displayName: string | null;
    role: string;
    isActive: boolean;
    allowAi: boolean;
};

function isApiRequest(req: Request): boolean {
    const acceptsJson = req.headers.accept ? req.headers.accept.includes("application/json") : false;
    const isAjax = req.headers["x-requested-with"] === "XMLHttpRequest";
    const isJsonContentType = req.headers["content-type"] ? req.headers["content-type"].includes("application/json") : false;

    if (acceptsJson || isAjax || isJsonContentType) {
        return true;
    }

    return false;
}

function getReturnUrl(req: Request): string {
    if (!req.originalUrl || req.originalUrl.startsWith("/auth")) {
        return "/";
    }

    return req.originalUrl;
}

export async function loadCurrentUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        res.locals.currentUser = null;

        if (!req.session.userId) {
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
                isActive: true,
                allowAi: true
            }
        });

        if (!user || !user.isActive) {
            req.session.destroy(function () {
                next();
            });

            return;
        }

        res.locals.currentUser = user;
        next();
    } catch (error) {
        next(error);
    }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
    const currentUser = res.locals.currentUser as CurrentUser | null | undefined;

    if (currentUser && currentUser.isActive) {
        next();
        return;
    }

    if (isApiRequest(req)) {
        res.status(401).json({
            ok: false,
            message: "You must sign in first."
        });

        return;
    }

    const returnUrl = encodeURIComponent(getReturnUrl(req));
    res.redirect(`/auth/sign-in?returnUrl=${returnUrl}`);
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
    const currentUser = res.locals.currentUser as CurrentUser | null | undefined;

    if (!currentUser || !currentUser.isActive) {
        if (isApiRequest(req)) {
            res.status(401).json({
                ok: false,
                message: "You must sign in first."
            });

            return;
        }

        const returnUrl = encodeURIComponent(getReturnUrl(req));
        res.redirect(`/auth/sign-in?returnUrl=${returnUrl}`);
        return;
    }

    if (currentUser.role !== "Admin") {
        if (isApiRequest(req)) {
            res.status(403).json({
                ok: false,
                message: "Admin access is required."
            });

            return;
        }

        res.status(403).render("error", {
            title: "Access Denied",
            message: "Admin access is required."
        });

        return;
    }

    next();
}

export function requireAiAccess(req: Request, res: Response, next: NextFunction): void {
    const currentUser = res.locals.currentUser as CurrentUser | null | undefined;

    if (currentUser && currentUser.isActive && currentUser.allowAi) {
        next();
        return;
    }

    if (isApiRequest(req)) {
        res.status(403).json({
            ok: false,
            message: "AI access is not enabled for your account.",
            errorMessage: "AI access is not enabled for your account."
        });

        return;
    }

    res.status(403).render("error", {
        title: "AI Access Disabled",
        message: "AI access is not enabled for your account."
    });
}

export function getRequiredUserId(req: Request): number {
    if (!req.session.userId) {
        throw new Error("User is not signed in.");
    }

    return req.session.userId;
}