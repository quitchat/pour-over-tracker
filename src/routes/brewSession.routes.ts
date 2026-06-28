import { Router, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { getRequiredUserId } from "../middleware/auth";
import { suggestBrewingRecipe } from "../services/brewAssistant.service";
import { AI_CALL_TYPES, finishAiCallLog, startAiCallLog } from "../services/aiCallLog.service";
import { formatDateUs, formatDateForInput as formatDateForInputValue } from "../utils/dateFormat";

const router = Router();

type AiCallRouteUser = {
    id: number;
    email: string;
};

function getAiCallRouteUser(res: Response): AiCallRouteUser | null {
    const currentUser = res.locals.currentUser as AiCallRouteUser | null | undefined;

    if (!currentUser) {
        return null;
    }

    return {
        id: currentUser.id,
        email: currentUser.email
    };
}

const scoreFields = ["richness", "sweetness", "aftertaste", "aroma", "acidity"] as const;

type ScoreField = typeof scoreFields[number];

function formatDateForInput(date: Date | null): string {
    return formatDateForInputValue(date);
}

function formatDateOnly(date: Date | null): string {
    return formatDateUs(date);
}

function getTodayDateForInput(): string {
    return new Date().toISOString().substring(0, 10);
}

function formatSeconds(seconds: number | null): string {
    if (seconds === null) {
        return "";
    }

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

function getDecimalText(value: any): string {
    if (value === null || typeof value === "undefined") {
        return "";
    }

    return value.toString();
}

function getBrewSessionFormValues(req: Request) {
    return {
        coffeeBeanId: String(req.body.coffeeBeanId || "").trim(),
        grinderId: String(req.body.grinderId || "").trim(),
        brewerId: String(req.body.brewerId || "").trim(),
        brewDate: String(req.body.brewDate || "").trim(),
        grindSize: String(req.body.grindSize || "").trim(),
        coffeeDoseGrams: String(req.body.coffeeDoseGrams || "").trim(),
        totalYieldGrams: String(req.body.totalYieldGrams || "").trim(),
        waterTemperatureC: String(req.body.waterTemperatureC || "").trim(),
        totalBrewTimeMinutes: String(req.body.totalBrewTimeMinutes || "").trim(),
        totalBrewTimeSeconds: String(req.body.totalBrewTimeSeconds || "").trim(),
        overallRating: String(req.body.overallRating || "").trim(),
        wouldRepeat: req.body.wouldRepeat === "on" || req.body.wouldRepeat === "true",
        notes: String(req.body.notes || "").trim(),
        richness: String(req.body.richness || "3").trim(),
        sweetness: String(req.body.sweetness || "3").trim(),
        aftertaste: String(req.body.aftertaste || "3").trim(),
        aroma: String(req.body.aroma || "3").trim(),
        acidity: String(req.body.acidity || "3").trim()
    };
}

function getDefaultFormData(preselectedCoffeeBeanId: string, preselectedGrinderId: string, preselectedBrewerId: string, defaultCoffeeDoseGrams: string, defaultWaterTemperatureC: string) {
    return {
        coffeeBeanId: preselectedCoffeeBeanId,
        grinderId: preselectedGrinderId,
        brewerId: preselectedBrewerId,
        brewDate: getTodayDateForInput(),
        grindSize: "",
        coffeeDoseGrams: defaultCoffeeDoseGrams,
        totalYieldGrams: "",
        waterTemperatureC: defaultWaterTemperatureC,
        totalBrewTimeMinutes: "",
        totalBrewTimeSeconds: "",
        overallRating: "",
        wouldRepeat: false,
        notes: "",
        richness: "3",
        sweetness: "3",
        aftertaste: "3",
        aroma: "3",
        acidity: "3"
    };
}

function parseRequiredInteger(value: string): number | null {
    if (!value) {
        return null;
    }

    const parsed = Number(value);

    if (!Number.isInteger(parsed) || parsed <= 0) {
        return null;
    }

    return parsed;
}

function parseOptionalInteger(value: string): number | null {
    if (!value) {
        return null;
    }

    const parsed = Number(value);

    if (!Number.isInteger(parsed)) {
        return null;
    }

    return parsed;
}

function parseRequiredNumber(value: string): number | null {
    if (!value) {
        return null;
    }

    const parsed = Number(value);

    if (Number.isNaN(parsed)) {
        return null;
    }

    return parsed;
}

function parseOptionalNumber(value: string): number | null {
    if (!value) {
        return null;
    }

    const parsed = Number(value);

    if (Number.isNaN(parsed)) {
        return null;
    }

    return parsed;
}

function parseOptionalDecimal(value: string): Prisma.Decimal | null {
    const parsed = parseOptionalNumber(value);

    if (parsed === null) {
        return null;
    }

    return new Prisma.Decimal(value);
}

function parseRequiredDecimal(value: string): Prisma.Decimal {
    return new Prisma.Decimal(value);
}

function calculateBrewRatio(coffeeDoseGrams: string, totalYieldGrams: string): Prisma.Decimal {
    const dose = Number(coffeeDoseGrams);
    const yieldGrams = Number(totalYieldGrams);
    const ratio = yieldGrams / dose;

    return new Prisma.Decimal(ratio.toFixed(3));
}

function getScoreValue(formValues: ReturnType<typeof getBrewSessionFormValues>, fieldName: ScoreField): number {
    const rawValue = formValues[fieldName];
    const parsed = Number(rawValue);

    if (!Number.isInteger(parsed)) {
        return 3;
    }

    if (parsed < 1) {
        return 1;
    }

    if (parsed > 5) {
        return 5;
    }

    return parsed;
}

function buildTotalBrewTimeSeconds(formValues: ReturnType<typeof getBrewSessionFormValues>): number | null {
    const minutes = parseOptionalInteger(formValues.totalBrewTimeMinutes);
    const seconds = parseOptionalInteger(formValues.totalBrewTimeSeconds);

    if (minutes === null && seconds === null) {
        return null;
    }

    return (minutes || 0) * 60 + (seconds || 0);
}

function validateBrewSessionForm(formValues: ReturnType<typeof getBrewSessionFormValues>): string[] {
    const errors: string[] = [];

    const coffeeBeanId = parseRequiredInteger(formValues.coffeeBeanId);
    const grinderId = parseOptionalInteger(formValues.grinderId);
    const brewerId = parseOptionalInteger(formValues.brewerId);
    const coffeeDoseGrams = parseRequiredNumber(formValues.coffeeDoseGrams);
    const totalYieldGrams = parseRequiredNumber(formValues.totalYieldGrams);
    const waterTemperatureC = parseOptionalNumber(formValues.waterTemperatureC);
    const totalBrewTimeMinutes = parseOptionalInteger(formValues.totalBrewTimeMinutes);
    const totalBrewTimeSeconds = parseOptionalInteger(formValues.totalBrewTimeSeconds);
    const overallRating = parseOptionalNumber(formValues.overallRating);

    if (coffeeBeanId === null) {
        errors.push("Coffee bean is required.");
    }

    if (grinderId === null && formValues.grinderId) {
        errors.push("Invalid grinder.");
    }

    if (brewerId === null && formValues.brewerId) {
        errors.push("Invalid brewer.");
    }

    if (!formValues.brewDate) {
        errors.push("Brew date is required.");
    }

    if (coffeeDoseGrams === null || coffeeDoseGrams <= 0) {
        errors.push("Coffee dose must be greater than 0.");
    }

    if (totalYieldGrams === null || totalYieldGrams <= 0) {
        errors.push("Total yield must be greater than 0.");
    }

    if (waterTemperatureC !== null && waterTemperatureC < 0) {
        errors.push("Water temperature must be 0 or greater.");
    }

    if (totalBrewTimeMinutes !== null && totalBrewTimeMinutes < 0) {
        errors.push("Brew time minutes must be 0 or greater.");
    }

    if (totalBrewTimeSeconds !== null && (totalBrewTimeSeconds < 0 || totalBrewTimeSeconds > 59)) {
        errors.push("Brew time seconds must be between 0 and 59.");
    }

    if (overallRating !== null && (overallRating < 0.5 || overallRating > 5)) {
        errors.push("Overall rating must be between 0.5 and 5.");
    }

    if (overallRating !== null && overallRating * 2 !== Math.round(overallRating * 2)) {
        errors.push("Overall rating must use half-star increments.");
    }

    scoreFields.forEach(function (fieldName) {
        const rawValue = formValues[fieldName];
        const parsed = Number(rawValue);

        if (!Number.isInteger(parsed) || parsed < 1 || parsed > 5) {
            errors.push("Bean characteristic scores must be between 1 and 5.");
        }
    });

    return errors;
}

async function validateSelectedRecordsBelongToUser(userId: number, formValues: ReturnType<typeof getBrewSessionFormValues>, allowInactiveCoffeeBean: boolean): Promise<string[]> {
    const errors: string[] = [];
    const coffeeBeanId = parseRequiredInteger(formValues.coffeeBeanId);
    const grinderId = parseOptionalInteger(formValues.grinderId);
    const brewerId = parseOptionalInteger(formValues.brewerId);

    if (coffeeBeanId !== null) {
        const coffeeBean = await prisma.coffeeBean.findFirst({
            where: {
                id: coffeeBeanId,
                userId: userId
            }
        });

        if (!coffeeBean) {
            errors.push("Selected coffee bean was not found.");
        } else if (!coffeeBean.isActive && !allowInactiveCoffeeBean) {
            errors.push("Selected coffee bean is inactive. Reactivate it before creating a new brew.");
        }
    }

    if (grinderId !== null) {
        const grinder = await prisma.grinder.findFirst({
            where: {
                id: grinderId,
                userId: userId
            }
        });

        if (!grinder) {
            errors.push("Selected grinder was not found.");
        }
    }

    if (brewerId !== null) {
        const brewer = await prisma.brewer.findFirst({
            where: {
                id: brewerId,
                userId: userId
            }
        });

        if (!brewer) {
            errors.push("Selected brewer was not found.");
        }
    }

    return errors;
}

function buildTastingScoreCreateData(formValues: ReturnType<typeof getBrewSessionFormValues>) {
    return {
        richness: getScoreValue(formValues, "richness"),
        sweetness: getScoreValue(formValues, "sweetness"),
        aftertaste: getScoreValue(formValues, "aftertaste"),
        aroma: getScoreValue(formValues, "aroma"),
        acidity: getScoreValue(formValues, "acidity"),
        bitterness: null as number | null
    };
}

function buildTastingScoreUpdateData(formValues: ReturnType<typeof getBrewSessionFormValues>) {
    return {
        richness: getScoreValue(formValues, "richness"),
        sweetness: getScoreValue(formValues, "sweetness"),
        aftertaste: getScoreValue(formValues, "aftertaste"),
        aroma: getScoreValue(formValues, "aroma"),
        acidity: getScoreValue(formValues, "acidity"),
        bitterness: null as number | null
    };
}

function buildBrewSessionCreateData(userId: number, formValues: ReturnType<typeof getBrewSessionFormValues>) {
    const totalBrewTimeSeconds = buildTotalBrewTimeSeconds(formValues);

    return {
        userId: userId,
        coffeeBeanId: Number(formValues.coffeeBeanId),
        grinderId: formValues.grinderId ? Number(formValues.grinderId) : null,
        brewerId: formValues.brewerId ? Number(formValues.brewerId) : null,
        brewDate: new Date(`${formValues.brewDate}T00:00:00`),
        grindSize: formValues.grindSize || null,
        coffeeDoseGrams: parseRequiredDecimal(formValues.coffeeDoseGrams),
        totalYieldGrams: parseOptionalDecimal(formValues.totalYieldGrams),
        brewRatio: calculateBrewRatio(formValues.coffeeDoseGrams, formValues.totalYieldGrams),
        waterTemperatureC: parseOptionalDecimal(formValues.waterTemperatureC),
        totalBrewTimeSeconds: totalBrewTimeSeconds,
        overallRating: formValues.overallRating ? new Prisma.Decimal(formValues.overallRating) : null,
        wouldRepeat: formValues.wouldRepeat,
        notes: formValues.notes || null,
        tastingScore: {
            create: buildTastingScoreCreateData(formValues)
        }
    };
}

function buildBrewSessionUpdateData(formValues: ReturnType<typeof getBrewSessionFormValues>) {
    const totalBrewTimeSeconds = buildTotalBrewTimeSeconds(formValues);

    return {
        coffeeBeanId: Number(formValues.coffeeBeanId),
        grinderId: formValues.grinderId ? Number(formValues.grinderId) : null,
        brewerId: formValues.brewerId ? Number(formValues.brewerId) : null,
        brewDate: new Date(`${formValues.brewDate}T00:00:00`),
        grindSize: formValues.grindSize || null,
        coffeeDoseGrams: parseRequiredDecimal(formValues.coffeeDoseGrams),
        totalYieldGrams: parseOptionalDecimal(formValues.totalYieldGrams),
        brewRatio: calculateBrewRatio(formValues.coffeeDoseGrams, formValues.totalYieldGrams),
        waterTemperatureC: parseOptionalDecimal(formValues.waterTemperatureC),
        totalBrewTimeSeconds: totalBrewTimeSeconds,
        overallRating: formValues.overallRating ? new Prisma.Decimal(formValues.overallRating) : null,
        wouldRepeat: formValues.wouldRepeat,
        notes: formValues.notes || null
    };
}

function buildFormDataFromBrewSession(session: any) {
    const totalSeconds = session.totalBrewTimeSeconds;
    const minutes = totalSeconds === null ? "" : String(Math.floor(totalSeconds / 60));
    const seconds = totalSeconds === null ? "" : String(totalSeconds % 60);
    const tastingScore = session.tastingScore;

    return {
        coffeeBeanId: String(session.coffeeBeanId),
        grinderId: session.grinderId ? String(session.grinderId) : "",
        brewerId: session.brewerId ? String(session.brewerId) : "",
        brewDate: formatDateForInput(session.brewDate),
        grindSize: session.grindSize || "",
        coffeeDoseGrams: getDecimalText(session.coffeeDoseGrams),
        totalYieldGrams: getDecimalText(session.totalYieldGrams),
        waterTemperatureC: getDecimalText(session.waterTemperatureC),
        totalBrewTimeMinutes: minutes,
        totalBrewTimeSeconds: seconds,
        overallRating: getDecimalText(session.overallRating),
        wouldRepeat: session.wouldRepeat,
        notes: session.notes || "",
        richness: tastingScore ? String(tastingScore.richness) : "3",
        sweetness: tastingScore ? String(tastingScore.sweetness) : "3",
        aftertaste: tastingScore ? String(tastingScore.aftertaste) : "3",
        aroma: tastingScore ? String(tastingScore.aroma) : "3",
        acidity: tastingScore ? String(tastingScore.acidity) : "3"
    };
}

function buildDuplicateFormDataFromBrewSession(session: any) {
    const totalSeconds = session.totalBrewTimeSeconds;
    const minutes = totalSeconds === null ? "" : String(Math.floor(totalSeconds / 60));
    const seconds = totalSeconds === null ? "" : String(totalSeconds % 60);

    return {
        coffeeBeanId: String(session.coffeeBeanId),
        grinderId: session.grinderId ? String(session.grinderId) : "",
        brewerId: session.brewerId ? String(session.brewerId) : "",
        brewDate: getTodayDateForInput(),
        grindSize: session.grindSize || "",
        coffeeDoseGrams: getDecimalText(session.coffeeDoseGrams),
        totalYieldGrams: getDecimalText(session.totalYieldGrams),
        waterTemperatureC: getDecimalText(session.waterTemperatureC),
        totalBrewTimeMinutes: minutes,
        totalBrewTimeSeconds: seconds,
        overallRating: "",
        wouldRepeat: false,
        notes: "",
        richness: "3",
        sweetness: "3",
        aftertaste: "3",
        aroma: "3",
        acidity: "3"
    };
}

function mapCoffeeBeanForSelect(bean: any) {
    const statusSuffix = bean.isActive ? "" : " (Inactive)";

    return {
        id: bean.id,
        label: bean.roasterName
            ? `${bean.roasterName} - ${bean.beanName}${statusSuffix}`
            : `${bean.beanName}${statusSuffix}`
    };
}

function mapBrewSessionForList(session: any) {
    return {
        id: session.id,
        brewDate: formatDateOnly(session.brewDate),
        coffeeBeanName: session.coffeeBean.roasterName
            ? `${session.coffeeBean.roasterName} - ${session.coffeeBean.beanName}`
            : session.coffeeBean.beanName,
        grinderName: session.grinder ? session.grinder.name : "",
        brewerName: session.brewer ? session.brewer.name : "",
        grindSize: session.grindSize || "",
        coffeeDoseGrams: getDecimalText(session.coffeeDoseGrams),
        totalYieldGrams: getDecimalText(session.totalYieldGrams),
        brewRatio: getDecimalText(session.brewRatio),
        waterTemperatureC: getDecimalText(session.waterTemperatureC),
        totalBrewTime: formatSeconds(session.totalBrewTimeSeconds),
        overallRating: getDecimalText(session.overallRating),
        wouldRepeat: session.wouldRepeat
    };
}

function mapBrewSessionForDetail(session: any) {
    const tastingScore = session.tastingScore;

    return {
        id: session.id,
        coffeeBeanId: session.coffeeBeanId,
        brewDate: formatDateOnly(session.brewDate),
        coffeeBeanName: session.coffeeBean.roasterName
            ? `${session.coffeeBean.roasterName} - ${session.coffeeBean.beanName}`
            : session.coffeeBean.beanName,
        grinderName: session.grinder ? session.grinder.name : "",
        brewerName: session.brewer ? session.brewer.name : "",
        grindSize: session.grindSize || "",
        coffeeDoseGrams: getDecimalText(session.coffeeDoseGrams),
        totalYieldGrams: getDecimalText(session.totalYieldGrams),
        brewRatio: getDecimalText(session.brewRatio),
        waterTemperatureC: getDecimalText(session.waterTemperatureC),
        totalBrewTime: formatSeconds(session.totalBrewTimeSeconds),
        overallRating: getDecimalText(session.overallRating),
        wouldRepeat: session.wouldRepeat,
        notes: session.notes || "",
        tastingScore: {
            richness: tastingScore ? tastingScore.richness : 3,
            sweetness: tastingScore ? tastingScore.sweetness : 3,
            aftertaste: tastingScore ? tastingScore.aftertaste : 3,
            aroma: tastingScore ? tastingScore.aroma : 3,
            acidity: tastingScore ? tastingScore.acidity : 3
        }
    };
}

async function getFormOptions(userId: number, includedCoffeeBeanId: number | null) {
    const coffeeBeanWhere: any = {
        userId: userId,
        OR: [
            {
                isActive: true
            }
        ]
    };

    if (includedCoffeeBeanId !== null) {
        coffeeBeanWhere.OR.push({
            id: includedCoffeeBeanId
        });
    }

    const [coffeeBeansFromDatabase, grindersFromDatabase, brewersFromDatabase] = await Promise.all([
        prisma.coffeeBean.findMany({
            where: coffeeBeanWhere,
            orderBy: [
                {
                    isActive: "desc"
                },
                {
                    roasterName: "asc"
                },
                {
                    beanName: "asc"
                }
            ]
        }),
        prisma.grinder.findMany({
            where: {
                userId: userId
            },
            orderBy: {
                name: "asc"
            }
        }),
        prisma.brewer.findMany({
            where: {
                userId: userId
            },
            orderBy: {
                name: "asc"
            }
        })
    ]);

    return {
        coffeeBeans: coffeeBeansFromDatabase.map(function (bean) {
            return mapCoffeeBeanForSelect(bean);
        }),
        grinders: grindersFromDatabase.map(function (grinder) {
            return {
                id: grinder.id,
                name: grinder.name,
                brand: grinder.brand || "",
                grinderType: grinder.grinderType || "",
                defaultGrindSizeRange: grinder.defaultGrindSizeRange || ""
            };
        }),
        brewers: brewersFromDatabase.map(function (brewer) {
            return {
                id: brewer.id,
                name: brewer.name,
                brand: brewer.brand || "",
                brewerType: brewer.brewerType || ""
            };
        })
    };
}

async function getUserBrewDefaults(userId: number) {
    return await prisma.user.findUnique({
        where: {
            id: userId
        },
        select: {
            defaultGrinderId: true,
            defaultBrewerId: true,
            defaultCoffeeDoseGrams: true,
            defaultWaterTemperatureC: true
        }
    });
}

async function getBrewSessionForUser(userId: number, id: number) {
    return await prisma.brewSession.findFirst({
        where: {
            id: id,
            userId: userId
        },
        include: {
            coffeeBean: true,
            grinder: true,
            brewer: true,
            tastingScore: true
        }
    });
}

router.get("/", async function (req: Request, res: Response) {
    const userId = getRequiredUserId(req);

    const filters = {
        coffeeBeanId: String(req.query.coffeeBeanId || ""),
        grinderId: String(req.query.grinderId || ""),
        brewerId: String(req.query.brewerId || ""),
        dateFrom: String(req.query.dateFrom || ""),
        dateTo: String(req.query.dateTo || "")
    };

    const where: any = {
        userId: userId
    };

    if (filters.coffeeBeanId) {
        where.coffeeBeanId = Number(filters.coffeeBeanId);
    }

    if (filters.grinderId) {
        where.grinderId = Number(filters.grinderId);
    }

    if (filters.brewerId) {
        where.brewerId = Number(filters.brewerId);
    }

    if (filters.dateFrom || filters.dateTo) {
        where.brewDate = {};

        if (filters.dateFrom) {
            where.brewDate.gte = new Date(`${filters.dateFrom}T00:00:00`);
        }

        if (filters.dateTo) {
            where.brewDate.lte = new Date(`${filters.dateTo}T23:59:59`);
        }
    }

    const [brewSessionsFromDatabase, formOptions] = await Promise.all([
        prisma.brewSession.findMany({
            where: where,
            include: {
                coffeeBean: true,
                grinder: true,
                brewer: true
            },
            orderBy: [
                {
                    brewDate: "desc"
                },
                {
                    createdAt: "desc"
                },
                {
                    id: "desc"
                }
            ]
        }),
        getFormOptions(userId, null)
    ]);

    const brewSessions = brewSessionsFromDatabase.map(function (session) {
        return mapBrewSessionForList(session);
    });

    res.render("brew-sessions/index", {
        title: "Brew Sessions",
        brewSessions: brewSessions,
        coffeeBeans: formOptions.coffeeBeans,
        grinders: formOptions.grinders,
        brewers: formOptions.brewers,
        filters: filters
    });
});

router.get("/new", async function (req: Request, res: Response) {
    const userId = getRequiredUserId(req);
    const requestedCoffeeBeanId = String(req.query.coffeeBeanId || "").trim();

    let preselectedCoffeeBeanId = "";
    let includedCoffeeBeanId: number | null = null;

    if (requestedCoffeeBeanId) {
        const requestedId = parseRequiredInteger(requestedCoffeeBeanId);

        if (requestedId !== null) {
            const coffeeBean = await prisma.coffeeBean.findFirst({
                where: {
                    id: requestedId,
                    userId: userId,
                    isActive: true
                }
            });

            if (coffeeBean) {
                preselectedCoffeeBeanId = requestedCoffeeBeanId;
                includedCoffeeBeanId = requestedId;
            }
        }
    }

    const [formOptions, userBrewDefaults] = await Promise.all([
        getFormOptions(userId, includedCoffeeBeanId),
        getUserBrewDefaults(userId)
    ]);

    if (!preselectedCoffeeBeanId && formOptions.coffeeBeans.length === 1) {
        preselectedCoffeeBeanId = String(formOptions.coffeeBeans[0].id);
    }

    const defaultGrinderIsAvailable = userBrewDefaults && userBrewDefaults.defaultGrinderId
        ? formOptions.grinders.some(function (grinder) {
            return grinder.id === userBrewDefaults.defaultGrinderId;
        })
        : false;

    const defaultBrewerIsAvailable = userBrewDefaults && userBrewDefaults.defaultBrewerId
        ? formOptions.brewers.some(function (brewer) {
            return brewer.id === userBrewDefaults.defaultBrewerId;
        })
        : false;

    const preselectedGrinderId = defaultGrinderIsAvailable && userBrewDefaults && userBrewDefaults.defaultGrinderId
        ? String(userBrewDefaults.defaultGrinderId)
        : formOptions.grinders.length === 1
            ? String(formOptions.grinders[0].id)
            : "";

    const preselectedBrewerId = defaultBrewerIsAvailable && userBrewDefaults && userBrewDefaults.defaultBrewerId
        ? String(userBrewDefaults.defaultBrewerId)
        : formOptions.brewers.length === 1
            ? String(formOptions.brewers[0].id)
            : "";

    const defaultCoffeeDoseGrams = userBrewDefaults
        ? getDecimalText(userBrewDefaults.defaultCoffeeDoseGrams)
        : "";

    const defaultWaterTemperatureC = userBrewDefaults
        ? getDecimalText(userBrewDefaults.defaultWaterTemperatureC)
        : "";

    res.render("brew-sessions/form", {
        title: "Add Brew Session",
        pageHeading: "Add Brew Session",
        formAction: "/brew-sessions",
        submitButtonText: "Save Brew Session",
        errors: [],
        showAiSuggestionButton: true,
        formData: getDefaultFormData(preselectedCoffeeBeanId, preselectedGrinderId, preselectedBrewerId, defaultCoffeeDoseGrams, defaultWaterTemperatureC),
        coffeeBeans: formOptions.coffeeBeans,
        grinders: formOptions.grinders,
        brewers: formOptions.brewers
    });
});

router.post("/suggest-recipe", async function (req: Request, res: Response) {
    const userId = getRequiredUserId(req);

    const coffeeBeanId = parseRequiredInteger(String(req.body.coffeeBeanId || "").trim());
    const grinderId = parseRequiredInteger(String(req.body.grinderId || "").trim());
    const brewerId = parseRequiredInteger(String(req.body.brewerId || "").trim());
    const coffeeDoseGrams = String(req.body.coffeeDoseGrams || "").trim();

    if (coffeeBeanId === null) {
        res.status(400).json({
            ok: false,
            errorMessage: "Please select a coffee bean."
        });

        return;
    }

    if (grinderId === null) {
        res.status(400).json({
            ok: false,
            errorMessage: "Please select a grinder."
        });

        return;
    }

    if (brewerId === null) {
        res.status(400).json({
            ok: false,
            errorMessage: "Please select a brewer."
        });

        return;
    }

    if (!coffeeDoseGrams || Number.isNaN(Number(coffeeDoseGrams)) || Number(coffeeDoseGrams) <= 0) {
        res.status(400).json({
            ok: false,
            errorMessage: "Please enter bean weight / coffee dose before asking for a recipe."
        });

        return;
    }

    const [coffeeBean, grinder, brewer] = await Promise.all([
        prisma.coffeeBean.findFirst({
            where: {
                id: coffeeBeanId,
                userId: userId,
                isActive: true
            }
        }),
        prisma.grinder.findFirst({
            where: {
                id: grinderId,
                userId: userId
            }
        }),
        prisma.brewer.findFirst({
            where: {
                id: brewerId,
                userId: userId
            }
        })
    ]);

    if (!coffeeBean || !grinder || !brewer) {
        res.status(404).json({
            ok: false,
            errorMessage: "Selected active bean, grinder, or brewer was not found."
        });

        return;
    }

    const aiModel = process.env.OPENAI_MODEL || "gpt-5.4-mini";
    const aiCallLog = await startAiCallLog({
        user: getAiCallRouteUser(res),
        callType: AI_CALL_TYPES.brewRecipeSuggestion,
        model: aiModel
    });

    try {
        const recipeResult = await suggestBrewingRecipe({
            roasterName: coffeeBean.roasterName || "",
            beanName: coffeeBean.beanName,
            origin: coffeeBean.origin || "",
            process: coffeeBean.process || "",
            roastLevel: coffeeBean.roastLevel || "",
            flavorNotes: coffeeBean.flavorNotes || "",
            beanNotes: coffeeBean.notes || "",
            grinderName: grinder.name,
            grinderBrand: grinder.brand || "",
            grinderType: grinder.grinderType || "",
            defaultGrindSizeRange: grinder.defaultGrindSizeRange || "",
            brewerName: brewer.name,
            brewerBrand: brewer.brand || "",
            brewerType: brewer.brewerType || "",
            coffeeDoseGrams: coffeeDoseGrams
        });
        const recipe = recipeResult.data;

        await finishAiCallLog({
            handle: aiCallLog,
            status: "Succeeded",
            model: aiModel,
            usage: recipeResult.usage
        });

        res.json({
            ok: true,
            recipe: recipe
        });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Could not suggest a brewing recipe.";

        await finishAiCallLog({
            handle: aiCallLog,
            status: "Failed",
            model: aiModel,
            errorMessage: errorMessage
        });

        res.status(500).json({
            ok: false,
            errorMessage: errorMessage
        });
    }
});

router.post("/", async function (req: Request, res: Response) {
    const userId = getRequiredUserId(req);
    const formValues = getBrewSessionFormValues(req);
    const errors = validateBrewSessionForm(formValues);
    const ownershipErrors = await validateSelectedRecordsBelongToUser(userId, formValues, false);
    const allErrors = errors.concat(ownershipErrors);

    if (allErrors.length > 0) {
        const selectedCoffeeBeanId = parseRequiredInteger(formValues.coffeeBeanId);
        const formOptions = await getFormOptions(userId, selectedCoffeeBeanId);

        res.status(400).render("brew-sessions/form", {
            title: "Add Brew Session",
            pageHeading: "Add Brew Session",
            formAction: "/brew-sessions",
            submitButtonText: "Save Brew Session",
            errors: allErrors,
            showAiSuggestionButton: true,
            formData: formValues,
            coffeeBeans: formOptions.coffeeBeans,
            grinders: formOptions.grinders,
            brewers: formOptions.brewers
        });

        return;
    }

    const createdSession = await prisma.brewSession.create({
        data: buildBrewSessionCreateData(userId, formValues)
    });

    res.redirect(`/brew-sessions/${createdSession.id}`);
});

router.get("/:id/edit", async function (req: Request, res: Response) {
    const userId = getRequiredUserId(req);
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
        res.status(400).send("Invalid brew session ID.");
        return;
    }

    const brewSession = await getBrewSessionForUser(userId, id);

    if (!brewSession) {
        res.status(404).send("Brew session not found.");
        return;
    }

    const formOptions = await getFormOptions(userId, brewSession.coffeeBeanId);

    res.render("brew-sessions/form", {
        title: "Edit Brew Session",
        pageHeading: "Edit Brew Session",
        formAction: `/brew-sessions/${id}/edit`,
        submitButtonText: "Update Brew Session",
        errors: [],
        showAiSuggestionButton: false,
        formData: buildFormDataFromBrewSession(brewSession),
        coffeeBeans: formOptions.coffeeBeans,
        grinders: formOptions.grinders,
        brewers: formOptions.brewers
    });
});

router.post("/:id/edit", async function (req: Request, res: Response) {
    const userId = getRequiredUserId(req);
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
        res.status(400).send("Invalid brew session ID.");
        return;
    }

    const existingSession = await getBrewSessionForUser(userId, id);

    if (!existingSession) {
        res.status(404).send("Brew session not found.");
        return;
    }

    const formValues = getBrewSessionFormValues(req);
    const errors = validateBrewSessionForm(formValues);
    const ownershipErrors = await validateSelectedRecordsBelongToUser(userId, formValues, true);
    const allErrors = errors.concat(ownershipErrors);

    if (allErrors.length > 0) {
        const selectedCoffeeBeanId = parseRequiredInteger(formValues.coffeeBeanId);
        const formOptions = await getFormOptions(userId, selectedCoffeeBeanId);

        res.status(400).render("brew-sessions/form", {
            title: "Edit Brew Session",
            pageHeading: "Edit Brew Session",
            formAction: `/brew-sessions/${id}/edit`,
            submitButtonText: "Update Brew Session",
            errors: allErrors,
            showAiSuggestionButton: false,
            formData: formValues,
            coffeeBeans: formOptions.coffeeBeans,
            grinders: formOptions.grinders,
            brewers: formOptions.brewers
        });

        return;
    }

    await prisma.brewSession.update({
        where: {
            id: id
        },
        data: buildBrewSessionUpdateData(formValues)
    });

    await prisma.tastingScore.upsert({
        where: {
            brewSessionId: id
        },
        update: buildTastingScoreUpdateData(formValues),
        create: {
            brewSessionId: id,
            ...buildTastingScoreCreateData(formValues)
        }
    });

    res.redirect(`/brew-sessions/${id}`);
});

