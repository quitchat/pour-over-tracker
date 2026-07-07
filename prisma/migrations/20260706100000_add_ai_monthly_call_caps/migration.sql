ALTER TABLE "User"
ADD COLUMN "aiMonthlyCapMode" TEXT NOT NULL DEFAULT 'USE_DEFAULT',
ADD COLUMN "aiMonthlyCallCap" INTEGER;

CREATE INDEX "User_aiMonthlyCapMode_idx" ON "User"("aiMonthlyCapMode");

CREATE TABLE "AiMonthlyCallCapSetting" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "defaultMonthlyCallCap" INTEGER NOT NULL DEFAULT 25,
    "updatedByUserId" INTEGER,
    "updatedByEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiMonthlyCallCapSetting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiMonthlyCallCapSetting_key_key" ON "AiMonthlyCallCapSetting"("key");
CREATE INDEX "AiMonthlyCallCapSetting_key_idx" ON "AiMonthlyCallCapSetting"("key");
CREATE INDEX "AiMonthlyCallCapSetting_updatedByUserId_idx" ON "AiMonthlyCallCapSetting"("updatedByUserId");

ALTER TABLE "AiMonthlyCallCapSetting"
ADD CONSTRAINT "AiMonthlyCallCapSetting_updatedByUserId_fkey"
FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "AiMonthlyCallCapSetting" ("key", "defaultMonthlyCallCap", "updatedAt")
VALUES ('default', 25, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
