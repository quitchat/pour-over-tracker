-- CreateTable
CREATE TABLE "TastingScore" (
    "id" SERIAL NOT NULL,
    "brewSessionId" INTEGER NOT NULL,
    "aroma" INTEGER NOT NULL,
    "sweetness" INTEGER NOT NULL,
    "acidity" INTEGER NOT NULL,
    "body" INTEGER NOT NULL,
    "clarity" INTEGER NOT NULL,
    "balance" INTEGER NOT NULL,
    "aftertaste" INTEGER NOT NULL,
    "flavorIntensity" INTEGER NOT NULL,
    "bitterness" INTEGER,
    "astringency" INTEGER,
    "sourness" INTEGER,
    "roastiness" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TastingScore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TastingScore_brewSessionId_key" ON "TastingScore"("brewSessionId");

-- AddForeignKey
ALTER TABLE "TastingScore" ADD CONSTRAINT "TastingScore_brewSessionId_fkey" FOREIGN KEY ("brewSessionId") REFERENCES "BrewSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
