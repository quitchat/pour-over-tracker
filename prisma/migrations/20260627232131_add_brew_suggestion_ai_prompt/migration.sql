-- CreateTable
CREATE TABLE "BrewSuggestionAiPrompt" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "promptText" TEXT NOT NULL,
    "updatedByUserId" INTEGER,
    "updatedByEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrewSuggestionAiPrompt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BrewSuggestionAiPrompt_name_key" ON "BrewSuggestionAiPrompt"("name");
