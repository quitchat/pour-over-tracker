import { prisma } from "../lib/prisma";

export type AiCallLogHandle = {
    id: number | null;
    startedAtMs: number;
};

export type AiCallLogUser = {
    id: number;
    email: string;
};

export const AI_CALL_TYPES = {
    beanDetailLookup: "Bean Detail Lookup",
    beanBagOcr: "Bean Bag OCR",
    brewRecipeSuggestion: "Brew Recipe Suggestion"
} as const;

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

export async function startAiCallLog(args: {
    user: AiCallLogUser | null | undefined;
    callType: string;
    model: string | null | undefined;
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
                status: "Started"
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
    errorMessage?: string | null;
}): Promise<void> {
    if (!args.handle.id) {
        return;
    }

    const completedAt = new Date();
    const durationMs = Math.max(0, Date.now() - args.handle.startedAtMs);

    try {
        await prisma.aiCallLog.update({
            where: {
                id: args.handle.id
            },
            data: {
                status: args.status,
                completedAt: completedAt,
                durationMs: durationMs,
                errorMessage: args.status === "Failed" ? normalizeErrorMessage(args.errorMessage) : null
            }
        });
    } catch (error) {
        // AI call logging should never block the actual AI feature.
    }
}
