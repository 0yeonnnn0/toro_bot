import { prisma } from "../../db/client";
import { encryptToken } from "./google-oauth";

export async function upsertCalendarConnection(input: { teamId: string; calendarId: string; refreshToken: string; connectedByDiscordUserId: string; googleAccountEmail?: string | null }) {
  const encryptedRefreshToken = encryptToken(input.refreshToken);
  return prisma.teamCalendarConnection.upsert({
    where: { teamId: input.teamId },
    create: {
      teamId: input.teamId,
      calendarId: input.calendarId,
      encryptedRefreshToken,
      connectedByDiscordUserId: input.connectedByDiscordUserId,
      googleAccountEmail: input.googleAccountEmail ?? null,
    },
    update: {
      calendarId: input.calendarId,
      encryptedRefreshToken,
      connectedByDiscordUserId: input.connectedByDiscordUserId,
      googleAccountEmail: input.googleAccountEmail ?? null,
    },
  });
}

export async function getCalendarConnection(teamId: string) {
  return prisma.teamCalendarConnection.findUnique({ where: { teamId } });
}

export async function deleteCalendarConnection(teamId: string) {
  return prisma.teamCalendarConnection.delete({ where: { teamId } });
}
