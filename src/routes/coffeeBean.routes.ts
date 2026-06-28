import { Router, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import fs from "fs";
import path from "path";
import multer from "multer";
import { prisma } from "../lib/prisma";
import { getRequiredUserId } from "../middleware/auth";
import { CoffeeInformationResult, getCoffeeBagImageIdentityFromOpenAI, getCoffeeInformationFromOpenAI } from "../services/coffeeInfo.service";
import { formatDateUs, formatDateTimeUs, formatDateForInput as formatDateForInputValue } from "../utils/dateFormat";

const router = Router();

const coffeeBeanImageRelativeDirectory = "/uploads/coffee-beans";
const coffeeBeanImageAbsoluteDirectory = path.join(__dirname, "..", "..", "public", "uploads", "coffee-beans");
const allowedCoffeeBeanImageMimeTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];

const coffeeBeanImageStorage = multer.diskStorage({
    destination: function (req, file, callback) {
        fs.mkdirSync(coffeeBeanImageAbsoluteDirectory, { recursive: true });
        callback(null, coffeeBeanImageAbsoluteDirectory);
    },
    filename: function (req, file, callback) {
        const extension = path.extname(file.originalname || "").toLowerCase();
        const safeExtension = extension || ".jpg";
        const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1000000000)}${safeExtension}`;

        callback(null, uniqueName);
    }
});

const uploadCoffeeBeanImage = multer({
    storage: coffeeBeanImageStorage,
    limits: {
        fileSize: 5 * 1024 * 1024
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
                resolve(["Bean picture must be 5 MB or smaller."]);
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
        notes: String(req.body.notes || "").trim(),
        removeBagImage: String(req.body.removeBagImage || "").trim() === "1"
    };
}

function validateCoffeeBeanForm(formValues: ReturnType<typeof getCoffeeBeanFormValues>): string[] {
    const errors: string[] = [];
    const validRoastLevels = ["", "Light", "Medium", "Dark"];
    const price = Number(formValues.price);

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
        notes: confirmedNotesText || currentValues.notes || ""
    };
}

function mapBrewSessionForBeanDetail(session: any) {
    return {
        id: session.id,
        brewDate: formatDateOnly(session.brewDate),
        grinderName: session.grinder ? session.grinder.name : "",
        brewerName: session.brewer ? session.brewer.name : "",
        grindSize: session.grindSize || "",
        coffeeDoseGrams: session.coffeeDoseGrams.toString(),
        totalYieldGrams: session.totalYieldGrams ? session.totalYieldGrams.toString() : "",
        brewRatio: session.brewRatio.toString(),
        waterTemperatureC: session.waterTemperatureC ? session.waterTemperatureC.toString() : "",
        totalBrewTime: formatSeconds(session.totalBrewTimeSeconds),
        overallRating: session.overallRating ? session.overallRating.toString() : "",
        wouldRepeat: session.wouldRepeat
    };
}

function buildBeanStats(brewSessions: any[]) {
    const ratedSessions = brewSessions.filter(function (session) {
        return !!session.overallRating;
    });

    const ratioSessions = brewSessions.filter(function (session) {
        return !!session.brewRatio;
    });

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
        ratedSessionCount: ratedSessions.length,
        averageRating: ratedSessions.length > 0 ? (totalRating / ratedSessions.length).toFixed(1) : "",
        bestRating: bestSession ? bestSession.overallRating.toString() : "",
        averageRatio: ratioSessions.length > 0 ? (totalRatio / ratioSessions.length).toFixed(2) : "",
        repeatCount: brewSessions.filter(function (session) {
            return session.wouldRepeat;
        }).length,
        bestBrewSessionId: bestSession ? bestSession.id : null
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

    const coffeeBeansFromDatabase = await prisma.coffeeBean.findMany({
        where: {
            userId: userId
        },
        orderBy: [
            {
                isActive: "desc"
            },
            {
                createdAt: "desc"
            }
        ],
        include: {
            brewSessions: {
                where: {
                    userId: userId
                }
            }
        }
    });

    const coffeeBeans = coffeeBeansFromDatabase.map(function (bean) {
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
            notes: bean.notes || "",
            isActive: bean.isActive,
            deactivatedAt: formatDateTime(bean.deactivatedAt),
            brewSessionCount: bean.brewSessions.length
        };
    });

    res.render("coffee-beans/index", {
        title: "Coffee Beans",
        coffeeBeans: coffeeBeans
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
        formData: {},
        roasterSuggestions: roasterSuggestions
    });
});

router.post("/get-info", async function (req: Request, res: Response) {
    const formValues = getCoffeeBeanFormValues(req);

    if (!formValues.roasterName || !formValues.beanName) {
        res.status(400).json({
            ok: false,
            errorMessage: "Roaster and Coffee Name are required before getting coffee information."
        });

        return;
    }

    try {
        const coffeeInfo = await getCoffeeInformationFromOpenAI(formValues.roasterName, formValues.beanName);
        const formData = buildCoffeeInfoFormData(formValues, coffeeInfo);

        res.json({
            ok: true,
            formData: formData,
            confirmedNotes: coffeeInfo.confirmedNotes
        });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Could not get coffee information.";

        res.status(500).json({
            ok: false,
            errorMessage: errorMessage
        });
    }
});

router.post("/upload-bag-image-identify", async function (req: Request, res: Response) {
    const uploadErrors = await runCoffeeBeanImageUpload(req, res);
    const uploadedBagImageUrl = getUploadedCoffeeBeanImageUrl(req);

    if (uploadErrors.length > 0) {
        deleteUploadedCoffeeBeanImage(req);

        res.status(400).json({
            ok: false,
            errorMessage: uploadErrors.join(" ")
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

    try {
        const imageFilePath = getCoffeeBeanImageAbsolutePathFromUrl(uploadedBagImageUrl);
        const identity = await getCoffeeBagImageIdentityFromOpenAI(imageFilePath, req.file.mimetype);

        res.json({
            ok: true,
            bagImageUrl: uploadedBagImageUrl,
            formData: {
                roasterName: identity.roasterName || "",
                beanName: identity.beanName || ""
            },
            confidence: identity.confidence,
            notes: identity.notes
        });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Could not read the coffee bag picture.";

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
    const formValues = getCoffeeBeanFormValues(req);
    const errors = validateCoffeeBeanForm(formValues).concat(uploadErrors);
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
                bagImageUrl: existingUploadedBagImageUrl
            },
            roasterSuggestions: roasterSuggestions
        });

        return;
    }

    const createdBean = await prisma.coffeeBean.create({
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
            notes: formValues.notes || null,
            isActive: true
        }
    });

    res.redirect(`/coffee-beans/${createdBean.id}`);
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
            notes: coffeeBean.notes || ""
        },
        roasterSuggestions: roasterSuggestions
    });
});

router.post("/:id/edit", async function (req: Request, res: Response) {
    const userId = getRequiredUserId(req);
    const uploadErrors = await runCoffeeBeanImageUpload(req, res);
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
    const errors = validateCoffeeBeanForm(formValues).concat(uploadErrors);
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
            roasterSuggestions: roasterSuggestions
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
            notes: formValues.notes || null
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
        res.status(400).send("This coffee bean cannot be deleted because it has brew sessions. Deactivate it instead.");
        return;
    }

    await prisma.coffeeBean.delete({
        where: {
            id: id
        }
    });

    res.redirect("/coffee-beans");
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

    const brewSessions = coffeeBean.brewSessions.map(function (session) {
        return mapBrewSessionForBeanDetail(session);
    });

    const stats = buildBeanStats(coffeeBean.brewSessions);

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
            notes: coffeeBean.notes || "",
            isActive: coffeeBean.isActive,
            deactivatedAt: formatDateTime(coffeeBean.deactivatedAt)
        },
        stats: stats,
        brewSessions: brewSessions
    });
});

export default router;
