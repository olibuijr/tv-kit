import type { HomeState, RuvChannel } from "../../../packages/protocol";

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

export function parseAgentReply(content: string | null | undefined): AgentReply {
	const fallback = content?.trim() || "Ég fékk ekkert svar frá líkaninu.";
	try {
		const parsed = JSON.parse(fallback.replace(/^```(?:json)?\s*|\s*```$/g, ""));
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
		const value = parsed as Record<string, unknown>;
		const type = replyTypes.has(value.type as AgentReplyType) ? value.type as AgentReplyType : "text";
		const title = typeof value.title === "string" && value.title.trim() ? value.title.trim().slice(0, 80) : "TV Kit";
		const text = (typeof value.text === "string" && value.text.trim() ? value.text.trim() : fallback).replace(/\*+/g, "").slice(0, 320);
		const data = value.data && typeof value.data === "object" && !Array.isArray(value.data) ? value.data as Record<string, unknown> : undefined;
		return data ? { type, title, text, data } : { type, title, text };
	} catch {
		return { type: "text", title: "TV Kit", text: fallback.slice(0, 320) };
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
Notaðu verkfæri þegar spurningin krefst núverandi stöðu eða aðgerðar. Segðu skýrt frá ef aðgerð tókst ekki.
Ekki finna upp dagskrá, stöðu eða efni. Ekki segjast hafa gert aðgerð nema verkfærið staðfesti hana.
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
							response_format: { type: "json_object" },
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
		if (!toolCalls.length)
			return {
				reply: parseAgentReply(message.content),
				tools: usedTools,
			};

		messages.push({
			role: "assistant",
			content: message.content ?? null,
			tool_calls: toolCalls,
		});
		for (const call of toolCalls.slice(0, 5)) {
			usedTools.push(call.function.name);
			const result = executeTool(
				call.function.name,
				call.function.arguments,
				input.context,
			);
			messages.push({
				role: "tool",
				tool_call_id: call.id,
				content: JSON.stringify(result),
			});
		}
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
