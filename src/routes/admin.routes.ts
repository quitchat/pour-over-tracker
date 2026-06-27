import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAdmin } from "../middleware/auth";
import {
    BEAN_DETAIL_AI_PROMPT_NAME,
    DEFAULT_BEAN_DETAIL_AI_PROMPT
} from "../services/coffeeInfo.service";
import {
    BREW_SUGGESTION_AI_PROMPT_NAME,
    DEFAULT_BREW_SUGGESTION_AI_PROMPT
} from "../services/brewAssistant.service";

const router = Router();

router.use(requireAdmin);

function getCurrentAdminFromLocals(res: Response) {
    return res.locals.currentUser as { id: number; email: string; displayName?: string | null } | undefined;
}

function formatDateTime(value: Date | null): string {
    if (!value) {
        return "";
    }

    return value.toLocaleString();
}

function getPromptStatusMessage(req: Request): string {
    const saved = String(req.query.saved || "");
    const reset = String(req.query.reset || "");

    if (saved === "1") {
        return "Prompt saved.";
    }

    if (reset === "1") {
        return "Prompt reset to default.";
    }

    return "";
}

router.get("/", function (req: Request, res: Response) {
    res.redirect("/admin/users");
});

router.get("/users", async function (req: Request, res: Response) {
    const usersFromDatabase = await prisma.user.findMany({
        orderBy: [
            {
                isActive: "desc"
            },
            {
                createdAt: "desc"
            }
        ],
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
        return {
            id: user.id,
            email: user.email,
            displayName: user.displayName || "",
            role: user.role,
            isActive: user.isActive,
            deactivatedAt: formatDateTime(user.deactivatedAt),
            createdAt: formatDateTime(user.createdAt),
            coffeeBeanCount: user._count.coffeeBeans,
            grinderCount: user._count.grinders,
            brewerCount: user._count.brewers,
            brewSessionCount: user._count.brewSessions
        };
    });

    res.render("admin/users", {
        title: "Admin - Users",
        users: users,
        message: String(req.query.message || ""),
        error: String(req.query.error || "")
    });
});

