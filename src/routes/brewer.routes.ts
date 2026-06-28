import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { getRequiredUserId } from "../middleware/auth";

const router = Router();

function getBrewerFormValues(req: Request) {
    return {
        name: String(req.body.name || "").trim(),
        brand: String(req.body.brand || "").trim(),
        brewerType: String(req.body.brewerType || "").trim(),
        notes: String(req.body.notes || "").trim(),
        locationName: String(req.body.locationName || "").trim(),
        latitude: String(req.body.latitude || "").trim(),
        longitude: String(req.body.longitude || "").trim()
    };
}


function parseOptionalCoordinate(value: string): number | null {
    if (!value) {
        return null;
    }

    const parsed = Number(value);

    if (Number.isNaN(parsed)) {
        return null;
    }

    return parsed;
}

function validateBrewerForm(formValues: ReturnType<typeof getBrewerFormValues>): string[] {
    const errors: string[] = [];

    if (!formValues.name) {
        errors.push("Brewer name is required.");
    }

    if (formValues.latitude && parseOptionalCoordinate(formValues.latitude) === null) {
        errors.push("Latitude must be a valid number.");
    }

    if (formValues.longitude && parseOptionalCoordinate(formValues.longitude) === null) {
        errors.push("Longitude must be a valid number.");
    }

    if ((formValues.latitude && !formValues.longitude) || (!formValues.latitude && formValues.longitude)) {
        errors.push("Latitude and longitude must be entered together.");
    }

    return errors;
}

router.get("/", async function (req: Request, res: Response) {
    const userId = getRequiredUserId(req);

    const brewers = await prisma.brewer.findMany({
        where: {
            userId: userId
        },
        orderBy: {
            createdAt: "desc"
        }
    });

    res.render("brewers/index", {
        title: "Brewers",
        brewers: brewers
    });
});

router.get("/new", function (req: Request, res: Response) {
    res.render("brewers/form", {
        title: "Add Brewer",
        pageHeading: "Add Brewer",
        formAction: "/brewers",
        submitButtonText: "Save Brewer",
        errors: [],
        formData: {}
    });
});

router.post("/", async function (req: Request, res: Response) {
    const userId = getRequiredUserId(req);
    const formValues = getBrewerFormValues(req);
    const errors = validateBrewerForm(formValues);

    if (errors.length > 0) {
        res.status(400).render("brewers/form", {
            title: "Add Brewer",
            pageHeading: "Add Brewer",
            formAction: "/brewers",
            submitButtonText: "Save Brewer",
            errors: errors,
            formData: formValues
        });

        return;
    }

    const brewer = await prisma.brewer.create({
        data: {
            userId: userId,
            name: formValues.name,
            brand: formValues.brand || null,
            brewerType: formValues.brewerType || null,
            notes: formValues.notes || null,
            locationName: formValues.locationName || null,
            latitude: parseOptionalCoordinate(formValues.latitude),
            longitude: parseOptionalCoordinate(formValues.longitude)
        }
    });

    res.redirect("/brewers");
});

router.get("/:id/edit", async function (req: Request, res: Response) {
    const userId = getRequiredUserId(req);
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
        res.status(400).send("Invalid brewer ID.");
        return;
    }

    const brewer = await prisma.brewer.findFirst({
        where: {
            id: id,
            userId: userId
        }
    });

    if (!brewer) {
        res.status(404).send("Brewer not found.");
        return;
    }

    res.render("brewers/form", {
        title: "Edit Brewer",
        pageHeading: "Edit Brewer",
        formAction: `/brewers/${brewer.id}/edit`,
        submitButtonText: "Update Brewer",
        errors: [],
        formData: {
            name: brewer.name,
            brand: brewer.brand || "",
            brewerType: brewer.brewerType || "",
            notes: brewer.notes || "",
            locationName: brewer.locationName || "",
            latitude: brewer.latitude === null ? "" : String(brewer.latitude),
            longitude: brewer.longitude === null ? "" : String(brewer.longitude)
        }
    });
});

router.post("/:id/edit", async function (req: Request, res: Response) {
    const userId = getRequiredUserId(req);
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
        res.status(400).send("Invalid brewer ID.");
        return;
    }

    const existingBrewer = await prisma.brewer.findFirst({
        where: {
            id: id,
            userId: userId
        }
    });

    if (!existingBrewer) {
        res.status(404).send("Brewer not found.");
        return;
    }

    const formValues = getBrewerFormValues(req);
    const errors = validateBrewerForm(formValues);

    if (errors.length > 0) {
        res.status(400).render("brewers/form", {
            title: "Edit Brewer",
            pageHeading: "Edit Brewer",
            formAction: `/brewers/${id}/edit`,
            submitButtonText: "Update Brewer",
            errors: errors,
            formData: formValues
        });

        return;
    }

    await prisma.brewer.update({
        where: {
            id: id
        },
        data: {
            name: formValues.name,
            brand: formValues.brand || null,
            brewerType: formValues.brewerType || null,
            notes: formValues.notes || null,
            locationName: formValues.locationName || null,
            latitude: parseOptionalCoordinate(formValues.latitude),
            longitude: parseOptionalCoordinate(formValues.longitude)
        }
    });

    res.redirect("/brewers");
});

router.post("/:id/delete", async function (req: Request, res: Response) {
    const userId = getRequiredUserId(req);
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
        res.status(400).send("Invalid brewer ID.");
        return;
    }

    const brewer = await prisma.brewer.findFirst({
        where: {
            id: id,
            userId: userId
        }
    });

    if (!brewer) {
        res.status(404).send("Brewer not found.");
        return;
    }

    await prisma.brewer.delete({
        where: {
            id: id
        }
    });

    res.redirect("/brewers");
});

export default router;