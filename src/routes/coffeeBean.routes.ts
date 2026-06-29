import { Router, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import fs from "fs";
import path from "path";
import multer from "multer";
import sharp from "sharp";
import { prisma } from "../lib/prisma";
import { getRequiredUserId, requireAiAccess } from "../middleware/auth";
import { CoffeeInformationResult, getCoffeeBagImageIdentityFromOpenAI, getCoffeeInformationFromOpenAI } from "../services/coffeeInfo.service";
import { AI_API_FEATURE_TYPES, AI_CALL_TYPES, AI_TOOL_CALL_TYPES, finishAiCallLog, startAiCallLog } from "../services/aiCallLog.service";
import { formatDateUs, formatDateTimeUs, formatDateForInput as formatDateForInputValue, formatDateOnlyUs } from "../utils/dateFormat";
import { TemperatureUnit, formatTemperatureDecimalForInput, normalizeTemperatureUnit } from "../utils/temperature";
import { convertToGrams, findBestInventoryForBrew, formatGrams, formatMoney, getBeanInventorySummary, getEffectiveTotalCost, normalizeCurrencyCode, normalizeWeightUnit, parseOptionalDecimal, roundGrams, getInventoryUsage } from "../services/beanInventory.service";

const router = Router();

function getCurrentTemperatureUnit(res: Response): TemperatureUnit {
    const currentUser = res.locals.currentUser as { temperatureUnit?: string } | null | undefined;

    return normalizeTemperatureUnit(currentUser && currentUser.temperatureUnit ? currentUser.temperatureUnit : "C");
}

function getTemperatureUnitLabel(temperatureUnit: TemperatureUnit): string {
    return temperatureUnit === "F" ? "°F" : "°C";
}

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

const coffeeBeanImageRelativeDirectory = "/uploads/coffee-beans";
const coffeeBeanImageAbsoluteDirectory = path.join(__dirname, "..", "..", "public", "uploads", "coffee-beans");
const allowedCoffeeBeanImageMimeTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const coffeeBeanImageMaxUploadSizeBytes = 12 * 1024 * 1024;
const coffeeBeanImageMaxOutputDimensionPixels = 1200;
const coffeeBeanImageJpegQuality = 82;

const coffeeBeanImageStorage = multer.diskStorage({
    destination: function (req, file, callback) {
        fs.mkdirSync(coffeeBeanImageAbsoluteDirectory, { recursive: true });
        callback(null, coffeeBeanImageAbsoluteDirectory);
    },
    filename: function (req, file, callback) {
        const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1000000000)}.jpg`;

        callback(null, uniqueName);
    }
});

const uploadCoffeeBeanImage = multer({
    storage: coffeeBeanImageStorage,
    limits: {
        fileSize: coffeeBeanImageMaxUploadSizeBytes
    },
    fileFilter: function (req, file, callback) {
        if (!allowedCoffeeBeanImageMimeTypes.includes(file.mimetype)) {
            callback(new Error("Bean picture must be a JPG, PNG, WEBP, or GIF image."));
            return;
        }

        callback(null, true);
    }
}).single("bagImageFile");

function runCoffeeBeanImageUpload(req: Request, res: Response): Promise<string[]> {
    return new Promise(function (resolve) {
        uploadCoffeeBeanImage(req, res, function (error) {
            if (!error) {
                resolve([]);
                return;
            }

            if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
                resolve(["Bean picture must be 12 MB or smaller."]);
                return;
            }

            if (error instanceof Error) {
                resolve([error.message]);
                return;
            }

            resolve(["Bean picture could not be uploaded."]);
        });
    });
}

async function resizeUploadedCoffeeBeanImage(req: Request): Promise<string[]> {
    if (!req.file) {
        return [];
    }

    const originalImagePath = req.file.path;
    const resizedImagePath = `${originalImagePath}.resized`;

    try {
        await sharp(originalImagePath)
            .rotate()
            .resize({
                width: coffeeBeanImageMaxOutputDimensionPixels,
                height: coffeeBeanImageMaxOutputDimensionPixels,
                fit: "inside",
                withoutEnlargement: true
            })
            .jpeg({
                quality: coffeeBeanImageJpegQuality,
                mozjpeg: true
            })
            .toFile(resizedImagePath);

        await fs.promises.rename(resizedImagePath, originalImagePath);

        const resizedImageStats = await fs.promises.stat(originalImagePath);
        req.file.size = resizedImageStats.size;
        req.file.mimetype = "image/jpeg";

        return [];
    } catch (error) {
        await fs.promises.unlink(resizedImagePath).catch(function () {
            // Ignore cleanup errors for missing temporary files.
        });

        return ["Bean picture could not be resized. Please try a different image."];
    }
}

function getUploadedCoffeeBeanImageUrl(req: Request): string {
    if (!req.file) {
        return "";
    }

    return `${coffeeBeanImageRelativeDirectory}/${req.file.filename}`;
}

function deleteCoffeeBeanImageByUrl(imageUrl: string | null | undefined): void {
    if (!imageUrl || !imageUrl.startsWith(`${coffeeBeanImageRelativeDirectory}/`)) {
        return;
    }

    const fileName = path.basename(imageUrl);
    const filePath = path.join(coffeeBeanImageAbsoluteDirectory, fileName);

    fs.unlink(filePath, function () {
        // Ignore cleanup errors. The database update should not fail because an old file is already gone.
    });
}

function deleteUploadedCoffeeBeanImage(req: Request): void {
    const uploadedImageUrl = getUploadedCoffeeBeanImageUrl(req);

    if (uploadedImageUrl) {
        deleteCoffeeBeanImageByUrl(uploadedImageUrl);
    }
}

function getCoffeeBeanImageAbsolutePathFromUrl(imageUrl: string): string {
    const fileName = path.basename(imageUrl);

    return path.join(coffeeBeanImageAbsoluteDirectory, fileName);
}

function isManagedCoffeeBeanImageUrl(imageUrl: string): boolean {
    return imageUrl.startsWith(`${coffeeBeanImageRelativeDirectory}/`);
}

function getExistingUploadedCoffeeBeanImageUrl(imageUrl: string): string {
    if (!imageUrl || !isManagedCoffeeBeanImageUrl(imageUrl)) {
        return "";
    }

    return imageUrl;
}

function formatDateForInput(date: Date | null): string {
    return formatDateForInputValue(date);
}

function formatDateOnly(date: Date | null): string {
    return formatDateUs(date);
}

function formatBrewDateOnly(date: Date | null): string {
    return formatDateOnlyUs(date);
}

function formatDateTime(date: Date | null): string {
    return formatDateTimeUs(date);
}

function formatSeconds(seconds: number | null): string {
    if (seconds === null) {
        return "";
    }

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

function getCoffeeBeanFormValues(req: Request) {
    return {
        beanName: String(req.body.beanName || "").trim(),
        roasterName: String(req.body.roasterName || "").trim(),
        origin: String(req.body.origin || "").trim(),
        process: String(req.body.process || "").trim(),
        roastLevel: String(req.body.roastLevel || "").trim(),
        roastDate: String(req.body.roastDate || "").trim(),
        price: String(req.body.price || "").trim(),
        flavorNotes: String(req.body.flavorNotes || "").trim(),
        sourceUrl: String(req.body.sourceUrl || "").trim(),
        bagImageUrl: String(req.body.bagImageUrl || "").trim(),
        beanInfo: String(req.body.beanInfo || "").trim(),
        beanNotes: String(req.body.beanNotes || "").trim(),
        rating: String(req.body.rating || "").trim(),
        removeBagImage: String(req.body.removeBagImage || "").trim() === "1"
    };
}

function validateCoffeeBeanForm(formValues: ReturnType<typeof getCoffeeBeanFormValues>): string[] {
    const errors: string[] = [];
    const validRoastLevels = ["", "Light", "Medium", "Dark"];
    const price = Number(formValues.price);
    const rating = Number(formValues.rating);

    if (!formValues.beanName) {
        errors.push("Coffee name is required.");
    }

    if (!validRoastLevels.includes(formValues.roastLevel)) {
        errors.push("Roast level must be Light, Medium, or Dark.");
    }

    if (formValues.price && (Number.isNaN(price) || price < 0)) {
        errors.push("Price must be 0 or greater.");
    }

    if (formValues.sourceUrl && !formValues.sourceUrl.startsWith("http")) {
        errors.push("Source URL must start with http or https.");
    }

    if (formValues.rating && (Number.isNaN(rating) || rating < 0 || rating > 5)) {
        errors.push("Bean rating must be between 0 and 5.");
    }

    return errors;
}

function buildConfirmedNotesText(confirmedNotes: string[]): string {
    if (!confirmedNotes || confirmedNotes.length === 0) {
        return "";
    }

    return confirmedNotes.join("\n");
}

function buildCoffeeInfoFormData(currentValues: any, coffeeInfo: CoffeeInformationResult) {
    const confirmedNotesText = buildConfirmedNotesText(coffeeInfo.confirmedNotes);

    return {
        origin: coffeeInfo.origin || currentValues.origin || "",
        process: coffeeInfo.process || currentValues.process || "",
        roastLevel: coffeeInfo.roastLevel || currentValues.roastLevel || "",
        flavorNotes: coffeeInfo.flavorNotes.length > 0
            ? coffeeInfo.flavorNotes.join(", ")
            : currentValues.flavorNotes || "",
        sourceUrl: coffeeInfo.sourceUrl || currentValues.sourceUrl || "",
        beanInfo: confirmedNotesText || currentValues.beanInfo || ""
    };
}

function mapBrewSessionForBeanDetail(session: any, temperatureUnit: TemperatureUnit) {
    return {
        id: session.id,
        brewDate: formatBrewDateOnly(session.brewDate),
        grinderName: session.grinder ? session.grinder.name : "",
        brewerName: session.brewer ? session.brewer.name : "",
        grindSize: session.grindSize || "",
        coffeeDoseGrams: session.coffeeDoseGrams.toString(),
        totalYieldGrams: session.totalYieldGrams ? session.totalYieldGrams.toString() : "",
        brewRatio: session.brewRatio.toString(),
        waterTemperatureC: formatTemperatureDecimalForInput(session.waterTemperatureC, temperatureUnit),
        waterTemperatureUnit: getTemperatureUnitLabel(temperatureUnit),
        totalBrewTime: formatSeconds(session.totalBrewTimeSeconds),
        overallRating: session.overallRating ? session.overallRating.toString() : ""
    };
}

function buildBeanStats(brewSessions: any[], temperatureUnit: TemperatureUnit) {
    const ratedSessions = brewSessions.filter(function (session) {
        return !!session.overallRating;
    });

    const ratioSessions = brewSessions.filter(function (session) {
        return !!session.brewRatio;
    });

    const totalGramsBrewed = brewSessions.reduce(function (sum, session) {
        if (!session.coffeeDoseGrams) {
            return sum;
        }

        return sum + Number(session.coffeeDoseGrams.toString());
    }, 0);

    const totalRating = ratedSessions.reduce(function (sum, session) {
        return sum + Number(session.overallRating.toString());
    }, 0);

    const totalRatio = ratioSessions.reduce(function (sum, session) {
        return sum + Number(session.brewRatio.toString());
    }, 0);

    const bestSession = ratedSessions
        .slice()
        .sort(function (a, b) {
            return Number(b.overallRating.toString()) - Number(a.overallRating.toString());
        })[0];

    return {
        brewSessionCount: brewSessions.length,
        totalGramsBrewed: totalGramsBrewed.toFixed(1),
        ratedSessionCount: ratedSessions.length,
        averageRating: ratedSessions.length > 0 ? (totalRating / ratedSessions.length).toFixed(1) : "",
        bestRating: bestSession ? bestSession.overallRating.toString() : "",
        averageRatio: ratioSessions.length > 0 ? (totalRatio / ratioSessions.length).toFixed(2) : "",
        bestBrewSessionId: bestSession ? bestSession.id : null,
        bestBrewDate: bestSession ? formatBrewDateOnly(bestSession.brewDate) : "",
        bestGrinderName: bestSession && bestSession.grinder ? bestSession.grinder.name : "",
        bestBrewerName: bestSession && bestSession.brewer ? bestSession.brewer.name : "",
        bestGrindSize: bestSession ? bestSession.grindSize || "" : "",
        bestDoseGrams: bestSession && bestSession.coffeeDoseGrams ? bestSession.coffeeDoseGrams.toString() : "",
        bestYieldGrams: bestSession && bestSession.totalYieldGrams ? bestSession.totalYieldGrams.toString() : "",
        bestBrewRatio: bestSession && bestSession.brewRatio ? bestSession.brewRatio.toString() : "",
        bestWaterTemperatureC: bestSession && bestSession.waterTemperatureC ? formatTemperatureDecimalForInput(bestSession.waterTemperatureC, temperatureUnit) : "",
        bestWaterTemperatureUnit: getTemperatureUnitLabel(temperatureUnit),
        bestBrewTime: bestSession ? formatSeconds(bestSession.totalBrewTimeSeconds) : ""
    };
}

async function getCoffeeBeanForUser(userId: number, id: number) {
    return await prisma.coffeeBean.findFirst({
        where: {
            id: id,
            userId: userId
        }
    });
}


function getCurrentCurrencyCode(res: Response): string {
    const currentUser = res.locals.currentUser as { preferredCurrencyCode?: string } | null | undefined;

    return normalizeCurrencyCode(currentUser && currentUser.preferredCurrencyCode ? currentUser.preferredCurrencyCode : "USD");
}

function getCurrentWeightUnit(res: Response): "G" | "OZ" {
    const currentUser = res.locals.currentUser as { preferredWeightUnit?: string } | null | undefined;

    return normalizeWeightUnit(currentUser && currentUser.preferredWeightUnit ? currentUser.preferredWeightUnit : "G");
}

function getTodayInputDate(): string {
    return new Date().toISOString().slice(0, 10);
}

function parseDateInput(value: string): Date | null {
    if (!value) {
        return null;
    }

    return new Date(`${value}T00:00:00`);
}

function getInitialInventoryFormValues(req: Request) {
    return {
        skipInitialInventory: String(req.body.skipInitialInventory || "").trim() === "1",
        initialQuantity: String(req.body.initialQuantity || "1").trim(),
        initialBagSize: String(req.body.initialBagSize || "").trim(),
        initialBagSizeUnit: normalizeWeightUnit(String(req.body.initialBagSizeUnit || "G")),
        initialRoastDate: String(req.body.initialRoastDate || "").trim(),
        initialPurchaseDate: String(req.body.initialPurchaseDate || "").trim(),
        initialCurrencyCode: normalizeCurrencyCode(String(req.body.initialCurrencyCode || "USD")),
        initialItemSubtotal: String(req.body.initialItemSubtotal || "").trim(),
        initialDiscount: String(req.body.initialDiscount || "").trim(),
        initialShipping: String(req.body.initialShipping || "").trim(),
        initialTax: String(req.body.initialTax || "").trim(),
        initialTotalPaid: String(req.body.initialTotalPaid || "").trim(),
        initialBagNotes: String(req.body.initialBagNotes || "").trim()
    };
}

function validateInitialInventoryForm(formValues: ReturnType<typeof getInitialInventoryFormValues>): string[] {
    const errors: string[] = [];

    if (formValues.skipInitialInventory) {
        return errors;
    }

    const quantity = Number(formValues.initialQuantity || "1");
    const bagSize = Number(formValues.initialBagSize);

    if (!Number.isInteger(quantity) || quantity < 1) {
        errors.push("Initial bag quantity must be at least 1.");
    }

    if (!formValues.initialBagSize || Number.isNaN(bagSize) || bagSize <= 0) {
        errors.push("Initial bag size must be greater than 0, or choose I do not have this bean on hand yet.");
    }

    if (!["G", "OZ"].includes(formValues.initialBagSizeUnit)) {
        errors.push("Initial bag size unit must be g or oz.");
    }

    if (!/^[A-Z]{3}$/.test(formValues.initialCurrencyCode)) {
        errors.push("Initial purchase currency must be a 3-letter code.");
    }

    [
        ["Subtotal", formValues.initialItemSubtotal],
        ["Discount", formValues.initialDiscount],
        ["Shipping", formValues.initialShipping],
        ["Tax", formValues.initialTax],
        ["Total paid", formValues.initialTotalPaid]
    ].forEach(function (item) {
        const label = item[0];
        const value = item[1];

        if (value && Number.isNaN(Number(value))) {
            errors.push(`Initial purchase ${label.toLowerCase()} must be a valid number.`);
        }
    });

    return errors;
}

function getPurchaseFormValues(req: Request) {
    return {
        quantity: String(req.body.quantity || "1").trim(),
        bagSize: String(req.body.bagSize || "").trim(),
        bagSizeUnit: normalizeWeightUnit(String(req.body.bagSizeUnit || "G")),
        roastDate: String(req.body.roastDate || "").trim(),
        purchaseDate: String(req.body.purchaseDate || "").trim(),
        currencyCode: normalizeCurrencyCode(String(req.body.currencyCode || "USD")),
        itemSubtotal: String(req.body.itemSubtotal || "").trim(),
        discount: String(req.body.discount || "").trim(),
        shipping: String(req.body.shipping || "").trim(),
        tax: String(req.body.tax || "").trim(),
        totalPaid: String(req.body.totalPaid || "").trim(),
        notes: String(req.body.notes || "").trim()
    };
}

function validatePurchaseForm(formValues: ReturnType<typeof getPurchaseFormValues>): string[] {
    const errors: string[] = [];
    const quantity = Number(formValues.quantity);
    const bagSize = Number(formValues.bagSize);

    if (!Number.isInteger(quantity) || quantity < 1) {
        errors.push("Quantity must be at least 1.");
    }

    if (!formValues.bagSize || Number.isNaN(bagSize) || bagSize <= 0) {
        errors.push("Bag size must be greater than 0.");
    }

    if (!["G", "OZ"].includes(formValues.bagSizeUnit)) {
        errors.push("Bag size unit must be g or oz.");
    }

    if (!/^[A-Z]{3}$/.test(formValues.currencyCode)) {
        errors.push("Currency must be a 3-letter code.");
    }

    [formValues.itemSubtotal, formValues.discount, formValues.shipping, formValues.tax, formValues.totalPaid].forEach(function (value) {
        if (value && Number.isNaN(Number(value))) {
            errors.push("Cost fields must be valid numbers when entered.");
        }
    });

    return errors;
}

function getOpeningBalanceFormValues(req: Request) {
    return {
        currentAmount: String(req.body.currentAmount || "").trim(),
        unit: normalizeWeightUnit(String(req.body.unit || "G")),
        roastDate: String(req.body.roastDate || "").trim(),
        purchaseDate: String(req.body.purchaseDate || "").trim(),
        notes: String(req.body.notes || "").trim()
    };
}

function validateOpeningBalanceForm(formValues: ReturnType<typeof getOpeningBalanceFormValues>): string[] {
    const errors: string[] = [];
    const currentAmount = Number(formValues.currentAmount);

    if (!formValues.currentAmount || Number.isNaN(currentAmount) || currentAmount < 0) {
        errors.push("Current remaining amount must be 0 or greater.");
    }

    if (!["G", "OZ"].includes(formValues.unit)) {
        errors.push("Unit must be g or oz.");
    }

    return errors;
}

function getAdjustmentFormValues(req: Request) {
    return {
        adjustmentGrams: String(req.body.adjustmentGrams || "").trim(),
        reason: String(req.body.reason || "CORRECTION").trim(),
        notes: String(req.body.notes || "").trim()
    };
}

function validateAdjustmentForm(formValues: ReturnType<typeof getAdjustmentFormValues>): string[] {
    const errors: string[] = [];
    const adjustmentGrams = Number(formValues.adjustmentGrams);
    const validReasons = ["FINISHED_LEFTOVER", "DISCARDED", "CORRECTION", "OTHER"];

    if (!formValues.adjustmentGrams || Number.isNaN(adjustmentGrams) || adjustmentGrams === 0) {
        errors.push("Adjustment grams must be a non-zero number.");
    }

    if (!validReasons.includes(formValues.reason)) {
        errors.push("Adjustment reason is invalid.");
    }

    return errors;
}

async function getCoffeeBeanForInventoryAction(userId: number, beanId: number) {
    return await prisma.coffeeBean.findFirst({
        where: {
            id: beanId,
            userId: userId
        }
    });
}

async function getInventoryForUser(userId: number, beanId: number, inventoryId: number) {
    return await prisma.beanInventory.findFirst({
        where: {
            id: inventoryId,
            beanId: beanId,
            bean: {
                userId: userId
            }
        },
        include: {
            beanPurchase: true,
            brewSessions: {
                select: {
                    coffeeDoseGrams: true
                }
            },
            adjustments: true
        }
    });
}

async function getDefaultPurchaseFormData(userId: number, beanId: number, res: Response) {
    const lastInventory = await prisma.beanInventory.findFirst({
        where: {
            beanId: beanId,
            bean: {
                userId: userId
            },
            bagSizeOriginalValue: {
                not: null
            }
        },
        orderBy: {
            createdAt: "desc"
        }
    });

    return {
        quantity: "1",
        bagSize: lastInventory && lastInventory.bagSizeOriginalValue ? lastInventory.bagSizeOriginalValue.toString() : "",
        bagSizeUnit: lastInventory && lastInventory.bagSizeOriginalUnit ? lastInventory.bagSizeOriginalUnit : getCurrentWeightUnit(res),
        roastDate: "",
        purchaseDate: getTodayInputDate(),
        currencyCode: getCurrentCurrencyCode(res),
        itemSubtotal: "",
        discount: "",
        shipping: "",
        tax: "",
        totalPaid: "",
        notes: ""
    };
}

async function getRoasterSuggestions(userId: number): Promise<string[]> {
    const roasters = await prisma.coffeeBean.findMany({
        where: {
            userId: userId,
            roasterName: {
                not: null
            }
        },
        select: {
            roasterName: true
        },
        distinct: ["roasterName"],
        orderBy: {
            roasterName: "asc"
        }
    });

    return roasters
        .map(function (roaster) {
            return roaster.roasterName || "";
        })
        .filter(function (roasterName) {
            return roasterName.length > 0;
        });
}

router.get("/", async function (req: Request, res: Response) {
    const userId = getRequiredUserId(req);
    const requestedPage = Number(req.query.page || "1");
    const pageSize = 10;
    const currentPage = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const skip = (currentPage - 1) * pageSize;

    const where = {
        userId: userId
    };

    const [totalBeanCount, coffeeBeansFromDatabase] = await Promise.all([
        prisma.coffeeBean.count({
            where: where
        }),
        prisma.coffeeBean.findMany({
            where: where,
            orderBy: [
                {
                    isActive: "desc"
                },
                {
                    createdAt: "desc"
                }
            ],
            skip: skip,
            take: pageSize,
            include: {
                brewSessions: {
                    where: {
                        userId: userId
                    },
                    select: {
                        id: true,
                        coffeeDoseGrams: true
                    }
                },
                beanInventories: {
                    include: {
                        brewSessions: {
                            select: {
                                coffeeDoseGrams: true
                            }
                        },
                        adjustments: {
                            select: {
                                adjustmentGrams: true
                            }
                        }
                    }
                }
            }
        })
    ]);

    const coffeeBeans = coffeeBeansFromDatabase.map(function (bean) {
        const totalGramsBrewed = bean.brewSessions.reduce(function (sum, session) {
            if (!session.coffeeDoseGrams) {
                return sum;
            }

            return sum + Number(session.coffeeDoseGrams.toString());
        }, 0);

        const totalInventoryGrams = bean.beanInventories.reduce(function (sum, inventory) {
            const usage = getInventoryUsage(inventory);

            return sum + usage.remainingGrams;
        }, 0);
        const availableInventories = bean.beanInventories
            .map(function (inventory) {
                return getInventoryUsage(inventory);
            })
            .filter(function (usage) {
                return usage.remainingGrams > 0;
            });
        const currentInventoryGrams = availableInventories.length > 0 ? availableInventories[0].remainingGrams : 0;
        const nextInventoryGrams = availableInventories.slice(1).reduce(function (sum, usage) {
            return sum + usage.remainingGrams;
        }, 0);

        return {
            id: bean.id,
            beanName: bean.beanName,
            roasterName: bean.roasterName || "",
            origin: bean.origin || "",
            process: bean.process || "",
            roastLevel: bean.roastLevel || "",
            roastDate: formatDateOnly(bean.roastDate),
            price: bean.price ? bean.price.toString() : "",
            bagImageUrl: bean.bagImageUrl || "",
            beanInfo: bean.beanInfo || "",
            beanNotes: bean.beanNotes || "",
            rating: bean.rating ? bean.rating.toString() : "",
            isActive: bean.isActive,
            deactivatedAt: formatDateTime(bean.deactivatedAt),
            brewSessionCount: bean.brewSessions.length,
            totalGramsBrewed: totalGramsBrewed.toFixed(1),
            totalInventoryGrams: formatGrams(totalInventoryGrams),
            currentInventoryGrams: formatGrams(currentInventoryGrams),
            nextInventoryGrams: formatGrams(nextInventoryGrams),
            hasInventory: bean.beanInventories.length > 0
        };
    });

    const totalPages = Math.max(1, Math.ceil(totalBeanCount / pageSize));

    res.render("coffee-beans/index", {
        title: "Coffee Beans",
        coffeeBeans: coffeeBeans,
        pagination: {
            currentPage: currentPage,
            pageSize: pageSize,
            totalItems: totalBeanCount,
            totalPages: totalPages,
            hasPreviousPage: currentPage > 1,
            hasNextPage: currentPage < totalPages,
            previousPage: currentPage - 1,
            nextPage: currentPage + 1
        }
    });
});

router.get("/new", async function (req: Request, res: Response) {
    const userId = getRequiredUserId(req);
    const roasterSuggestions = await getRoasterSuggestions(userId);

    res.render("coffee-beans/form", {
        title: "Add Coffee Bean",
        pageHeading: "Add Coffee Bean",
        formAction: "/coffee-beans",
        submitButtonText: "Save Coffee Bean",
        errors: [],
        formData: {
            skipInitialInventory: false,
            initialQuantity: "1",
            initialBagSize: "",
            initialBagSizeUnit: getCurrentWeightUnit(res),
            initialRoastDate: "",
            initialPurchaseDate: getTodayInputDate(),
            initialCurrencyCode: getCurrentCurrencyCode(res),
            initialItemSubtotal: "",
            initialDiscount: "",
            initialShipping: "",
            initialTax: "",
            initialTotalPaid: "",
            initialBagNotes: ""
        },
        roasterSuggestions: roasterSuggestions,
        isEdit: false
    });
});

router.post("/get-info", requireAiAccess, async function (req: Request, res: Response) {
    const formValues = getCoffeeBeanFormValues(req);

    if (!formValues.roasterName || !formValues.beanName) {
        res.status(400).json({
            ok: false,
            errorMessage: "Roaster and Coffee Name are required before getting coffee information."
        });

        return;
    }

    const aiModel = process.env.OPENAI_MODEL || "gpt-5.4-mini";
    const aiCallLog = await startAiCallLog({
        user: getAiCallRouteUser(res),
        callType: AI_CALL_TYPES.beanDetailLookup,
        model: aiModel,
        apiFeatureType: AI_API_FEATURE_TYPES.webSearch,
        toolCallTypes: AI_TOOL_CALL_TYPES.webSearch,
        webSearchCallCount: 1
    });

    try {
        const coffeeInfoResult = await getCoffeeInformationFromOpenAI(formValues.roasterName, formValues.beanName);
        const coffeeInfo = coffeeInfoResult.data;
        const formData = buildCoffeeInfoFormData(formValues, coffeeInfo);

        await finishAiCallLog({
            handle: aiCallLog,
            status: "Succeeded",
            model: aiModel,
            usage: coffeeInfoResult.usage,
            promptText: coffeeInfoResult.promptText,
            outputText: coffeeInfoResult.outputText,
            apiFeatureType: AI_API_FEATURE_TYPES.webSearch,
            toolCallTypes: AI_TOOL_CALL_TYPES.webSearch,
            webSearchCallCount: 1
        });

        res.json({
            ok: true,
            formData: formData,
            confirmedNotes: coffeeInfo.confirmedNotes
        });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Could not get coffee information.";

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

router.post("/upload-bag-image-identify", requireAiAccess, async function (req: Request, res: Response) {
    const uploadErrors = await runCoffeeBeanImageUpload(req, res);
    const resizeErrors = uploadErrors.length === 0 ? await resizeUploadedCoffeeBeanImage(req) : [];
    const allUploadErrors = uploadErrors.concat(resizeErrors);
    const uploadedBagImageUrl = getUploadedCoffeeBeanImageUrl(req);

    if (allUploadErrors.length > 0) {
        deleteUploadedCoffeeBeanImage(req);

        res.status(400).json({
            ok: false,
            errorMessage: allUploadErrors.join(" ")
        });

        return;
    }

    if (!uploadedBagImageUrl || !req.file) {
        res.status(400).json({
            ok: false,
            errorMessage: "Choose a bean bag picture before uploading."
        });

        return;
    }

    const aiModel = process.env.OPENAI_VISION_MODEL || process.env.OPENAI_MODEL || "gpt-5.4-mini";
    const aiCallLog = await startAiCallLog({
        user: getAiCallRouteUser(res),
        callType: AI_CALL_TYPES.beanBagOcr,
        model: aiModel,
        imageCount: 1,
        apiFeatureType: AI_API_FEATURE_TYPES.imageInput,
        toolCallTypes: AI_TOOL_CALL_TYPES.imageInput
    });

    try {
        const imageFilePath = getCoffeeBeanImageAbsolutePathFromUrl(uploadedBagImageUrl);
        const imageIdentityResult = await getCoffeeBagImageIdentityFromOpenAI(imageFilePath, req.file.mimetype);
        const imageIdentity = imageIdentityResult.data;

        await finishAiCallLog({
            handle: aiCallLog,
            status: "Succeeded",
            model: aiModel,
            usage: imageIdentityResult.usage,
            imageCount: 1,
            promptText: imageIdentityResult.promptText,
            outputText: imageIdentityResult.outputText,
            apiFeatureType: AI_API_FEATURE_TYPES.imageInput,
            toolCallTypes: AI_TOOL_CALL_TYPES.imageInput,
            webSearchCallCount: 0
        });

        res.json({
            ok: true,
            bagImageUrl: uploadedBagImageUrl,
            formData: {
                roasterName: imageIdentity.roasterName || "",
                beanName: imageIdentity.beanName || ""
            },
            confidence: imageIdentity.confidence,
            notes: imageIdentity.notes
        });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Could not read the coffee bag picture.";

        await finishAiCallLog({
            handle: aiCallLog,
            status: "Failed",
            model: aiModel,
            errorMessage: errorMessage,
            imageCount: 1,
            apiFeatureType: AI_API_FEATURE_TYPES.imageInput,
            toolCallTypes: AI_TOOL_CALL_TYPES.imageInput,
            webSearchCallCount: 0
        });

        res.json({
            ok: false,
            bagImageUrl: uploadedBagImageUrl,
            errorMessage: errorMessage
        });
    }
});

router.post("/", async function (req: Request, res: Response) {
    const userId = getRequiredUserId(req);
    const uploadErrors = await runCoffeeBeanImageUpload(req, res);
    const resizeErrors = uploadErrors.length === 0 ? await resizeUploadedCoffeeBeanImage(req) : [];
    const allUploadErrors = uploadErrors.concat(resizeErrors);
    const formValues = getCoffeeBeanFormValues(req);
    const initialInventoryValues = getInitialInventoryFormValues(req);
    const errors = validateCoffeeBeanForm(formValues).concat(validateInitialInventoryForm(initialInventoryValues)).concat(allUploadErrors);
    const uploadedBagImageUrl = getUploadedCoffeeBeanImageUrl(req);
    const existingUploadedBagImageUrl = getExistingUploadedCoffeeBeanImageUrl(formValues.bagImageUrl);

    if (errors.length > 0) {
        deleteUploadedCoffeeBeanImage(req);
        const roasterSuggestions = await getRoasterSuggestions(userId);

        res.status(400).render("coffee-beans/form", {
            title: "Add Coffee Bean",
            pageHeading: "Add Coffee Bean",
            formAction: "/coffee-beans",
            submitButtonText: "Save Coffee Bean",
            errors: errors,
            formData: {
                ...formValues,
                ...initialInventoryValues,
                bagImageUrl: existingUploadedBagImageUrl
            },
            roasterSuggestions: roasterSuggestions,
            isEdit: false
        });

        return;
    }

    const createdBean = await prisma.$transaction(async function (tx) {
        const bean = await tx.coffeeBean.create({
            data: {
                userId: userId,
                beanName: formValues.beanName,
                roasterName: formValues.roasterName || null,
                origin: formValues.origin || null,
                process: formValues.process || null,
                roastLevel: formValues.roastLevel || null,
                roastDate: formValues.roastDate ? new Date(`${formValues.roastDate}T00:00:00`) : null,
                price: formValues.price ? new Prisma.Decimal(formValues.price) : null,
                flavorNotes: formValues.flavorNotes || null,
                sourceUrl: formValues.sourceUrl || null,
                bagImageUrl: uploadedBagImageUrl || existingUploadedBagImageUrl || null,
                beanInfo: formValues.beanInfo || null,
                beanNotes: formValues.beanNotes || null,
                rating: formValues.rating ? new Prisma.Decimal(formValues.rating) : null,
                isActive: true
            }
        });

        if (!initialInventoryValues.skipInitialInventory) {
            const quantity = Number(initialInventoryValues.initialQuantity || "1");
            const bagSizeOriginalValue = Number(initialInventoryValues.initialBagSize);
            const bagSizeGrams = roundGrams(convertToGrams(bagSizeOriginalValue, initialInventoryValues.initialBagSizeUnit));
            const purchase = await tx.beanPurchase.create({
                data: {
                    beanId: bean.id,
                    purchaseDate: parseDateInput(initialInventoryValues.initialPurchaseDate),
                    quantity: quantity,
                    currencyCode: initialInventoryValues.initialCurrencyCode,
                    itemSubtotal: parseOptionalDecimal(initialInventoryValues.initialItemSubtotal),
                    discount: parseOptionalDecimal(initialInventoryValues.initialDiscount),
                    shipping: parseOptionalDecimal(initialInventoryValues.initialShipping),
                    tax: parseOptionalDecimal(initialInventoryValues.initialTax),
                    totalPaid: parseOptionalDecimal(initialInventoryValues.initialTotalPaid),
                    notes: initialInventoryValues.initialBagNotes || null,
                    createdByUserId: userId
                }
            });

            for (let index = 0; index < quantity; index++) {
                await tx.beanInventory.create({
                    data: {
                        beanId: bean.id,
                        beanPurchaseId: purchase.id,
                        inventoryType: "PURCHASE",
                        startingGrams: new Prisma.Decimal(bagSizeGrams.toFixed(2)),
                        bagSizeGrams: new Prisma.Decimal(bagSizeGrams.toFixed(2)),
                        bagSizeOriginalValue: new Prisma.Decimal(bagSizeOriginalValue.toString()),
                        bagSizeOriginalUnit: initialInventoryValues.initialBagSizeUnit,
                        roastDate: parseDateInput(initialInventoryValues.initialRoastDate),
                        purchaseDate: parseDateInput(initialInventoryValues.initialPurchaseDate),
                        notes: initialInventoryValues.initialBagNotes || null
                    }
                });
            }
        }

        return bean;
    });

    res.redirect(`/coffee-beans/${createdBean.id}`);
});

router.get("/:id/replenishments/new", async function (req: Request, res: Response) {
    const userId = getRequiredUserId(req);
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
        res.status(400).send("Invalid coffee bean ID.");
        return;
    }

    const coffeeBean = await getCoffeeBeanForInventoryAction(userId, id);

    if (!coffeeBean) {
        res.status(404).send("Coffee bean not found.");
        return;
    }

    res.render("coffee-beans/inventory-purchase-form", {
        title: "Add Replenishment",
        pageHeading: "Add Replenishment",
        coffeeBean: coffeeBean,
        errors: [],
        formData: await getDefaultPurchaseFormData(userId, id, res)
    });
});

router.post("/:id/replenishments", async function (req: Request, res: Response) {
    const userId = getRequiredUserId(req);
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
        res.status(400).send("Invalid coffee bean ID.");
        return;
    }

    const coffeeBean = await getCoffeeBeanForInventoryAction(userId, id);

    if (!coffeeBean) {
        res.status(404).send("Coffee bean not found.");
        return;
    }

    const formValues = getPurchaseFormValues(req);
    const errors = validatePurchaseForm(formValues);

    if (errors.length > 0) {
        res.status(400).render("coffee-beans/inventory-purchase-form", {
            title: "Add Replenishment",
            pageHeading: "Add Replenishment",
            coffeeBean: coffeeBean,
            errors: errors,
            formData: formValues
        });
        return;
    }

    const quantity = Number(formValues.quantity);
    const bagSizeOriginalValue = Number(formValues.bagSize);
    const bagSizeGrams = roundGrams(convertToGrams(bagSizeOriginalValue, formValues.bagSizeUnit));

    await prisma.$transaction(async function (tx) {
        const purchase = await tx.beanPurchase.create({
            data: {
                beanId: id,
                purchaseDate: parseDateInput(formValues.purchaseDate),
                quantity: quantity,
                currencyCode: formValues.currencyCode,
                itemSubtotal: parseOptionalDecimal(formValues.itemSubtotal),
                discount: parseOptionalDecimal(formValues.discount),
                shipping: parseOptionalDecimal(formValues.shipping),
                tax: parseOptionalDecimal(formValues.tax),
                totalPaid: parseOptionalDecimal(formValues.totalPaid),
                notes: formValues.notes || null,
                createdByUserId: userId
            }
        });

        for (let index = 0; index < quantity; index++) {
            await tx.beanInventory.create({
                data: {
                    beanId: id,
                    beanPurchaseId: purchase.id,
                    inventoryType: "PURCHASE",
                    startingGrams: new Prisma.Decimal(bagSizeGrams.toFixed(2)),
                    bagSizeGrams: new Prisma.Decimal(bagSizeGrams.toFixed(2)),
                    bagSizeOriginalValue: new Prisma.Decimal(bagSizeOriginalValue.toString()),
                    bagSizeOriginalUnit: formValues.bagSizeUnit,
                    roastDate: parseDateInput(formValues.roastDate),
                    purchaseDate: parseDateInput(formValues.purchaseDate),
                    notes: formValues.notes || null
                }
            });
        }
    });

    res.redirect(`/coffee-beans/${id}?message=${encodeURIComponent("Replenishment added.")}`);
});

router.get("/:id/opening-balance/new", async function (req: Request, res: Response) {
    const userId = getRequiredUserId(req);
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
        res.status(400).send("Invalid coffee bean ID.");
        return;
    }

    const coffeeBean = await getCoffeeBeanForInventoryAction(userId, id);

    if (!coffeeBean) {
        res.status(404).send("Coffee bean not found.");
        return;
    }

    res.render("coffee-beans/opening-balance-form", {
        title: "Set Current Inventory",
        pageHeading: "Set Current Inventory",
        coffeeBean: coffeeBean,
        errors: [],
        formData: {
            currentAmount: "",
            unit: getCurrentWeightUnit(res),
            roastDate: "",
            purchaseDate: "",
            notes: ""
        }
    });
});

router.post("/:id/opening-balance", async function (req: Request, res: Response) {
    const userId = getRequiredUserId(req);
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
        res.status(400).send("Invalid coffee bean ID.");
        return;
    }

    const coffeeBean = await getCoffeeBeanForInventoryAction(userId, id);

    if (!coffeeBean) {
        res.status(404).send("Coffee bean not found.");
        return;
    }

    const formValues = getOpeningBalanceFormValues(req);
    const errors = validateOpeningBalanceForm(formValues);

    if (errors.length > 0) {
        res.status(400).render("coffee-beans/opening-balance-form", {
            title: "Set Current Inventory",
            pageHeading: "Set Current Inventory",
            coffeeBean: coffeeBean,
            errors: errors,
            formData: formValues
        });
        return;
    }

    const startingGrams = roundGrams(convertToGrams(Number(formValues.currentAmount), formValues.unit));

    await prisma.beanInventory.create({
        data: {
            beanId: id,
            inventoryType: "OPENING_BALANCE",
            startingGrams: new Prisma.Decimal(startingGrams.toFixed(2)),
            bagSizeGrams: null,
            bagSizeOriginalValue: null,
            bagSizeOriginalUnit: null,
            roastDate: parseDateInput(formValues.roastDate),
            purchaseDate: parseDateInput(formValues.purchaseDate),
            notes: formValues.notes || null
        }
    });

    res.redirect(`/coffee-beans/${id}?message=${encodeURIComponent("Current inventory set.")}`);
});

router.get("/:id/inventory/:inventoryId/edit", async function (req: Request, res: Response) {
    const userId = getRequiredUserId(req);
    const id = Number(req.params.id);
    const inventoryId = Number(req.params.inventoryId);

    if (!Number.isInteger(id) || !Number.isInteger(inventoryId)) {
        res.status(400).send("Invalid inventory ID.");
        return;
    }

    const coffeeBean = await getCoffeeBeanForInventoryAction(userId, id);
    const inventory = await getInventoryForUser(userId, id, inventoryId);

    if (!coffeeBean || !inventory) {
        res.status(404).send("Inventory record not found.");
        return;
    }

    res.render("coffee-beans/inventory-edit-form", {
        title: "Edit Bag",
        pageHeading: "Edit Bag",
        coffeeBean: coffeeBean,
        inventory: inventory,
        errors: [],
        formData: {
            bagSize: inventory.bagSizeOriginalValue ? inventory.bagSizeOriginalValue.toString() : "",
            bagSizeUnit: inventory.bagSizeOriginalUnit || "G",
            startingGrams: inventory.startingGrams.toString(),
            roastDate: formatDateForInput(inventory.roastDate),
            purchaseDate: formatDateForInput(inventory.purchaseDate),
            notes: inventory.notes || ""
        }
    });
});

router.post("/:id/inventory/:inventoryId/edit", async function (req: Request, res: Response) {
    const userId = getRequiredUserId(req);
    const id = Number(req.params.id);
    const inventoryId = Number(req.params.inventoryId);

    if (!Number.isInteger(id) || !Number.isInteger(inventoryId)) {
        res.status(400).send("Invalid inventory ID.");
        return;
    }

    const coffeeBean = await getCoffeeBeanForInventoryAction(userId, id);
    const inventory = await getInventoryForUser(userId, id, inventoryId);

    if (!coffeeBean || !inventory) {
        res.status(404).send("Inventory record not found.");
        return;
    }

    const formData = {
        bagSize: String(req.body.bagSize || "").trim(),
        bagSizeUnit: normalizeWeightUnit(String(req.body.bagSizeUnit || "G")),
        startingGrams: String(req.body.startingGrams || "").trim(),
        roastDate: String(req.body.roastDate || "").trim(),
        purchaseDate: String(req.body.purchaseDate || "").trim(),
        notes: String(req.body.notes || "").trim()
    };
    const errors: string[] = [];
    const startingGrams = Number(formData.startingGrams);
    const bagSize = Number(formData.bagSize);

    if (!formData.startingGrams || Number.isNaN(startingGrams) || startingGrams < 0) {
        errors.push("Starting grams must be 0 or greater.");
    }

    if (formData.bagSize && (Number.isNaN(bagSize) || bagSize <= 0)) {
        errors.push("Bag size must be greater than 0 when entered.");
    }

    if (errors.length > 0) {
        res.status(400).render("coffee-beans/inventory-edit-form", {
            title: "Edit Bag",
            pageHeading: "Edit Bag",
            coffeeBean: coffeeBean,
            inventory: inventory,
            errors: errors,
            formData: formData
        });
        return;
    }

    const bagSizeGrams = formData.bagSize ? roundGrams(convertToGrams(bagSize, formData.bagSizeUnit)) : null;

    await prisma.beanInventory.update({
        where: {
            id: inventoryId
        },
        data: {
            startingGrams: new Prisma.Decimal(startingGrams.toFixed(2)),
            bagSizeGrams: bagSizeGrams === null ? null : new Prisma.Decimal(bagSizeGrams.toFixed(2)),
            bagSizeOriginalValue: formData.bagSize ? new Prisma.Decimal(bagSize.toString()) : null,
            bagSizeOriginalUnit: formData.bagSize ? formData.bagSizeUnit : null,
            roastDate: parseDateInput(formData.roastDate),
            purchaseDate: parseDateInput(formData.purchaseDate),
            notes: formData.notes || null
        }
    });

    res.redirect(`/coffee-beans/${id}?message=${encodeURIComponent("Inventory bag updated.")}`);
});

router.get("/:id/inventory/:inventoryId/adjust", async function (req: Request, res: Response) {
    const userId = getRequiredUserId(req);
    const id = Number(req.params.id);
    const inventoryId = Number(req.params.inventoryId);

    if (!Number.isInteger(id) || !Number.isInteger(inventoryId)) {
        res.status(400).send("Invalid inventory ID.");
        return;
    }

    const coffeeBean = await getCoffeeBeanForInventoryAction(userId, id);
    const inventory = await getInventoryForUser(userId, id, inventoryId);

    if (!coffeeBean || !inventory) {
        res.status(404).send("Inventory record not found.");
        return;
    }

    const usage = getInventoryUsage(inventory);

    res.render("coffee-beans/inventory-adjust-form", {
        title: "Adjust Inventory",
        pageHeading: "Adjust Inventory",
        coffeeBean: coffeeBean,
        inventory: inventory,
        remainingGrams: usage.remainingGrams,
        errors: [],
        formData: {
            adjustmentGrams: "",
            reason: "CORRECTION",
            notes: ""
        }
    });
});

router.post("/:id/inventory/:inventoryId/adjust", async function (req: Request, res: Response) {
    const userId = getRequiredUserId(req);
    const id = Number(req.params.id);
    const inventoryId = Number(req.params.inventoryId);

    if (!Number.isInteger(id) || !Number.isInteger(inventoryId)) {
        res.status(400).send("Invalid inventory ID.");
        return;
    }

    const coffeeBean = await getCoffeeBeanForInventoryAction(userId, id);
    const inventory = await getInventoryForUser(userId, id, inventoryId);

    if (!coffeeBean || !inventory) {
        res.status(404).send("Inventory record not found.");
        return;
    }

    const formValues = getAdjustmentFormValues(req);
    const errors = validateAdjustmentForm(formValues);
    const usage = getInventoryUsage(inventory);

    if (errors.length > 0) {
        res.status(400).render("coffee-beans/inventory-adjust-form", {
            title: "Adjust Inventory",
            pageHeading: "Adjust Inventory",
            coffeeBean: coffeeBean,
            inventory: inventory,
            remainingGrams: usage.remainingGrams,
            errors: errors,
            formData: formValues
        });
        return;
    }

    await prisma.beanInventoryAdjustment.create({
        data: {
            beanInventoryId: inventoryId,
            adjustmentGrams: new Prisma.Decimal(Number(formValues.adjustmentGrams).toFixed(2)),
            reason: formValues.reason as any,
            notes: formValues.notes || null,
            createdByUserId: userId
        }
    });

    res.redirect(`/coffee-beans/${id}?message=${encodeURIComponent("Inventory adjusted.")}`);
});

router.get("/:id/inventory/:inventoryId/finish", async function (req: Request, res: Response) {
    const userId = getRequiredUserId(req);
    const id = Number(req.params.id);
    const inventoryId = Number(req.params.inventoryId);

    if (!Number.isInteger(id) || !Number.isInteger(inventoryId)) {
        res.status(400).send("Invalid inventory ID.");
        return;
    }

    const coffeeBean = await getCoffeeBeanForInventoryAction(userId, id);
    const inventory = await getInventoryForUser(userId, id, inventoryId);

    if (!coffeeBean || !inventory) {
        res.status(404).send("Inventory record not found.");
        return;
    }

    const usage = getInventoryUsage(inventory);

    res.render("coffee-beans/inventory-finish-form", {
        title: "Finish Bag",
        pageHeading: "Finish Bag",
        coffeeBean: coffeeBean,
        inventory: inventory,
        remainingGrams: usage.remainingGrams,
        errors: [],
        formData: {
            reason: "FINISHED_LEFTOVER",
            notes: ""
        }
    });
});

router.post("/:id/inventory/:inventoryId/finish", async function (req: Request, res: Response) {
    const userId = getRequiredUserId(req);
    const id = Number(req.params.id);
    const inventoryId = Number(req.params.inventoryId);

    if (!Number.isInteger(id) || !Number.isInteger(inventoryId)) {
        res.status(400).send("Invalid inventory ID.");
        return;
    }

    const coffeeBean = await getCoffeeBeanForInventoryAction(userId, id);
    const inventory = await getInventoryForUser(userId, id, inventoryId);

    if (!coffeeBean || !inventory) {
        res.status(404).send("Inventory record not found.");
        return;
    }

    const usage = getInventoryUsage(inventory);
    const reason = String(req.body.reason || "FINISHED_LEFTOVER").trim();
    const notes = String(req.body.notes || "").trim();
    const validReasons = ["FINISHED_LEFTOVER", "DISCARDED", "CORRECTION", "OTHER"];

    if (!validReasons.includes(reason)) {
        res.status(400).render("coffee-beans/inventory-finish-form", {
            title: "Finish Bag",
            pageHeading: "Finish Bag",
            coffeeBean: coffeeBean,
            inventory: inventory,
            remainingGrams: usage.remainingGrams,
            errors: ["Reason is invalid."],
            formData: {
                reason: reason,
                notes: notes
            }
        });
        return;
    }

    if (usage.remainingGrams > 0) {
        await prisma.beanInventoryAdjustment.create({
            data: {
                beanInventoryId: inventoryId,
                adjustmentGrams: new Prisma.Decimal((-usage.remainingGrams).toFixed(2)),
                reason: reason as any,
                notes: notes || null,
                createdByUserId: userId
            }
        });
    }

    res.redirect(`/coffee-beans/${id}?message=${encodeURIComponent("Bag finished.")}`);
});

router.post("/:id/inventory/:inventoryId/delete", async function (req: Request, res: Response) {
    const userId = getRequiredUserId(req);
    const id = Number(req.params.id);
    const inventoryId = Number(req.params.inventoryId);

    if (!Number.isInteger(id) || !Number.isInteger(inventoryId)) {
        res.status(400).send("Invalid inventory ID.");
        return;
    }

    const inventory = await getInventoryForUser(userId, id, inventoryId);

    if (!inventory) {
        res.status(404).send("Inventory record not found.");
        return;
    }

    if (inventory.brewSessions.length > 0 || inventory.adjustments.length > 0) {
        res.redirect(`/coffee-beans/${id}?errorMessage=${encodeURIComponent("Cannot delete a bag that already has brews or adjustments. Use Finish Bag or Adjust Inventory instead.")}`);
        return;
    }

    await prisma.beanInventory.delete({
        where: {
            id: inventoryId
        }
    });

    res.redirect(`/coffee-beans/${id}?message=${encodeURIComponent("Inventory bag deleted.")}`);
});

router.get("/:id/edit", async function (req: Request, res: Response) {
    const userId = getRequiredUserId(req);
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
        res.status(400).send("Invalid coffee bean ID.");
        return;
    }

    const coffeeBean = await getCoffeeBeanForUser(userId, id);

    if (!coffeeBean) {
        res.status(404).send("Coffee bean not found.");
        return;
    }

    const roasterSuggestions = await getRoasterSuggestions(userId);

    res.render("coffee-beans/form", {
        title: "Edit Coffee Bean",
        pageHeading: "Edit Coffee Bean",
        formAction: `/coffee-beans/${coffeeBean.id}/edit`,
        submitButtonText: "Update Coffee Bean",
        errors: [],
        formData: {
            beanName: coffeeBean.beanName,
            roasterName: coffeeBean.roasterName || "",
            origin: coffeeBean.origin || "",
            process: coffeeBean.process || "",
            roastLevel: coffeeBean.roastLevel || "",
            roastDate: formatDateForInput(coffeeBean.roastDate),
            price: coffeeBean.price ? coffeeBean.price.toString() : "",
            flavorNotes: coffeeBean.flavorNotes || "",
            sourceUrl: coffeeBean.sourceUrl || "",
            bagImageUrl: coffeeBean.bagImageUrl || "",
            beanInfo: coffeeBean.beanInfo || "",
            beanNotes: coffeeBean.beanNotes || "",
            rating: coffeeBean.rating ? coffeeBean.rating.toString() : ""
        },
        roasterSuggestions: roasterSuggestions,
        isEdit: true
    });
});

router.post("/:id/edit", async function (req: Request, res: Response) {
    const userId = getRequiredUserId(req);
    const uploadErrors = await runCoffeeBeanImageUpload(req, res);
    const resizeErrors = uploadErrors.length === 0 ? await resizeUploadedCoffeeBeanImage(req) : [];
    const allUploadErrors = uploadErrors.concat(resizeErrors);
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
        deleteUploadedCoffeeBeanImage(req);
        res.status(400).send("Invalid coffee bean ID.");
        return;
    }

    const existingCoffeeBean = await getCoffeeBeanForUser(userId, id);

    if (!existingCoffeeBean) {
        deleteUploadedCoffeeBeanImage(req);
        res.status(404).send("Coffee bean not found.");
        return;
    }

    const formValues = getCoffeeBeanFormValues(req);
    const errors = validateCoffeeBeanForm(formValues).concat(allUploadErrors);
    const uploadedBagImageUrl = getUploadedCoffeeBeanImageUrl(req);
    const existingUploadedBagImageUrl = getExistingUploadedCoffeeBeanImageUrl(formValues.bagImageUrl);

    if (errors.length > 0) {
        deleteUploadedCoffeeBeanImage(req);
        const roasterSuggestions = await getRoasterSuggestions(userId);

        res.status(400).render("coffee-beans/form", {
            title: "Edit Coffee Bean",
            pageHeading: "Edit Coffee Bean",
            formAction: `/coffee-beans/${id}/edit`,
            submitButtonText: "Update Coffee Bean",
            errors: errors,
            formData: {
                ...formValues,
                bagImageUrl: existingUploadedBagImageUrl || existingCoffeeBean.bagImageUrl || ""
            },
            roasterSuggestions: roasterSuggestions,
            isEdit: true
        });

        return;
    }

    let bagImageUrl = existingCoffeeBean.bagImageUrl || null;

    if (formValues.removeBagImage) {
        bagImageUrl = null;
    }

    if (existingUploadedBagImageUrl) {
        bagImageUrl = existingUploadedBagImageUrl;
    }

    if (uploadedBagImageUrl) {
        bagImageUrl = uploadedBagImageUrl;
    }

    await prisma.coffeeBean.update({
        where: {
            id: id
        },
        data: {
            beanName: formValues.beanName,
            roasterName: formValues.roasterName || null,
            origin: formValues.origin || null,
            process: formValues.process || null,
            roastLevel: formValues.roastLevel || null,
            roastDate: formValues.roastDate ? new Date(`${formValues.roastDate}T00:00:00`) : null,
            price: formValues.price ? new Prisma.Decimal(formValues.price) : null,
            flavorNotes: formValues.flavorNotes || null,
            sourceUrl: formValues.sourceUrl || null,
            bagImageUrl: bagImageUrl,
            beanInfo: formValues.beanInfo || null,
            beanNotes: formValues.beanNotes || null,
            rating: formValues.rating ? new Prisma.Decimal(formValues.rating) : null
        }
    });

    if (uploadedBagImageUrl || existingUploadedBagImageUrl || formValues.removeBagImage) {
        if (existingCoffeeBean.bagImageUrl !== bagImageUrl) {
            deleteCoffeeBeanImageByUrl(existingCoffeeBean.bagImageUrl);
        }
    }

    res.redirect(`/coffee-beans/${id}`);
});

router.post("/:id/deactivate", async function (req: Request, res: Response) {
    const userId = getRequiredUserId(req);
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
        res.status(400).send("Invalid coffee bean ID.");
        return;
    }

    const coffeeBean = await getCoffeeBeanForUser(userId, id);

    if (!coffeeBean) {
        res.status(404).send("Coffee bean not found.");
        return;
    }

    await prisma.coffeeBean.update({
        where: {
            id: id
        },
        data: {
            isActive: false,
            deactivatedAt: new Date()
        }
    });

    res.redirect(`/coffee-beans/${id}?message=${encodeURIComponent("Coffee bean deactivated. Historical brew sessions were preserved.")}`);
});

router.post("/:id/reactivate", async function (req: Request, res: Response) {
    const userId = getRequiredUserId(req);
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
        res.status(400).send("Invalid coffee bean ID.");
        return;
    }

    const coffeeBean = await getCoffeeBeanForUser(userId, id);

    if (!coffeeBean) {
        res.status(404).send("Coffee bean not found.");
        return;
    }

    await prisma.coffeeBean.update({
        where: {
            id: id
        },
        data: {
            isActive: true,
            deactivatedAt: null
        }
    });

    res.redirect(`/coffee-beans/${id}?message=${encodeURIComponent("Coffee bean reactivated.")}`);
});

router.post("/:id/delete", async function (req: Request, res: Response) {
    const userId = getRequiredUserId(req);
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
        res.status(400).send("Invalid coffee bean ID.");
        return;
    }

    const coffeeBean = await getCoffeeBeanForUser(userId, id);

    if (!coffeeBean) {
        res.status(404).send("Coffee bean not found.");
        return;
    }

    const brewSessionCount = await prisma.brewSession.count({
        where: {
            userId: userId,
            coffeeBeanId: id
        }
    });

    if (brewSessionCount > 0) {
        res.redirect(`/coffee-beans/${id}?errorMessage=${encodeURIComponent("This coffee bean cannot be deleted because it has brew sessions. Deactivate it instead.")}`);
        return;
    }

    await prisma.coffeeBean.delete({
        where: {
            id: id
        }
    });

    deleteCoffeeBeanImageByUrl(coffeeBean.bagImageUrl);

    res.redirect(`/coffee-beans?message=${encodeURIComponent("Coffee bean deleted.")}`);
});

router.get("/:id", async function (req: Request, res: Response) {
    const userId = getRequiredUserId(req);
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
        res.status(400).send("Invalid coffee bean ID.");
        return;
    }

    const coffeeBean = await prisma.coffeeBean.findFirst({
        where: {
            id: id,
            userId: userId
        },
        include: {
            brewSessions: {
                where: {
                    userId: userId
                },
                include: {
                    grinder: true,
                    brewer: true
                },
                orderBy: {
                    brewDate: "desc"
                }
            }
        }
    });

    if (!coffeeBean) {
        res.status(404).send("Coffee bean not found.");
        return;
    }

    const temperatureUnit = getCurrentTemperatureUnit(res);

    const brewSessions = coffeeBean.brewSessions.map(function (session) {
        return mapBrewSessionForBeanDetail(session, temperatureUnit);
    });

    const stats = buildBeanStats(coffeeBean.brewSessions, temperatureUnit);
    const inventorySummary = await getBeanInventorySummary(coffeeBean.id, userId);

    res.render("coffee-beans/detail", {
        title: "Coffee Bean Detail",
        message: String(req.query.message || ""),
        errorMessage: String(req.query.errorMessage || ""),
        coffeeBean: {
            id: coffeeBean.id,
            beanName: coffeeBean.beanName,
            roasterName: coffeeBean.roasterName || "",
            origin: coffeeBean.origin || "",
            process: coffeeBean.process || "",
            roastLevel: coffeeBean.roastLevel || "",
            roastDate: formatDateOnly(coffeeBean.roastDate),
            price: coffeeBean.price ? coffeeBean.price.toString() : "",
            flavorNotes: coffeeBean.flavorNotes || "",
            sourceUrl: coffeeBean.sourceUrl || "",
            bagImageUrl: coffeeBean.bagImageUrl || "",
            beanInfo: coffeeBean.beanInfo || "",
            beanNotes: coffeeBean.beanNotes || "",
            rating: coffeeBean.rating ? coffeeBean.rating.toString() : "",
            isActive: coffeeBean.isActive,
            deactivatedAt: formatDateTime(coffeeBean.deactivatedAt)
        },
        stats: stats,
        inventorySummary: inventorySummary,
        formatInventoryGrams: formatGrams,
        formatInventoryMoney: formatMoney,
        brewSessions: brewSessions
    });
});

export default router;
