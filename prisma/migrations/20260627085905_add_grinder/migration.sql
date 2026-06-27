-- CreateTable
CREATE TABLE "Grinder" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "grinderType" TEXT,
    "burrType" TEXT,
    "calibrationNotes" TEXT,
    "defaultGrindSizeRange" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Grinder_pkey" PRIMARY KEY ("id")
);
