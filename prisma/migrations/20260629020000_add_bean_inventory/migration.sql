CREATE TYPE "BeanInventoryType" AS ENUM ('PURCHASE', 'OPENING_BALANCE');
CREATE TYPE "BeanWeightUnit" AS ENUM ('G', 'OZ');
CREATE TYPE "BeanInventoryAdjustmentReason" AS ENUM ('FINISHED_LEFTOVER', 'DISCARDED', 'CORRECTION', 'OTHER');

ALTER TABLE "User" ADD COLUMN "preferredCurrencyCode" TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE "User" ADD COLUMN "preferredWeightUnit" TEXT NOT NULL DEFAULT 'G';

CREATE TABLE "BeanPurchase" (
    "id" SERIAL NOT NULL,
    "beanId" INTEGER NOT NULL,
    "purchaseDate" TIMESTAMP(3),
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "itemSubtotal" DECIMAL(10,2),
    "discount" DECIMAL(10,2),
    "shipping" DECIMAL(10,2),
    "tax" DECIMAL(10,2),
    "totalPaid" DECIMAL(10,2),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" INTEGER,
    CONSTRAINT "BeanPurchase_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BeanInventory" (
    "id" SERIAL NOT NULL,
    "beanId" INTEGER NOT NULL,
    "beanPurchaseId" INTEGER,
    "inventoryType" "BeanInventoryType" NOT NULL DEFAULT 'PURCHASE',
    "startingGrams" DECIMAL(10,2) NOT NULL,
    "bagSizeGrams" DECIMAL(10,2),
    "bagSizeOriginalValue" DECIMAL(10,2),
    "bagSizeOriginalUnit" "BeanWeightUnit",
    "roastDate" TIMESTAMP(3),
    "purchaseDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BeanInventory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BeanInventoryAdjustment" (
    "id" SERIAL NOT NULL,
    "beanInventoryId" INTEGER NOT NULL,
    "adjustmentGrams" DECIMAL(10,2) NOT NULL,
    "reason" "BeanInventoryAdjustmentReason" NOT NULL DEFAULT 'CORRECTION',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" INTEGER,
    CONSTRAINT "BeanInventoryAdjustment_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "BrewSession" ADD COLUMN "beanInventoryId" INTEGER;

CREATE INDEX "BeanPurchase_beanId_idx" ON "BeanPurchase"("beanId");
CREATE INDEX "BeanPurchase_createdByUserId_idx" ON "BeanPurchase"("createdByUserId");
CREATE INDEX "BeanPurchase_purchaseDate_idx" ON "BeanPurchase"("purchaseDate");
CREATE INDEX "BeanInventory_beanId_idx" ON "BeanInventory"("beanId");
CREATE INDEX "BeanInventory_beanPurchaseId_idx" ON "BeanInventory"("beanPurchaseId");
CREATE INDEX "BeanInventory_inventoryType_idx" ON "BeanInventory"("inventoryType");
CREATE INDEX "BeanInventory_purchaseDate_idx" ON "BeanInventory"("purchaseDate");
CREATE INDEX "BeanInventory_roastDate_idx" ON "BeanInventory"("roastDate");
CREATE INDEX "BeanInventoryAdjustment_beanInventoryId_idx" ON "BeanInventoryAdjustment"("beanInventoryId");
CREATE INDEX "BeanInventoryAdjustment_createdByUserId_idx" ON "BeanInventoryAdjustment"("createdByUserId");
CREATE INDEX "BeanInventoryAdjustment_reason_idx" ON "BeanInventoryAdjustment"("reason");
CREATE INDEX "BeanInventoryAdjustment_createdAt_idx" ON "BeanInventoryAdjustment"("createdAt");
CREATE INDEX "BrewSession_beanInventoryId_idx" ON "BrewSession"("beanInventoryId");

ALTER TABLE "BeanPurchase" ADD CONSTRAINT "BeanPurchase_beanId_fkey" FOREIGN KEY ("beanId") REFERENCES "CoffeeBean"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BeanPurchase" ADD CONSTRAINT "BeanPurchase_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BeanInventory" ADD CONSTRAINT "BeanInventory_beanId_fkey" FOREIGN KEY ("beanId") REFERENCES "CoffeeBean"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BeanInventory" ADD CONSTRAINT "BeanInventory_beanPurchaseId_fkey" FOREIGN KEY ("beanPurchaseId") REFERENCES "BeanPurchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BeanInventoryAdjustment" ADD CONSTRAINT "BeanInventoryAdjustment_beanInventoryId_fkey" FOREIGN KEY ("beanInventoryId") REFERENCES "BeanInventory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BeanInventoryAdjustment" ADD CONSTRAINT "BeanInventoryAdjustment_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BrewSession" ADD CONSTRAINT "BrewSession_beanInventoryId_fkey" FOREIGN KEY ("beanInventoryId") REFERENCES "BeanInventory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
