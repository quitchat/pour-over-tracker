ALTER TABLE "User" ADD COLUMN "temperatureUnit" TEXT NOT NULL DEFAULT 'C';
CREATE INDEX "User_temperatureUnit_idx" ON "User"("temperatureUnit");

UPDATE "BrewSuggestionAiPrompt"
SET "promptText" = REPLACE(
    "promptText",
    'For waterTemperatureC, use Celsius.',
    'For waterTemperature, use the user temperature unit provided in the request context.'
),
"updatedAt" = CURRENT_TIMESTAMP
WHERE "name" = 'default'
  AND "promptText" LIKE '%For waterTemperatureC, use Celsius.%';
