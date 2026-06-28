ALTER TABLE "AiCallLog" ADD COLUMN "apiFeatureType" TEXT NOT NULL DEFAULT 'text_only';
ALTER TABLE "AiCallLog" ADD COLUMN "toolCallTypes" TEXT;
ALTER TABLE "AiCallLog" ADD COLUMN "webSearchCallCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AiCallLog" ADD COLUMN "tokenEstimatedCostUsd" DECIMAL(12, 6);
ALTER TABLE "AiCallLog" ADD COLUMN "toolEstimatedCostUsd" DECIMAL(12, 6);

UPDATE "AiCallLog"
SET "tokenEstimatedCostUsd" = "estimatedCostUsd"
WHERE "estimatedCostUsd" IS NOT NULL;

CREATE INDEX "AiCallLog_apiFeatureType_idx" ON "AiCallLog"("apiFeatureType");
