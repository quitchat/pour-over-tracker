import { Prisma, BeanInventory, BeanPurchase, BeanInventoryAdjustment, BrewSession } from "@prisma/client";
import { prisma } from "../lib/prisma";

export type BeanInventoryFormMode = "purchase" | "opening" | "edit" | "adjust" | "finish";

export const gramsPerOunce = 28.349523125;

export function normalizeCurrencyCode(value: string | null | undefined): string {
    const currencyCode = String(value || "USD").trim().toUpperCase();

    if (/^[A-Z]{3}$/.test(currencyCode)) {
        return currencyCode;
    }

    return "USD";
}

export function normalizeWeightUnit(value: string | null | undefined): "G" | "OZ" {
    const unit = String(value || "G").trim().toUpperCase();

    return unit === "OZ" ? "OZ" : "G";
}

export function convertToGrams(value: string | number, unitValue: string): number {
    const amount = typeof value === "number" ? value : Number(value);
    const unit = normalizeWeightUnit(unitValue);

    if (unit === "OZ") {
        return amount * gramsPerOunce;
    }

    return amount;
}

export function roundGrams(value: number): number {
    return Math.round(value * 100) / 100;
}

export function formatGrams(value: number | null | undefined): string {
    const numberValue = Number(value || 0);

    if (Math.abs(numberValue - Math.round(numberValue)) < 0.005) {
        return String(Math.round(numberValue));
    }

    return numberValue.toFixed(1);
}

export function formatMoney(value: number | null | undefined, currencyCode: string): string {
    if (value === null || typeof value === "undefined" || Number.isNaN(value)) {
        return "";
    }

    return `${currencyCode} ${value.toFixed(2)}`;
}

export function parseOptionalDecimal(value: string | null | undefined): Prisma.Decimal | null {
    const text = String(value || "").trim();

    if (!text) {
        return null;
    }

    const parsed = Number(text);

    if (Number.isNaN(parsed)) {
        return null;
    }

    return new Prisma.Decimal(text);
}

export function getEffectiveTotalCost(purchase: Pick<BeanPurchase, "itemSubtotal" | "discount" | "shipping" | "tax" | "totalPaid">): number | null {
    if (purchase.totalPaid !== null) {
        return Number(purchase.totalPaid.toString());
    }

    if (purchase.itemSubtotal === null && purchase.discount === null && purchase.shipping === null && purchase.tax === null) {
        return null;
    }

    return Number((purchase.itemSubtotal || new Prisma.Decimal(0)).toString())
        - Number((purchase.discount || new Prisma.Decimal(0)).toString())
        + Number((purchase.shipping || new Prisma.Decimal(0)).toString())
        + Number((purchase.tax || new Prisma.Decimal(0)).toString());
}

export function getInventoryUsage(inventory: BeanInventory & { brewSessions: Pick<BrewSession, "coffeeDoseGrams">[]; adjustments: Pick<BeanInventoryAdjustment, "adjustmentGrams">[] }) {
    const startingGrams = Number(inventory.startingGrams.toString());
    const brewedGrams = inventory.brewSessions.reduce(function (sum, brew) {
        return sum + Number(brew.coffeeDoseGrams.toString());
    }, 0);
    const adjustmentGrams = inventory.adjustments.reduce(function (sum, adjustment) {
        return sum + Number(adjustment.adjustmentGrams.toString());
    }, 0);
    const remainingGrams = startingGrams - brewedGrams + adjustmentGrams;

    return {
        startingGrams: roundGrams(startingGrams),
        brewedGrams: roundGrams(brewedGrams),
        adjustmentGrams: roundGrams(adjustmentGrams),
        usedGrams: roundGrams(brewedGrams - adjustmentGrams),
        remainingGrams: roundGrams(Math.max(0, remainingGrams)),
        rawRemainingGrams: roundGrams(remainingGrams)
    };
}

export async function findBestInventoryForBrew(userId: number, beanId: number, coffeeDoseGrams: number): Promise<number | null> {
    try {
        const inventories = await prisma.beanInventory.findMany({
            where: {
                beanId: beanId,
                bean: {
                    userId: userId
                }
            },
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
            },
            orderBy: [
                {
                    purchaseDate: "asc"
                },
                {
                    roastDate: "asc"
                },
                {
                    createdAt: "asc"
                },
                {
                    id: "asc"
                }
            ]
        });

        for (const inventory of inventories) {
            const usage = getInventoryUsage(inventory);

            if (usage.remainingGrams + 0.0001 >= coffeeDoseGrams) {
                return inventory.id;
            }
        }

        return null;
    } catch (error) {
        console.error("Inventory auto-link skipped.", error);
        return null;
    }
}

