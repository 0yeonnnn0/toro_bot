-- Enforce the current product policy: one TORO team per Discord guild.
CREATE UNIQUE INDEX "Team_guildId_key" ON "Team"("guildId");
