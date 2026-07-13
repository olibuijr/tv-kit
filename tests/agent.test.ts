import { expect, test } from "bun:test";
import {
	agentHistoryForModel,
	chatWithLocalAgent,
	parseAgentReply,
} from "../apps/server/src/agent";
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
	expect(
		parseAgentReply('{"type":"action","title":"Rás","text":"Stillt á RÚV"}'),
	).toEqual({
		type: "action",
		title: "Rás",
		text: "Stillt á RÚV",
	});
	expect(
		parseAgentReply(
			'<think>innri hugsun</think>\n```json\n{"type":"status","title":"Staða","text":"Í beinni"}\n```',
		),
	).toEqual({
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
			setView: (view) => {
				state.view = view;
			},
			togglePlayback: () => {},
			setVolume: () => {},
		},
	});
	expect(tuned).toBe("ruv2");
	expect(result.reply.type).toBe("action");
	expect(result.tools).toEqual(["tune_tv_channel"]);
});

test("internal agent opens TV Kit views without the model", async () => {
	const state = createDefaultState();
	const result = await chatWithLocalAgent({
		baseUrl: "http://example.test/v1",
		apiKey: "test-key",
		model: "test-model",
		timeoutMs: 5_000,
		history: [{ role: "user", content: "Opnaðu Deildu." }],
		context: {
			getState: () => state,
			listChannels: () => [],
			getNow: () => undefined,
			tuneChannel: () => false,
			setView: (view) => {
				state.view = view;
			},
			togglePlayback: () => {},
			setVolume: () => {},
		},
	});
	expect(state.view).toBe("deildu");
	expect(result.tools).toEqual(["set_tv_view"]);
});

test("follow-up requests send normalized prior turns to the model", async () => {
	const history = [
		{ role: "user" as const, content: "Ég heiti Ólafur." },
		{
			role: "assistant" as const,
			content:
				'{"type":"text","title":"Kynning","text":"Gaman að kynnast, Ólafur."}',
		},
		{ role: "user" as const, content: "Hvað heiti ég?" },
	];
	expect(agentHistoryForModel(history)).toEqual([
		history[0],
		{ role: "assistant", content: "Kynning: Gaman að kynnast, Ólafur." },
		history[2],
	]);

	const originalFetch = globalThis.fetch;
	let sentMessages: unknown;
	globalThis.fetch = (async (_input, init) => {
		sentMessages = JSON.parse(String(init?.body)).messages;
		return Response.json({
			choices: [
				{
					message: {
						content:
							'{"type":"text","title":"Minni","text":"Þú heitir Ólafur."}',
					},
				},
			],
		});
	}) as typeof fetch;
	try {
		const state = createDefaultState();
		const result = await chatWithLocalAgent({
			baseUrl: "http://example.test/v1",
			apiKey: "test-key",
			model: "test-model",
			timeoutMs: 5_000,
			history,
			context: {
				getState: () => state,
				listChannels: () => [],
				getNow: () => undefined,
				tuneChannel: () => false,
				setView: () => {},
				togglePlayback: () => {},
				setVolume: () => {},
			},
		});
		expect(result.reply.text).toBe("Þú heitir Ólafur.");
		expect(sentMessages).toEqual([
			expect.objectContaining({ role: "system" }),
			...agentHistoryForModel(history),
		]);
	} finally {
		globalThis.fetch = originalFetch;
	}
});
