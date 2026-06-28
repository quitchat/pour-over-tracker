CREATE TABLE "AiCostSetting" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "valueDecimal" DECIMAL(12,6) NOT NULL,
    "unit" TEXT,
    "updatedByUserId" INTEGER,
    "updatedByEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiCostSetting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiCostSetting_key_key" ON "AiCostSetting"("key");
CREATE INDEX "AiCostSetting_key_idx" ON "AiCostSetting"("key");

INSERT INTO "AiCostSetting" ("key", "label", "description", "valueDecimal", "unit")
VALUES (
    'web_search_per_1k_calls',
    'Web search tool cost',
    'Estimated base cost charged for OpenAI web search tool calls. Used to calculate AI log tool cost.',
    10.000000,
    'USD per 1,000 calls'
)
ON CONFLICT ("key") DO NOTHING;
