import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { getRequiredUserId } from "../middleware/auth";

const router = Router();

function getGrinderFormValues(req: Request) {
    return {
        name: String(req.body.name || "").trim(),
        brand: String(req.body.brand || "").trim(),
        grinderType: String(req.body.grinderType || "").trim(),
        burrType: String(req.body.burrType || "").trim(),
        calibrationNotes: String(req.body.calibrationNotes || "").trim(),
        defaultGrindSizeRange: String(req.body.defaultGrindSizeRange || "").trim()
    };
}

function validateGrinderForm(formValues: ReturnType<typeof getGrinderFormValues>): string[] {
    const errors: string[] = [];

    if (!formValues.name) {
        errors.push("Grinder name is required.");
    }

    return errors;
}

router.get("/", async function (req: Request, res: Response) {
    const userId = getRequiredUserId(req);

    const grinders = await prisma.grinder.findMany({
        where: {
            userId: userId
        },
        orderBy: {
            createdAt: "desc"
        }
    });

    res.render("grinders/index", {
        title: "Grinders",
        grinders: grinders
    });
});

router.get("/new", function (req: Request, res: Response) {
    res.render("grinders/form", {
        title: "Add Grinder",
        pageHeading: "Add Grinder",
        formAction: "/grinders",
        submitButtonText: "Save Grinder",
        errors: [],
        formData: {}
    });
});

router.post("/", async function (req: Request, res: Response) {
    const userId = getRequiredUserId(req);
    const formValues = getGrinderFormValues(req);
    const errors = validateGrinderForm(formValues);

    if (errors.length > 0) {
        res.status(400).render("grinders/form", {
            title: "Add Grinder",
            pageHeading: "Add Grinder",
            formAction: "/grinders",
            submitButtonText: "Save Grinder",
            errors: errors,
            formData: formValues
        });

        return;
    }

    const grinder = await prisma.grinder.create({
        data: {
            userId: userId,
            name: formValues.name,
            brand: formValues.brand || null,
            grinderType: formValues.grinderType || null,
            burrType: formValues.burrType || null,
            calibrationNotes: formValues.calibrationNotes || null,
            defaultGrindSizeRange: formValues.defaultGrindSizeRange || null
        }
    });

    res.redirect("/grinders");
});

router.get("/:id/edit", async function (req: Request, res: Response) {
    const userId = getRequiredUserId(req);
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
        res.status(400).send("Invalid grinder ID.");
        return;
    }

    const grinder = await prisma.grinder.findFirst({
        where: {
            id: id,
            userId: userId
        }
    });

    if (!grinder) {
        res.status(404).send("Grinder not found.");
        return;
    }

    res.render("grinders/form", {
        title: "Edit Grinder",
        pageHeading: "Edit Grinder",
        formAction: `/grinders/${grinder.id}/edit`,
        submitButtonText: "Update Grinder",
        errors: [],
        formData: {
            name: grinder.name,
            brand: grinder.brand || "",
            grinderType: grinder.grinderType || "",
            burrType: grinder.burrType || "",
            calibrationNotes: grinder.calibrationNotes || "",
            defaultGrindSizeRange: grinder.defaultGrindSizeRange || ""
        }
    });
});

router.post("/:id/edit", async function (req: Request, res: Response) {
    const userId = getRequiredUserId(req);
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
        res.status(400).send("Invalid grinder ID.");
        return;
    }

    const existingGrinder = await prisma.grinder.findFirst({
        where: {
            id: id,
            userId: userId
        }
    });

    if (!existingGrinder) {
        res.status(404).send("Grinder not found.");
        return;
    }

    const formValues = getGrinderFormValues(req);
    const errors = validateGrinderForm(formValues);

    if (errors.length > 0) {
        res.status(400).render("grinders/form", {
            title: "Edit Grinder",
            pageHeading: "Edit Grinder",
            formAction: `/grinders/${id}/edit`,
            submitButtonText: "Update Grinder",
            errors: errors,
            formData: formValues
        });

        return;
    }

    await prisma.grinder.update({
        where: {
            id: id
        },
        data: {
            name: formValues.name,
            brand: formValues.brand || null,
            grinderType: formValues.grinderType || null,
            burrType: formValues.burrType || null,
            calibrationNotes: formValues.calibrationNotes || null,
            defaultGrindSizeRange: formValues.defaultGrindSizeRange || null
        }
    });

    res.redirect("/grinders");
});

router.post("/:id/delete", async function (req: Request, res: Response) {
    const userId = getRequiredUserId(req);
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
        res.status(400).send("Invalid grinder ID.");
        return;
    }

    const grinder = await prisma.grinder.findFirst({
        where: {
            id: id,
            userId: userId
        }
    });

    if (!grinder) {
        res.status(404).send("Grinder not found.");
        return;
    }

    await prisma.grinder.delete({
        where: {
            id: id
        }
    });

    res.redirect("/grinders");
});

export default router;