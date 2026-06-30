import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type ScriptOptions = {
    apply: boolean;
    overwrite: boolean;
    userId: number | null;
    beanId: number | null;
    includeFutureInventory: boolean;
};

type InventoryState = {
    id: number;
    beanId: number;
    startingGrams: number;
    adjustmentGrams: number;
    linkedBrewedGrams: number;
    projectedBackfillGrams: number;
    purchaseDate: Date | null;
    roastDate: Date | null;
    createdAt: Date;
};

type BrewCandidate = {
    id: number;
    userId: number | null;
    coffeeBeanId: number;
    beanInventoryId: number | null;
    brewDate: Date;
    coffeeDoseGrams: { toString(): string };
};

function parseOptions(): ScriptOptions {
    const args = process.argv.slice(2);
    const options: ScriptOptions = {
        apply: false,
        overwrite: false,
        userId: null,
        beanId: null,
        includeFutureInventory: false
    };

    for (const arg of args) {
        if (arg === "--apply") {
            options.apply = true;
        } else if (arg === "--overwrite") {
            options.overwrite = true;
        } else if (arg === "--include-future-inventory") {
            options.includeFutureInventory = true;
        } else if (arg.startsWith("--user-id=")) {
            options.userId = parsePositiveInteger(arg.substring("--user-id=".length), "user-id");
        } else if (arg.startsWith("--bean-id=")) {
            options.beanId = parsePositiveInteger(arg.substring("--bean-id=".length), "bean-id");
        } else if (arg === "--help" || arg === "-h") {
            printHelp();
            process.exit(0);
        } else {
            throw new Error(`Unknown argument: ${arg}`);
        }
    }

    return options;
}

function parsePositiveInteger(value: string, label: string): number {
    const parsed = Number(value);

    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error(`Invalid ${label}: ${value}`);
    }

    return parsed;
}

function printHelp(): void {
    console.log(`Backfill brew session inventory links\n\nUsage:\n  npx.cmd tsx src/scripts/backfillBrewInventoryLinks.ts\n  npx.cmd tsx src/scripts/backfillBrewInventoryLinks.ts --apply\n\nOptions:\n  --apply                    Save updates. Without this, the script runs as a dry run.\n  --overwrite                Re-link brew sessions that already have beanInventoryId. Default is to only fill null links.\n  --user-id=<id>             Limit to one user.\n  --bean-id=<id>             Limit to one coffee bean.\n  --include-future-inventory Allow linking a brew to inventory whose purchase/roast/created date is after the brew date. Default is safer date-aware matching.\n  --help                     Show this help.\n`);
}

function toNumber(value: { toString(): string } | number | null | undefined): number {
    if (value === null || typeof value === "undefined") {
        return 0;
    }

    if (typeof value === "number") {
        return value;
    }

    return Number(value.toString());
}

function roundGrams(value: number): number {
    return Math.round(value * 100) / 100;
}

function getInventoryAvailableDate(inventory: InventoryState): Date {
    return inventory.purchaseDate || inventory.roastDate || inventory.createdAt;
}

function sortInventory(a: InventoryState, b: InventoryState): number {
    const aDate = getInventoryAvailableDate(a).getTime();
    const bDate = getInventoryAvailableDate(b).getTime();

    if (aDate !== bDate) {
        return aDate - bDate;
    }

    return a.id - b.id;
}

function getRemainingGrams(inventory: InventoryState): number {
    return roundGrams(inventory.startingGrams - inventory.linkedBrewedGrams - inventory.projectedBackfillGrams + inventory.adjustmentGrams);
}

function canUseInventoryForBrew(inventory: InventoryState, brew: BrewCandidate, doseGrams: number, options: ScriptOptions): boolean {
    if (inventory.beanId !== brew.coffeeBeanId) {
        return false;
    }

    if (!options.includeFutureInventory) {
        const inventoryAvailableDate = getInventoryAvailableDate(inventory);

        if (inventoryAvailableDate.getTime() > brew.brewDate.getTime()) {
            return false;
        }
    }

    return getRemainingGrams(inventory) + 0.0001 >= doseGrams;
}

