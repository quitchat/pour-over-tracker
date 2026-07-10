import { Router, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { getRequiredUserId, requireAiAccess } from "../middleware/auth";
import { suggestBrewingRecipe } from "../services/brewAssistant.service";
import { AI_API_FEATURE_TYPES, AI_CALL_TYPES, AI_TOOL_CALL_TYPES, finishAiCallLog, startAiCallLog } from "../services/aiCallLog.service";
import { formatDateOnlyForInput, formatDateOnlyUs, getTodayDateForInput as getTodayDateForInputByTimeZone, parseDateOnlyToUtcDate, parseDateOnlyToUtcEndOfDay } from "../utils/dateFormat";
import { TemperatureUnit, formatTemperatureDecimalForInput, normalizeTemperatureUnit, parseTemperatureInputToCelsiusDecimal } from "../utils/temperature";
import { normalizeTimeZone } from "../utils/timeZone";
import { findBestInventoryForBrew } from "../services/beanInventory.service";

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
const acidityLevels = ["LOW", "MEDIUM", "HIGH"] as const;
type AcidityLevel = typeof acidityLevels[number];

type BrewRatingFormValues = {
    overallRating: string;
    brewComments: string;
    richness: string;
    sweetness: string;
    aftertaste: string;
    aroma: string;
    acidity: string;
    acidityLevel: string;
};

function getCurrentTemperatureUnit(res: Response): TemperatureUnit {
    const currentUser = res.locals.currentUser as { temperatureUnit?: string } | null | undefined;

    return normalizeTemperatureUnit(currentUser && currentUser.temperatureUnit ? currentUser.temperatureUnit : "C");
}

function getCurrentTimeZone(res: Response): string {
    const currentUser = res.locals.currentUser as { timeZone?: string } | null | undefined;

    return normalizeTimeZone(currentUser && currentUser.timeZone ? currentUser.timeZone : "America/Los_Angeles");
}

function getEquipmentNameKey(name: string | null | undefined): string {
    return String(name || "").trim().toLowerCase();
}

function getDuplicateEquipmentNameCounts<T extends { name: string | null | undefined }>(items: T[]): Map<string, number> {
    const counts = new Map<string, number>();

    items.forEach(function (item) {
        const key = getEquipmentNameKey(item.name);

        if (!key) {
            return;
        }

        counts.set(key, (counts.get(key) || 0) + 1);
    });

    return counts;
}

function getEquipmentSelectLabel(item: { name: string | null | undefined; locationName?: string | null }, duplicateNameCounts: Map<string, number>): string {
    const name = String(item.name || "").trim();
    const key = getEquipmentNameKey(name);
    const duplicateCount = duplicateNameCounts.get(key) || 0;

    if (duplicateCount <= 1) {
        return name;
    }

    const locationName = String(item.locationName || "").trim();

    if (locationName) {
        return `${name} (${locationName})`;
    }

    return `${name} (No location)`;
}

function getTemperatureUnitLabel(temperatureUnit: TemperatureUnit): string {
    return temperatureUnit === "F" ? "°F" : "°C";
}

type ScoreField = typeof scoreFields[number];

function formatDateForInput(date: Date | null): string {
    return formatDateOnlyForInput(date);
}

function formatDateOnly(date: Date | null): string {
    return formatDateOnlyUs(date);
}

function getTodayDateForInput(timeZone: string): string {
    return getTodayDateForInputByTimeZone(timeZone);
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
        pourStructure: String(req.body.pourStructure || "").trim(),
        recipeSteps: String(req.body.recipeSteps || "").trim(),
        adjustmentNotes: String(req.body.adjustmentNotes || "").trim(),
        brewComments: String(req.body.brewComments || "").trim(),
        richness: String(req.body.richness || "3").trim(),
        sweetness: String(req.body.sweetness || "3").trim(),
        aftertaste: String(req.body.aftertaste || "3").trim(),
        aroma: String(req.body.aroma || "3").trim(),
        acidity: String(req.body.acidity || "3").trim(),
        acidityLevel: String(req.body.acidityLevel || "").trim().toUpperCase()
    };
}

function getBrewRatingFormValues(req: Request): BrewRatingFormValues {
    return {
        overallRating: String(req.body.overallRating || "").trim(),
        brewComments: String(req.body.brewComments || "").trim(),
        richness: String(req.body.richness || "3").trim(),
        sweetness: String(req.body.sweetness || "3").trim(),
        aftertaste: String(req.body.aftertaste || "3").trim(),
        aroma: String(req.body.aroma || "3").trim(),
        acidity: String(req.body.acidity || "3").trim(),
        acidityLevel: String(req.body.acidityLevel || "").trim().toUpperCase()
    };
}

