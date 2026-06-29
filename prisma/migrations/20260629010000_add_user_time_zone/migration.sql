ALTER TABLE "User" ADD COLUMN "timeZone" TEXT NOT NULL DEFAULT 'America/Los_Angeles';

CREATE INDEX "User_timeZone_idx" ON "User"("timeZone");
