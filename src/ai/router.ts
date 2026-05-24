import type { TeamContext } from "../team/context";
import type { HistoryMessage } from "../bot/history";
import { detectIntent } from "./intents";
import { handleMemoCreate, handleMemoSearch } from "../tools/memo/memo-tool";
import { handleCalendarCreate, handleCalendarList } from "../tools/calendar/calendar-tool";

export interface RouteToroMessageInput {
  teamContext: TeamContext;
  content: string;
  mentions?: string[];
  history?: HistoryMessage[];
  source?: { guildId?: string | null; channelId?: string | null; messageId?: string | null };
  chat: (history: HistoryMessage[]) => Promise<string>;
}

export async function routeToroMessage(input: RouteToroMessageInput): Promise<string> {
  const mentions = input.mentions ?? [];
  const intent = detectIntent(input.content, mentions);
  const teamId = input.teamContext.team.id;
  const authorDiscordUserId = input.teamContext.member.discordUserId;

  switch (intent.type) {
    case "memo_create":
      return handleMemoCreate({ teamId, authorDiscordUserId, content: intent.content, mentions, source: input.source });
    case "memo_search":
      return handleMemoSearch({ teamId, query: intent.query, mentions, subjectDiscordUserId: intent.subjectDiscordUserId });
    case "calendar_create":
      return handleCalendarCreate({ teamId, title: intent.title, startsAt: intent.startsAt, requestedByDiscordUserId: authorDiscordUserId });
    case "calendar_list":
      return handleCalendarList({ teamId, range: intent.range });
    case "chat":
    default:
      return input.chat(input.history ?? [{ role: "user", content: input.content }]);
  }
}
