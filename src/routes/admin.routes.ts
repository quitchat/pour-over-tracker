import { Router, Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";
import { createPostgresBackup, getDatabaseBackupInfo } from "../services/databaseBackup.service";
import { requireAdmin } from "../middleware/auth";
import { formatDateTimeUs } from "../utils/dateFormat";
import {
    BEAN_DETAIL_AI_PROMPT_NAME,
    COFFEE_BAG_IMAGE_IDENTITY_AI_PROMPT_NAME,
    DEFAULT_BEAN_DETAIL_AI_PROMPT,
    DEFAULT_COFFEE_BAG_IMAGE_IDENTITY_AI_PROMPT
} from "../services/coffeeInfo.service";
import {
    BREW_SUGGESTION_AI_PROMPT_NAME,
    DEFAULT_BREW_SUGGESTION_AI_PROMPT
} from "../services/brewAssistant.service";
import {
    AI_COST_SETTING_KEYS,
    ensureAiCostSettings,
    formatEstimatedCost,
    getInputCostPer1MTokens,
    getOutputCostPer1MTokens,
    getWebSearchCostPer1KCalls
} from "../services/aiCallLog.service";

const router = Router();

router.use(requireAdmin);

function getCurrentAdminFromLocals(res: Response) {
    return res.locals.currentUser as { id: number; email: string; displayName?: string | null } | undefined;
}

function formatDateTime(value: Date | null): string {
    return formatDateTimeUs(value);
}

function formatApiFeatureType(value: string | null | undefined): string {
    if (value === "web_search") {
        return "Web search";
    }

    if (value === "image_input") {
        return "Image input";
    }

    if (value === "image_input_and_web_search") {
        return "Image + web search";
    }

    return "Text only";
}

function formatCostNumber(value: unknown): string {
    if (value === null || typeof value === "undefined") {
        return "";
    }

    const numericValue = Number(value.toString());

    if (!Number.isFinite(numericValue)) {
        return "";
    }

    return numericValue.toFixed(6);
}

function parseNonNegativeDecimal(value: string): number | null {
    const parsed = Number(value);

    if (!Number.isFinite(parsed) || parsed < 0) {
        return null;
    }

    return parsed;
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

router.get("/ai", async function (req: Request, res: Response) {
    const currentMonthStart = new Date();
    currentMonthStart.setDate(1);
    currentMonthStart.setHours(0, 0, 0, 0);

    const [totalAiCallCount, failedAiCallCount, latestAiCallLog, totalCostSummary, currentMonthCostSummary, inputCostPer1MTokens, outputCostPer1MTokens, webSearchCostPer1KCalls] = await Promise.all([
        prisma.aiCallLog.count(),
        prisma.aiCallLog.count({
            where: {
                status: "Failed"
            }
        }),
        prisma.aiCallLog.findFirst({
            orderBy: {
                startedAt: "desc"
            },
            select: {
                startedAt: true
            }
        }),
        prisma.aiCallLog.aggregate({
            _sum: {
                estimatedCostUsd: true
            }
        }),
        prisma.aiCallLog.aggregate({
            where: {
                startedAt: {
                    gte: currentMonthStart
                }
            },
            _sum: {
                estimatedCostUsd: true
            }
        }),
        getInputCostPer1MTokens(),
        getOutputCostPer1MTokens(),
        getWebSearchCostPer1KCalls()
    ]);

    res.render("admin/ai", {
        title: "Admin - AI Administration",
        totalAiCallCount: totalAiCallCount,
        failedAiCallCount: failedAiCallCount,
        latestAiCallStartedAt: latestAiCallLog ? formatDateTime(latestAiCallLog.startedAt) : "",
        totalEstimatedCost: formatEstimatedCost(totalCostSummary._sum.estimatedCostUsd),
        currentMonthEstimatedCost: formatEstimatedCost(currentMonthCostSummary._sum.estimatedCostUsd),
        inputCostPer1MTokens: formatCostNumber(inputCostPer1MTokens),
        outputCostPer1MTokens: formatCostNumber(outputCostPer1MTokens),
        webSearchCostPer1KCalls: formatCostNumber(webSearchCostPer1KCalls)
    });
});

router.get("/ai-cost-settings", async function (req: Request, res: Response) {
    await ensureAiCostSettings();

    const [inputSetting, outputSetting, webSearchSetting] = await Promise.all([
        prisma.aiCostSetting.findUnique({
            where: {
                key: AI_COST_SETTING_KEYS.inputPer1MTokens
            }
        }),
        prisma.aiCostSetting.findUnique({
            where: {
                key: AI_COST_SETTING_KEYS.outputPer1MTokens
            }
        }),
        prisma.aiCostSetting.findUnique({
            where: {
                key: AI_COST_SETTING_KEYS.webSearchPer1KCalls
            }
        })
    ]);

    const effectiveInputCost = inputSetting
        ? Number(inputSetting.valueDecimal.toString())
        : await getInputCostPer1MTokens();
    const effectiveOutputCost = outputSetting
        ? Number(outputSetting.valueDecimal.toString())
        : await getOutputCostPer1MTokens();
    const effectiveWebSearchCost = webSearchSetting
        ? Number(webSearchSetting.valueDecimal.toString())
        : await getWebSearchCostPer1KCalls();

    res.render("admin/ai-cost-settings", {
        title: "Admin - AI Cost Settings",
        inputCostPer1MTokens: formatCostNumber(effectiveInputCost),
        outputCostPer1MTokens: formatCostNumber(effectiveOutputCost),
        webSearchCostPer1KCalls: formatCostNumber(effectiveWebSearchCost),
        inputUnit: inputSetting ? inputSetting.unit || "USD per 1,000,000 input tokens" : "USD per 1,000,000 input tokens",
        outputUnit: outputSetting ? outputSetting.unit || "USD per 1,000,000 output tokens" : "USD per 1,000,000 output tokens",
        webSearchUnit: webSearchSetting ? webSearchSetting.unit || "USD per 1,000 calls" : "USD per 1,000 calls",
        inputUpdatedByEmail: inputSetting ? inputSetting.updatedByEmail || "" : "",
        outputUpdatedByEmail: outputSetting ? outputSetting.updatedByEmail || "" : "",
        webSearchUpdatedByEmail: webSearchSetting ? webSearchSetting.updatedByEmail || "" : "",
        inputUpdatedAt: inputSetting ? formatDateTime(inputSetting.updatedAt) : "",
        outputUpdatedAt: outputSetting ? formatDateTime(outputSetting.updatedAt) : "",
        webSearchUpdatedAt: webSearchSetting ? formatDateTime(webSearchSetting.updatedAt) : "",
        message: String(req.query.message || ""),
        error: String(req.query.error || "")
    });
});

router.post("/ai-cost-settings", async function (req: Request, res: Response) {
    const currentAdmin = getCurrentAdminFromLocals(res);
    const inputCostRaw = String(req.body.inputCostPer1MTokens || "").trim();
    const outputCostRaw = String(req.body.outputCostPer1MTokens || "").trim();
    const webSearchCostRaw = String(req.body.webSearchCostPer1KCalls || "").trim();
    const inputCost = parseNonNegativeDecimal(inputCostRaw);
    const outputCost = parseNonNegativeDecimal(outputCostRaw);
    const webSearchCost = parseNonNegativeDecimal(webSearchCostRaw);

    if (inputCost === null) {
        res.redirect("/admin/ai-cost-settings?error=Input%20token%20cost%20must%20be%20a%20number%20greater%20than%20or%20equal%20to%200.");
        return;
    }

    if (outputCost === null) {
        res.redirect("/admin/ai-cost-settings?error=Output%20token%20cost%20must%20be%20a%20number%20greater%20than%20or%20equal%20to%200.");
        return;
    }

    if (webSearchCost === null) {
        res.redirect("/admin/ai-cost-settings?error=Web%20search%20cost%20must%20be%20a%20number%20greater%20than%20or%20equal%20to%200.");
        return;
    }

    const settings = [
        {
            key: AI_COST_SETTING_KEYS.inputPer1MTokens,
            label: "Input token cost",
            description: "Estimated base cost charged for OpenAI input tokens. Used to calculate AI log token cost.",
            value: inputCost,
            unit: "USD per 1,000,000 input tokens"
        },
        {
            key: AI_COST_SETTING_KEYS.outputPer1MTokens,
            label: "Output token cost",
            description: "Estimated base cost charged for OpenAI output tokens. Used to calculate AI log token cost.",
            value: outputCost,
            unit: "USD per 1,000,000 output tokens"
        },
        {
            key: AI_COST_SETTING_KEYS.webSearchPer1KCalls,
            label: "Web search tool cost",
            description: "Estimated base cost charged for OpenAI web search tool calls. Used to calculate AI log tool cost.",
            value: webSearchCost,
            unit: "USD per 1,000 calls"
        }
    ];

    for (const setting of settings) {
        await prisma.aiCostSetting.upsert({
            where: {
                key: setting.key
            },
            create: {
                key: setting.key,
                label: setting.label,
                description: setting.description,
                valueDecimal: setting.value.toFixed(6),
                unit: setting.unit,
                updatedByUserId: currentAdmin ? currentAdmin.id : null,
                updatedByEmail: currentAdmin ? currentAdmin.email : null
            },
            update: {
                label: setting.label,
                description: setting.description,
                valueDecimal: setting.value.toFixed(6),
                unit: setting.unit,
                updatedByUserId: currentAdmin ? currentAdmin.id : null,
                updatedByEmail: currentAdmin ? currentAdmin.email : null
            }
        });
    }

    res.redirect("/admin/ai-cost-settings?message=AI%20cost%20settings%20saved.");
});

router.get("/ai-call-logs", async function (req: Request, res: Response) {
    const callType = String(req.query.callType || "").trim();
    const status = String(req.query.status || "").trim();
    const apiFeatureType = String(req.query.apiFeatureType || "").trim();
    const requestedPage = Number(req.query.page || "1");
    const pageSize = 25;
    const currentPage = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const skip = (currentPage - 1) * pageSize;

    const where: {
        callType?: string;
        status?: string;
        apiFeatureType?: string;
    } = {};

    if (callType) {
        where.callType = callType;
    }

    if (status) {
        where.status = status;
    }

    if (apiFeatureType) {
        where.apiFeatureType = apiFeatureType;
    }

    const [totalLogCount, aiCallLogs, callTypes, statuses, apiFeatureTypes, filteredCostSummary] = await Promise.all([
        prisma.aiCallLog.count({
            where: where
        }),
        prisma.aiCallLog.findMany({
            where: where,
            orderBy: {
                startedAt: "desc"
            },
            skip: skip,
            take: pageSize
        }),
        prisma.aiCallLog.findMany({
            distinct: ["callType"],
            orderBy: {
                callType: "asc"
            },
            select: {
                callType: true
            }
        }),
        prisma.aiCallLog.findMany({
            distinct: ["status"],
            orderBy: {
                status: "asc"
            },
            select: {
                status: true
            }
        }),
        prisma.aiCallLog.findMany({
            distinct: ["apiFeatureType"],
            orderBy: {
                apiFeatureType: "asc"
            },
            select: {
                apiFeatureType: true
            }
        }),
        prisma.aiCallLog.aggregate({
            where: where,
            _sum: {
                estimatedCostUsd: true,
                tokenEstimatedCostUsd: true,
                toolEstimatedCostUsd: true,
                inputTokens: true,
                outputTokens: true,
                totalTokens: true,
                imageCount: true,
                webSearchCallCount: true
            }
        })
    ]);

    const logs = aiCallLogs.map(function (log) {
        return {
            id: log.id,
            userEmail: log.userEmail || "",
            callType: log.callType,
            model: log.model || "",
            status: log.status,
            startedAt: formatDateTime(log.startedAt),
            completedAt: formatDateTime(log.completedAt),
            durationMs: log.durationMs,
            inputTokens: log.inputTokens,
            outputTokens: log.outputTokens,
            totalTokens: log.totalTokens,
            imageCount: log.imageCount,
            apiFeatureType: log.apiFeatureType,
            apiFeatureLabel: formatApiFeatureType(log.apiFeatureType),
            toolCallTypes: log.toolCallTypes || "",
            webSearchCallCount: log.webSearchCallCount,
            tokenEstimatedCost: formatEstimatedCost(log.tokenEstimatedCostUsd),
            toolEstimatedCost: formatEstimatedCost(log.toolEstimatedCostUsd),
            estimatedCost: formatEstimatedCost(log.estimatedCostUsd),
            errorMessage: log.errorMessage || "",
            hasPrompt: !!log.promptText,
            hasOutput: !!log.outputText
        };
    });

    const totalPages = Math.max(1, Math.ceil(totalLogCount / pageSize));
    const queryBase = new URLSearchParams();

    if (callType) {
        queryBase.set("callType", callType);
    }

    if (status) {
        queryBase.set("status", status);
    }

    if (apiFeatureType) {
        queryBase.set("apiFeatureType", apiFeatureType);
    }

    const pageLinks = Array.from({ length: totalPages }, function (_, index) {
        const pageNumber = index + 1;
        const pageQuery = new URLSearchParams(queryBase.toString());
        pageQuery.set("page", String(pageNumber));

        return {
            pageNumber: pageNumber,
            href: `/admin/ai-call-logs?${pageQuery.toString()}`
        };
    });

    function buildPageUrl(pageNumber: number): string {
        const pageQuery = new URLSearchParams(queryBase.toString());
        pageQuery.set("page", String(pageNumber));

        return `/admin/ai-call-logs?${pageQuery.toString()}`;
    }

    res.render("admin/ai-call-logs", {
        title: "Admin - AI Call Logs",
        logs: logs,
        callTypes: callTypes.map(function (item) { return item.callType; }),
        statuses: statuses.map(function (item) { return item.status; }),
        apiFeatureTypes: apiFeatureTypes.map(function (item) { return { value: item.apiFeatureType, label: formatApiFeatureType(item.apiFeatureType) }; }),
        selectedCallType: callType,
        selectedStatus: status,
        selectedApiFeatureType: apiFeatureType,
        filteredInputTokens: filteredCostSummary._sum.inputTokens || 0,
        filteredOutputTokens: filteredCostSummary._sum.outputTokens || 0,
        filteredTotalTokens: filteredCostSummary._sum.totalTokens || 0,
        filteredImageCount: filteredCostSummary._sum.imageCount || 0,
        filteredWebSearchCallCount: filteredCostSummary._sum.webSearchCallCount || 0,
        filteredTokenEstimatedCost: formatEstimatedCost(filteredCostSummary._sum.tokenEstimatedCostUsd),
        filteredToolEstimatedCost: formatEstimatedCost(filteredCostSummary._sum.toolEstimatedCostUsd),
        filteredEstimatedCost: formatEstimatedCost(filteredCostSummary._sum.estimatedCostUsd),
        pagination: {
            currentPage: currentPage,
            pageSize: pageSize,
            totalItems: totalLogCount,
            totalPages: totalPages,
            hasPreviousPage: currentPage > 1,
            hasNextPage: currentPage < totalPages,
            previousPage: currentPage - 1,
            nextPage: currentPage + 1,
            previousPageHref: buildPageUrl(currentPage - 1),
            nextPageHref: buildPageUrl(currentPage + 1),
            pageLinks: pageLinks
        }
    });
});

router.get("/ai-call-logs/:id", async function (req: Request, res: Response) {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
        res.redirect("/admin/ai-call-logs");
        return;
    }

    const log = await prisma.aiCallLog.findUnique({
        where: {
            id: id
        }
    });

    if (!log) {
        res.redirect("/admin/ai-call-logs");
        return;
    }

    res.render("admin/ai-call-log-detail", {
        title: "Admin - AI Call Log Detail",
        log: {
            id: log.id,
            userEmail: log.userEmail || "",
            callType: log.callType,
            model: log.model || "",
            status: log.status,
            startedAt: formatDateTime(log.startedAt),
            completedAt: formatDateTime(log.completedAt),
            durationMs: log.durationMs,
            inputTokens: log.inputTokens,
            outputTokens: log.outputTokens,
            totalTokens: log.totalTokens,
            imageCount: log.imageCount,
            apiFeatureType: log.apiFeatureType,
            apiFeatureLabel: formatApiFeatureType(log.apiFeatureType),
            toolCallTypes: log.toolCallTypes || "",
            webSearchCallCount: log.webSearchCallCount,
            tokenEstimatedCost: formatEstimatedCost(log.tokenEstimatedCostUsd),
            toolEstimatedCost: formatEstimatedCost(log.toolEstimatedCostUsd),
            estimatedCost: formatEstimatedCost(log.estimatedCostUsd),
            errorMessage: log.errorMessage || "",
            promptText: log.promptText || "",
            outputText: log.outputText || ""
        }
    });
});

router.get("/users", async function (req: Request, res: Response) {
    const currentAdmin = getCurrentAdminFromLocals(res);

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
            allowAi: user.allowAi,
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
        currentUserId: currentAdmin ? currentAdmin.id : null,
        message: String(req.query.message || ""),
        error: String(req.query.error || "")
    });
});