router.get("/:id/duplicate", async function (req: Request, res: Response) {
    const userId = getRequiredUserId(req);
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
        res.status(400).send("Invalid brew session ID.");
        return;
    }

    const existingSession = await getBrewSessionForUser(userId, id);

    if (!existingSession) {
        res.status(404).send("Brew session not found.");
        return;
    }

    if (!existingSession.coffeeBean.isActive) {
        res.status(400).send("This brew session uses an inactive coffee bean. Reactivate the bean before duplicating this brew.");
        return;
    }

    const formOptions = await getFormOptions(userId, existingSession.coffeeBeanId);

    res.render("brew-sessions/form", {
        title: "Duplicate Brew Session",
        pageHeading: "Duplicate Brew Session",
        formAction: "/brew-sessions",
        submitButtonText: "Save Duplicated Brew",
        errors: [],
        showAiSuggestionButton: true,
        formData: buildDuplicateFormDataFromBrewSession(existingSession),
        coffeeBeans: formOptions.coffeeBeans,
        grinders: formOptions.grinders,
        brewers: formOptions.brewers
    });
});

router.post("/:id/duplicate", async function (req: Request, res: Response) {
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
        res.status(400).send("Invalid brew session ID.");
        return;
    }

    res.redirect(`/brew-sessions/${id}/duplicate`);
});

router.post("/:id/delete", async function (req: Request, res: Response) {
    const userId = getRequiredUserId(req);
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
        res.status(400).send("Invalid brew session ID.");
        return;
    }

    const brewSession = await getBrewSessionForUser(userId, id);

    if (!brewSession) {
        res.status(404).send("Brew session not found.");
        return;
    }

    await prisma.tastingScore.deleteMany({
        where: {
            brewSessionId: id
        }
    });

    await prisma.brewSession.delete({
        where: {
            id: id
        }
    });

    res.redirect("/brew-sessions");
});

router.get("/:id", async function (req: Request, res: Response) {
    const userId = getRequiredUserId(req);
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
        res.status(400).send("Invalid brew session ID.");
        return;
    }

    const brewSession = await getBrewSessionForUser(userId, id);

    if (!brewSession) {
        res.status(404).send("Brew session not found.");
        return;
    }

    res.render("brew-sessions/detail", {
        title: "Brew Session Detail",
        brewSession: mapBrewSessionForDetail(brewSession)
    });
});

export default router;