function getDefaultFormData(preselectedCoffeeBeanId: string, preselectedGrinderId: string, preselectedBrewerId: string, defaultCoffeeDoseGrams: string, defaultWaterTemperatureC: string, timeZone: string) {
    return {
        coffeeBeanId: preselectedCoffeeBeanId,
        grinderId: preselectedGrinderId,
        brewerId: preselectedBrewerId,
        brewDate: getTodayDateForInput(timeZone),
        grindSize: "",
        coffeeDoseGrams: defaultCoffeeDoseGrams,
        totalYieldGrams: "",
        waterTemperatureC: defaultWaterTemperatureC,
        totalBrewTimeMinutes: "",
        totalBrewTimeSeconds: "",
        overallRating: "",
        pourStructure: "",
        recipeSteps: "",
        adjustmentNotes: "",
        brewComments: "",
        richness: "3",
        sweetness: "3",
        aftertaste: "3",
        aroma: "3",
        acidity: "3",
        acidityLevel: ""
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



type EquipmentLocationCandidate = {
    id: number;
    name: string;
    locationName: string | null;
    latitude: number;
    longitude: number;
    distanceMeters: number;
    matchStrength: "strong" | "possible";
    lastUsedAt: Date | null;
};

function toRadians(value: number): number {
    return value * Math.PI / 180;
}

function calculateDistanceMeters(latitude1: number, longitude1: number, latitude2: number, longitude2: number): number {
    const earthRadiusMeters = 6371000;
    const deltaLatitude = toRadians(latitude2 - latitude1);
    const deltaLongitude = toRadians(longitude2 - longitude1);
    const lat1 = toRadians(latitude1);
    const lat2 = toRadians(latitude2);

    const a = Math.sin(deltaLatitude / 2) * Math.sin(deltaLatitude / 2)
        + Math.cos(lat1) * Math.cos(lat2)
        * Math.sin(deltaLongitude / 2) * Math.sin(deltaLongitude / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return earthRadiusMeters * c;
}

function getMatchStrength(distanceMeters: number): "strong" | "possible" | null {
    if (distanceMeters <= 100) {
        return "strong";
    }

    if (distanceMeters <= 500) {
        return "possible";
    }

    return null;
}

function sortEquipmentCandidates(candidates: EquipmentLocationCandidate[]): EquipmentLocationCandidate[] {
    return candidates.sort(function (a, b) {
        if (a.matchStrength !== b.matchStrength) {
            return a.matchStrength === "strong" ? -1 : 1;
        }

        if (a.lastUsedAt && b.lastUsedAt) {
            return b.lastUsedAt.getTime() - a.lastUsedAt.getTime();
        }

        if (a.lastUsedAt && !b.lastUsedAt) {
            return -1;
        }

        if (!a.lastUsedAt && b.lastUsedAt) {
            return 1;
        }

        return a.distanceMeters - b.distanceMeters;
    });
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

function getScoreValue(formValues: ReturnType<typeof getBrewSessionFormValues> | BrewRatingFormValues, fieldName: ScoreField): number {
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

function parseOptionalAcidityLevel(value: string): AcidityLevel | null {
    const normalizedValue = String(value || "").trim().toUpperCase();

    if (!normalizedValue) {
        return null;
    }

    if (!acidityLevels.includes(normalizedValue as typeof acidityLevels[number])) {
        return null;
    }

    return normalizedValue as AcidityLevel;
}

function isInvalidAcidityLevel(value: string): boolean {
    const normalizedValue = String(value || "").trim().toUpperCase();

    if (!normalizedValue) {
        return false;
    }

    return !acidityLevels.includes(normalizedValue as typeof acidityLevels[number]);
}

function getAcidityLevelLabel(value: AcidityLevel | string | null | undefined): string {
    switch (value) {
        case "LOW":
            return "Low";
        case "MEDIUM":
            return "Medium";
        case "HIGH":
            return "High";
        default:
            return "";
    }
}

function buildTotalBrewTimeSeconds(formValues: ReturnType<typeof getBrewSessionFormValues>): number | null {
    const minutes = parseOptionalInteger(formValues.totalBrewTimeMinutes);
    const seconds = parseOptionalInteger(formValues.totalBrewTimeSeconds);

    if (minutes === null && seconds === null) {
        return null;
    }

    return (minutes || 0) * 60 + (seconds || 0);
}

function validateBrewSessionForm(formValues: ReturnType<typeof getBrewSessionFormValues>, temperatureUnit: TemperatureUnit): string[] {
    const errors: string[] = [];

    const coffeeBeanId = parseRequiredInteger(formValues.coffeeBeanId);
    const grinderId = parseOptionalInteger(formValues.grinderId);
    const brewerId = parseOptionalInteger(formValues.brewerId);
    const coffeeDoseGrams = parseRequiredNumber(formValues.coffeeDoseGrams);
    const totalYieldGrams = parseRequiredNumber(formValues.totalYieldGrams);
    const waterTemperatureInput = parseOptionalNumber(formValues.waterTemperatureC);
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

    if (totalYieldGrams !== null && totalYieldGrams <= 0) {
        errors.push("Total yield must be greater than 0 when entered.");
    }

    if (waterTemperatureInput !== null && waterTemperatureInput < 0) {
        errors.push(`Water temperature must be 0 ${getTemperatureUnitLabel(temperatureUnit)} or greater.`);
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

    if (isInvalidAcidityLevel(formValues.acidityLevel)) {
        errors.push("Acidity Level must be Low, Medium, High, or blank.");
    }

    return errors;
}

function validateBrewSetupForm(formValues: ReturnType<typeof getBrewSessionFormValues>, temperatureUnit: TemperatureUnit): string[] {
    const errors: string[] = [];

    const coffeeBeanId = parseRequiredInteger(formValues.coffeeBeanId);
    const grinderId = parseOptionalInteger(formValues.grinderId);
    const brewerId = parseOptionalInteger(formValues.brewerId);
    const coffeeDoseGrams = parseRequiredNumber(formValues.coffeeDoseGrams);
    const waterTemperatureInput = parseOptionalNumber(formValues.waterTemperatureC);
    const totalYieldGrams = parseOptionalNumber(formValues.totalYieldGrams);
    const totalBrewTimeMinutes = parseOptionalInteger(formValues.totalBrewTimeMinutes);
    const totalBrewTimeSeconds = parseOptionalInteger(formValues.totalBrewTimeSeconds);

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
        errors.push("Bean weight / coffee dose must be greater than 0.");
    }

    if (totalYieldGrams !== null && totalYieldGrams <= 0) {
        errors.push("Total yield must be greater than 0 when entered.");
    }

    if (waterTemperatureInput !== null && waterTemperatureInput < 0) {
        errors.push(`Water temperature must be 0 ${getTemperatureUnitLabel(temperatureUnit)} or greater.`);
    }

    if (totalBrewTimeMinutes !== null && totalBrewTimeMinutes < 0) {
        errors.push("Brew time minutes must be 0 or greater.");
    }

    if (totalBrewTimeSeconds !== null && (totalBrewTimeSeconds < 0 || totalBrewTimeSeconds > 59)) {
        errors.push("Brew time seconds must be between 0 and 59.");
    }

    if (isInvalidAcidityLevel(formValues.acidityLevel)) {
        errors.push("Acidity Level must be Low, Medium, High, or blank.");
    }

    return errors;
}

function validateBrewRatingForm(formValues: BrewRatingFormValues): string[] {
    const errors: string[] = [];
    const overallRating = parseOptionalNumber(formValues.overallRating);

    if (overallRating === null) {
        errors.push("Overall rating is required.");
    } else {
        if (overallRating < 0.5 || overallRating > 5) {
            errors.push("Overall rating must be between 0.5 and 5.");
        }

        if (overallRating * 2 !== Math.round(overallRating * 2)) {
            errors.push("Overall rating must use half-star increments.");
        }
    }

    scoreFields.forEach(function (fieldName) {
        const rawValue = formValues[fieldName];
        const parsed = Number(rawValue);

        if (!Number.isInteger(parsed) || parsed < 1 || parsed > 5) {
            errors.push("Bean characteristic scores must be between 1 and 5.");
        }
    });

    if (isInvalidAcidityLevel(formValues.acidityLevel)) {
        errors.push("Acidity Level must be Low, Medium, High, or blank.");
    }

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

function buildTastingScoreCreateData(formValues: ReturnType<typeof getBrewSessionFormValues> | BrewRatingFormValues) {
    return {
        richness: getScoreValue(formValues, "richness"),
        sweetness: getScoreValue(formValues, "sweetness"),
        aftertaste: getScoreValue(formValues, "aftertaste"),
        aroma: getScoreValue(formValues, "aroma"),
        acidity: getScoreValue(formValues, "acidity"),
        bitterness: null as number | null
    };
}

function buildTastingScoreUpdateData(formValues: ReturnType<typeof getBrewSessionFormValues> | BrewRatingFormValues) {
    return {
        richness: getScoreValue(formValues, "richness"),
        sweetness: getScoreValue(formValues, "sweetness"),
        aftertaste: getScoreValue(formValues, "aftertaste"),
        aroma: getScoreValue(formValues, "aroma"),
        acidity: getScoreValue(formValues, "acidity"),
        bitterness: null as number | null
    };
}

function buildBrewSessionCreateData(userId: number, formValues: ReturnType<typeof getBrewSessionFormValues>, temperatureUnit: TemperatureUnit, beanInventoryId?: number | null) {
    const totalBrewTimeSeconds = buildTotalBrewTimeSeconds(formValues);

    return {
        userId: userId,
        coffeeBeanId: Number(formValues.coffeeBeanId),
        beanInventoryId: beanInventoryId || null,
        grinderId: formValues.grinderId ? Number(formValues.grinderId) : null,
        brewerId: formValues.brewerId ? Number(formValues.brewerId) : null,
        brewDate: parseDateOnlyToUtcDate(formValues.brewDate),
        grindSize: formValues.grindSize || null,
        coffeeDoseGrams: parseRequiredDecimal(formValues.coffeeDoseGrams),
        totalYieldGrams: parseOptionalDecimal(formValues.totalYieldGrams),
        brewRatio: calculateBrewRatio(formValues.coffeeDoseGrams, formValues.totalYieldGrams),
        waterTemperatureC: parseTemperatureInputToCelsiusDecimal(formValues.waterTemperatureC, temperatureUnit),
        totalBrewTimeSeconds: totalBrewTimeSeconds,
        overallRating: formValues.overallRating ? new Prisma.Decimal(formValues.overallRating) : null,
        notes: formValues.brewComments || null,
        pourStructure: formValues.pourStructure || null,
        recipeSteps: formValues.recipeSteps || null,
        adjustmentNotes: formValues.adjustmentNotes || null,
        acidityLevel: parseOptionalAcidityLevel(formValues.acidityLevel),
        tastingScore: {
            create: buildTastingScoreCreateData(formValues)
        }
    };
}

function buildBrewSessionUpdateData(formValues: ReturnType<typeof getBrewSessionFormValues>, temperatureUnit: TemperatureUnit) {
    const totalBrewTimeSeconds = buildTotalBrewTimeSeconds(formValues);

    return {
        coffeeBeanId: Number(formValues.coffeeBeanId),
        grinderId: formValues.grinderId ? Number(formValues.grinderId) : null,
        brewerId: formValues.brewerId ? Number(formValues.brewerId) : null,
        brewDate: parseDateOnlyToUtcDate(formValues.brewDate),
        grindSize: formValues.grindSize || null,
        coffeeDoseGrams: parseRequiredDecimal(formValues.coffeeDoseGrams),
        totalYieldGrams: parseOptionalDecimal(formValues.totalYieldGrams),
        brewRatio: calculateBrewRatio(formValues.coffeeDoseGrams, formValues.totalYieldGrams),
        waterTemperatureC: parseTemperatureInputToCelsiusDecimal(formValues.waterTemperatureC, temperatureUnit),
        totalBrewTimeSeconds: totalBrewTimeSeconds,
        overallRating: formValues.overallRating ? new Prisma.Decimal(formValues.overallRating) : null,
        notes: formValues.brewComments || null,
        pourStructure: formValues.pourStructure || null,
        recipeSteps: formValues.recipeSteps || null,
        adjustmentNotes: formValues.adjustmentNotes || null,
        acidityLevel: parseOptionalAcidityLevel(formValues.acidityLevel)
    };
}

function buildFormDataFromBrewSession(session: any, temperatureUnit: TemperatureUnit) {
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
        waterTemperatureC: formatTemperatureDecimalForInput(session.waterTemperatureC, temperatureUnit),
        totalBrewTimeMinutes: minutes,
        totalBrewTimeSeconds: seconds,
        overallRating: getDecimalText(session.overallRating),
        hasRating: session.overallRating !== null && typeof session.overallRating !== "undefined",
        pourStructure: session.pourStructure || "",
        recipeSteps: session.recipeSteps || "",
        adjustmentNotes: session.adjustmentNotes || "",
        brewComments: session.notes || "",
        richness: tastingScore ? String(tastingScore.richness) : "3",
        sweetness: tastingScore ? String(tastingScore.sweetness) : "3",
        aftertaste: tastingScore ? String(tastingScore.aftertaste) : "3",
        aroma: tastingScore ? String(tastingScore.aroma) : "3",
        acidity: tastingScore ? String(tastingScore.acidity) : "3",
        acidityLevel: session.acidityLevel || ""
    };
}

function buildBrewSetupSummary(session: any, temperatureUnit: TemperatureUnit) {
    return {
        coffeeBeanName: session.coffeeBean && session.coffeeBean.roasterName
            ? `${session.coffeeBean.roasterName} - ${session.coffeeBean.beanName}`
            : session.coffeeBean
                ? session.coffeeBean.beanName
                : "",
        grinderName: session.grinder ? session.grinder.name : "",
        brewerName: session.brewer ? session.brewer.name : "",
        brewDate: formatDateOnly(session.brewDate),
        coffeeDoseGrams: getDecimalText(session.coffeeDoseGrams),
        temperatureUnit: getTemperatureUnitLabel(temperatureUnit)
    };
}

function buildBrewSetupSummaryFromFormValues(formValues: ReturnType<typeof getBrewSessionFormValues>, formOptions: any, temperatureUnit: TemperatureUnit) {
    const coffeeBean = formOptions.coffeeBeans.find(function (bean: any) {
        return String(bean.id) === String(formValues.coffeeBeanId);
    });

    const grinder = formOptions.grinders.find(function (item: any) {
        return String(item.id) === String(formValues.grinderId);
    });

    const brewer = formOptions.brewers.find(function (item: any) {
        return String(item.id) === String(formValues.brewerId);
    });

    return {
        coffeeBeanName: coffeeBean ? coffeeBean.label : "",
        grinderName: grinder ? grinder.label || grinder.name : "",
        brewerName: brewer ? brewer.label || brewer.name : "",
        brewDate: formValues.brewDate ? formatDateOnly(parseDateOnlyToUtcDate(formValues.brewDate)) : "",
        coffeeDoseGrams: formValues.coffeeDoseGrams,
        temperatureUnit: getTemperatureUnitLabel(temperatureUnit)
    };
}

function buildFormDataFromBrewRating(session: any): BrewRatingFormValues {
    const tastingScore = session.tastingScore;

    return {
        overallRating: getDecimalText(session.overallRating),
        brewComments: session.notes || "",
        richness: tastingScore ? String(tastingScore.richness) : "3",
        sweetness: tastingScore ? String(tastingScore.sweetness) : "3",
        aftertaste: tastingScore ? String(tastingScore.aftertaste) : "3",
        aroma: tastingScore ? String(tastingScore.aroma) : "3",
        acidity: tastingScore ? String(tastingScore.acidity) : "3",
        acidityLevel: session.acidityLevel || ""
    };
}

function buildDuplicateFormDataFromBrewSession(session: any, temperatureUnit: TemperatureUnit, timeZone: string) {
    const totalSeconds = session.totalBrewTimeSeconds;
    const minutes = totalSeconds === null ? "" : String(Math.floor(totalSeconds / 60));
    const seconds = totalSeconds === null ? "" : String(totalSeconds % 60);

    return {
        coffeeBeanId: String(session.coffeeBeanId),
        grinderId: session.grinderId ? String(session.grinderId) : "",
        brewerId: session.brewerId ? String(session.brewerId) : "",
        brewDate: getTodayDateForInput(timeZone),
        grindSize: session.grindSize || "",
        coffeeDoseGrams: getDecimalText(session.coffeeDoseGrams),
        totalYieldGrams: getDecimalText(session.totalYieldGrams),
        waterTemperatureC: formatTemperatureDecimalForInput(session.waterTemperatureC, temperatureUnit),
        totalBrewTimeMinutes: minutes,
        totalBrewTimeSeconds: seconds,
        overallRating: "",
        pourStructure: session.pourStructure || "",
        recipeSteps: "",
        adjustmentNotes: "",
        brewComments: "",
        richness: "3",
        sweetness: "3",
        aftertaste: "3",
        aroma: "3",
        acidity: "3",
        acidityLevel: ""
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

function mapBrewSessionForList(session: any, temperatureUnit: TemperatureUnit) {
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
        waterTemperatureC: formatTemperatureDecimalForInput(session.waterTemperatureC, temperatureUnit),
        waterTemperatureUnit: getTemperatureUnitLabel(temperatureUnit),
        totalBrewTime: formatSeconds(session.totalBrewTimeSeconds),
        overallRating: getDecimalText(session.overallRating)
    };
}

function mapBrewSessionForDetail(session: any, temperatureUnit: TemperatureUnit) {
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
        waterTemperatureC: formatTemperatureDecimalForInput(session.waterTemperatureC, temperatureUnit),
        waterTemperatureUnit: getTemperatureUnitLabel(temperatureUnit),
        totalBrewTime: formatSeconds(session.totalBrewTimeSeconds),
        overallRating: getDecimalText(session.overallRating),
        hasRating: session.overallRating !== null && typeof session.overallRating !== "undefined",
        acidityLevel: session.acidityLevel || "",
        acidityLevelLabel: getAcidityLevelLabel(session.acidityLevel),
        pourStructure: session.pourStructure || "",
        recipeSteps: session.recipeSteps || "",
        adjustmentNotes: session.adjustmentNotes || "",
        brewComments: session.notes || "",
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

    const grinderNameCounts = getDuplicateEquipmentNameCounts(grindersFromDatabase);
    const brewerNameCounts = getDuplicateEquipmentNameCounts(brewersFromDatabase);

    return {
        coffeeBeans: coffeeBeansFromDatabase.map(function (bean) {
            return mapCoffeeBeanForSelect(bean);
        }),
        grinders: grindersFromDatabase.map(function (grinder) {
            return {
                id: grinder.id,
                name: grinder.name,
                label: getEquipmentSelectLabel(grinder, grinderNameCounts),
                brand: grinder.brand || "",
                grinderType: grinder.grinderType || "",
                defaultGrindSizeRange: grinder.defaultGrindSizeRange || "",
                locationName: grinder.locationName || ""
            };
        }),
        brewers: brewersFromDatabase.map(function (brewer) {
            return {
                id: brewer.id,
                name: brewer.name,
                label: getEquipmentSelectLabel(brewer, brewerNameCounts),
                brand: brewer.brand || "",
                brewerType: brewer.brewerType || "",
                locationName: brewer.locationName || ""
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


function getTastingAverage(tastingScore: any): number {
    if (!tastingScore) {
        return 0;
    }

    const values = [
        tastingScore.richness,
        tastingScore.sweetness,
        tastingScore.aftertaste,
        tastingScore.aroma,
        tastingScore.acidity
    ].map(function (value) {
        return Number(value || 0);
    }).filter(function (value) {
        return !Number.isNaN(value) && value > 0;
    });

    if (values.length === 0) {
        return 0;
    }

    return values.reduce(function (sum, value) {
        return sum + value;
    }, 0) / values.length;
}

function compareBestBrewCandidates(a: any, b: any): number {
    const aOverall = a.overallRating === null || typeof a.overallRating === "undefined" ? 0 : Number(a.overallRating);
    const bOverall = b.overallRating === null || typeof b.overallRating === "undefined" ? 0 : Number(b.overallRating);

    if (aOverall !== bOverall) {
        return bOverall - aOverall;
    }

    const aTastingAverage = getTastingAverage(a.tastingScore);
    const bTastingAverage = getTastingAverage(b.tastingScore);

    if (aTastingAverage !== bTastingAverage) {
        return bTastingAverage - aTastingAverage;
    }

    const aBrewDateTime = a.brewDate ? a.brewDate.getTime() : 0;
    const bBrewDateTime = b.brewDate ? b.brewDate.getTime() : 0;

    if (aBrewDateTime !== bBrewDateTime) {
        return bBrewDateTime - aBrewDateTime;
    }

    const aCreatedAtTime = a.createdAt ? a.createdAt.getTime() : 0;
    const bCreatedAtTime = b.createdAt ? b.createdAt.getTime() : 0;

    if (aCreatedAtTime !== bCreatedAtTime) {
        return bCreatedAtTime - aCreatedAtTime;
    }

    return b.id - a.id;
}

function mapBestBrewForJson(brew: any, temperatureUnit: TemperatureUnit) {
    const totalSeconds = brew.totalBrewTimeSeconds;
    const minutes = totalSeconds === null || typeof totalSeconds === "undefined" ? "" : String(Math.floor(totalSeconds / 60));
    const seconds = totalSeconds === null || typeof totalSeconds === "undefined" ? "" : String(totalSeconds % 60);
    const overallRating = getDecimalText(brew.overallRating);
    const tastingAverage = getTastingAverage(brew.tastingScore);
    const summaryParts = [formatDateOnly(brew.brewDate)];

    if (overallRating) {
        summaryParts.push(`${overallRating}/5 overall`);
    }

    if (tastingAverage > 0) {
        summaryParts.push(`${tastingAverage.toFixed(1)}/5 taste quality`);
    }

    return {
        id: brew.id,
        summary: summaryParts.join(" · "),
        brewDate: formatDateOnly(brew.brewDate),
        grindSize: brew.grindSize || "",
        totalYieldGrams: getDecimalText(brew.totalYieldGrams),
        waterTemperatureC: formatTemperatureDecimalForInput(brew.waterTemperatureC, temperatureUnit),
        totalBrewTimeMinutes: minutes,
        totalBrewTimeSeconds: seconds,
        pourStructure: brew.pourStructure || "",
        brewComments: brew.notes || ""
    };
}

async function findBestMatchingBrew(userId: number, coffeeBeanId: number, grinderId: number, brewerId: number, temperatureUnit: TemperatureUnit) {
    const matchingBrews = await prisma.brewSession.findMany({
        where: {
            userId: userId,
            coffeeBeanId: coffeeBeanId,
            grinderId: grinderId,
            brewerId: brewerId,
            overallRating: {
                not: null
            }
        },
        include: {
            tastingScore: true
        },
        orderBy: [
            {
                overallRating: "desc"
            },
            {
                brewDate: "desc"
            },
            {
                createdAt: "desc"
            },
            {
                id: "desc"
            }
        ],
        take: 50
    });

    if (matchingBrews.length === 0) {
        return null;
    }

    matchingBrews.sort(compareBestBrewCandidates);

    return mapBestBrewForJson(matchingBrews[0], temperatureUnit);
}

async function getRecentMatchingBrewsForSuggestion(userId: number, coffeeBeanId: number, grinderId: number, brewerId: number, coffeeDoseGrams: string, temperatureUnit: TemperatureUnit) {
    const recentBrews = await prisma.brewSession.findMany({
        where: {
            userId: userId,
            coffeeBeanId: coffeeBeanId,
            grinderId: grinderId,
            brewerId: brewerId,
            coffeeDoseGrams: new Prisma.Decimal(coffeeDoseGrams)
        },
        include: {
            tastingScore: true
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
        ],
        take: 5
    });

    return recentBrews.map(function (brew) {
        return {
            brewDate: formatDateOnly(brew.brewDate),
            grindSize: brew.grindSize || "",
            coffeeDoseGrams: getDecimalText(brew.coffeeDoseGrams),
            totalYieldGrams: getDecimalText(brew.totalYieldGrams),
            brewRatio: getDecimalText(brew.brewRatio),
            waterTemperature: formatTemperatureDecimalForInput(brew.waterTemperatureC, temperatureUnit),
            temperatureUnit: getTemperatureUnitLabel(temperatureUnit),
            totalBrewTimeSeconds: brew.totalBrewTimeSeconds,
            overallRating: getDecimalText(brew.overallRating),
            pourStructure: brew.pourStructure || "",
            recipeSteps: brew.recipeSteps || "",
            brewComments: brew.notes || "",
            richness: brew.tastingScore ? brew.tastingScore.richness : null,
            sweetness: brew.tastingScore ? brew.tastingScore.sweetness : null,
            aftertaste: brew.tastingScore ? brew.tastingScore.aftertaste : null,
            aroma: brew.tastingScore ? brew.tastingScore.aroma : null,
            acidity: brew.tastingScore ? brew.tastingScore.acidity : null,
            acidityLevel: brew.acidityLevel || null
        };
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

async function getAdjacentBrewSessionsForUser(userId: number, brewSession: any) {
    const baseBrewDate = brewSession.brewDate;
    const baseCreatedAt = brewSession.createdAt;
    const baseId = brewSession.id;

    const [previousBrewSession, nextBrewSession] = await Promise.all([
        prisma.brewSession.findFirst({
            where: {
                userId: userId,
                OR: [
                    {
                        brewDate: {
                            lt: baseBrewDate
                        }
                    },
                    {
                        brewDate: baseBrewDate,
                        createdAt: {
                            lt: baseCreatedAt
                        }
                    },
                    {
                        brewDate: baseBrewDate,
                        createdAt: baseCreatedAt,
                        id: {
                            lt: baseId
                        }
                    }
                ]
            },
            include: {
                coffeeBean: true
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
        prisma.brewSession.findFirst({
            where: {
                userId: userId,
                OR: [
                    {
                        brewDate: {
                            gt: baseBrewDate
                        }
                    },
                    {
                        brewDate: baseBrewDate,
                        createdAt: {
                            gt: baseCreatedAt
                        }
                    },
                    {
                        brewDate: baseBrewDate,
                        createdAt: baseCreatedAt,
                        id: {
                            gt: baseId
                        }
                    }
                ]
            },
            include: {
                coffeeBean: true
            },
            orderBy: [
                {
                    brewDate: "asc"
                },
                {
                    createdAt: "asc"
                },
                {
                    id: "asc"
                }
            ]
        })
    ]);

    return {
        previousBrewSession: previousBrewSession,
        nextBrewSession: nextBrewSession
    };
}

function mapAdjacentBrewSessionForNavigation(session: any) {
    if (!session) {
        return null;
    }

    return {
        id: session.id,
        brewDate: formatDateOnly(session.brewDate),
        coffeeBeanName: session.coffeeBean && session.coffeeBean.roasterName
            ? `${session.coffeeBean.roasterName} - ${session.coffeeBean.beanName}`
            : session.coffeeBean
                ? session.coffeeBean.beanName
                : "Brew Session"
    };
}

router.get("/", async function (req: Request, res: Response) {
    const userId = getRequiredUserId(req);
    const temperatureUnit = getCurrentTemperatureUnit(res);
    const requestedPage = Number(req.query.page || "1");
    const pageSize = 10;
    const currentPage = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const skip = (currentPage - 1) * pageSize;

    const filters = {
        coffeeBeanId: String(req.query.coffeeBeanId || ""),
        grinderId: String(req.query.grinderId || ""),
        brewerId: String(req.query.brewerId || ""),
        dateFrom: String(req.query.dateFrom || ""),
        dateTo: String(req.query.dateTo || ""),
        minRating: String(req.query.minRating || "")
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

    if (filters.minRating) {
        const minRating = Number(filters.minRating);

        if (!Number.isNaN(minRating)) {
            where.overallRating = {
                gte: new Prisma.Decimal(filters.minRating)
            };
        }
    }

    if (filters.dateFrom || filters.dateTo) {
        where.brewDate = {};

        if (filters.dateFrom) {
            where.brewDate.gte = parseDateOnlyToUtcDate(filters.dateFrom);
        }

        if (filters.dateTo) {
            where.brewDate.lte = parseDateOnlyToUtcEndOfDay(filters.dateTo);
        }
    }

    const [totalBrewSessionCount, brewSessionsFromDatabase, formOptions] = await Promise.all([
        prisma.brewSession.count({
            where: where
        }),
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
            ],
            skip: skip,
            take: pageSize
        }),
        getFormOptions(userId, null)
    ]);

    const brewSessions = brewSessionsFromDatabase.map(function (session) {
        return mapBrewSessionForList(session, temperatureUnit);
    });
    const totalPages = Math.max(1, Math.ceil(totalBrewSessionCount / pageSize));

    const queryBase = new URLSearchParams();
    Object.keys(filters).forEach(function (key) {
        const value = filters[key as keyof typeof filters];

        if (value) {
            queryBase.set(key, value);
        }
    });

    const pageLinks = Array.from({ length: totalPages }, function (_, index) {
        const pageNumber = index + 1;
        const pageQuery = new URLSearchParams(queryBase.toString());
        pageQuery.set("page", String(pageNumber));

        return {
            pageNumber: pageNumber,
            href: `/brew-sessions?${pageQuery.toString()}`
        };
    });

    function buildPageUrl(pageNumber: number): string {
        const pageQuery = new URLSearchParams(queryBase.toString());
        pageQuery.set("page", String(pageNumber));

        return `/brew-sessions?${pageQuery.toString()}`;
    }

    res.render("brew-sessions/index", {
        title: "Brew Sessions",
        brewSessions: brewSessions,
        coffeeBeans: formOptions.coffeeBeans,
        grinders: formOptions.grinders,
        brewers: formOptions.brewers,
        filters: filters,
        pagination: {
            currentPage: currentPage,
            pageSize: pageSize,
            totalItems: totalBrewSessionCount,
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

router.get("/new", async function (req: Request, res: Response) {
    const userId = getRequiredUserId(req);
    const temperatureUnit = getCurrentTemperatureUnit(res);
    const timeZone = getCurrentTimeZone(res);
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
        ? formatTemperatureDecimalForInput(userBrewDefaults.defaultWaterTemperatureC, temperatureUnit)
        : "";

    res.render("brew-sessions/form", {
        title: "Add Brew",
        pageHeading: "Add Brew",
        formAction: "/brew-sessions/start",
        submitButtonText: "Continue",
        errors: [],
        formMode: "setup",
        showAiSuggestionButton: false,
        enableLocationDefaults: true,
        formData: getDefaultFormData(preselectedCoffeeBeanId, preselectedGrinderId, preselectedBrewerId, defaultCoffeeDoseGrams, defaultWaterTemperatureC, timeZone),
        temperatureUnit: getTemperatureUnitLabel(temperatureUnit),
        coffeeBeans: formOptions.coffeeBeans,
        grinders: formOptions.grinders,
        brewers: formOptions.brewers
    });
});



router.post("/equipment-location-suggestions", async function (req: Request, res: Response) {
    const userId = getRequiredUserId(req);
    const latitude = parseOptionalNumber(String(req.body.latitude || "").trim());
    const longitude = parseOptionalNumber(String(req.body.longitude || "").trim());

    if (latitude === null || longitude === null) {
        res.status(400).json({
            ok: false,
            errorMessage: "Latitude and longitude are required."
        });

        return;
    }

    const [grinders, brewers] = await Promise.all([
        prisma.grinder.findMany({
            where: {
                userId: userId,
                latitude: {
                    not: null
                },
                longitude: {
                    not: null
                }
            }
        }),
        prisma.brewer.findMany({
            where: {
                userId: userId,
                latitude: {
                    not: null
                },
                longitude: {
                    not: null
                }
            }
        })
    ]);

    const grinderIds = grinders.map(function (grinder) {
        return grinder.id;
    });
    const brewerIds = brewers.map(function (brewer) {
        return brewer.id;
    });

    const [recentGrinderBrews, recentBrewerBrews] = await Promise.all([
        grinderIds.length > 0
            ? prisma.brewSession.findMany({
                where: {
                    userId: userId,
                    grinderId: {
                        in: grinderIds
                    }
                },
                select: {
                    grinderId: true,
                    brewDate: true,
                    createdAt: true
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
            })
            : Promise.resolve([]),
        brewerIds.length > 0
            ? prisma.brewSession.findMany({
                where: {
                    userId: userId,
                    brewerId: {
                        in: brewerIds
                    }
                },
                select: {
                    brewerId: true,
                    brewDate: true,
                    createdAt: true
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
            })
            : Promise.resolve([])
    ]);

    const lastUsedByGrinderId = new Map<number, Date>();
    recentGrinderBrews.forEach(function (brew) {
        if (brew.grinderId && !lastUsedByGrinderId.has(brew.grinderId)) {
            lastUsedByGrinderId.set(brew.grinderId, brew.brewDate || brew.createdAt);
        }
    });

    const lastUsedByBrewerId = new Map<number, Date>();
    recentBrewerBrews.forEach(function (brew) {
        if (brew.brewerId && !lastUsedByBrewerId.has(brew.brewerId)) {
            lastUsedByBrewerId.set(brew.brewerId, brew.brewDate || brew.createdAt);
        }
    });

    const grinderCandidates = sortEquipmentCandidates(grinders.flatMap(function (grinder) {
        if (grinder.latitude === null || grinder.longitude === null) {
            return [];
        }

        const distanceMeters = calculateDistanceMeters(latitude, longitude, grinder.latitude, grinder.longitude);
        const matchStrength = getMatchStrength(distanceMeters);

        if (!matchStrength) {
            return [];
        }

        return [{
            id: grinder.id,
            name: grinder.name,
            locationName: grinder.locationName,
            latitude: grinder.latitude,
            longitude: grinder.longitude,
            distanceMeters: Math.round(distanceMeters),
            matchStrength: matchStrength,
            lastUsedAt: lastUsedByGrinderId.get(grinder.id) || null
        }];
    }));

    const brewerCandidates = sortEquipmentCandidates(brewers.flatMap(function (brewer) {
        if (brewer.latitude === null || brewer.longitude === null) {
            return [];
        }

        const distanceMeters = calculateDistanceMeters(latitude, longitude, brewer.latitude, brewer.longitude);
        const matchStrength = getMatchStrength(distanceMeters);

        if (!matchStrength) {
            return [];
        }

        return [{
            id: brewer.id,
            name: brewer.name,
            locationName: brewer.locationName,
            latitude: brewer.latitude,
            longitude: brewer.longitude,
            distanceMeters: Math.round(distanceMeters),
            matchStrength: matchStrength,
            lastUsedAt: lastUsedByBrewerId.get(brewer.id) || null
        }];
    }));

    res.json({
        ok: true,
        grinder: grinderCandidates.length > 0 ? grinderCandidates[0] : null,
        brewer: brewerCandidates.length > 0 ? brewerCandidates[0] : null,
        grinderCandidates: grinderCandidates,
        brewerCandidates: brewerCandidates
    });
});

router.post("/suggest-recipe", requireAiAccess, async function (req: Request, res: Response) {
    const userId = getRequiredUserId(req);
    const temperatureUnit = getCurrentTemperatureUnit(res);

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
        model: aiModel,
        apiFeatureType: AI_API_FEATURE_TYPES.webSearch,
        toolCallTypes: AI_TOOL_CALL_TYPES.webSearch,
        webSearchCallCount: 1
    });

    try {
        const recentMatchingBrews = await getRecentMatchingBrewsForSuggestion(
            userId,
            coffeeBeanId,
            grinderId,
            brewerId,
            coffeeDoseGrams,
            temperatureUnit
        );

        const recipeResult = await suggestBrewingRecipe({
            roasterName: coffeeBean.roasterName || "",
            beanName: coffeeBean.beanName,
            origin: coffeeBean.origin || "",
            process: coffeeBean.process || "",
            roastLevel: coffeeBean.roastLevel || "",
            flavorNotes: coffeeBean.flavorNotes || "",
            beanInfo: coffeeBean.beanInfo || "",
            beanNotes: coffeeBean.beanNotes || "",
            grinderName: grinder.name,
            grinderBrand: grinder.brand || "",
            grinderType: grinder.grinderType || "",
            brewerName: brewer.name,
            brewerBrand: brewer.brand || "",
            brewerType: brewer.brewerType || "",
            coffeeDoseGrams: coffeeDoseGrams,
            temperatureUnit: getTemperatureUnitLabel(temperatureUnit),
            recentMatchingBrews: recentMatchingBrews
        });
        const recipe = recipeResult.data;

        await finishAiCallLog({
            handle: aiCallLog,
            status: "Succeeded",
            model: aiModel,
            usage: recipeResult.usage,
            promptText: recipeResult.promptText,
            outputText: recipeResult.outputText,
            apiFeatureType: AI_API_FEATURE_TYPES.webSearch,
            toolCallTypes: AI_TOOL_CALL_TYPES.webSearch,
            webSearchCallCount: 1
        });

        res.json({
            ok: true,
            recipe: recipe,
            recentMatchingBrewCount: recentMatchingBrews.length
        });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Could not suggest a brewing recipe.";

        await finishAiCallLog({
            handle: aiCallLog,
            status: "Failed",
            model: aiModel,
            errorMessage: errorMessage,
            apiFeatureType: AI_API_FEATURE_TYPES.webSearch,
            toolCallTypes: AI_TOOL_CALL_TYPES.webSearch,
            webSearchCallCount: 1
        });

        res.status(500).json({
            ok: false,
            errorMessage: errorMessage
        });
    }
});

router.post("/best-matching-brew", async function (req: Request, res: Response) {
    const userId = getRequiredUserId(req);
    const temperatureUnit = getCurrentTemperatureUnit(res);

    const coffeeBeanId = parseRequiredInteger(String(req.body.coffeeBeanId || "").trim());
    const grinderId = parseRequiredInteger(String(req.body.grinderId || "").trim());
    const brewerId = parseRequiredInteger(String(req.body.brewerId || "").trim());

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

    const ownershipErrors = await validateSelectedRecordsBelongToUser(userId, {
        coffeeBeanId: String(coffeeBeanId),
        grinderId: String(grinderId),
        brewerId: String(brewerId),
        brewDate: "2000-01-01",
        grindSize: "",
        coffeeDoseGrams: "1",
        totalYieldGrams: "",
        waterTemperatureC: "",
        totalBrewTimeMinutes: "",
        totalBrewTimeSeconds: "",
        overallRating: "",
        pourStructure: "",
        recipeSteps: "",
        adjustmentNotes: "",
        brewComments: "",
        richness: "3",
        sweetness: "3",
        aftertaste: "3",
        aroma: "3",
        acidity: "3",
        acidityLevel: ""
    }, true);

    if (ownershipErrors.length > 0) {
        res.status(400).json({
            ok: false,
            errorMessage: ownershipErrors[0]
        });

        return;
    }

    const bestBrew = await findBestMatchingBrew(userId, coffeeBeanId, grinderId, brewerId, temperatureUnit);

    res.json({
        ok: true,
        bestBrew: bestBrew
    });
});

router.post("/start", async function (req: Request, res: Response) {
    const userId = getRequiredUserId(req);
    const temperatureUnit = getCurrentTemperatureUnit(res);
    const formValues = getBrewSessionFormValues(req);
    const errors = validateBrewSetupForm(formValues, temperatureUnit);
    const ownershipErrors = await validateSelectedRecordsBelongToUser(userId, formValues, false);
    const allErrors = errors.concat(ownershipErrors);

    if (allErrors.length > 0) {
        const selectedCoffeeBeanId = parseRequiredInteger(formValues.coffeeBeanId);
        const formOptions = await getFormOptions(userId, selectedCoffeeBeanId);

        res.status(400).render("brew-sessions/form", {
            title: "Add Brew",
            pageHeading: "Add Brew",
            formAction: "/brew-sessions/start",
            submitButtonText: "Continue",
            errors: allErrors,
            formMode: "setup",
            showAiSuggestionButton: false,
            enableLocationDefaults: true,
            formData: formValues,
            temperatureUnit: getTemperatureUnitLabel(temperatureUnit),
            coffeeBeans: formOptions.coffeeBeans,
            grinders: formOptions.grinders,
            brewers: formOptions.brewers
        });

        return;
    }

    const selectedCoffeeBeanId = parseRequiredInteger(formValues.coffeeBeanId);
    const formOptions = await getFormOptions(userId, selectedCoffeeBeanId);

    res.render("brew-sessions/form", {
        title: "Brew Variables",
        pageHeading: "Brew Variables",
        formAction: "/brew-sessions",
        submitButtonText: "Save Brew Entry",
        errors: [],
        formMode: "entry",
        setupSummary: buildBrewSetupSummaryFromFormValues(formValues, formOptions, temperatureUnit),
        autoScrollToBrewVariables: true,
        showAiSuggestionButton: true,
        enableLocationDefaults: false,
        formData: formValues,
        temperatureUnit: getTemperatureUnitLabel(temperatureUnit),
        coffeeBeans: formOptions.coffeeBeans,
        grinders: formOptions.grinders,
        brewers: formOptions.brewers
    });
});

router.post("/", async function (req: Request, res: Response) {
    const userId = getRequiredUserId(req);
    const temperatureUnit = getCurrentTemperatureUnit(res);
    const formValues = getBrewSessionFormValues(req);
    const errors = validateBrewSessionForm(formValues, temperatureUnit);
    const ownershipErrors = await validateSelectedRecordsBelongToUser(userId, formValues, false);
    const allErrors = errors.concat(ownershipErrors);

    if (allErrors.length > 0) {
        const selectedCoffeeBeanId = parseRequiredInteger(formValues.coffeeBeanId);
        const formOptions = await getFormOptions(userId, selectedCoffeeBeanId);

        res.status(400).render("brew-sessions/form", {
            title: "Brew Variables",
            pageHeading: "Brew Variables",
            formAction: "/brew-sessions",
            submitButtonText: "Save Brew Entry",
            errors: allErrors,
            formMode: "entry",
            setupSummary: buildBrewSetupSummaryFromFormValues(formValues, formOptions, temperatureUnit),
            showAiSuggestionButton: true,
            enableLocationDefaults: false,
            formData: formValues,
            temperatureUnit: getTemperatureUnitLabel(temperatureUnit),
            coffeeBeans: formOptions.coffeeBeans,
            grinders: formOptions.grinders,
            brewers: formOptions.brewers
        });

        return;
    }

    const beanInventoryId = await findBestInventoryForBrew(userId, Number(formValues.coffeeBeanId), Number(formValues.coffeeDoseGrams));

    const createdSession = await prisma.brewSession.create({
        data: buildBrewSessionCreateData(userId, formValues, temperatureUnit, beanInventoryId)
    });

    res.redirect(`/brew-sessions/${createdSession.id}`);
});

router.get("/:id/entry", async function (req: Request, res: Response) {
    const userId = getRequiredUserId(req);
    const temperatureUnit = getCurrentTemperatureUnit(res);
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
        title: "Brew Variables",
        pageHeading: "Brew Variables",
        formAction: `/brew-sessions/${id}/entry`,
        submitButtonText: "Save Brew Entry",
        errors: [],
        formMode: "entry",
        setupSummary: buildBrewSetupSummary(brewSession, temperatureUnit),
        showAiSuggestionButton: true,
        enableLocationDefaults: false,
        formData: buildFormDataFromBrewSession(brewSession, temperatureUnit),
        temperatureUnit: getTemperatureUnitLabel(temperatureUnit),
        coffeeBeans: formOptions.coffeeBeans,
        grinders: formOptions.grinders,
        brewers: formOptions.brewers
    });
});

router.post("/:id/entry", async function (req: Request, res: Response) {
    const userId = getRequiredUserId(req);
    const temperatureUnit = getCurrentTemperatureUnit(res);
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
    const errors = validateBrewSessionForm(formValues, temperatureUnit);
    const ownershipErrors = await validateSelectedRecordsBelongToUser(userId, formValues, true);
    const allErrors = errors.concat(ownershipErrors);

    if (allErrors.length > 0) {
        const formOptions = await getFormOptions(userId, existingSession.coffeeBeanId);

        res.status(400).render("brew-sessions/form", {
            title: "Brew Variables",
            pageHeading: "Brew Variables",
            formAction: `/brew-sessions/${id}/entry`,
            submitButtonText: "Save Brew Entry",
            errors: allErrors,
            formMode: "entry",
            setupSummary: buildBrewSetupSummary(existingSession, temperatureUnit),
            showAiSuggestionButton: true,
            enableLocationDefaults: false,
            formData: formValues,
            temperatureUnit: getTemperatureUnitLabel(temperatureUnit),
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
        data: buildBrewSessionUpdateData(formValues, temperatureUnit)
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

router.get("/:id/edit", async function (req: Request, res: Response) {
    const userId = getRequiredUserId(req);
    const temperatureUnit = getCurrentTemperatureUnit(res);
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
        formMode: "full",
        showAiSuggestionButton: false,
        enableLocationDefaults: false,
        formData: buildFormDataFromBrewSession(brewSession, temperatureUnit),
        temperatureUnit: getTemperatureUnitLabel(temperatureUnit),
        coffeeBeans: formOptions.coffeeBeans,
        grinders: formOptions.grinders,
        brewers: formOptions.brewers
    });
});

router.post("/:id/edit", async function (req: Request, res: Response) {
    const userId = getRequiredUserId(req);
    const temperatureUnit = getCurrentTemperatureUnit(res);
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
    const errors = validateBrewSessionForm(formValues, temperatureUnit);
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
            formMode: "full",
            showAiSuggestionButton: false,
            enableLocationDefaults: false,
            formData: formValues,
            temperatureUnit: getTemperatureUnitLabel(temperatureUnit),
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
        data: buildBrewSessionUpdateData(formValues, temperatureUnit)
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

router.get("/:id/rate", async function (req: Request, res: Response) {
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

    if (brewSession.overallRating !== null && typeof brewSession.overallRating !== "undefined") {
        res.redirect(`/brew-sessions/${id}`);
        return;
    }

    res.render("brew-sessions/rate", {
        title: "Rate Brew",
        brewSession: mapBrewSessionForDetail(brewSession, getCurrentTemperatureUnit(res)),
        formAction: `/brew-sessions/${id}/rate`,
        errors: [],
        formData: buildFormDataFromBrewRating(brewSession)
    });
});

router.post("/:id/rate", async function (req: Request, res: Response) {
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

    const formValues = getBrewRatingFormValues(req);
    const errors = validateBrewRatingForm(formValues);

    if (errors.length > 0) {
        res.status(400).render("brew-sessions/rate", {
            title: "Rate Brew",
            brewSession: mapBrewSessionForDetail(brewSession, getCurrentTemperatureUnit(res)),
            formAction: `/brew-sessions/${id}/rate`,
            errors: errors,
            formData: formValues
        });

        return;
    }

    await prisma.brewSession.update({
        where: {
            id: id
        },
        data: {
            overallRating: new Prisma.Decimal(formValues.overallRating),
            notes: formValues.brewComments || null,
            acidityLevel: parseOptionalAcidityLevel(formValues.acidityLevel)
        }
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
    const temperatureUnit = getCurrentTemperatureUnit(res);
    const timeZone = getCurrentTimeZone(res);
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
        formAction: "/brew-sessions/start",
        submitButtonText: "Continue",
        errors: [],
        formMode: "setup",
        showAiSuggestionButton: false,
        enableLocationDefaults: false,
        formData: buildDuplicateFormDataFromBrewSession(existingSession, temperatureUnit, timeZone),
        temperatureUnit: getTemperatureUnitLabel(temperatureUnit),
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
    const temperatureUnit = getCurrentTemperatureUnit(res);
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

    const adjacentBrewSessions = await getAdjacentBrewSessionsForUser(userId, brewSession);

    res.render("brew-sessions/detail", {
        title: "Brew Session Detail",
        brewSession: mapBrewSessionForDetail(brewSession, temperatureUnit),
        previousBrewSession: mapAdjacentBrewSessionForNavigation(adjacentBrewSessions.previousBrewSession),
        nextBrewSession: mapAdjacentBrewSessionForNavigation(adjacentBrewSessions.nextBrewSession)
    });
});

export default router;
