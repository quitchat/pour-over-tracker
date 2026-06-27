-- AlterTable
ALTER TABLE "TastingScore" ALTER COLUMN "aroma" SET DEFAULT 3,
ALTER COLUMN "sweetness" SET DEFAULT 3,
ALTER COLUMN "acidity" SET DEFAULT 3,
ALTER COLUMN "aftertaste" SET DEFAULT 3,
ALTER COLUMN "richness" SET DEFAULT 3;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "deactivatedAt" TIMESTAMP(3),
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "role" TEXT NOT NULL DEFAULT 'User';

-- CreateTable
CREATE TABLE "BeanDetailAiPrompt" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "promptText" TEXT NOT NULL,
    "updatedByUserId" INTEGER,
    "updatedByEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BeanDetailAiPrompt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BeanDetailAiPrompt_name_key" ON "BeanDetailAiPrompt"("name");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_isActive_idx" ON "User"("isActive");