router.post("/users/:id/enable-ai", async function (req: Request, res: Response) {
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
            allowAi: true
        }
    });

    res.redirect("/admin/users?message=AI%20access%20enabled.");
});

router.post("/users/:id/disable-ai", async function (req: Request, res: Response) {
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
            allowAi: false
        }
    });

    res.redirect("/admin/users?message=AI%20access%20disabled.");
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

router.get("/coffee-bag-image-identity-ai-prompt", async function (req: Request, res: Response) {
    let promptRecord = await prisma.coffeeBagImageIdentityAiPrompt.findUnique({
        where: {
            name: COFFEE_BAG_IMAGE_IDENTITY_AI_PROMPT_NAME
        }
    });

    if (!promptRecord) {
        promptRecord = await prisma.coffeeBagImageIdentityAiPrompt.create({
            data: {
                name: COFFEE_BAG_IMAGE_IDENTITY_AI_PROMPT_NAME,
                promptText: DEFAULT_COFFEE_BAG_IMAGE_IDENTITY_AI_PROMPT
            }
        });
    }

    res.render("admin/coffee-bag-image-identity-ai-prompt", {
        title: "Admin - Bean Bag Image OCR AI Prompt",
        promptRecord: promptRecord,
        defaultPromptText: DEFAULT_COFFEE_BAG_IMAGE_IDENTITY_AI_PROMPT,
        message: getPromptStatusMessage(req),
        error: String(req.query.error || "")
    });
});

