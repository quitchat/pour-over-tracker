import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { prisma } from "../lib/prisma";
import { sendPasswordResetEmail } from "../services/email.service";
import { isValidTemperatureUnit, normalizeTemperatureUnit } from "../utils/temperature";

const router = Router();
const passwordResetTokenExpirationMinutes = 60;

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

function getForgotPasswordFormValues(req: Request) {
    return {
        email: normalizeEmail(String(req.body.email || ""))
    };
}

function getResetPasswordFormValues(req: Request) {
    return {
        token: String(req.body.token || "").trim(),
        password: String(req.body.password || ""),
        confirmPassword: String(req.body.confirmPassword || "")
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

function validateForgotPasswordForm(formValues: ReturnType<typeof getForgotPasswordFormValues>): string[] {
    const errors: string[] = [];

    if (!formValues.email) {
        errors.push("Email is required.");
    }

    if (formValues.email && !formValues.email.includes("@")) {
        errors.push("Email must be valid.");
    }

    return errors;
}

function validateResetPasswordForm(formValues: ReturnType<typeof getResetPasswordFormValues>): string[] {
    const errors: string[] = [];

    if (!formValues.token) {
        errors.push("Reset token is required.");
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

function createPasswordResetToken(): string {
    return crypto.randomBytes(32).toString("hex");
}

function hashPasswordResetToken(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex");
}

function getBaseUrl(req: Request): string {
    const configuredBaseUrl = String(process.env.APP_BASE_URL || "").trim().replace(/\/$/, "");

    if (configuredBaseUrl) {
        return configuredBaseUrl;
    }

    const protocol = req.headers["x-forwarded-proto"] ? String(req.headers["x-forwarded-proto"]).split(",")[0] : req.protocol;
    return `${protocol}://${req.get("host")}`;
}

async function getPasswordResetTokenRecord(token: string) {
    const tokenHash = hashPasswordResetToken(token);

    return prisma.passwordResetToken.findUnique({
        where: {
            tokenHash: tokenHash
        },
        include: {
            user: true
        }
    });
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

router.get("/forgot-password", function (req: Request, res: Response) {
    res.render("auth/forgot-password", {
        title: "Forgot Password",
        errors: [],
        formData: {},
        message: "",
        devResetUrl: ""
    });
});

router.post("/forgot-password", async function (req: Request, res: Response, next) {
    try {
        const formValues = getForgotPasswordFormValues(req);
        const errors = validateForgotPasswordForm(formValues);

        if (errors.length > 0) {
            res.status(400).render("auth/forgot-password", {
                title: "Forgot Password",
                errors: errors,
                formData: formValues,
                message: "",
                devResetUrl: ""
            });

            return;
        }

        let devResetUrl = "";
        const user = await prisma.user.findUnique({
            where: {
                email: formValues.email
            }
        });

        if (user && user.isActive) {
            const token = createPasswordResetToken();
            const tokenHash = hashPasswordResetToken(token);
            const expiresAt = new Date(Date.now() + passwordResetTokenExpirationMinutes * 60 * 1000);
            const resetUrl = `${getBaseUrl(req)}/auth/reset-password?token=${encodeURIComponent(token)}`;

            await prisma.passwordResetToken.deleteMany({
                where: {
                    userId: user.id,
                    usedAt: null
                }
            });

            await prisma.passwordResetToken.create({
                data: {
                    userId: user.id,
                    tokenHash: tokenHash,
                    expiresAt: expiresAt
                }
            });

            const emailResult = await sendPasswordResetEmail(user.email, resetUrl);

            if (!emailResult.sent && process.env.NODE_ENV !== "production") {
                devResetUrl = resetUrl;
            }
        }

        res.render("auth/forgot-password-sent", {
            title: "Check Your Email",
            devResetUrl: devResetUrl
        });
    } catch (error) {
        next(error);
    }
});

router.get("/reset-password", async function (req: Request, res: Response, next) {
    try {
        const token = String(req.query.token || "").trim();

        if (!token) {
            res.status(400).render("auth/reset-password", {
                title: "Reset Password",
                errors: ["The password reset link is invalid or expired."],
                token: ""
            });

            return;
        }

        const resetToken = await getPasswordResetTokenRecord(token);
        const isInvalid = !resetToken || !!resetToken.usedAt || resetToken.expiresAt <= new Date() || !resetToken.user.isActive;

        if (isInvalid) {
            res.status(400).render("auth/reset-password", {
                title: "Reset Password",
                errors: ["The password reset link is invalid or expired."],
                token: ""
            });

            return;
        }

        res.render("auth/reset-password", {
            title: "Reset Password",
            errors: [],
            token: token
        });
    } catch (error) {
        next(error);
    }
});

router.post("/reset-password", async function (req: Request, res: Response, next) {
    try {
        const formValues = getResetPasswordFormValues(req);
        const errors = validateResetPasswordForm(formValues);

        if (errors.length > 0) {
            res.status(400).render("auth/reset-password", {
                title: "Reset Password",
                errors: errors,
                token: formValues.token
            });

            return;
        }

        const resetToken = await getPasswordResetTokenRecord(formValues.token);
        const isInvalid = !resetToken || !!resetToken.usedAt || resetToken.expiresAt <= new Date() || !resetToken.user.isActive;

        if (isInvalid || !resetToken) {
            res.status(400).render("auth/reset-password", {
                title: "Reset Password",
                errors: ["The password reset link is invalid or expired."],
                token: ""
            });

            return;
        }

        const passwordHash = await bcrypt.hash(formValues.password, 12);

        await prisma.$transaction([
            prisma.user.update({
                where: {
                    id: resetToken.userId
                },
                data: {
                    passwordHash: passwordHash
                }
            }),
            prisma.passwordResetToken.update({
                where: {
                    id: resetToken.id
                },
                data: {
                    usedAt: new Date()
                }
            }),
            prisma.passwordResetToken.deleteMany({
                where: {
                    userId: resetToken.userId,
                    usedAt: null,
                    id: {
                        not: resetToken.id
                    }
                }
            })
        ]);

        req.session.userId = resetToken.userId;
        res.redirect("/");
    } catch (error) {
        next(error);
    }
});

router.post("/sign-out", function (req: Request, res: Response) {
    req.session.destroy(function () {
        res.redirect("/auth/sign-in");
    });
});

export default router;
