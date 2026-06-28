import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";

export type AiCallLogHandle = {
    id: number | null;
    startedAtMs: number;
};

export type AiCallLogUser = {
    id: number;
    email: string;
};

export type AiTokenUsage = {
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
};

export const AI_CALL_TYPES = {
    beanDetailLookup: "Bean Detail Lookup",
    beanBagOcr: "Bean Bag OCR",
    beanBagLookup: "Bean Bag Image Lookup",
    brewRecipeSuggestion: "Brew Recipe Suggestion"
} as const;

export const AI_API_FEATURE_TYPES = {
    textOnly: "text_only",
    imageInput: "image_input",
    webSearch: "web_search",
    imageInputAndWebSearch: "image_input_and_web_search"
} as const;

export const AI_TOOL_CALL_TYPES = {
    webSearch: "web_search",
    imageInput: "image_input"
} as const;

export const AI_COST_SETTING_KEYS = {
    inputPer1MTokens: "input_per_1m_tokens",
    outputPer1MTokens: "output_per_1m_tokens",
    webSearchPer1KCalls: "web_search_per_1k_calls"
} as const;

export const DEFAULT_INPUT_COST_PER_1M_TOKENS = 0.4;
export const DEFAULT_OUTPUT_COST_PER_1M_TOKENS = 1.6;
export const DEFAULT_WEB_SEARCH_COST_PER_1K_CALLS = 10;

type AiModelPrice = {
    inputPerMillion: number;
    outputPerMillion: number;
};

const DEFAULT_MODEL_PRICES_PER_MILLION: Record<string, AiModelPrice> = {
    "gpt-4.1-mini": {
        inputPerMillion: DEFAULT_INPUT_COST_PER_1M_TOKENS,
        outputPerMillion: DEFAULT_OUTPUT_COST_PER_1M_TOKENS
    },
    "gpt-5.4-mini": {
        inputPerMillion: DEFAULT_INPUT_COST_PER_1M_TOKENS,
        outputPerMillion: DEFAULT_OUTPUT_COST_PER_1M_TOKENS
    },
    "gpt-5.5-mini": {
        inputPerMillion: DEFAULT_INPUT_COST_PER_1M_TOKENS,
        outputPerMillion: DEFAULT_OUTPUT_COST_PER_1M_TOKENS
    }
};

function normalizeErrorMessage(errorMessage: string | null | undefined): string | null {
    if (!errorMessage) {
        return null;
    }

    const trimmed = errorMessage.trim();

    if (!trimmed) {
        return null;
    }

    if (trimmed.length <= 500) {
        return trimmed;
    }

    return `${trimmed.substring(0, 497)}...`;
}

function normalizeLogPayload(value: string | null | undefined): string | null {
    if (!value) {
        return null;
    }

    const trimmed = value.trim();

    if (!trimmed) {
        return null;
    }

    return trimmed;
}

function getNumberValue(value: unknown): number | null {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        return null;
    }

    return Math.max(0, Math.round(value));
}

function getEnvNumber(name: string): number | null {
    const rawValue = process.env[name];

    if (!rawValue) {
        return null;
    }

    const parsed = Number(rawValue);

    if (!Number.isFinite(parsed) || parsed < 0) {
        return null;
    }

    return parsed;
}

function getDefaultInputCostPer1MTokens(): number {
    return getEnvNumber("OPENAI_COST_INPUT_PER_1M") ?? DEFAULT_INPUT_COST_PER_1M_TOKENS;
}

function getDefaultOutputCostPer1MTokens(): number {
    return getEnvNumber("OPENAI_COST_OUTPUT_PER_1M") ?? DEFAULT_OUTPUT_COST_PER_1M_TOKENS;
}

function getDefaultWebSearchCostPer1KCalls(): number {
    return getEnvNumber("OPENAI_COST_WEB_SEARCH_PER_1K") ?? DEFAULT_WEB_SEARCH_COST_PER_1K_CALLS;
}

async function getAiCostSettingNumber(key: string, fallbackValue: number): Promise<number> {
    try {
        const setting = await prisma.aiCostSetting.findUnique({
            where: {
                key: key
            },
            select: {
                valueDecimal: true
            }
        });

        if (!setting) {
            return fallbackValue;
        }

        const parsed = Number(setting.valueDecimal.toString());

        if (!Number.isFinite(parsed) || parsed < 0) {
            return fallbackValue;
        }

        return parsed;
    } catch (error) {
        return fallbackValue;
    }
}

export async function getInputCostPer1MTokens(): Promise<number> {
    return getAiCostSettingNumber(AI_COST_SETTING_KEYS.inputPer1MTokens, getDefaultInputCostPer1MTokens());
}

export async function getOutputCostPer1MTokens(): Promise<number> {
    return getAiCostSettingNumber(AI_COST_SETTING_KEYS.outputPer1MTokens, getDefaultOutputCostPer1MTokens());
}

