export type ToroIntent =
  | { type: "chat" }
  | { type: "memo_create"; content: string; subjectDiscordUserId?: string; tags?: string[] }
  | { type: "memo_search"; query: string; subjectDiscordUserId?: string }
  | { type: "calendar_create"; title: string; startsAt: string; endsAt?: string }
  | { type: "calendar_list"; range: string };

function firstMention(mentions: string[]): string | undefined {
  return mentions.length > 0 ? mentions[0] : undefined;
}

export function detectIntent(content: string, mentions: string[] = []): ToroIntent {
  const text = content.trim();
  const compact = text.replace(/\s+/g, " ");

  if (/(메모|기억).*(보여|찾아|검색|알려)|관련 메모|메모.*(보여|찾아|검색|알려)/i.test(compact)) {
    return { type: "memo_search", query: compact.replace(/메모|보여줘|찾아줘|검색해줘|알려줘|관련/gi, " ").trim() || compact, subjectDiscordUserId: firstMention(mentions) };
  }

  if (/(메모|기억)(좀|해줘|해둬|해|저장)|저장해줘/i.test(compact)) {
    return { type: "memo_create", content: compact.replace(/(메모|기억)(좀|해줘|해둬|해|저장)?|저장해줘/gi, "").trim() || compact, subjectDiscordUserId: firstMention(mentions), tags: [] };
  }

  if (/(일정|캘린더|스케줄).*(보여|목록|조회|알려)|오늘 일정|이번주 일정|다음주 일정/i.test(compact)) {
    const range = compact.includes("다음주") ? "다음주" : compact.includes("오늘") ? "오늘" : "이번주";
    return { type: "calendar_list", range };
  }

  if (/(일정|캘린더|스케줄).*(추가|등록|잡아|넣어)|회의.*(추가|등록)/i.test(compact)) {
    return { type: "calendar_create", title: compact.replace(/일정|캘린더|스케줄|추가해줘|등록해줘|추가|등록/gi, "").trim() || compact, startsAt: compact };
  }

  return { type: "chat" };
}
