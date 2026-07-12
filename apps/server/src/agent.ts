import type { HomeState, RuvChannel, View } from "../../../packages/protocol";

export type AgentHistoryMessage = {
	role: "user" | "assistant";
	content: string;
};

export type AgentReplyType = "text" | "status" | "action" | "list" | "error";

export type AgentReply = {
	type: AgentReplyType;
	title: string;
	text: string;
	data?: Record<string, unknown>;
};

const replyTypes = new Set<AgentReplyType>(["text", "status", "action", "list", "error"]);

function firstJsonObject(value: string) {
	for (let start = 0; start < value.length; start += 1) {
		if (value[start] !== "{") continue;
		let depth = 0;
		let quoted = false;
		let escaped = false;
		for (let index = start; index < value.length; index += 1) {
			const char = value[index];
			if (quoted) {
				if (escaped) escaped = false;
				else if (char === "\\") escaped = true;
				else if (char === '"') quoted = false;
				continue;
			}
			if (char === '"') quoted = true;
			else if (char === "{") depth += 1;
			else if (char === "}" && --depth === 0) {
				try { return JSON.parse(value.slice(start, index + 1)); } catch { break; }
			}
		}
	}
	return undefined;
}

export function parseAgentReply(content: string | null | undefined): AgentReply {
	const fallback = content?.trim() || "Ég fékk ekkert svar frá líkaninu.";
	const cleaned = fallback.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/<\/think>/gi, "").trim();
	try {
		const candidate = (cleaned.split(/\n\s*\n/).find((part) => part.trim().startsWith("{")) || cleaned).replace(/^```(?:json)?\s*|\s*```$/g, "");
		let parsed: unknown;
		try { parsed = JSON.parse(candidate); } catch { parsed = firstJsonObject(cleaned); }
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
		const value = parsed as Record<string, unknown>;
		const type = replyTypes.has(value.type as AgentReplyType) ? value.type as AgentReplyType : "text";
		const title = typeof value.title === "string" && value.title.trim() ? value.title.trim().slice(0, 80) : "TV Kit";
		const text = (typeof value.text === "string" && value.text.trim() ? value.text.trim() : cleaned || fallback).replace(/\*+/g, "").slice(0, 320);
		if (typeof value.text === "string" && value.text.trim().startsWith("{")) {
			const nested = parseAgentReply(value.text);
			if (nested.type !== "text" || nested.title !== "TV Kit") return nested;
		}
		const data = value.data && typeof value.data === "object" && !Array.isArray(value.data) ? value.data as Record<string, unknown> : undefined;
		return data ? { type, title, text, data } : { type, title, text };
	} catch {
		return { type: "text", title: "TV Kit", text: (cleaned || fallback).replace(/\*+/g, "").slice(0, 320) };
	}
}

type ChatMessage =
	| AgentHistoryMessage
	| {
			role: "system" | "tool";
			content: string;
			tool_call_id?: string;
	  }
	| {
			role: "assistant";
			content: string | null;
			tool_calls?: ToolCall[];
	  };

type ToolCall = {
	id: string;
	type: "function";
	function: { name: string; arguments: string };
};

type ToolContext = {
	getState: () => HomeState;
	listChannels: () => RuvChannel[];
	getNow: (slug: string) => unknown;
	tuneChannel: (slug: string) => boolean;
	setView: (view: View) => void;
	togglePlayback: () => void;
	setVolume: (volume: number) => void;
};

