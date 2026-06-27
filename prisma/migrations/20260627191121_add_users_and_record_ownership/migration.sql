-- AlterTable
ALTER TABLE "BrewSession" ADD COLUMN     "userId" INTEGER;

-- AlterTable
ALTER TABLE "Brewer" ADD COLUMN     "userId" INTEGER;

-- AlterTable
ALTER TABLE "CoffeeBean" ADD COLUMN     "userId" INTEGER;

-- AlterTable
ALTER TABLE "Grinder" ADD COLUMN     "userId" INTEGER;

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "BrewSession_userId_idx" ON "BrewSession"("userId");

-- CreateIndex
CREATE INDEX "BrewSession_coffeeBeanId_idx" ON "BrewSession"("coffeeBeanId");

-- CreateIndex
CREATE INDEX "BrewSession_grinderId_idx" ON "BrewSession"("grinderId");

-- CreateIndex
CREATE INDEX "BrewSession_brewerId_idx" ON "BrewSession"("brewerId");

-- CreateIndex
CREATE INDEX "Brewer_userId_idx" ON "Brewer"("userId");

-- CreateIndex
CREATE INDEX "CoffeeBean_userId_idx" ON "CoffeeBean"("userId");

-- CreateIndex
CREATE INDEX "Grinder_userId_idx" ON "Grinder"("userId");

-- AddForeignKey
ALTER TABLE "CoffeeBean" ADD CONSTRAINT "CoffeeBean_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Grinder" ADD CONSTRAINT "Grinder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Brewer" ADD CONSTRAINT "Brewer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrewSession" ADD CONSTRAINT "BrewSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
