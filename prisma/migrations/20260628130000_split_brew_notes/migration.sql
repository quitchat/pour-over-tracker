-- Split the old BrewSession notes field into recipe-specific fields.
-- Keep the legacy notes column for backward compatibility, but stop using it in the UI.
ALTER TABLE "BrewSession" ADD COLUMN "pourStructure" TEXT;
ALTER TABLE "BrewSession" ADD COLUMN "recipeSteps" TEXT;
ALTER TABLE "BrewSession" ADD COLUMN "adjustmentNotes" TEXT;

-- Preserve existing notes by copying them into Recipe Steps so no user-entered data is lost.
-- The user can manually split the one existing note into Pour Structure / Recipe Steps / Adjustment Notes after deployment.
UPDATE "BrewSession"
SET "recipeSteps" = "notes"
WHERE "notes" IS NOT NULL
  AND TRIM("notes") <> ''
  AND "recipeSteps" IS NULL;
