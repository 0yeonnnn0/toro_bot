import { describe, expect, it, vi } from "vitest";

vi.mock("../../db/client", () => ({
  prisma: { team: { count: vi.fn(async () => 2), findMany: vi.fn(async () => []) }, teamMember: { count: vi.fn(async () => 3) }, memo: { count: vi.fn(async () => 4) }, teamCalendarConnection: { count: vi.fn(async () => 1) }, $queryRaw: vi.fn(async () => [{ ok: 1 }]) },
}));

import { getTeamsOverview } from "./teams";

describe("dashboard teams overview", () => {
  it("returns db/team/member/memo/calendar status", async () => {
    await expect(getTeamsOverview()).resolves.toMatchObject({ db: { ok: true }, counts: { teams: 2, members: 3, memos: 4, calendars: 1 } });
  });
});