export async function getWebSearchCostPer1KCalls(): Promise<number> {
    return getAiCostSettingNumber(AI_COST_SETTING_KEYS.webSearchPer1KCalls, getDefaultWebSearchCostPer1KCalls());
}

export async function ensureAiCostSettings(): Promise<void> {
    try {
        const settings = [
            {
                key: AI_COST_SETTING_KEYS.inputPer1MTokens,
                label: "Input token cost",
                description: "Estimated base cost charged for OpenAI input tokens. Used to calculate AI log token cost.",
                value: getDefaultInputCostPer1MTokens(),
                unit: "USD per 1,000,000 input tokens"
            },
            {
                key: AI_COST_SETTING_KEYS.outputPer1MTokens,
                label: "Output token cost",
                description: "Estimated base cost charged for OpenAI output tokens. Used to calculate AI log token cost.",
                value: getDefaultOutputCostPer1MTokens(),
                unit: "USD per 1,000,000 output tokens"
            },
            {
                key: AI_COST_SETTING_KEYS.webSearchPer1KCalls,
                label: "Web search tool cost",
                description: "Estimated base cost charged for OpenAI web search tool calls. Used to calculate AI log tool cost.",
                value: getDefaultWebSearchCostPer1KCalls(),
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
                    valueDecimal: new Prisma.Decimal(setting.value.toFixed(6)),
                    unit: setting.unit
                },
                update: {}
            });
        }
    } catch (error) {
        // Cost settings should not block admin pages or AI features.
    }
}

async function getModelPrice(model: string | null | undefined): Promise<AiModelPrice | null> {
    const configuredInputPrice = await getInputCostPer1MTokens();
    const configuredOutputPrice = await getOutputCostPer1MTokens();

    if (configuredInputPrice !== null && configuredOutputPrice !== null) {
        return {
            inputPerMillion: configuredInputPrice,
            outputPerMillion: configuredOutputPrice
        };
    }

    if (!model) {
        return null;
    }

    const normalizedModel = model.trim().toLowerCase();

    if (DEFAULT_MODEL_PRICES_PER_MILLION[normalizedModel]) {
        return DEFAULT_MODEL_PRICES_PER_MILLION[normalizedModel];
    }

    return null;
}

async function estimateTokenCostUsd(args: {
    model: string | null | undefined;
    inputTokens: number | null;
    outputTokens: number | null;
}): Promise<Prisma.Decimal | null> {
    const price = await getModelPrice(args.model);

    if (!price) {
        return null;
    }

    const inputTokens = args.inputTokens || 0;
    const outputTokens = args.outputTokens || 0;

    if (inputTokens === 0 && outputTokens === 0) {
        return null;
    }

    const estimatedCost = (inputTokens / 1000000) * price.inputPerMillion + (outputTokens / 1000000) * price.outputPerMillion;

    return new Prisma.Decimal(estimatedCost.toFixed(6));
}


async function estimateToolCostUsd(args: {
    webSearchCallCount: number | null | undefined;
}): Promise<Prisma.Decimal | null> {
    const webSearchCallCount = args.webSearchCallCount || 0;

    if (webSearchCallCount <= 0) {
        return null;
    }

    const webSearchCostPerThousand = await getWebSearchCostPer1KCalls();
    const estimatedCost = (webSearchCallCount / 1000) * webSearchCostPerThousand;

    return new Prisma.Decimal(estimatedCost.toFixed(6));
}

function addCostsUsd(first: Prisma.Decimal | null, second: Prisma.Decimal | null): Prisma.Decimal | null {
    if (!first && !second) {
        return null;
    }

    const firstNumber = first ? Number(first.toString()) : 0;
    const secondNumber = second ? Number(second.toString()) : 0;

    return new Prisma.Decimal((firstNumber + secondNumber).toFixed(6));
}

function normalizeApiFeatureType(value: string | null | undefined): string {
    if (!value) {
        return AI_API_FEATURE_TYPES.textOnly;
    }

    const normalizedValue = value.trim();
    const allowedValues = Object.values(AI_API_FEATURE_TYPES) as string[];

    if (allowedValues.indexOf(normalizedValue) >= 0) {
        return normalizedValue;
    }

    return AI_API_FEATURE_TYPES.textOnly;
}

function normalizeToolCallTypes(value: string | null | undefined): string | null {
    if (!value) {
        return null;
    }

    const normalizedTypes = value.split(",")
        .map(function (item) { return item.trim(); })
        .filter(function (item) { return item.length > 0; });

    if (normalizedTypes.length === 0) {
        return null;
    }

    return Array.from(new Set(normalizedTypes)).join(", ");
}

