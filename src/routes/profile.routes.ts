import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { getRequiredUserId } from "../middleware/auth";
import { formatTemperatureDecimalForInput, isValidTemperatureUnit, normalizeTemperatureUnit, parseTemperatureInputToCelsiusDecimal } from "../utils/temperature";
import { getTimeZoneGroups, getTimeZoneOptions, getTimeZoneLabel, isValidTimeZone, normalizeTimeZone } from "../utils/timeZone";

const router = Router();

function getProfileFormValues(req: Request) {
    return {
        displayName: String(req.body.displayName || "").trim(),
        email: String(req.body.email || "").trim().toLowerCase(),
        temperatureUnit: normalizeTemperatureUnit(String(req.body.temperatureUnit || "C")),
        timeZone: normalizeTimeZone(String(req.body.timeZone || "America/Los_Angeles")),
        preferredCurrencyCode: String(req.body.preferredCurrencyCode || "USD").trim().toUpperCase(),
        preferredWeightUnit: String(req.body.preferredWeightUnit || "G").trim().toUpperCase() === "OZ" ? "OZ" : "G"
    };
}

function getPasswordFormValues(req: Request) {
    return {
        currentPassword: String(req.body.currentPassword || ""),
        newPassword: String(req.body.newPassword || ""),
        confirmNewPassword: String(req.body.confirmNewPassword || "")
    };
}

function getBrewDefaultsFormValues(req: Request) {
    return {
        defaultGrinderId: String(req.body.defaultGrinderId || "").trim(),
        defaultBrewerId: String(req.body.defaultBrewerId || "").trim(),
        defaultCoffeeDoseGrams: String(req.body.defaultCoffeeDoseGrams || "").trim(),
        defaultWaterTemperatureC: String(req.body.defaultWaterTemperatureC || "").trim()
    };
}

function getDecimalText(value: any): string {
    if (value === null || typeof value === "undefined") {
        return "";
    }

    return value.toString();
}

