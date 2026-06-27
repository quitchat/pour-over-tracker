import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { getRequiredUserId } from "../middleware/auth";
import {
    BEAN_DETAIL_AI_PROMPT_NAME,
    DEFAULT_BEAN_DETAIL_AI_PROMPT
} from "../services/coffeeInfo.service";

const router = Router();

function formatDateTime(date: Date | null): string {
    if (!date) {
        return "";
    }

    return date.toLocaleString();
}

function mapUserForAdmin(user: any) {
    return {
        id: user.id,
        email: user.email,
        displayName: user.displayName || "",
        role: user.role,
        isActive: user.isActive,
        createdAt: formatDateTime(user.createdAt),
        deactivatedAt: formatDateTime(user.deactivatedAt),
        coffeeBeanCount: user._count.coffeeBeans,
        grinderCount: user._count.grinders,
        brewerCount: user._count.brewers,
        brewSessionCount: user._count.brewSessions
    };
}

async function getBeanDetailAiPrompt() {
    const existingPrompt = await prisma.beanDetailAiPrompt.findUnique({
        where: {
            name: BEAN_DETAIL_AI_PROMPT_NAME
        }
    });

    if (existingPrompt) {
        return existingPrompt;
    }

    return await prisma.beanDetailAiPrompt.create({
        data: {
            name: BEAN_DETAIL_AI_PROMPT_NAME,
            promptText: DEFAULT_BEAN_DETAIL_AI_PROMPT
        }
    });
}

router.get("/", function (req: Request, res: Response) {
    res.redirect("/admin/users");
});

router.get("/users", async function (req: Request, res: Response) {
    const usersFromDatabase = await prisma.user.findMany({
        orderBy: {
            createdAt: "desc"
        },
        include: {
            _count: {
                select: {
                    coffeeBeans: true,
                    grinders: true,
                    brewers: true,
                    brewSessions: true
                }
            }
        }
    });

    const users = usersFromDatabase.map(function (user) {
        return mapUserForAdmin(user);
    });

    res.render("admin/users", {
        title: "Admin Users",
        users: users,
        currentUserId: getRequiredUserId(req)
    });
});

router.post("/users/:id/deactivate", async function (req: Request, res: Response) {
    const currentUserId = getRequiredUserId(req);
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
        res.status(400).send("Invalid user ID.");
        return;
    }

    if (id === currentUserId) {
        res.status(400).send("You cannot deactivate your own account.");
        return;
    }

    await prisma.user.update({
        where: {
            id: id
        },
        data: {
            isActive: false,
            deactivatedAt: new Date()
        }
    });

    res.redirect("/admin/users");
});

router.post("/users/:id/activate", async function (req: Request, res: Response) {
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
        res.status(400).send("Invalid user ID.");
        return;
    }

    await prisma.user.update({
        where: {
            id: id
        },
        data: {
            isActive: true,
            deactivatedAt: null
        }
    });

    res.redirect("/admin/users");
});

router.post("/users/:id/make-admin", async function (req: Request, res: Response) {
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
        res.status(400).send("Invalid user ID.");
        return;
    }

    await prisma.user.update({
        where: {
            id: id
        },
        data: {
            role: "Admin"
        }
    });

    res.redirect("/admin/users");
});

router.post("/users/:id/make-user", async function (req: Request, res: Response) {
    const currentUserId = getRequiredUserId(req);
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
        res.status(400).send("Invalid user ID.");
        return;
    }

    if (id === currentUserId) {
        res.status(400).send("You cannot remove your own Admin role.");
        return;
    }

    await prisma.user.update({
        where: {
            id: id
        },
        data: {
            role: "User"
        }
    });

    res.redirect("/admin/users");
});

router.get("/bean-detail-ai-prompt", async function (req: Request, res: Response) {
    const prompt = await getBeanDetailAiPrompt();

    res.render("admin/bean-detail-ai-prompt", {
        title: "Bean Detail AI Prompt",
        errors: [],
        message: String(req.query.message || ""),
        prompt: {
            id: prompt.id,
            promptText: prompt.promptText,
            updatedByEmail: prompt.updatedByEmail || "",
            updatedAt: formatDateTime(prompt.updatedAt)
        }
    });
});

router.post("/bean-detail-ai-prompt", async function (req: Request, res: Response) {
    const currentUserId = getRequiredUserId(req);
    const currentUser = await prisma.user.findUnique({
        where: {
            id: currentUserId
        }
    });

    const promptText = String(req.body.promptText || "").trim();
    const errors: string[] = [];

    if (!promptText) {
        errors.push("Prompt text is required.");
    }

    if (promptText.length < 100) {
        errors.push("Prompt text is too short. Please keep the detailed instructions.");
    }

    if (errors.length > 0) {
        res.status(400).render("admin/bean-detail-ai-prompt", {
            title: "Bean Detail AI Prompt",
            errors: errors,
            message: "",
            prompt: {
                id: 0,
                promptText: promptText,
                updatedByEmail: currentUser ? currentUser.email : "",
                updatedAt: ""
            }
        });

        return;
    }

    await prisma.beanDetailAiPrompt.upsert({
        where: {
            name: BEAN_DETAIL_AI_PROMPT_NAME
        },
        update: {
            promptText: promptText,
            updatedByUserId: currentUserId,
            updatedByEmail: currentUser ? currentUser.email : null
        },
        create: {
            name: BEAN_DETAIL_AI_PROMPT_NAME,
            promptText: promptText,
            updatedByUserId: currentUserId,
            updatedByEmail: currentUser ? currentUser.email : null
        }
    });

    res.redirect("/admin/bean-detail-ai-prompt?message=Prompt%20saved.");
});

router.post("/bean-detail-ai-prompt/reset", async function (req: Request, res: Response) {
    const currentUserId = getRequiredUserId(req);
    const currentUser = await prisma.user.findUnique({
        where: {
            id: currentUserId
        }
    });

    await prisma.beanDetailAiPrompt.upsert({
        where: {
            name: BEAN_DETAIL_AI_PROMPT_NAME
        },
        update: {
            promptText: DEFAULT_BEAN_DETAIL_AI_PROMPT,
            updatedByUserId: currentUserId,
            updatedByEmail: currentUser ? currentUser.email : null
        },
        create: {
            name: BEAN_DETAIL_AI_PROMPT_NAME,
            promptText: DEFAULT_BEAN_DETAIL_AI_PROMPT,
            updatedByUserId: currentUserId,
            updatedByEmail: currentUser ? currentUser.email : null
        }
    });

    res.redirect("/admin/bean-detail-ai-prompt?message=Prompt%20reset%20to%20default.");
});

export default router;