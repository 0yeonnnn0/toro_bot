import { describe, expect, it, vi } from "vitest";

vi.mock("../tools/memo/memo-tool", () => ({ handleMemoCreate: vi.fn(async () => "메모해뒀다냥."), handleMemoSearch: vi.fn(async () => "최근 메모다냥.") }));
vi.mock("../tools/calendar/calendar-tool", () => ({ handleCalendarCreate: vi.fn(async () => "일정 추가했다냥."), handleCalendarList: vi.fn(async () => "일정 목록이다냥.") }));

import { detectIntent } from "./intents";
import { routeToroMessage } from "./router";

describe("AI router intents", () => {
  const ctx = { team: { id: "team_1" }, member: { discordUserId: "user_1", displayName: "User", role: "MEMBER" } } as any;

  it("detects Korean memo create and search intents", () => {
    expect(detectIntent("철수가 100만원 준다고 했다 메모좀", [])).toMatchObject({ type: "memo_create" });
    expect(detectIntent("철수 관련 메모 보여줘", [])).toMatchObject({ type: "memo_search" });
  });

  it("detects calendar create and list intents", () => {
    expect(detectIntent("내일 오후 3시에 회의 일정 추가해줘", [])).toMatchObject({ type: "calendar_create" });
    expect(detectIntent("이번주 일정 보여줘", [])).toMatchObject({ type: "calendar_list" });
  });

  it("routes tool intents without calling chat model", async () => {
    const chat = vi.fn();
    await expect(routeToroMessage({ teamContext: ctx, content: "메모좀", mentions: [], chat })).resolves.toContain("메모");
    expect(chat).not.toHaveBeenCalled();
  });

  it("falls back to chat model for normal chat", async () => {
    const chat = vi.fn(async () => "안녕하다냥");
    await expect(routeToroMessage({ teamContext: ctx, content: "안녕", mentions: [], chat })).resolves.toBe("안녕하다냥");
    expect(chat).toHaveBeenCalledOnce();
  });
});
