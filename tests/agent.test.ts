import { expect, test } from "bun:test";
import { chatWithLocalAgent, parseAgentReply } from "../apps/server/src/agent";
import { createDefaultState } from "../apps/server/src/state";

const channel = (slug: string, name: string) => ({
  slug,
  name,
  kind: "tv" as const,
  streamUrl: "https://example.test/live.m3u8",
  geoblock: false,
  checkedAt: 0,
});

test("agent replies parse into the stable component envelope", () => {
  expect(parseAgentReply('{"type":"action","title":"Rás","text":"Stillt á RÚV"}')).toEqual({
    type: "action",
    title: "Rás",
    text: "Stillt á RÚV",
  });
  expect(parseAgentReply("<think>innri hugsun</think>\n```json\n{\"type\":\"status\",\"title\":\"Staða\",\"text\":\"Í beinni\"}\n```")).toEqual({
    type: "status",
    title: "Staða",
    text: "Í beinni",
  });
});

test("channel actions use the longest matching channel name", async () => {
  const state = createDefaultState();
  let tuned = "";
  const result = await chatWithLocalAgent({
    baseUrl: "http://example.test/v1",
    apiKey: "test-key",
    model: "test-model",
    timeoutMs: 5_000,
    history: [{ role: "user", content: "Skiptu yfir á RÚV 2." }],
    context: {
      getState: () => state,
      listChannels: () => [channel("ruv", "RÚV"), channel("ruv2", "RÚV 2")],
      getNow: () => undefined,
      tuneChannel: (slug) => {
        tuned = slug;
        state.media.source = slug === "ruv2" ? "RÚV 2" : "RÚV";
        state.media.title = state.media.source;
        return true;
      },
      togglePlayback: () => {},
      setVolume: () => {},
    },
  });
  expect(tuned).toBe("ruv2");
  expect(result.reply.type).toBe("action");
  expect(result.tools).toEqual(["tune_tv_channel"]);
});
