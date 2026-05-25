-- Store a Discord user's selected TORO team for DM/multi-team contexts.
CREATE TABLE "ActiveTeamSelection" (
    "discordUserId" TEXT NOT NULL PRIMARY KEY,
    "teamId" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ActiveTeamSelection_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ActiveTeamSelection_teamId_idx" ON "ActiveTeamSelection"("teamId");
