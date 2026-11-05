-- CreateTable
CREATE TABLE "Contest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "canonicalKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "host" TEXT,
    "category" TEXT,
    "applyEnd" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "sourceIssueUrl" TEXT NOT NULL,
    "summary" TEXT,
    "track" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ContestPreference" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "contestId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ContestPreference_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "Contest" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ContestNotification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "contestId" TEXT NOT NULL,
    "channelId" TEXT,
    "messageId" TEXT,
    "sentAt" DATETIME,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContestNotification_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "Contest" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ContestNotifierState" (
    "userId" TEXT NOT NULL PRIMARY KEY,
    "quotaDate" TEXT NOT NULL,
    "reservedCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Contest_canonicalKey_key" ON "Contest"("canonicalKey");

-- CreateIndex
CREATE INDEX "Contest_status_applyEnd_idx" ON "Contest"("status", "applyEnd");

-- CreateIndex
CREATE INDEX "ContestPreference_userId_status_idx" ON "ContestPreference"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ContestPreference_userId_contestId_key" ON "ContestPreference"("userId", "contestId");

-- CreateIndex
CREATE INDEX "ContestNotification_contestId_deletedAt_idx" ON "ContestNotification"("contestId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ContestNotification_userId_contestId_key" ON "ContestNotification"("userId", "contestId");
