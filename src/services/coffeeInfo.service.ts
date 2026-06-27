import OpenAI from "openai";
import { prisma } from "../lib/prisma";

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

export async function getCoffeeInformationFromOpenAI(roasterName: string, beanName: string): Promise<CoffeeInformationResult> {
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

    return parseCoffeeInformationJson(response.output_text);
}
