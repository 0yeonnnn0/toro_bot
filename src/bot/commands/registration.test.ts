import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ put: vi.fn() }));

vi.mock("discord.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("discord.js")>();
  return {
    ...actual,
    REST: class {
      setToken() { return this; }
      put = mocks.put;
    },
    Routes: {
      ...actual.Routes,
      applicationCommands: (clientId: string) => `/applications/${clientId}/commands`,
      applicationGuildCommands: (clientId: string, guildId: string) => `/applications/${clientId}/guilds/${guildId}/commands`,
    },
  };
});

import { registerCommands } from "./index";

describe("Discord command registration", () => {
  beforeEach(() => {
    mocks.put.mockReset().mockResolvedValue([]);
  });

  it("registers commands globally and immediately in every joined guild", async () => {
    await registerCommands("app_1", "token", ["guild_1", "guild_2"]);

    expect(mocks.put).toHaveBeenCalledWith("/applications/app_1/commands", { body: [] });
    expect(mocks.put).toHaveBeenCalledWith(
      "/applications/app_1/guilds/guild_1/commands",
      expect.objectContaining({ body: expect.arrayContaining([expect.objectContaining({ name: "공모전" })]) }),
    );
    expect(mocks.put).toHaveBeenCalledWith(
      "/applications/app_1/guilds/guild_2/commands",
      expect.objectContaining({ body: expect.arrayContaining([expect.objectContaining({ name: "공모전" })]) }),
    );
  });
});
