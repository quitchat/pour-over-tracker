-- CreateTable
CREATE TABLE "CoffeeBean" (
    "id" SERIAL NOT NULL,
    "beanName" TEXT NOT NULL,
    "roasterName" TEXT,
    "origin" TEXT,
    "process" TEXT,
    "roastDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoffeeBean_pkey" PRIMARY KEY ("id")
);
