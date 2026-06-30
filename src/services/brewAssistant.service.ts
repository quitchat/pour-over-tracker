import OpenAI from "openai";
import { prisma } from "../lib/prisma";
import { AiTokenUsage, extractAiTokenUsage } from "./aiCallLog.service";

export type AiServiceResult<T> = {
    data: T;
    usage: AiTokenUsage;
    promptText: string;
    outputText: string;
};

export type RecentMatchingBrewForSuggestion = {
    brewDate: string;
    grindSize: string;
    coffeeDoseGrams: string;
    totalYieldGrams: string;
    brewRatio: string;
    waterTemperature: string;
    temperatureUnit: string;
    totalBrewTimeSeconds: number | null;
    overallRating: string;
    pourStructure: string;
    recipeSteps: string;
    brewComments: string;
    richness: number | null;
    sweetness: number | null;
    aftertaste: number | null;
    aroma: number | null;
    acidity: number | null;
};

export type BrewAssistantInput = {
    roasterName: string;
    beanName: string;
    origin: string;
    process: string;
    roastLevel: string;
    flavorNotes: string;
    beanInfo: string;
    beanNotes: string;
    grinderName: string;
    grinderBrand: string;
    grinderType: string;
    brewerName: string;
    brewerBrand: string;
    brewerType: string;
    coffeeDoseGrams: string;
    temperatureUnit: string;
    recentMatchingBrews: RecentMatchingBrewForSuggestion[];
};

export type BrewRecipeSuggestion = {
    recipeName: string;
    grindSize: string | null;
    waterTemperature: number | null;
    coffeeDoseGrams: number | null;
    totalYieldGrams: number | null;
    brewRatio: string | null;
    bloomWaterGrams: number | null;
    bloomSeconds: number | null;
    totalBrewTimeSeconds: number | null;
    pourStructure: string[];
    recipeSteps: string[];
    adjustmentTips: string[];
    reasoningNotes: string[];
};

export const BREW_SUGGESTION_AI_PROMPT_NAME = "default";

export const DEFAULT_BREW_SUGGESTION_AI_PROMPT = [
    "You are an expert pour-over coffee brewing assistant.",
    "Create a practical brewing recipe for the selected coffee bean, grinder, brewer, and dose.",
    "If recent matching brew history is provided, use it as the most important context for the recommendation.",
    "When previous brews have ratings and tasting scores, suggest a next recipe that learns from what worked and avoids repeating what did not work.",
    "The pentagon tasting scores are structured tasting feedback. The user's brew comments are free-form tasting notes and observations when available.",
    "Use web search when helpful to find brewing guidance for the brewer, coffee, roaster, or brew method.",
    "Do not invent exact roaster-specific instructions unless supported by search results or common brewing practice.",
    "Prefer practical home-brewing guidance over competition recipes.",
    "The recipe must be usable by a beginner.",
    "Do not include pricing.",
    "If grinder setting cannot be known exactly, give a reasonable general pour-over grind-size description or range. Do not use the grinder's saved default grind size range.",
    "For waterTemperature, use the user temperature unit provided in the request context.",
    "For totalYieldGrams, calculate a reasonable yield from the coffee dose, brewer, and coffee style.",
    "For brewRatio, return text like 1:15, 1:16, or 1:17.",
    "For totalBrewTimeSeconds, return the target total drawdown time in seconds.",
    "For pourStructure, include a short pour plan.",
    "For recipeSteps, include clear step-by-step brew instructions.",
    "For adjustmentTips, include what to change if the brew tastes sour, bitter, thin, muted, or too heavy.",
    "For reasoningNotes, include short practical reasons for the choices.",
    "Return structured JSON only."
].join("\n");

function getOpenAIClient() {
    if (!process.env.OPENAI_API_KEY) {
        throw new Error("OPENAI_API_KEY is missing. Add it to your .env file.");
    }

    return new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
    });
}

async function getBrewSuggestionAiPromptText(): Promise<string> {
    const existingPrompt = await prisma.brewSuggestionAiPrompt.findUnique({
        where: {
            name: BREW_SUGGESTION_AI_PROMPT_NAME
        }
    });

    if (existingPrompt) {
        return existingPrompt.promptText;
    }

    const createdPrompt = await prisma.brewSuggestionAiPrompt.create({
        data: {
            name: BREW_SUGGESTION_AI_PROMPT_NAME,
            promptText: DEFAULT_BREW_SUGGESTION_AI_PROMPT
        }
    });

    return createdPrompt.promptText;
}