router.post("/coffee-bag-image-identity-ai-prompt", async function (req: Request, res: Response) {
    const action = String(req.body.action || "save");
    const currentAdmin = getCurrentAdminFromLocals(res);
    const promptText = action === "reset"
        ? DEFAULT_COFFEE_BAG_IMAGE_IDENTITY_AI_PROMPT
        : String(req.body.promptText || "").trim();

    if (!promptText) {
        res.redirect("/admin/coffee-bag-image-identity-ai-prompt?error=Prompt%20text%20is%20required.");
        return;
    }

    await prisma.coffeeBagImageIdentityAiPrompt.upsert({
        where: {
            name: COFFEE_BAG_IMAGE_IDENTITY_AI_PROMPT_NAME
        },
        create: {
            name: COFFEE_BAG_IMAGE_IDENTITY_AI_PROMPT_NAME,
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
        res.redirect("/admin/coffee-bag-image-identity-ai-prompt?reset=1");
        return;
    }

    res.redirect("/admin/coffee-bag-image-identity-ai-prompt?saved=1");
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


async function getOrphanedBeanPurchases() {
    return await prisma.beanPurchase.findMany({
        where: {
            inventories: {
                none: {}
            }
        },
        include: {
            bean: {
                select: {
                    id: true,
                    beanName: true,
                    roasterName: true
                }
            }
        },
        orderBy: {
            createdAt: "desc"
        }
    });
}

router.get("/orphan-purchases", async function (req: Request, res: Response) {
    const orphanedPurchases = await getOrphanedBeanPurchases();

    res.render("admin/orphan-purchases", {
        title: "Admin - Orphaned Replenishments",
        orphanedPurchases: orphanedPurchases.map(function (purchase) {
            return {
                id: purchase.id,
                beanId: purchase.beanId,
                beanName: purchase.bean.beanName,
                roasterName: purchase.bean.roasterName || "",
                purchaseDate: formatDateTime(purchase.purchaseDate),
                quantity: purchase.quantity,
                currencyCode: purchase.currencyCode,
                totalPaid: purchase.totalPaid === null ? "" : purchase.totalPaid.toString(),
                createdAt: formatDateTime(purchase.createdAt)
            };
        }),
        message: String(req.query.message || ""),
        error: String(req.query.error || "")
    });
});

router.post("/orphan-purchases/delete", async function (req: Request, res: Response) {
    const confirmDelete = String(req.body.confirmDelete || "");

    if (confirmDelete !== "DELETE") {
        res.redirect("/admin/orphan-purchases?error=Type%20DELETE%20to%20confirm%20orphaned%20replenishment%20cleanup.");
        return;
    }

    const result = await prisma.beanPurchase.deleteMany({
        where: {
            inventories: {
                none: {}
            }
        }
    });

    res.redirect(`/admin/orphan-purchases?message=${encodeURIComponent(`${result.count} orphaned replenish record${result.count === 1 ? "" : "s"} deleted.`)}`);
});


router.get("/database", function (req: Request, res: Response) {
    const databaseInfo = getDatabaseBackupInfo();

    res.render("admin/database", {
        title: "Admin - Database",
        databaseInfo: databaseInfo,
        message: String(req.query.message || ""),
        error: String(req.query.error || "")
    });
});

router.post("/database/backup", async function (req: Request, res: Response, next: NextFunction) {
    try {
        const backup = await createPostgresBackup();

        res.download(backup.filePath, backup.fileName, async function (downloadError: Error | undefined) {
            await backup.cleanup();

            if (downloadError) {
                next(downloadError);
            }
        });
    } catch (error) {
        const message = error instanceof Error && error.message
            ? error.message
            : "Database backup failed.";

        res.redirect(`/admin/database?error=${encodeURIComponent(message)}`);
    }
});

export default router;