async function main(): Promise<void> {
    const options = parseOptions();

    console.log(options.apply ? "Running inventory-link backfill in APPLY mode." : "Running inventory-link backfill in DRY RUN mode. Add --apply to save changes.");

    const brewWhere = {
        ...(options.overwrite ? {} : { beanInventoryId: null }),
        ...(options.userId !== null ? { userId: options.userId } : {}),
        ...(options.beanId !== null ? { coffeeBeanId: options.beanId } : {})
    };

    const inventoryWhere = {
        ...(options.userId !== null ? { bean: { userId: options.userId } } : {}),
        ...(options.beanId !== null ? { beanId: options.beanId } : {})
    };

    const inventories = await prisma.beanInventory.findMany({
        where: inventoryWhere,
        include: {
            brewSessions: {
                select: {
                    id: true,
                    coffeeDoseGrams: true
                }
            },
            adjustments: {
                select: {
                    adjustmentGrams: true
                }
            }
        }
    });

    const inventoryStates: InventoryState[] = inventories.map(function (inventory) {
        return {
            id: inventory.id,
            beanId: inventory.beanId,
            startingGrams: toNumber(inventory.startingGrams),
            adjustmentGrams: inventory.adjustments.reduce(function (sum, adjustment) {
                return sum + toNumber(adjustment.adjustmentGrams);
            }, 0),
            linkedBrewedGrams: inventory.brewSessions.reduce(function (sum, brew) {
                return sum + toNumber(brew.coffeeDoseGrams);
            }, 0),
            projectedBackfillGrams: 0,
            purchaseDate: inventory.purchaseDate,
            roastDate: inventory.roastDate,
            createdAt: inventory.createdAt
        };
    }).sort(sortInventory);

    const brews = await prisma.brewSession.findMany({
        where: brewWhere,
        select: {
            id: true,
            userId: true,
            coffeeBeanId: true,
            beanInventoryId: true,
            brewDate: true,
            coffeeDoseGrams: true
        },
        orderBy: [
            { brewDate: "asc" },
            { createdAt: "asc" },
            { id: "asc" }
        ]
    });

    let linkedCount = 0;
    let skippedCount = 0;
    const updates: { brewId: number; inventoryId: number; doseGrams: number }[] = [];

    for (const brew of brews) {
        const doseGrams = toNumber(brew.coffeeDoseGrams);

        if (doseGrams <= 0) {
            skippedCount += 1;
            continue;
        }

        const selectedInventory = inventoryStates.find(function (inventory) {
            return canUseInventoryForBrew(inventory, brew, doseGrams, options);
        });

        if (!selectedInventory) {
            skippedCount += 1;
            continue;
        }

        selectedInventory.projectedBackfillGrams = roundGrams(selectedInventory.projectedBackfillGrams + doseGrams);
        linkedCount += 1;
        updates.push({
            brewId: brew.id,
            inventoryId: selectedInventory.id,
            doseGrams: roundGrams(doseGrams)
        });
    }

    console.log(`Inventory records scanned: ${inventoryStates.length}`);
    console.log(`Brew sessions scanned: ${brews.length}`);
    console.log(`Brew sessions linkable: ${linkedCount}`);
    console.log(`Brew sessions skipped: ${skippedCount}`);

    if (updates.length > 0) {
        console.log("Sample links:");
        for (const update of updates.slice(0, 20)) {
            console.log(`  Brew #${update.brewId} -> Inventory #${update.inventoryId} (${update.doseGrams}g)`);
        }

        if (updates.length > 20) {
            console.log(`  ...and ${updates.length - 20} more`);
        }
    }

    if (!options.apply) {
        console.log("Dry run complete. No rows were changed.");
        return;
    }

    if (updates.length === 0) {
        console.log("No updates to apply.");
        return;
    }

    await prisma.$transaction(
        updates.map(function (update) {
            return prisma.brewSession.update({
                where: {
                    id: update.brewId
                },
                data: {
                    beanInventoryId: update.inventoryId
                }
            });
        })
    );

    console.log(`Applied ${updates.length} brew session inventory links.`);
}

main()
    .catch(function (error) {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(async function () {
        await prisma.$disconnect();
    });