const tools = [
	{
		type: "function",
		function: {
			name: "get_tv_state",
			description:
				"Sækir núverandi stöðu TV Kit: sjónvarpsrás, spilun, hljóðstyrk og efni.",
			parameters: {
				type: "object",
				properties: {},
				additionalProperties: false,
			},
		},
	},
	{
		type: "function",
		function: {
			name: "list_tv_channels",
			description:
				"Listar tiltækar RÚV sjónvarpsrásir og dagskrá sem er í beinni.",
			parameters: {
				type: "object",
				properties: {},
				additionalProperties: false,
			},
		},
	},
	{
		type: "function",
		function: {
			name: "tune_tv_channel",
			description: "Stillir TV Kit á tiltekna RÚV sjónvarpsrás með slug.",
			parameters: {
				type: "object",
				properties: {
					slug: {
						type: "string",
						description: "Rásar-slug úr list_tv_channels",
					},
				},
				required: ["slug"],
				additionalProperties: false,
			},
		},
	},
	{
		type: "function",
		function: {
			name: "set_tv_view",
			description: "Opnar síðu í TV Kit: heim, sjónvarp, útvarp, Sarpur, Deildu eða fréttir.",
			parameters: {
				type: "object",
				properties: { view: { type: "string", enum: ["home", "tv", "radio", "media", "deildu", "news"] } },
				required: ["view"],
				additionalProperties: false,
			},
		},
	},
	{
		type: "function",
		function: {
			name: "toggle_playback",
			description: "Gerir hlé á eða heldur áfram með núverandi spilun.",
			parameters: {
				type: "object",
				properties: {},
				additionalProperties: false,
			},
		},
	},
	{
		type: "function",
		function: {
			name: "set_volume",
			description: "Stillir hljóðstyrk TV Kit á tölu frá 0 til 100.",
			parameters: {
				type: "object",
				properties: { volume: { type: "number", minimum: 0, maximum: 100 } },
				required: ["volume"],
				additionalProperties: false,
			},
		},
	},
] as const;

const systemPrompt = `Þú ert staðbundinn TV Kit aðstoðarmaður á íslensku.
Þú hjálpar notandanum að finna efni og stjórna sjónvarpinu með þeim verkfærum sem þú hefur.
Notaðu verkfæri þegar spurningin krefst núverandi stöðu eða aðgerðar. Aðgerðir eins og að stilla rás, skipta um efni, spila, gera hlé eða breyta hljóðstyrk verða alltaf að kalla viðeigandi verkfæri áður en þú svarar. Segðu skýrt frá ef aðgerð tókst ekki.
Ekki finna upp dagskrá, stöðu eða efni. Ekki segjast hafa framkvæmt aðgerð nema verkfærið staðfesti hana.
Ekki sýna API-lykla, kerfisupplýsingar eða innri verkfæraskilaboð.
Öll lokasvör verða að vera einn gildur JSON-hlutur og ekkert annað, án markdown eða kóðagirðinga:
{"type":"text|status|action|list|error","title":"stuttur titill","text":"stutt svar","data":{}}
Veldu type=action eftir framkvæmd, status fyrir stöðu, list fyrir lista og error ef eitthvað mistókst. Hafðu title stuttan og text mest 240 stafi. Notaðu data.items fyrir lista og bættu aðeins við gögnum sem verkfæri staðfesta.`;

function stateSummary(state: HomeState) {
	return {
		power: state.power,
		view: state.view,
		channel: state.channel,
		playing: state.playing,
		volume: state.volume,
		muted: state.muted,
		media: {
			title: state.media.title,
			subtitle: state.media.subtitle,
			source: state.media.source,
			kind: state.media.kind,
			live: state.media.live,
			status: state.media.status,
		},
	};
}

