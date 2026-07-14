import { describe, expect, test } from "bun:test";
import { parseCommandMessage } from "../apps/server/src/commands";

describe("native frame and remote commands", () => {
  test("accepts media programme navigation", () => {
    expect(parseCommandMessage({ type: "command", action: "media-program", value: 42 }))
      .toEqual({ type: "command", action: "media-program", value: 42 });
    expect(parseCommandMessage({ type: "command", action: "media-program", value: 0 }))
      .toEqual({ type: "command", action: "media-program", value: 0 });
  });

  test("accepts bounded frame buffering reports", () => {
    expect(parseCommandMessage({ type: "command", action: "media-buffering", value: 0 }))
      .toEqual({ type: "command", action: "media-buffering", value: 0 });
    expect(parseCommandMessage({ type: "command", action: "media-buffering", value: 100 }))
      .toEqual({ type: "command", action: "media-buffering", value: 100 });
    expect(parseCommandMessage({ type: "command", action: "media-buffering", value: 101 }))
      .toBeNull();
  });
});