function formatRecentMatchingBrewHistory(recentMatchingBrews: RecentMatchingBrewForSuggestion[]): string {
    if (!recentMatchingBrews || recentMatchingBrews.length === 0) {
        return "No recent matching brew history found.";
    }

    return recentMatchingBrews.map(function (brew, index) {
        const scoreParts = [
            brew.richness === null ? "" : `Richness ${brew.richness}/5`,
            brew.sweetness === null ? "" : `Sweetness ${brew.sweetness}/5`,
            brew.aftertaste === null ? "" : `Aftertaste ${brew.aftertaste}/5`,
            brew.aroma === null ? "" : `Aroma ${brew.aroma}/5`,
            brew.acidity === null ? "" : `Acidity ${brew.acidity}/5`
        ].filter(function (value) {
            return value;
        }).join(", ");

        return [
            `Recent matching brew #${index + 1}:`,
            `Date: ${brew.brewDate || "Unknown"}`,
            `Grind size: ${brew.grindSize || "Unknown"}`,
            `Dose: ${brew.coffeeDoseGrams || "Unknown"} g`,
            `Yield: ${brew.totalYieldGrams || "Unknown"} g`,
            `Ratio: ${brew.brewRatio || "Unknown"}`,
            `Water temp: ${brew.waterTemperature || "Unknown"} ${brew.temperatureUnit || ""}`.trim(),
            `Total brew time seconds: ${brew.totalBrewTimeSeconds === null ? "Unknown" : brew.totalBrewTimeSeconds}`,
            `Overall rating: ${brew.overallRating || "Unknown"}`,
            `Scores: ${scoreParts || "Unknown"}`,
            `Previous pour structure: ${brew.pourStructure || "None"}`,
            `Previous recipe steps: ${brew.recipeSteps || "None"}`,
            `User brew comments: ${brew.brewComments || "None"}`
        ].join("\n");
    }).join("\n\n");
}

function parseBrewRecipeSuggestionJson(outputText: string): BrewRecipeSuggestion {
    const parsed = JSON.parse(outputText) as BrewRecipeSuggestion;

    return {
        recipeName: parsed.recipeName || "Suggested Brewing Recipe",
        grindSize: parsed.grindSize || null,
        waterTemperature: typeof parsed.waterTemperature === "number" ? parsed.waterTemperature : null,
        coffeeDoseGrams: typeof parsed.coffeeDoseGrams === "number" ? parsed.coffeeDoseGrams : null,
        totalYieldGrams: typeof parsed.totalYieldGrams === "number" ? parsed.totalYieldGrams : null,
        brewRatio: parsed.brewRatio || null,
        bloomWaterGrams: typeof parsed.bloomWaterGrams === "number" ? parsed.bloomWaterGrams : null,
        bloomSeconds: typeof parsed.bloomSeconds === "number" ? parsed.bloomSeconds : null,
        totalBrewTimeSeconds: typeof parsed.totalBrewTimeSeconds === "number" ? parsed.totalBrewTimeSeconds : null,
        pourStructure: Array.isArray(parsed.pourStructure) ? parsed.pourStructure : [],
        recipeSteps: Array.isArray(parsed.recipeSteps) ? parsed.recipeSteps : [],
        adjustmentTips: Array.isArray(parsed.adjustmentTips) ? parsed.adjustmentTips : [],
        reasoningNotes: Array.isArray(parsed.reasoningNotes) ? parsed.reasoningNotes : []
    };
}

