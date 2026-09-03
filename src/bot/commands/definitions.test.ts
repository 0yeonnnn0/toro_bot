import { describe, expect, it } from "vitest";
import { commands } from "./definitions";

describe("registered Discord commands", () => {
  it("uses mentions as the only direct AI question entrypoint", () => {
    const names = commands.map(command => command.name);

    expect(names).not.toContain("ask");
  });
});
