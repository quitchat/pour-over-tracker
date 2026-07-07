CREATE TABLE "OriginMapPinOverride" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "coffeeBeanId" INTEGER NOT NULL,
    "countryKey" TEXT NOT NULL,
    "countryInput" TEXT NOT NULL,
    "searchText" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "displayName" TEXT,
    "country" TEXT,
    "countryCode" TEXT,
    "region" TEXT,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OriginMapPinOverride_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OriginMapPinOverride_userId_coffeeBeanId_countryKey_key" ON "OriginMapPinOverride"("userId", "coffeeBeanId", "countryKey");
CREATE INDEX "OriginMapPinOverride_userId_idx" ON "OriginMapPinOverride"("userId");
CREATE INDEX "OriginMapPinOverride_coffeeBeanId_idx" ON "OriginMapPinOverride"("coffeeBeanId");
CREATE INDEX "OriginMapPinOverride_countryKey_idx" ON "OriginMapPinOverride"("countryKey");

ALTER TABLE "OriginMapPinOverride" ADD CONSTRAINT "OriginMapPinOverride_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OriginMapPinOverride" ADD CONSTRAINT "OriginMapPinOverride_coffeeBeanId_fkey" FOREIGN KEY ("coffeeBeanId") REFERENCES "CoffeeBean"("id") ON DELETE CASCADE ON UPDATE CASCADE;
