-- CreateTable
CREATE TABLE "BrewSession" (
    "id" SERIAL NOT NULL,
    "coffeeBeanId" INTEGER NOT NULL,
    "grinderId" INTEGER,
    "brewerId" INTEGER,
    "brewDate" TIMESTAMP(3) NOT NULL,
    "grindSize" TEXT,
    "coffeeDoseGrams" DECIMAL(8,2) NOT NULL,
    "waterAmountGrams" DECIMAL(8,2) NOT NULL,
    "brewRatio" DECIMAL(8,3) NOT NULL,
    "waterTemperatureC" DECIMAL(5,2),
    "totalBrewTimeSeconds" INTEGER,
    "finalBeverageGrams" DECIMAL(8,2),
    "overallRating" DECIMAL(4,2),
    "notes" TEXT,
    "wouldRepeat" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrewSession_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "BrewSession" ADD CONSTRAINT "BrewSession_coffeeBeanId_fkey" FOREIGN KEY ("coffeeBeanId") REFERENCES "CoffeeBean"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrewSession" ADD CONSTRAINT "BrewSession_grinderId_fkey" FOREIGN KEY ("grinderId") REFERENCES "Grinder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrewSession" ADD CONSTRAINT "BrewSession_brewerId_fkey" FOREIGN KEY ("brewerId") REFERENCES "Brewer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