function executeTool(name: string, rawArguments: string, context: ToolContext) {
	let args: Record<string, unknown> = {};
	try {
		const parsed = JSON.parse(rawArguments || "{}");
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
			args = parsed;
	} catch {
		return { ok: false, error: "ógild rök verkfæris" };
	}

	if (name === "get_tv_state")
		return { ok: true, state: stateSummary(context.getState()) };
	if (name === "list_tv_channels") {
		return {
			ok: true,
			channels: context.listChannels().map((channel) => {
				const now = context.getNow(channel.slug) as
					| { current?: { title?: string; category?: string } }
					| undefined;
				return {
					slug: channel.slug,
					name: channel.name,
					current: now?.current ?? null,
				};
			}),
		};
	}
	if (name === "tune_tv_channel") {
		const slug = typeof args.slug === "string" ? args.slug : "";
		if (!slug || !context.tuneChannel(slug))
			return { ok: false, error: "Rás fannst ekki" };
		return { ok: true, state: stateSummary(context.getState()) };
	}
	if (name === "set_tv_view") {
		const view = typeof args.view === "string" ? args.view as View : undefined;
		if (!view || !["home", "tv", "radio", "media", "deildu", "news"].includes(view))
			return { ok: false, error: "Óþekkt síða" };
		context.setView(view);
		return { ok: true, state: stateSummary(context.getState()) };
	}
	if (name === "toggle_playback") {
		context.togglePlayback();
		return { ok: true, state: stateSummary(context.getState()) };
	}
	if (name === "set_volume") {
		const volume = typeof args.volume === "number" ? args.volume : NaN;
		if (!Number.isFinite(volume) || volume < 0 || volume > 100)
			return { ok: false, error: "Hljóðstyrkur þarf að vera 0–100" };
		context.setVolume(Math.round(volume));
		return { ok: true, state: stateSummary(context.getState()) };
	}
	return { ok: false, error: "Óþekkt verkfæri" };
}

function actionReply(name: string, result: unknown): AgentReply | undefined {
	if (!result || typeof result !== "object" || !(result as Record<string, unknown>).ok) return undefined;
	const state = (result as Record<string, unknown>).state as ReturnType<typeof stateSummary> | undefined;
	if (!state) return undefined;
	if (name === "tune_tv_channel") return { type: "action", title: state.media.source, text: `Stilla á ${state.media.source}. ${state.media.title} er í beinni.`, data: { state } };
	if (name === "set_tv_view") return { type: "action", title: "Síða", text: `Opnaði ${state.view}.`, data: { view: state.view } };
	if (name === "set_volume") return { type: "action", title: "Hljóðstyrkur", text: `Hljóðstyrkur er nú ${state.volume}%.`, data: { volume: state.volume } };
	if (name === "toggle_playback") return { type: "action", title: state.playing ? "Spilun" : "Pása", text: state.playing ? "Spilun hafin." : "Spilun í pásu.", data: { playing: state.playing } };
	return undefined;
}

function directActionRequest(message: string, context: ToolContext) {
	const normalized = message.toLocaleLowerCase("is-IS");
	if (/\b(opna\w*|farðu|sýndu\w*)/iu.test(normalized)) {
		const view = ([
			["deildu", "deildu"], ["sarp", "media"], ["útvarp", "radio"],
			["frétt", "news"], ["sjónvarp", "tv"], ["heim", "home"],
		] as const).find(([label]) => normalized.includes(label))?.[1];
		if (view) {
			context.setView(view);
			const result = { ok: true, state: stateSummary(context.getState()) };
			return { reply: actionReply("set_tv_view", result) ?? { type: "action", title: "Síða", text: `Opnaði ${view}.` }, tools: ["set_tv_view"] };
		}
	}
	if (/\b(still\w*|set\w*|skip\w*)/iu.test(normalized)) {
		const normalize = (value: string) => value.toLocaleLowerCase("is-IS").replace(/\s+/g, " ").trim();
		const channel = context.listChannels().slice().sort((a, b) => b.name.length - a.name.length).find((item) => {
			const name = normalize(item.name);
			const slug = normalize(item.slug);
			return normalized.includes(name) || normalized.includes(slug);
		});
		if (channel) {
			const ok = context.tuneChannel(channel.slug);
			const result = { ok, state: stateSummary(context.getState()) };
			return { reply: actionReply("tune_tv_channel", result) ?? { type: "error", title: "Rás", text: "Ekki tókst að stilla rás." }, tools: ["tune_tv_channel"] };
		}
	}
	const volume = normalized.match(/(?:hljóð|volume)[^\d]{0,20}(\d{1,3})/u);
	if (volume) {
		const value = Number(volume[1]);
		if (value >= 0 && value <= 100) {
			context.setVolume(value);
			const result = { ok: true, state: stateSummary(context.getState()) };
			return { reply: actionReply("set_volume", result) ?? { type: "action", title: "Hljóðstyrkur", text: `Hljóðstyrkur er nú ${value}%.` }, tools: ["set_volume"] };
		}
	}
	return undefined;
}

