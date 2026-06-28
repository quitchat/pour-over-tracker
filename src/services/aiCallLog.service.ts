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
    brewRecipeSuggestion: "Brew Recipe Suggestion"
} as const;

type AiModelPrice = {
    inputPerMillion: number;
    outputPerMillion: number;
};

const DEFAULT_MODEL_PRICES_PER_MILLION: Record<string, AiModelPrice> = {
    "gpt-4.1-mini": {
        inputPerMillion: 0.4,
        outputPerMillion: 1.6
    },
    "gpt-5.4-mini": {
        inputPerMillion: 0.4,
        outputPerMillion: 1.6
    },
    "gpt-5.5-mini": {
        inputPerMillion: 0.4,
        outputPerMillion: 1.6
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

function getModelPrice(model: string | null | undefined): AiModelPrice | null {
    const configuredInputPrice = getEnvNumber("OPENAI_COST_INPUT_PER_1M");
    const configuredOutputPrice = getEnvNumber("OPENAI_COST_OUTPUT_PER_1M");

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

function estimateAiCallCostUsd(args: {
    model: string | null | undefined;
    inputTokens: number | null;
    outputTokens: number | null;
}): Prisma.Decimal | null {
    const price = getModelPrice(args.model);

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
                imageCount: args.imageCount || 0
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
    const estimatedCostUsd = estimateAiCallCostUsd({
        model: args.model,
        inputTokens: inputTokens,
        outputTokens: outputTokens
    });

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
                estimatedCostUsd: estimatedCostUsd,
                errorMessage: args.status === "Failed" ? normalizeErrorMessage(args.errorMessage) : null
            }
        });
    } catch (error) {
        // AI call logging should never block the actual AI feature.
    }
}
