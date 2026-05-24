import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../db/client", () => ({
  prisma: { teamCalendarConnection: { upsert: vi.fn(), findUnique: vi.fn(), delete: vi.fn() } },
}));

import { prisma } from "../../db/client";
import { encryptToken, decryptToken } from "./google-oauth";
import { upsertCalendarConnection } from "./calendar-store";
import { handleCalendarStatus, assertCanAdminCalendar } from "./calendar-tool";

describe("calendar tool", () => {
  beforeEach(() => { vi.clearAllMocks(); process.env.TOKEN_ENCRYPTION_KEY = "12345678901234567890123456789012"; });

  it("encrypts and decrypts refresh tokens", () => {
    const enc = encryptToken("refresh-token");
    expect(enc).not.toBe("refresh-token");
    expect(decryptToken(enc)).toBe("refresh-token");
  });

  it("stores encrypted shared team calendar connection", async () => {
    vi.mocked(prisma.teamCalendarConnection.upsert).mockResolvedValue({ id: "cal_1" } as never);
    await upsertCalendarConnection({ teamId: "team_1", calendarId: "primary", refreshToken: "rt", connectedByDiscordUserId: "owner_1", googleAccountEmail: "a@example.com" });
    expect(prisma.teamCalendarConnection.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { teamId: "team_1" } }));
  });

  it("only owner/admin can administer calendar", () => {
    expect(() => assertCanAdminCalendar("OWNER" as any)).not.toThrow();
    expect(() => assertCanAdminCalendar("ADMIN" as any)).not.toThrow();
    expect(() => assertCanAdminCalendar("MEMBER" as any)).toThrow();
  });

  it("reports disconnected calendar status", async () => {
    vi.mocked(prisma.teamCalendarConnection.findUnique).mockResolvedValue(null as never);
    await expect(handleCalendarStatus({ teamId: "team_1" })).resolves.toContain("연결된 캘린더가 없다냥");
  });
});
