-- CreateTable
CREATE TABLE "ContestSubscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "channelId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ContestPreference" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "targetId" TEXT NOT NULL DEFAULT 'legacy',
    "userId" TEXT NOT NULL,
    "contestId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ContestPreference_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "Contest" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ContestPreference" ("contestId", "createdAt", "id", "status", "updatedAt", "userId") SELECT "contestId", "createdAt", "id", "status", "updatedAt", "userId" FROM "ContestPreference";
DROP TABLE "ContestPreference";
ALTER TABLE "new_ContestPreference" RENAME TO "ContestPreference";
CREATE INDEX "ContestPreference_targetId_contestId_status_idx" ON "ContestPreference"("targetId", "contestId", "status");
CREATE INDEX "ContestPreference_userId_status_idx" ON "ContestPreference"("userId", "status");
CREATE UNIQUE INDEX "ContestPreference_targetId_userId_contestId_key" ON "ContestPreference"("targetId", "userId", "contestId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "ContestSubscription_channelId_key" ON "ContestSubscription"("channelId");

-- CreateIndex
CREATE INDEX "ContestSubscription_enabled_idx" ON "ContestSubscription"("enabled");