export function extractAiTokenUsage(response: unknown): AiTokenUsage {
    const responseAsAny = response as any;
    const usage = responseAsAny && responseAsAny.usage ? responseAsAny.usage : null;

    if (!usage) {
        return {
            inputTokens: null,
            outputTokens: null,
            totalTokens: null
        };
    }

    const inputTokens = getNumberValue(usage.input_tokens ?? usage.prompt_tokens);
    const outputTokens = getNumberValue(usage.output_tokens ?? usage.completion_tokens);
    const totalTokens = getNumberValue(usage.total_tokens) ??
        (inputTokens !== null || outputTokens !== null ? (inputTokens || 0) + (outputTokens || 0) : null);

    return {
        inputTokens: inputTokens,
        outputTokens: outputTokens,
        totalTokens: totalTokens
    };
}

export function formatEstimatedCost(value: unknown): string {
    if (value === null || typeof value === "undefined") {
        return "";
    }

    const numericValue = Number(value.toString());

    if (!Number.isFinite(numericValue)) {
        return "";
    }

    return `$${numericValue.toFixed(6)}`;
}

export async function startAiCallLog(args: {
    user: AiCallLogUser | null | undefined;
    callType: string;
    model: string | null | undefined;
    imageCount?: number | null;
    apiFeatureType?: string | null;
    toolCallTypes?: string | null;
    webSearchCallCount?: number | null;
    promptText?: string | null;
}): Promise<AiCallLogHandle> {
    const handle: AiCallLogHandle = {
        id: null,
        startedAtMs: Date.now()
    };

    try {
        const createdLog = await prisma.aiCallLog.create({
            data: {
                userId: args.user ? args.user.id : null,
                userEmail: args.user ? args.user.email : null,
                callType: args.callType,
                model: args.model || null,
                status: "Started",
                imageCount: args.imageCount || 0,
                apiFeatureType: normalizeApiFeatureType(args.apiFeatureType),
                toolCallTypes: normalizeToolCallTypes(args.toolCallTypes),
                webSearchCallCount: args.webSearchCallCount || 0,
                promptText: normalizeLogPayload(args.promptText)
            },
            select: {
                id: true
            }
        });

        handle.id = createdLog.id;
    } catch (error) {
        // AI call logging should never block the actual AI feature.
    }

    return handle;
}

export async function finishAiCallLog(args: {
    handle: AiCallLogHandle;
    status: "Succeeded" | "Failed";
    model?: string | null;
    errorMessage?: string | null;
    usage?: AiTokenUsage | null;
    imageCount?: number | null;
    apiFeatureType?: string | null;
    toolCallTypes?: string | null;
    webSearchCallCount?: number | null;
    promptText?: string | null;
    outputText?: string | null;
}): Promise<void> {
    if (!args.handle.id) {
        return;
    }

    const completedAt = new Date();
    const durationMs = Math.max(0, Date.now() - args.handle.startedAtMs);
    const usage = args.usage || null;
    const inputTokens = usage ? usage.inputTokens : null;
    const outputTokens = usage ? usage.outputTokens : null;
    const totalTokens = usage ? usage.totalTokens : null;
    const tokenEstimatedCostUsd = await estimateTokenCostUsd({
        model: args.model,
        inputTokens: inputTokens,
        outputTokens: outputTokens
    });
    const webSearchCallCount = args.webSearchCallCount === null || typeof args.webSearchCallCount === "undefined" ? null : Math.max(0, Math.round(args.webSearchCallCount));
    const toolEstimatedCostUsd = await estimateToolCostUsd({
        webSearchCallCount: webSearchCallCount
    });
    const estimatedCostUsd = addCostsUsd(tokenEstimatedCostUsd, toolEstimatedCostUsd);

    try {
        await prisma.aiCallLog.update({
            where: {
                id: args.handle.id
            },
            data: {
                status: args.status,
                completedAt: completedAt,
                durationMs: durationMs,
                inputTokens: inputTokens,
                outputTokens: outputTokens,
                totalTokens: totalTokens,
                imageCount: args.imageCount === null || typeof args.imageCount === "undefined" ? undefined : args.imageCount,
                apiFeatureType: args.apiFeatureType === null || typeof args.apiFeatureType === "undefined" ? undefined : normalizeApiFeatureType(args.apiFeatureType),
                toolCallTypes: args.toolCallTypes === null || typeof args.toolCallTypes === "undefined" ? undefined : normalizeToolCallTypes(args.toolCallTypes),
                webSearchCallCount: webSearchCallCount === null ? undefined : webSearchCallCount,
                tokenEstimatedCostUsd: tokenEstimatedCostUsd,
                toolEstimatedCostUsd: toolEstimatedCostUsd,
                estimatedCostUsd: estimatedCostUsd,
                promptText: args.promptText === null || typeof args.promptText === "undefined" ? undefined : normalizeLogPayload(args.promptText),
                outputText: args.outputText === null || typeof args.outputText === "undefined" ? undefined : normalizeLogPayload(args.outputText),
                errorMessage: args.status === "Failed" ? normalizeErrorMessage(args.errorMessage) : null
            }
        });
    } catch (error) {
        // AI call logging should never block the actual AI feature.
    }
}