router.post("/users/:id/deactivate", async function (req: Request, res: Response) {
    const id = Number(req.params.id);
    const currentAdmin = getCurrentAdminFromLocals(res);

    if (!Number.isInteger(id) || id <= 0) {
        res.redirect("/admin/users?error=Invalid%20user.");
        return;
    }

    if (currentAdmin && currentAdmin.id === id) {
        res.redirect("/admin/users?error=You%20cannot%20deactivate%20yourself.");
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

    res.redirect("/admin/users?message=User%20deactivated.");
});

router.post("/users/:id/reactivate", async function (req: Request, res: Response) {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
        res.redirect("/admin/users?error=Invalid%20user.");
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

    res.redirect("/admin/users?message=User%20reactivated.");
});

router.post("/users/:id/make-admin", async function (req: Request, res: Response) {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
        res.redirect("/admin/users?error=Invalid%20user.");
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

    res.redirect("/admin/users?message=User%20made%20Admin.");
});

router.post("/users/:id/make-user", async function (req: Request, res: Response) {
    const id = Number(req.params.id);
    const currentAdmin = getCurrentAdminFromLocals(res);

    if (!Number.isInteger(id) || id <= 0) {
        res.redirect("/admin/users?error=Invalid%20user.");
        return;
    }

    if (currentAdmin && currentAdmin.id === id) {
        res.redirect("/admin/users?error=You%20cannot%20remove%20your%20own%20Admin%20role.");
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

    res.redirect("/admin/users?message=User%20changed%20to%20regular%20User.");
});

router.get("/bean-detail-ai-prompt", async function (req: Request, res: Response) {
    let promptRecord = await prisma.beanDetailAiPrompt.findUnique({
        where: {
            name: BEAN_DETAIL_AI_PROMPT_NAME
        }
    });

    if (!promptRecord) {
        promptRecord = await prisma.beanDetailAiPrompt.create({
            data: {
                name: BEAN_DETAIL_AI_PROMPT_NAME,
                promptText: DEFAULT_BEAN_DETAIL_AI_PROMPT
            }
        });
    }

    res.render("admin/bean-detail-ai-prompt", {
        title: "Admin - Bean Detail AI Prompt",
        promptRecord: promptRecord,
        defaultPromptText: DEFAULT_BEAN_DETAIL_AI_PROMPT,
        message: getPromptStatusMessage(req),
        error: String(req.query.error || "")
    });
});

router.post("/bean-detail-ai-prompt", async function (req: Request, res: Response) {
    const action = String(req.body.action || "save");
    const currentAdmin = getCurrentAdminFromLocals(res);
    const promptText = action === "reset"
        ? DEFAULT_BEAN_DETAIL_AI_PROMPT
        : String(req.body.promptText || "").trim();

    if (!promptText) {
        res.redirect("/admin/bean-detail-ai-prompt?error=Prompt%20text%20is%20required.");
        return;
    }

    await prisma.beanDetailAiPrompt.upsert({
        where: {
            name: BEAN_DETAIL_AI_PROMPT_NAME
        },
        create: {
            name: BEAN_DETAIL_AI_PROMPT_NAME,
            promptText: promptText,
            updatedByUserId: currentAdmin ? currentAdmin.id : null,
            updatedByEmail: currentAdmin ? currentAdmin.email : null
        },
        update: {
            promptText: promptText,
            updatedByUserId: currentAdmin ? currentAdmin.id : null,
            updatedByEmail: currentAdmin ? currentAdmin.email : null
        }
    });

    if (action === "reset") {
        res.redirect("/admin/bean-detail-ai-prompt?reset=1");
        return;
    }

    res.redirect("/admin/bean-detail-ai-prompt?saved=1");
});

router.get("/brew-suggestion-ai-prompt", async function (req: Request, res: Response) {
    let promptRecord = await prisma.brewSuggestionAiPrompt.findUnique({
        where: {
            name: BREW_SUGGESTION_AI_PROMPT_NAME
        }
    });

    if (!promptRecord) {
        promptRecord = await prisma.brewSuggestionAiPrompt.create({
            data: {
                name: BREW_SUGGESTION_AI_PROMPT_NAME,
                promptText: DEFAULT_BREW_SUGGESTION_AI_PROMPT
            }
        });
    }

    res.render("admin/brew-suggestion-ai-prompt", {
        title: "Admin - Brew Suggestion AI Prompt",
        promptRecord: promptRecord,
        defaultPromptText: DEFAULT_BREW_SUGGESTION_AI_PROMPT,
        message: getPromptStatusMessage(req),
        error: String(req.query.error || "")
    });
});

router.post("/brew-suggestion-ai-prompt", async function (req: Request, res: Response) {
    const action = String(req.body.action || "save");
    const currentAdmin = getCurrentAdminFromLocals(res);
    const promptText = action === "reset"
        ? DEFAULT_BREW_SUGGESTION_AI_PROMPT
        : String(req.body.promptText || "").trim();

    if (!promptText) {
        res.redirect("/admin/brew-suggestion-ai-prompt?error=Prompt%20text%20is%20required.");
        return;
    }

    await prisma.brewSuggestionAiPrompt.upsert({
        where: {
            name: BREW_SUGGESTION_AI_PROMPT_NAME
        },
        create: {
            name: BREW_SUGGESTION_AI_PROMPT_NAME,
            promptText: promptText,
            updatedByUserId: currentAdmin ? currentAdmin.id : null,
            updatedByEmail: currentAdmin ? currentAdmin.email : null
        },
        update: {
            promptText: promptText,
            updatedByUserId: currentAdmin ? currentAdmin.id : null,
            updatedByEmail: currentAdmin ? currentAdmin.email : null
        }
    });

    if (action === "reset") {
        res.redirect("/admin/brew-suggestion-ai-prompt?reset=1");
        return;
    }

    res.redirect("/admin/brew-suggestion-ai-prompt?saved=1");
});

export default router;
