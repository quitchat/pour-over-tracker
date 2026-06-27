/*
  Warnings:

  - You are about to drop the column `astringency` on the `TastingScore` table. All the data in the column will be lost.
  - You are about to drop the column `balance` on the `TastingScore` table. All the data in the column will be lost.
  - You are about to drop the column `body` on the `TastingScore` table. All the data in the column will be lost.
  - You are about to drop the column `clarity` on the `TastingScore` table. All the data in the column will be lost.
  - You are about to drop the column `flavorIntensity` on the `TastingScore` table. All the data in the column will be lost.
  - You are about to drop the column `roastiness` on the `TastingScore` table. All the data in the column will be lost.
  - You are about to drop the column `sourness` on the `TastingScore` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "CoffeeBean" ADD COLUMN     "price" DECIMAL(10,2),
ADD COLUMN     "roastLevel" TEXT;

-- AlterTable
ALTER TABLE "TastingScore" DROP COLUMN "astringency",
DROP COLUMN "balance",
DROP COLUMN "body",
DROP COLUMN "clarity",
DROP COLUMN "flavorIntensity",
DROP COLUMN "roastiness",
DROP COLUMN "sourness",
ADD COLUMN     "richness" INTEGER NOT NULL DEFAULT 5,
ALTER COLUMN "aroma" SET DEFAULT 5,
ALTER COLUMN "sweetness" SET DEFAULT 5,
ALTER COLUMN "acidity" SET DEFAULT 5,
ALTER COLUMN "aftertaste" SET DEFAULT 5;
