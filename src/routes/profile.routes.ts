import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { getRequiredUserId } from "../middleware/auth";

const router = Router();

function getProfileFormValues(req: Request) {
    return {
        displayName: String(req.body.displayName || "").trim(),
        email: String(req.body.email || "").trim().toLowerCase()
    };
}

function getPasswordFormValues(req: Request) {
    return {
        currentPassword: String(req.body.currentPassword || ""),
        newPassword: String(req.body.newPassword || ""),
        confirmNewPassword: String(req.body.confirmNewPassword || "")
    };
}

router.get("/", async function (req: Request, res: Response) {
    const userId = getRequiredUserId(req);

    const user = await prisma.user.findUnique({
        where: {
            id: userId
        },
        select: {
            id: true,
            email: true,
            displayName: true,
            createdAt: true
        }
    });

    if (!user) {
        res.status(404).send("User not found.");
        return;
    }

    res.render("profile/index", {
        title: "Profile",
        profileErrors: [],
        passwordErrors: [],
        profileSuccessMessage: "",
        passwordSuccessMessage: "",
        formData: {
            displayName: user.displayName || "",
            email: user.email
        },
        user: user
    });
});

router.post("/", async function (req: Request, res: Response) {
    const userId = getRequiredUserId(req);
    const formValues = getProfileFormValues(req);
    const errors: string[] = [];

    const user = await prisma.user.findUnique({
        where: {
            id: userId
        },
        select: {
            id: true,
            email: true,
            displayName: true,
            createdAt: true
        }
    });

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
        res.status(400).render("profile/index", {
            title: "Profile",
            profileErrors: errors,
            passwordErrors: [],
            profileSuccessMessage: "",
            passwordSuccessMessage: "",
            formData: formValues,
            user: user
        });

        return;
    }

    const updatedUser = await prisma.user.update({
        where: {
            id: userId
        },
        data: {
            displayName: formValues.displayName,
            email: formValues.email
        },
        select: {
            id: true,
            email: true,
            displayName: true,
            createdAt: true
        }
    });

    res.render("profile/index", {
        title: "Profile",
        profileErrors: [],
        passwordErrors: [],
        profileSuccessMessage: "Profile updated.",
        passwordSuccessMessage: "",
        formData: {
            displayName: updatedUser.displayName || "",
            email: updatedUser.email
        },
        user: updatedUser
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
        res.status(400).render("profile/index", {
            title: "Profile",
            profileErrors: [],
            passwordErrors: errors,
            profileSuccessMessage: "",
            passwordSuccessMessage: "",
            formData: {
                displayName: user.displayName || "",
                email: user.email
            },
            user: {
                id: user.id,
                email: user.email,
                displayName: user.displayName,
                createdAt: user.createdAt
            }
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

    res.render("profile/index", {
        title: "Profile",
        profileErrors: [],
        passwordErrors: [],
        profileSuccessMessage: "",
        passwordSuccessMessage: "Password updated.",
        formData: {
            displayName: user.displayName || "",
            email: user.email
        },
        user: {
            id: user.id,
            email: user.email,
            displayName: user.displayName,
            createdAt: user.createdAt
        }
    });
});

export default router;