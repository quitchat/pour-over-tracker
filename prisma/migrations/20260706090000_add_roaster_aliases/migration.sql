CREATE TABLE "RoasterAlias" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "aliasName" TEXT NOT NULL,
    "preferredName" TEXT NOT NULL,
    "normalizedAlias" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoasterAlias_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RoasterAlias_userId_normalizedAlias_key" ON "RoasterAlias"("userId", "normalizedAlias");
CREATE INDEX "RoasterAlias_userId_idx" ON "RoasterAlias"("userId");
CREATE INDEX "RoasterAlias_preferredName_idx" ON "RoasterAlias"("preferredName");

ALTER TABLE "RoasterAlias" ADD CONSTRAINT "RoasterAlias_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
