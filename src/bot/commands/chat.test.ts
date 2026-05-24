import { beforeEach, describe, expect, it, vi } from "vitest";
import { TeamLoginRequiredError } from "../../team/errors";

vi.mock("../../team/context", () => ({
  resolveTeamContext: vi.fn(),
}));
vi.mock("../../ai/conversation-store", () => ({
  appendConversationMessage: vi.fn(),
  getRecentConversationHistory: vi.fn(),
}));
vi.mock("../../ai/router", () => ({
  routeToroMessage: vi.fn(),
}));
vi.mock("../ai", () => ({
  getReply: vi.fn(),
}));

import { resolveTeamContext } from "../../team/context";
import { handleQuestion } from "./chat";

function fakeInteraction(message = "안녕") {
  return {
    user: { id: "user_1", displayName: "Tester" },
    guildId: "guild_1",
    channelId: "channel_1",
    id: "interaction_1",
    deferReply: vi.fn(),
    editReply: vi.fn(),
    options: { getString: vi.fn(() => message) },
  } as any;
}

describe("/ask command", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows team setup guidance instead of a generic error when team login is missing", async () => {
    vi.mocked(resolveTeamContext).mockRejectedValue(new TeamLoginRequiredError("팀 먼저 만들어줘라냥"));
    const interaction = fakeInteraction();

    await handleQuestion(interaction);

    expect(interaction.deferReply).toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalledWith("팀 먼저 만들어줘라냥");
  });
});