function parseOptionalInteger(value: string): number | null {
    if (!value) {
        return null;
    }

    const parsed = Number(value);

    if (!Number.isInteger(parsed) || parsed <= 0) {
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

async function getProfileUser(userId: number) {
    return await prisma.user.findUnique({
        where: {
            id: userId
        },
        select: {
            id: true,
            email: true,
            displayName: true,
            defaultGrinderId: true,
            defaultBrewerId: true,
            defaultCoffeeDoseGrams: true,
            defaultWaterTemperatureC: true,
            temperatureUnit: true,
            timeZone: true,
            preferredCurrencyCode: true,
            preferredWeightUnit: true,
            createdAt: true
        }
    });
}

async function getBrewDefaultOptions(userId: number) {
    const [grinders, brewers] = await Promise.all([
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
        grinders: grinders,
        brewers: brewers
    };
}

function buildProfileFormData(user: any) {
    return {
        displayName: user.displayName || "",
        email: user.email,
        temperatureUnit: normalizeTemperatureUnit(user.temperatureUnit),
        timeZone: normalizeTimeZone(user.timeZone),
        preferredCurrencyCode: user.preferredCurrencyCode || "USD",
        preferredWeightUnit: user.preferredWeightUnit || "G"
    };
}

function buildBrewDefaultsFormData(user: any) {
    return {
        defaultGrinderId: user.defaultGrinderId ? String(user.defaultGrinderId) : "",
        defaultBrewerId: user.defaultBrewerId ? String(user.defaultBrewerId) : "",
        defaultCoffeeDoseGrams: getDecimalText(user.defaultCoffeeDoseGrams),
        defaultWaterTemperatureC: formatTemperatureDecimalForInput(user.defaultWaterTemperatureC, normalizeTemperatureUnit(user.temperatureUnit))
    };
}

async function renderProfilePage(res: Response, userId: number, options?: {
    statusCode?: number;
    profileErrors?: string[];
    passwordErrors?: string[];
    brewDefaultsErrors?: string[];
    profileSuccessMessage?: string;
    passwordSuccessMessage?: string;
    brewDefaultsSuccessMessage?: string;
    profileFormData?: ReturnType<typeof getProfileFormValues>;
    brewDefaultsFormData?: ReturnType<typeof getBrewDefaultsFormValues>;
}) {
    const user = await getProfileUser(userId);

    if (!user) {
        res.status(404).send("User not found.");
        return;
    }

    const brewDefaultOptions = await getBrewDefaultOptions(userId);

    res.status(options?.statusCode || 200).render("profile/index", {
        title: "Profile",
        profileErrors: options?.profileErrors || [],
        passwordErrors: options?.passwordErrors || [],
        brewDefaultsErrors: options?.brewDefaultsErrors || [],
        profileSuccessMessage: options?.profileSuccessMessage || "",
        passwordSuccessMessage: options?.passwordSuccessMessage || "",
        brewDefaultsSuccessMessage: options?.brewDefaultsSuccessMessage || "",
        formData: options?.profileFormData || buildProfileFormData(user),
        brewDefaultsFormData: options?.brewDefaultsFormData || buildBrewDefaultsFormData(user),
        grinders: brewDefaultOptions.grinders,
        brewers: brewDefaultOptions.brewers,
        user: user,
        timeZoneOptions: getTimeZoneOptions(),
        timeZoneGroups: getTimeZoneGroups(),
        timeZoneLabel: getTimeZoneLabel(user.timeZone)
    });
}

router.get("/", async function (req: Request, res: Response) {
    const userId = getRequiredUserId(req);

    await renderProfilePage(res, userId);
});

router.post("/", async function (req: Request, res: Response) {
    const userId = getRequiredUserId(req);
    const formValues = getProfileFormValues(req);
    const errors: string[] = [];

    const user = await getProfileUser(userId);

    if (!user) {
        res.status(404).send("User not found.");
        return;
    }

    if (!formValues.displayName) {
        errors.push("Name is required.");
    }

    if (!formValues.email) {
        errors.push("Email is required.");
    }

    if (!isValidTemperatureUnit(formValues.temperatureUnit)) {
        errors.push("Temperature unit must be Celsius or Fahrenheit.");
    }

    if (!isValidTimeZone(formValues.timeZone)) {
        errors.push("Timezone must be valid.");
    }

    if (!/^[A-Z]{3}$/.test(formValues.preferredCurrencyCode)) {
        errors.push("Preferred currency must be a 3-letter code.");
    }

    if (!["G", "OZ"].includes(formValues.preferredWeightUnit)) {
        errors.push("Preferred bag weight unit must be g or oz.");
    }

    const existingEmailUser = formValues.email
        ? await prisma.user.findUnique({
            where: {
                email: formValues.email
            }
        })
        : null;

    if (existingEmailUser && existingEmailUser.id !== userId) {
        errors.push("Another account already uses this email.");
    }

    if (errors.length > 0) {
        await renderProfilePage(res, userId, {
            statusCode: 400,
            profileErrors: errors,
            profileFormData: formValues
        });

        return;
    }

    await prisma.user.update({
        where: {
            id: userId
        },
        data: {
            displayName: formValues.displayName,
            email: formValues.email,
            temperatureUnit: formValues.temperatureUnit,
            timeZone: formValues.timeZone,
            preferredCurrencyCode: formValues.preferredCurrencyCode,
            preferredWeightUnit: formValues.preferredWeightUnit
        }
    });

    await renderProfilePage(res, userId, {
        profileSuccessMessage: "Profile updated."
    });
});

router.post("/brew-defaults", async function (req: Request, res: Response) {
    const userId = getRequiredUserId(req);
    const formValues = getBrewDefaultsFormValues(req);
    const errors: string[] = [];

    const user = await getProfileUser(userId);

    if (!user) {
        res.status(404).send("User not found.");
        return;
    }

    const defaultGrinderId = parseOptionalInteger(formValues.defaultGrinderId);
    const defaultBrewerId = parseOptionalInteger(formValues.defaultBrewerId);
    const defaultCoffeeDoseGrams = parseOptionalNumber(formValues.defaultCoffeeDoseGrams);
    const defaultWaterTemperatureInput = parseOptionalNumber(formValues.defaultWaterTemperatureC);
    const temperatureUnit = normalizeTemperatureUnit(user.temperatureUnit);

    if (formValues.defaultGrinderId && defaultGrinderId === null) {
        errors.push("Invalid default grinder.");
    }

    if (formValues.defaultBrewerId && defaultBrewerId === null) {
        errors.push("Invalid default brewer.");
    }

    if (defaultCoffeeDoseGrams !== null && defaultCoffeeDoseGrams <= 0) {
        errors.push("Default coffee dose must be greater than 0.");
    }

    if (defaultWaterTemperatureInput !== null && defaultWaterTemperatureInput < 0) {
        errors.push("Default water temperature must be 0 or greater.");
    }

    if (defaultGrinderId !== null) {
        const grinder = await prisma.grinder.findFirst({
            where: {
                id: defaultGrinderId,
                userId: userId
            }
        });

        if (!grinder) {
            errors.push("Selected default grinder was not found.");
        }
    }

    if (defaultBrewerId !== null) {
        const brewer = await prisma.brewer.findFirst({
            where: {
                id: defaultBrewerId,
                userId: userId
            }
        });

        if (!brewer) {
            errors.push("Selected default brewer was not found.");
        }
    }

    if (errors.length > 0) {
        await renderProfilePage(res, userId, {
            statusCode: 400,
            brewDefaultsErrors: errors,
            brewDefaultsFormData: formValues
        });

        return;
    }

    await prisma.user.update({
        where: {
            id: userId
        },
        data: {
            defaultGrinderId: defaultGrinderId,
            defaultBrewerId: defaultBrewerId,
            defaultCoffeeDoseGrams: formValues.defaultCoffeeDoseGrams
                ? new Prisma.Decimal(formValues.defaultCoffeeDoseGrams)
                : null,
            defaultWaterTemperatureC: parseTemperatureInputToCelsiusDecimal(formValues.defaultWaterTemperatureC, temperatureUnit)
        }
    });

    await renderProfilePage(res, userId, {
        brewDefaultsSuccessMessage: "Brew defaults updated."
    });
});

router.post("/password", async function (req: Request, res: Response) {
    const userId = getRequiredUserId(req);
    const formValues = getPasswordFormValues(req);
    const errors: string[] = [];

    const user = await prisma.user.findUnique({
        where: {
            id: userId
        }
    });

    if (!user) {
        res.status(404).send("User not found.");
        return;
    }

    if (!formValues.currentPassword) {
        errors.push("Current password is required.");
    }

    if (!formValues.newPassword) {
        errors.push("New password is required.");
    }

    if (formValues.newPassword && formValues.newPassword.length < 8) {
        errors.push("New password must be at least 8 characters.");
    }

    if (formValues.newPassword !== formValues.confirmNewPassword) {
        errors.push("New passwords do not match.");
    }

    const currentPasswordIsValid = formValues.currentPassword
        ? await bcrypt.compare(formValues.currentPassword, user.passwordHash)
        : false;

    if (formValues.currentPassword && !currentPasswordIsValid) {
        errors.push("Current password is incorrect.");
    }

    if (errors.length > 0) {
        await renderProfilePage(res, userId, {
            statusCode: 400,
            passwordErrors: errors
        });

        return;
    }

    const newPasswordHash = await bcrypt.hash(formValues.newPassword, 12);

    await prisma.user.update({
        where: {
            id: userId
        },
        data: {
            passwordHash: newPasswordHash
        }
    });

    await renderProfilePage(res, userId, {
        passwordSuccessMessage: "Password updated."
    });
});

export default router;
