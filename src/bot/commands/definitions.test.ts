import { describe, expect, it } from "vitest";
import { commands } from "./definitions";

describe("registered Discord commands", () => {
  it("registers channel contest subscription controls", () => {
    const contest = commands.find(command => command.name === "공모전")?.toJSON();

    expect(contest).toBeDefined();
    expect(contest?.options?.map(option => option.name)).toEqual(["시작", "중지", "상태"]);
  });

  it("uses mentions as the only direct AI question entrypoint", () => {
    const names = commands.map(command => command.name);

    expect(names).not.toContain("ask");
  });

  it("keeps team setup and login on the web", () => {
    const names = commands.map(command => command.name);

    expect(names).not.toContain("login");
    expect(names).not.toContain("team");
  });

  it("does not expose persistent memory or calendar commands", () => {
    const names = commands.map(command => command.name);

    expect(names).not.toContain("calendar");
    expect(names).not.toContain("내정보");
  });

  it("keeps media focused on images and party music", () => {
    const names = commands.map(command => command.name);

    expect(names).not.toContain("say");
    expect(names).toContain("draw");
    expect(names).toContain("play");
  });
});
