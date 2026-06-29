import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { isValidTemperatureUnit, normalizeTemperatureUnit } from "../utils/temperature";

const router = Router();

function normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
}

function getRegisterFormValues(req: Request) {
    return {
        displayName: String(req.body.displayName || "").trim(),
        email: normalizeEmail(String(req.body.email || "")),
        password: String(req.body.password || ""),
        confirmPassword: String(req.body.confirmPassword || ""),
        temperatureUnit: normalizeTemperatureUnit(String(req.body.temperatureUnit || "C"))
    };
}

function getSignInFormValues(req: Request) {
    return {
        email: normalizeEmail(String(req.body.email || "")),
        password: String(req.body.password || ""),
        returnTo: String(req.body.returnTo || "")
    };
}

function validateRegisterForm(formValues: ReturnType<typeof getRegisterFormValues>): string[] {
    const errors: string[] = [];

    if (!formValues.email) {
        errors.push("Email is required.");
    }

    if (!formValues.email.includes("@")) {
        errors.push("Email must be valid.");
    }

    if (!formValues.password) {
        errors.push("Password is required.");
    }

    if (formValues.password && formValues.password.length < 8) {
        errors.push("Password must be at least 8 characters.");
    }

    if (formValues.password !== formValues.confirmPassword) {
        errors.push("Password and confirm password must match.");
    }

    if (!isValidTemperatureUnit(formValues.temperatureUnit)) {
        errors.push("Temperature unit must be Celsius or Fahrenheit.");
    }

    return errors;
}

function validateSignInForm(formValues: ReturnType<typeof getSignInFormValues>): string[] {
    const errors: string[] = [];

    if (!formValues.email) {
        errors.push("Email is required.");
    }

    if (!formValues.password) {
        errors.push("Password is required.");
    }

    return errors;
}

function getSafeReturnTo(returnTo: string): string {
    if (!returnTo) {
        return "/";
    }

    if (!returnTo.startsWith("/")) {
        return "/";
    }

    if (returnTo.startsWith("//")) {
        return "/";
    }

    return returnTo;
}

router.get("/register", function (req: Request, res: Response) {
    res.render("auth/register", {
        title: "Register",
        errors: [],
        formData: {}
    });
});

router.post("/register", async function (req: Request, res: Response) {
    const formValues = getRegisterFormValues(req);
    const errors = validateRegisterForm(formValues);

    if (errors.length > 0) {
        res.status(400).render("auth/register", {
            title: "Register",
            errors: errors,
            formData: formValues
        });

        return;
    }

    const existingUser = await prisma.user.findUnique({
        where: {
            email: formValues.email
        }
    });

    if (existingUser) {
        res.status(400).render("auth/register", {
            title: "Register",
            errors: ["An account with this email already exists."],
            formData: formValues
        });

        return;
    }

    const userCount = await prisma.user.count();
    const passwordHash = await bcrypt.hash(formValues.password, 12);

    const user = await prisma.user.create({
        data: {
            email: formValues.email,
            displayName: formValues.displayName || null,
            passwordHash: passwordHash,
            role: userCount === 0 ? "Admin" : "User",
            isActive: true,
            temperatureUnit: formValues.temperatureUnit
        }
    });

    req.session.userId = user.id;
    res.redirect("/");
});

router.get("/sign-in", function (req: Request, res: Response) {
    res.render("auth/sign-in", {
        title: "Sign In",
        errors: [],
        formData: {
            returnTo: String(req.query.returnTo || "")
        }
    });
});

router.post("/sign-in", async function (req: Request, res: Response) {
    const formValues = getSignInFormValues(req);
    const errors = validateSignInForm(formValues);

    if (errors.length > 0) {
        res.status(400).render("auth/sign-in", {
            title: "Sign In",
            errors: errors,
            formData: formValues
        });

        return;
    }

    const user = await prisma.user.findUnique({
        where: {
            email: formValues.email
        }
    });

    if (!user) {
        res.status(400).render("auth/sign-in", {
            title: "Sign In",
            errors: ["Invalid email or password."],
            formData: formValues
        });

        return;
    }

    if (!user.isActive) {
        res.status(403).render("auth/sign-in", {
            title: "Sign In",
            errors: ["This account is deactivated. Contact an administrator."],
            formData: formValues
        });

        return;
    }

    const passwordMatches = await bcrypt.compare(formValues.password, user.passwordHash);

    if (!passwordMatches) {
        res.status(400).render("auth/sign-in", {
            title: "Sign In",
            errors: ["Invalid email or password."],
            formData: formValues
        });

        return;
    }

    req.session.userId = user.id;
    res.redirect(getSafeReturnTo(formValues.returnTo));
});

router.post("/sign-out", function (req: Request, res: Response) {
    req.session.destroy(function () {
        res.redirect("/auth/sign-in");
    });
});

export default router;