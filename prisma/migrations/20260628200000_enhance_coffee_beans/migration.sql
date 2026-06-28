ALTER TABLE "CoffeeBean" RENAME COLUMN "notes" TO "beanInfo";
ALTER TABLE "CoffeeBean" ADD COLUMN "beanNotes" TEXT;
ALTER TABLE "CoffeeBean" ADD COLUMN "rating" DECIMAL(4, 2);
