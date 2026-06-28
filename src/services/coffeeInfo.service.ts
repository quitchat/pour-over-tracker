import fs from "fs";
import OpenAI from "openai";
import { prisma } from "../lib/prisma";
import { AiTokenUsage, extractAiTokenUsage } from "./aiCallLog.service";

export type AiServiceResult<T> = {
    data: T;
    usage: AiTokenUsage;
};

export type CoffeeInformationResult = {
    beanName: string | null;
    roasterName: string | null;
    origin: string | null;
    process: string | null;
    roastLevel: "Light" | "Medium" | "Dark" | null;
    flavorNotes: string[];
    sourceUrl: string | null;
    confirmedNotes: string[];
};

export type CoffeeBagImageIdentityResult = {
    roasterName: string | null;
    beanName: string | null;
    confidence: "high" | "medium" | "low";
    notes: string[];
};

export const BEAN_DETAIL_AI_PROMPT_NAME = "default";

export const DEFAULT_BEAN_DETAIL_AI_PROMPT = [
    "You are helping a pour-over coffee tracking app fill in coffee bean information.",
    "Use web search to find the official roaster product page whenever possible.",
    "Prefer the roaster's official website over retailers, reviews, Reddit, blogs, or marketplace pages.",
    "Do not guess. If a field is not clearly supported by the source, return null or an empty array.",
    "For roastLevel, only return Light, Medium, Dark, or null.",
    "Do not look for coffee bag images. Do not return image URLs.",
    "Do not return price information. Price is manually entered by the user only.",
    "For sourceUrl, return the official product page URL if found.",

    "For confirmedNotes, include useful confirmed information about the bean itself.",
    "confirmedNotes should be short factual notes that would help a coffee drinker understand the bean.",
    "Good confirmedNotes examples include region, farm, producer, cooperative, variety/cultivar, elevation, harvest season, blend components, decaf method, roast style, processing details, certification, recommended brewing notes, or a roaster's own description of the coffee.",
    "Return 3 to 8 confirmedNotes if the official source supports that much information.",
    "Do not duplicate the exact same information already returned in origin, process, roastLevel, or flavorNotes unless the note adds more detail.",
    "Do not include statements about missing data.",
    "Do not say things like not listed, not mentioned, unavailable, unknown, unclear, or not specified.",
    "If there are no extra confirmed facts, return an empty confirmedNotes array.",

    "Return text facts only: origin, process, roast level, flavor notes, source URL, and confirmed notes."
].join("\n");

function getOpenAIClient() {
    if (!process.env.OPENAI_API_KEY) {
        throw new Error("OPENAI_API_KEY is missing. Add it to your .env file.");
    }

    return new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
    });
}

async function getBeanDetailAiPromptText(): Promise<string> {
    const existingPrompt = await prisma.beanDetailAiPrompt.findUnique({
        where: {
            name: BEAN_DETAIL_AI_PROMPT_NAME
        }
    });

    if (existingPrompt) {
        return existingPrompt.promptText;
    }

    const createdPrompt = await prisma.beanDetailAiPrompt.create({
        data: {
            name: BEAN_DETAIL_AI_PROMPT_NAME,
            promptText: DEFAULT_BEAN_DETAIL_AI_PROMPT
        }
    });

    return createdPrompt.promptText;
}

function parseCoffeeInformationJson(outputText: string): CoffeeInformationResult {
    const parsed = JSON.parse(outputText) as CoffeeInformationResult;

    return {
        beanName: parsed.beanName || null,
        roasterName: parsed.roasterName || null,
        origin: parsed.origin || null,
        process: parsed.process || null,
        roastLevel: parsed.roastLevel || null,
        flavorNotes: Array.isArray(parsed.flavorNotes) ? parsed.flavorNotes : [],
        sourceUrl: parsed.sourceUrl || null,
        confirmedNotes: Array.isArray(parsed.confirmedNotes) ? parsed.confirmedNotes : []
    };
}

