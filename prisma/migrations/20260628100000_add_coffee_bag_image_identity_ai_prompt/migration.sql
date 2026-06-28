CREATE TABLE "CoffeeBagImageIdentityAiPrompt" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "promptText" TEXT NOT NULL,
    "updatedByUserId" INTEGER,
    "updatedByEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoffeeBagImageIdentityAiPrompt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CoffeeBagImageIdentityAiPrompt_name_key" ON "CoffeeBagImageIdentityAiPrompt"("name");

INSERT INTO "CoffeeBagImageIdentityAiPrompt" ("name", "promptText", "updatedAt")
VALUES ('default', $prompt$You are helping a pour-over coffee tracking app read a coffee bag label from an uploaded image.

Extract only the roaster name and the coffee bean name from the image.

Rules:

1. Return the roaster name only if it is clearly visible or strongly supported by the bag label.
2. Return the coffee bean name only if it is clearly visible or strongly supported by the bag label.
3. Do not guess.
4. Do not return origin, process, roast level, tasting notes, price, image URL, or marketing text.
5. If the bag shows multiple possible names, choose the one most likely to be the coffee product name.
6. If a value cannot be determined, return null.
7. Prefer the exact text printed on the bag, but clean obvious OCR mistakes.
8. Do not include explanations.

Return JSON only in this shape:

{
  "roasterName": "string or null",
  "beanName": "string or null",
  "confidence": "high, medium, or low",
  "notes": []
}$prompt$, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;
