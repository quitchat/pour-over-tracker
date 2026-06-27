-- AlterTable
ALTER TABLE "CoffeeBean" ADD COLUMN     "deactivatedAt" TIMESTAMP(3),
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "CoffeeBean_isActive_idx" ON "CoffeeBean"("isActive");
