-- CreateTable
CREATE TABLE "OriginMapGeocodeCache" (
    "id" SERIAL NOT NULL,
    "cacheKey" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "matchLevel" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "country" TEXT,
    "countryCode" TEXT,
    "region" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OriginMapGeocodeCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OriginMapGeocodeCache_cacheKey_key" ON "OriginMapGeocodeCache"("cacheKey");

-- CreateIndex
CREATE INDEX "OriginMapGeocodeCache_matchLevel_idx" ON "OriginMapGeocodeCache"("matchLevel");

-- CreateIndex
CREATE INDEX "OriginMapGeocodeCache_status_idx" ON "OriginMapGeocodeCache"("status");

-- CreateIndex
CREATE INDEX "OriginMapGeocodeCache_countryCode_idx" ON "OriginMapGeocodeCache"("countryCode");