export async function suggestBrewingRecipe(input: BrewAssistantInput): Promise<AiServiceResult<BrewRecipeSuggestion>> {
    const client = getOpenAIClient();
    const model = process.env.OPENAI_MODEL || "gpt-5.4-mini";
    const promptText = await getBrewSuggestionAiPromptText();
    const systemPromptText = [
        promptText,
        "",
        "Technical output contract:",
        "Return structured JSON only.",
        "Match the JSON schema exactly.",
        "Do not include markdown, comments, citations, or prose outside the JSON object."
    ].join("\n");
    const userPromptText = [
        "Create a brewing recipe using this context:",
        "",
        `Roaster: ${input.roasterName || "Unknown"}`,
        `Coffee bean: ${input.beanName || "Unknown"}`,
        `Origin: ${input.origin || "Unknown"}`,
        `Process: ${input.process || "Unknown"}`,
        `Roast level: ${input.roastLevel || "Unknown"}`,
        `Flavor notes: ${input.flavorNotes || "Unknown"}`,
        `Bean info: ${input.beanInfo || "Unknown"}`,
        `Bean notes: ${input.beanNotes || "Unknown"}`,
        "",
        `Grinder: ${input.grinderBrand || ""} ${input.grinderName || "Unknown"}`.trim(),
        `Grinder type: ${input.grinderType || "Unknown"}`,
        "",
        `Brewer: ${input.brewerBrand || ""} ${input.brewerName || "Unknown"}`.trim(),
        `Brew method / brewer type: ${input.brewerType || "Unknown"}`,
        "",
        `Coffee dose / bean weight: ${input.coffeeDoseGrams || "Unknown"} grams`,
        `Temperature unit for all water temperature values: ${input.temperatureUnit || "°C"}`,
        "",
        "Recent matching brew history with the same bean, grinder, brewer, and dose:",
        formatRecentMatchingBrewHistory(input.recentMatchingBrews),
        "",
        "Use the recent matching brew history to improve the suggestion when it is available.",
        "If the recent brews were highly rated, preserve the working parts of those recipes.",
        "If the recent brews had lower ratings or low pentagon tasting scores, suggest practical adjustments to avoid those issues.",
        `Return waterTemperature as a number in ${input.temperatureUnit || "°C"}. Do not return the other temperature unit.`,
        "The user's structured tasting feedback is captured by the pentagon scores: richness, sweetness, aftertaste, aroma, and acidity.",
        "The user's free-form brew comments may include tasting notes, issues, preferences, or reminders. Use those comments when they are available.",
        "Suggest a balanced recipe that highlights the coffee bean characteristics."
    ].join("\n");
    const loggedPromptText = [
        "SYSTEM PROMPT:",
        systemPromptText,
        "",
        "USER PROMPT:",
        userPromptText
    ].join("\n");

    const response = await client.responses.create({
        model: model,
        store: false,
        tools: [
            {
                type: "web_search"
            }
        ],
        input: [
            {
                role: "system",
                content: [
                    {
                        type: "input_text",
                        text: systemPromptText
                    }
                ]
            },
            {
                role: "user",
                content: [
                    {
                        type: "input_text",
                        text: userPromptText
                    }
                ]
            }
        ],
        text: {
            format: {
                type: "json_schema",
                name: "brew_recipe_suggestion",
                strict: true,
                schema: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                        recipeName: {
                            type: "string"
                        },
                        grindSize: {
                            type: ["string", "null"]
                        },
                        waterTemperature: {
                            type: ["number", "null"]
                        },
                        coffeeDoseGrams: {
                            type: ["number", "null"]
                        },
                        totalYieldGrams: {
                            type: ["number", "null"]
                        },
                        brewRatio: {
                            type: ["string", "null"]
                        },
                        bloomWaterGrams: {
                            type: ["number", "null"]
                        },
                        bloomSeconds: {
                            type: ["number", "null"]
                        },
                        totalBrewTimeSeconds: {
                            type: ["number", "null"]
                        },
                        pourStructure: {
                            type: "array",
                            items: {
                                type: "string"
                            }
                        },
                        recipeSteps: {
                            type: "array",
                            items: {
                                type: "string"
                            }
                        },
                        adjustmentTips: {
                            type: "array",
                            items: {
                                type: "string"
                            }
                        },
                        reasoningNotes: {
                            type: "array",
                            items: {
                                type: "string"
                            }
                        }
                    },
                    required: [
                        "recipeName",
                        "grindSize",
                        "waterTemperature",
                        "coffeeDoseGrams",
                        "totalYieldGrams",
                        "brewRatio",
                        "bloomWaterGrams",
                        "bloomSeconds",
                        "totalBrewTimeSeconds",
                        "pourStructure",
                        "recipeSteps",
                        "adjustmentTips",
                        "reasoningNotes"
                    ]
                }
            }
        }
    });

    if (!response.output_text) {
        throw new Error("OpenAI did not return a brewing recipe.");
    }

    return {
        data: parseBrewRecipeSuggestionJson(response.output_text),
        usage: extractAiTokenUsage(response),
        promptText: loggedPromptText,
        outputText: response.output_text
    };
}