export async function getCoffeeInformationFromOpenAI(roasterName: string, beanName: string): Promise<AiServiceResult<CoffeeInformationResult>> {
    const client = getOpenAIClient();
    const model = process.env.OPENAI_MODEL || "gpt-5.4-mini";
    const promptText = await getBeanDetailAiPromptText();

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
                        text: promptText
                    }
                ]
            },
            {
                role: "user",
                content: [
                    {
                        type: "input_text",
                        text: [
                            `Roaster: ${roasterName}`,
                            `Coffee bean name: ${beanName}`,
                            "",
                            "Find the coffee information and return structured data only."
                        ].join("\n")
                    }
                ]
            }
        ],
        text: {
            format: {
                type: "json_schema",
                name: "coffee_information",
                strict: true,
                schema: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                        beanName: {
                            type: ["string", "null"]
                        },
                        roasterName: {
                            type: ["string", "null"]
                        },
                        origin: {
                            type: ["string", "null"]
                        },
                        process: {
                            type: ["string", "null"]
                        },
                        roastLevel: {
                            type: ["string", "null"],
                            enum: ["Light", "Medium", "Dark", null]
                        },
                        flavorNotes: {
                            type: "array",
                            items: {
                                type: "string"
                            }
                        },
                        sourceUrl: {
                            type: ["string", "null"]
                        },
                        confirmedNotes: {
                            type: "array",
                            items: {
                                type: "string"
                            }
                        }
                    },
                    required: [
                        "beanName",
                        "roasterName",
                        "origin",
                        "process",
                        "roastLevel",
                        "flavorNotes",
                        "sourceUrl",
                        "confirmedNotes"
                    ]
                }
            }
        }
    });

    if (!response.output_text) {
        throw new Error("OpenAI did not return coffee information.");
    }

    return {
        data: parseCoffeeInformationJson(response.output_text),
        usage: extractAiTokenUsage(response)
    };
}


function parseCoffeeBagImageIdentityJson(outputText: string): CoffeeBagImageIdentityResult {
    const parsed = JSON.parse(outputText) as CoffeeBagImageIdentityResult;
    const confidence = parsed.confidence === "high" || parsed.confidence === "medium" || parsed.confidence === "low"
        ? parsed.confidence
        : "low";

    return {
        roasterName: parsed.roasterName || null,
        beanName: parsed.beanName || null,
        confidence: confidence,
        notes: Array.isArray(parsed.notes) ? parsed.notes : []
    };
}

export async function getCoffeeBagImageIdentityFromOpenAI(imageFilePath: string, mimeType: string): Promise<AiServiceResult<CoffeeBagImageIdentityResult>> {
    const client = getOpenAIClient();
    const model = process.env.OPENAI_VISION_MODEL || process.env.OPENAI_MODEL || "gpt-5.4-mini";
    const imageBytes = await fs.promises.readFile(imageFilePath);
    const imageBase64 = imageBytes.toString("base64");
    const imageUrl = `data:${mimeType};base64,${imageBase64}`;

    const response = await client.responses.create({
        model: model,
        store: false,
        input: [
            {
                role: "system",
                content: [
                    {
                        type: "input_text",
                        text: [
                            "You extract coffee bag label information for a pour-over coffee tracking app.",
                            "Use OCR/vision on the provided coffee bag image.",
                            "Return only the roaster name and coffee bean/product name when visible on the bag.",
                            "Do not guess. If either value is not clearly visible, return null for that value.",
                            "Do not return origin, process, roast level, price, or tasting notes from this step.",
                            "The coffee bean/product name should not include the roaster name unless it is truly part of the product name."
                        ].join("\n")
                    }
                ]
            },
            {
                role: "user",
                content: [
                    {
                        type: "input_text",
                        text: "Read this coffee bag image and identify the roaster name and coffee bean/product name."
                    },
                    {
                        type: "input_image",
                        image_url: imageUrl,
                        detail: "high"
                    }
                ]
            }
        ],
        text: {
            format: {
                type: "json_schema",
                name: "coffee_bag_image_identity",
                strict: true,
                schema: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                        roasterName: {
                            type: ["string", "null"]
                        },
                        beanName: {
                            type: ["string", "null"]
                        },
                        confidence: {
                            type: "string",
                            enum: ["high", "medium", "low"]
                        },
                        notes: {
                            type: "array",
                            items: {
                                type: "string"
                            }
                        }
                    },
                    required: [
                        "roasterName",
                        "beanName",
                        "confidence",
                        "notes"
                    ]
                }
            }
        }
    });

    if (!response.output_text) {
        throw new Error("OpenAI did not return coffee bag information.");
    }

    return {
        data: parseCoffeeBagImageIdentityJson(response.output_text),
        usage: extractAiTokenUsage(response)
    };
}
