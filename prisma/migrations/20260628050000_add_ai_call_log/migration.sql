CREATE TABLE "AiCallLog" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER,
    "userEmail" TEXT,
    "callType" TEXT NOT NULL,
    "model" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Started',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiCallLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiCallLog_userId_idx" ON "AiCallLog"("userId");
CREATE INDEX "AiCallLog_userEmail_idx" ON "AiCallLog"("userEmail");
CREATE INDEX "AiCallLog_callType_idx" ON "AiCallLog"("callType");
CREATE INDEX "AiCallLog_status_idx" ON "AiCallLog"("status");
CREATE INDEX "AiCallLog_startedAt_idx" ON "AiCallLog"("startedAt");

ALTER TABLE "AiCallLog" ADD CONSTRAINT "AiCallLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