export async function chatWithLocalAgent(input: {
	baseUrl: string;
	apiKey: string;
	model: string;
	timeoutMs: number;
	history: AgentHistoryMessage[];
	context: ToolContext;
}) {
	if (!input.baseUrl || !input.apiKey)
		throw new Error("local model is not configured");
	const messages: ChatMessage[] = [
		{ role: "system", content: systemPrompt },
		...input.history.slice(-40),
	];
	const latestUserMessage = input.history.at(-1)?.content ?? "";
	const requiresTool = /\b(opna\w*|farðu|sýndu\w*|still\w*|set\w*|skip\w*|spil\w*|pás\w*|hæk\w*|læk\w*|hljóð\w*|þagga\w*|mute\w*)/iu.test(latestUserMessage);
	const directAction = directActionRequest(latestUserMessage, input.context);
	if (directAction) return directAction;
	const usedTools: string[] = [];

	for (let round = 0; round < 3; round += 1) {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), input.timeoutMs);
		let response: Response;
		try {
			try {
				response = await fetch(
					`${input.baseUrl.replace(/\/$/, "")}/chat/completions`,
					{
						method: "POST",
						headers: {
							Authorization: `Bearer ${input.apiKey}`,
							"Content-Type": "application/json",
						},
						body: JSON.stringify({
							model: input.model,
							messages,
							tools,
							tool_choice: "auto",
							...(round === 0 && requiresTool ? {} : { response_format: { type: "json_object" } }),
							temperature: 0.2,
							max_tokens: 512,
						}),
						signal: controller.signal,
					},
				);
			} catch (error) {
				throw new Error(
					error instanceof DOMException && error.name === "AbortError"
						? "local model timed out"
						: "local model unavailable",
				);
			}
		} finally {
			clearTimeout(timeout);
		}
		if (!response.ok)
			throw new Error(`local model returned HTTP ${response.status}`);
		const payload = (await response.json()) as {
			choices?: Array<{
				message?: { content?: string | null; tool_calls?: ToolCall[] };
			}>;
		};
		const message = payload.choices?.[0]?.message;
		if (!message) throw new Error("local model returned no message");
		const toolCalls = message.tool_calls ?? [];
		if (!toolCalls.length) {
			const reply = parseAgentReply(message.content);
			return {
				reply: reply.type === "action" && !usedTools.length
					? { type: "error", title: "Ekki framkvæmt", text: "Ég þarf að nota TV Kit verkfæri áður en aðgerð er staðfest." }
					: reply,
				tools: usedTools,
			};
		}

		messages.push({
			role: "assistant",
			content: message.content ?? null,
			tool_calls: toolCalls,
		});
		let completedAction: AgentReply | undefined;
		for (const call of toolCalls.slice(0, 5)) {
			usedTools.push(call.function.name);
			const result = executeTool(
				call.function.name,
				call.function.arguments,
				input.context,
			);
			completedAction = actionReply(call.function.name, result) || completedAction;
			messages.push({
				role: "tool",
				tool_call_id: call.id,
				content: JSON.stringify(result),
			});
		}
		if (completedAction) return { reply: completedAction, tools: usedTools };
	}
	return {
		reply: {
			type: "error",
			title: "Verkfæri",
			text: "Ég gat ekki lokið verkfærakeðjunni. Prófaðu aftur.",
		},
		tools: usedTools,
	};
}