export async function getBeanInventorySummary(beanId: number, userId: number) {
    const inventories = await prisma.beanInventory.findMany({
        where: {
            beanId: beanId,
            bean: {
                userId: userId
            }
        },
        include: {
            beanPurchase: true,
            brewSessions: {
                select: {
                    id: true,
                    brewDate: true,
                    coffeeDoseGrams: true
                },
                orderBy: {
                    brewDate: "desc"
                }
            },
            adjustments: {
                orderBy: {
                    createdAt: "desc"
                }
            }
        },
        orderBy: [
            {
                purchaseDate: "asc"
            },
            {
                roastDate: "asc"
            },
            {
                createdAt: "asc"
            },
            {
                id: "asc"
            }
        ]
    });

    const items = inventories.map(function (inventory) {
        const usage = getInventoryUsage(inventory);
        const purchase = inventory.beanPurchase;
        const effectiveTotalCost = purchase ? getEffectiveTotalCost(purchase) : null;
        const purchaseQuantity = purchase ? Math.max(1, purchase.quantity || 1) : 1;
        const effectiveCostPerBag = effectiveTotalCost === null ? null : effectiveTotalCost / purchaseQuantity;
        const effectiveCostPerGram = effectiveCostPerBag === null || usage.startingGrams <= 0 ? null : effectiveCostPerBag / usage.startingGrams;
        const originalValue = inventory.bagSizeOriginalValue === null ? null : Number(inventory.bagSizeOriginalValue.toString());
        const originalUnit = inventory.bagSizeOriginalUnit || "G";

        return {
            id: inventory.id,
            inventoryType: inventory.inventoryType,
            startingGrams: usage.startingGrams,
            bagSizeGrams: inventory.bagSizeGrams === null ? null : roundGrams(Number(inventory.bagSizeGrams.toString())),
            bagSizeOriginalValue: originalValue,
            bagSizeOriginalUnit: originalUnit,
            bagSizeLabel: originalValue !== null ? `${formatGrams(originalValue)} ${originalUnit.toLowerCase()} / ${formatGrams(inventory.bagSizeGrams === null ? usage.startingGrams : Number(inventory.bagSizeGrams.toString()))}g` : `${formatGrams(usage.startingGrams)}g`,
            roastDate: inventory.roastDate,
            purchaseDate: inventory.purchaseDate,
            notes: inventory.notes || "",
            remainingGrams: usage.remainingGrams,
            rawRemainingGrams: usage.rawRemainingGrams,
            brewedGrams: usage.brewedGrams,
            adjustmentGrams: usage.adjustmentGrams,
            isFinished: usage.remainingGrams <= 0,
            purchase: purchase ? {
                id: purchase.id,
                currencyCode: purchase.currencyCode,
                quantity: purchase.quantity,
                itemSubtotal: purchase.itemSubtotal === null ? null : Number(purchase.itemSubtotal.toString()),
                discount: purchase.discount === null ? null : Number(purchase.discount.toString()),
                shipping: purchase.shipping === null ? null : Number(purchase.shipping.toString()),
                tax: purchase.tax === null ? null : Number(purchase.tax.toString()),
                totalPaid: purchase.totalPaid === null ? null : Number(purchase.totalPaid.toString()),
                effectiveTotalCost: effectiveTotalCost,
                effectiveCostPerBag: effectiveCostPerBag,
                effectiveCostPerGram: effectiveCostPerGram,
                notes: purchase.notes || ""
            } : null,
            brewSessions: inventory.brewSessions,
            adjustments: inventory.adjustments
        };
    });

    const availableItems = items.filter(function (item) {
        return item.remainingGrams > 0;
    });
    const finishedItems = items.filter(function (item) {
        return item.remainingGrams <= 0;
    });

    return {
        items: items,
        availableItems: availableItems,
        finishedItems: finishedItems,
        openingBalanceItems: items.filter(function (item) {
            return item.inventoryType === "OPENING_BALANCE";
        }),
        currentItem: availableItems.length > 0 ? availableItems[0] : null,
        nextItems: availableItems.slice(1),
        totalAvailableGrams: roundGrams(availableItems.reduce(function (sum, item) {
            return sum + item.remainingGrams;
        }, 0))
    };
}
