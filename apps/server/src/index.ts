import type { ServerWebSocket } from "bun";
import { resolve } from "node:path";
import {
	DEILDU_PAGE_SIZE,
	type CastMode,
	type CastSource,
	type HomeState,
	type MediaItem,
	type PlayerPanel,
	type Programme,
	type Station,
} from "../../../packages/protocol";
import { parseCommandMessage } from "./commands";
import { chatWithLocalAgent, parseAgentReply } from "./agent";
import { config } from "./config";
import { deilduCleanupState } from "./deilduCleanupJob";
import {
	appendAgentChatMessage,
	getCache,
	listAgentChatMessages,
	listRadioFavorites,
	listRadioStations,
	loadState,
	recordPlayback,
	saveState,
	setCache,
	toggleRadioFavorite,
	upsertMedia,
} from "./db";
import {
	dashboardContent,
	getRuvEpisode,
	getRuvNewsArticle,
	getRuvNow,
	getRuvProgram,
	getWatchProgress,
	listContinueWatching,
	listProgramFavorites,
	listRuvChannels,
	listRuvEpg,
	listRuvEpisodes,
	listRuvNews,
	listRuvPrograms,
	listTvFavorites,
	lastSuccessfulRuvScrape,
	resumePosition,
	saveWatchProgress,
	startRuvScrape,
	finishRuvScrape,
	toggleProgramFavorite,
	toggleTvFavorite,
} from "./ruvdb";
import {
	corsHeaders,
	preflightResponse,
	requestOriginAllowed,
} from "./httpAccess";
import { RuvScheduler, type RuvJob } from "./ruvScheduler";
import { createDefaultState, normalizeHomeState } from "./state";
import {
	getTorrentMedia,
	listTorrentMedia,
	serveTorrentMedia,
	serveTorrentMediaStream,
	startTorrentMediaPlayback,
} from "./torrentMedia";
import {
	getDeilduItem,
	listDeilduCategories,
	listDeilduItems,
	scrapeDeildu,
	scrapeState,
} from "./deilduScraper";
import {
	serveDeilduStream,
	startDeilduPlayback,
	stopDeilduStream,
} from "./deilduStream";

process.title = "tvserverd";

const defaultState = createDefaultState();
const storedState = loadState();
const state: HomeState = normalizeHomeState(storedState ?? defaultState, {
	radio: listRadioFavorites(),
	tv: listTvFavorites(),
	programs: listProgramFavorites(),
});
saveState(state);

const clients = new Set<ServerWebSocket<unknown>>();
let castPrevious: {
	media: MediaItem;
	playing: boolean;
	view: HomeState["view"];
	previousView: HomeState["previousView"];
} | null = null;
const broadcast = () => {
	saveState(state);
	const payload = JSON.stringify({ type: "state", state });
	for (const client of clients) client.send(payload);
};

const agentChatMessages = () =>
	listAgentChatMessages().map((message) =>
		message.role === "assistant"
			? {
					id: message.id,
					role: message.role,
					createdAt: message.createdAt,
					reply: parseAgentReply(message.content),
				}
			: message,
	);

const radioStations = () => listRadioStations();
const radioGuide = (station: Station): Programme[] => [
	{
		start: "Núna",
		title: "Bein útsending",
		detail: `${station.name}${station.terrestrial ? ` - ${station.frequency.toFixed(1)} FM` : " - á netinu"}`,
		current: true,
	},
	{
		start: "Næst",
		title: "Dagskrárupplýsingar ekki tiltækar",
		detail: `${config.radioSourceName} veitir aðeins beina strauminn`,
	},
];

function tuneRadio(id: number) {
	const station = radioStations().find((item) => item.id === id);
	if (!station) return false;
	state.previousView = state.view;
	state.view = "radio";
	state.playing = true;
	state.media = {
		id: `radio-${station.id}`,
		kind: "radio",
		title: station.name,
		subtitle: station.terrestrial
			? `${station.frequency.toFixed(1)} FM`
			: "Á netinu",
		source: config.radioSourceName,
		src: station.streamUrl,
		artwork: station.logoUrl,
		live: true,
		frequency: station.frequency,
		currentTime: 0,
		duration: 0,
		playbackRate: 1,
		subtitleTrack: "Slökkt",
		audioTrack: "Bein útsending",
		subtitles: [],
		textTracks: [],
		audioTracks: ["Bein útsending"],
		epg: radioGuide(station),
		panel: null,
		fullscreen: false,
		favorite: state.radioFavorites.includes(station.id),
		status: "loading",
	};
	upsertMedia(state.media);
	recordPlayback(state.media);
	state.lastAction = `Spila ${station.name}`;
	broadcast();
	return true;
}

function stepRadio(direction: number) {
	const stations = radioStations();
	if (!stations.length) return;
	const currentId = Number(state.media.id.replace("radio-", ""));
	const current = Math.max(
		0,
		stations.findIndex((station) => station.id === currentId),
	);
	tuneRadio(
		stations[(current + direction + stations.length) % stations.length].id,
	);
}

const time = (value: number) =>
	new Intl.DateTimeFormat("is-IS", {
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
		timeZone: config.timezone,
	}).format(new Date(value));
const eventDetail = (event: {
	category: string;
	description: string;
	startTime: number;
	endTime: number | null;
}) => {
	const minutes = event.endTime
		? Math.max(1, Math.round((event.endTime - event.startTime) / 60_000))
		: 0;
	return [event.category, minutes ? `${minutes} mín.` : "", event.description]
		.filter(Boolean)
		.join(" · ");
};

function tuneTvSlug(slug: string) {
	const channels = listRuvChannels("tv");
	const index = channels.findIndex((channel) => channel.slug === slug);
	const channel = channels[index];
	if (!channel) return false;
	const now = getRuvNow(slug);
	const current = now?.current;
	const programme: Programme[] = [current, ...(now?.upcoming ?? [])]
		.filter(Boolean)
		.map((event, itemIndex) => ({
			start: time(event!.startTime),
			title: event!.title,
			detail: eventDetail(event!),
			current: itemIndex === 0 && Boolean(current),
		}));
	const elapsed = current
		? Math.max(0, (Date.now() - current.startTime) / 1000)
		: 0;
	const duration = current?.endTime
		? Math.max(0, (current.endTime - current.startTime) / 1000)
		: 0;
	state.previousView = state.view;
	state.view = "tv";
	state.channel = index + 1;
	state.playing = true;
	state.media = {
		id: `ruv-channel-${channel.slug}`,
		kind: "tv",
		title: current?.title ?? channel.name,
		subtitle: current?.category || "Bein útsending",
		source: channel.name,
		src: channel.streamUrl,
		artwork: current?.watchFromStart?.image ?? "",
		live: true,
		currentTime: elapsed,
		duration,
		playbackRate: 1,
		subtitleTrack: "Slökkt",
		audioTrack: "Bein útsending",
		subtitles: [],
		textTracks: [],
		audioTracks: ["Bein útsending"],
		epg: programme,
		panel: null,
		fullscreen: false,
		favorite: state.tvFavorites.includes(channel.slug),
		status: "loading",
	};
	upsertMedia(state.media);
	recordPlayback(state.media);
	state.lastAction = `Spila ${channel.name}`;
	broadcast();
	return true;
}

function tuneTvNumber(number: number) {
	const channels = listRuvChannels("tv");
	if (!Number.isSafeInteger(number) || number < 1 || number > channels.length)
		return false;
	return tuneTvSlug(channels[number - 1].slug);
}

function stepTv(direction: number) {
	const channels = listRuvChannels("tv");
	if (!channels.length) return;
	const currentSlug = state.media.id.replace("ruv-channel-", "");
	const current = Math.max(
		0,
		channels.findIndex((channel) => channel.slug === currentSlug),
	);
	tuneTvSlug(
		channels[(current + direction + channels.length) % channels.length].slug,
	);
}

function playRuvEpisode(id: string) {
	const episode = getRuvEpisode(id);
	if (!episode?.available || !episode.fileUrl) return false;
	const resumeAt = resumePosition(
		getWatchProgress(episode.id),
		episode.duration,
	);
	const kind =
		getRuvProgram(episode.programId)?.kind === "movie" ? "movie" : "video";
	state.previousView = state.view;
	state.view = "media";
	state.playing = true;
	state.media = {
		id: `ruv-episode-${episode.id}`,
		kind,
		title: episode.programTitle,
		subtitle: episode.title,
		source: "RÚV Sarpurinn",
		src: episode.fileUrl,
		artwork: episode.image,
		live: false,
		currentTime: resumeAt,
		duration: episode.duration,
		playbackRate: 1,
		subtitleTrack: "Slökkt",
		audioTrack: "Aðalhljóð",
		subtitles: ["Slökkt", ...episode.textTracks.map((track) => track.label)],
		textTracks: episode.textTracks,
		audioTracks: ["Aðalhljóð"],
		epg: [],
		panel: null,
		fullscreen: false,
		favorite: state.programFavorites.includes(episode.programId),
		status: "loading",
	};
	upsertMedia(state.media);
	recordPlayback(state.media);
	state.lastAction =
		resumeAt > 0
			? `Halda áfram: ${episode.programTitle}`
			: `Spila ${episode.programTitle}`;
	broadcast();
	return true;
}

function persistEpisodeProgress() {
	if (!state.media.id.startsWith("ruv-episode-")) return;
	saveWatchProgress({
		episodeId: state.media.id.replace("ruv-episode-", ""),
		position: state.media.currentTime,
		duration: state.media.duration,
	});
}

function playRuvProgram(id: number) {
	const episode = getRuvProgram(id)?.latestEpisode;
	return episode ? playRuvEpisode(episode.id) : false;
}

async function playTorrentMedia(id: string) {
	const item = getTorrentMedia(id);
	if (!item) return false;
	state.previousView = state.view;
	state.view = "media";
	state.playing = false;
	state.media = {
		id: `torrent-${item.id}`,
		kind: "movie",
		title: item.title,
		subtitle: "Undirbý torrent-straum…",
		source: item.source,
		src: "",
		artwork: item.artwork,
		live: false,
		currentTime: 0,
		duration: item.duration,
		playbackRate: 1,
		subtitleTrack: "Slökkt",
		audioTrack: "Aðalhljóð",
		subtitles: ["Slökkt"],
		textTracks: [],
		audioTracks: ["Aðalhljóð"],
		epg: [],
		panel: null,
		fullscreen: true,
		favorite: false,
		status: "loading",
	};
	state.lastAction = `Undirbý torrent: ${item.title}`;
	broadcast();
	try {
		const playback = await startTorrentMediaPlayback(id, broadcast);
		state.media = {
			...state.media,
			kind: playback.kind,
			subtitle: item.license,
			src: playback.src,
			status: "loading",
		};
		state.playing = true;
		state.lastAction = `Spila torrent: ${playback.title}`;
		upsertMedia(state.media);
		recordPlayback(state.media);
		broadcast();
		return true;
	} catch (error) {
		await stopDeilduStream();
		const message =
			error instanceof Error ? error.message : "Torrent-spilun mistókst";
		state.playing = false;
		state.media.status = "error";
		state.media.subtitle = message;
		state.lastAction = message;
		broadcast();
		return false;
	}
}

async function playDeilduItem(id: number) {
	const item = getDeilduItem(id);
	if (!item || !item.playable) return false;
	state.previousView = state.view;
	state.view = "deildu";
	state.playing = false;
	state.media = {
		id: `deildu-${item.id}`,
		kind:
			item.mediaKind === "audio"
				? "music"
				: item.mediaKind === "tv"
					? "tv"
					: "movie",
		title: item.title,
		subtitle: "Undirbý torrent-straum…",
		source: `Deildu · ${item.categoryName}`,
		src: "",
		artwork: "",
		live: false,
		currentTime: 0,
		duration: 0,
		playbackRate: 1,
		subtitleTrack: "Slökkt",
		audioTrack: "Aðalhljóð",
		subtitles: ["Slökkt"],
		textTracks: [],
		audioTracks: ["Aðalhljóð"],
		epg: [],
		panel: null,
		fullscreen: true,
		favorite: false,
		status: "loading",
	};
	state.lastAction = `Tengi við Deildu: ${item.title}`;
	broadcast();
	try {
		const playback = await startDeilduPlayback(id, broadcast);
		const refreshed = getDeilduItem(id) ?? item;
		state.media = {
			...state.media,
			kind: playback.kind,
			title: playback.title,
			subtitle: playback.fileName,
			source: `Deildu · ${refreshed.categoryName}`,
			src: playback.src,
			status: "loading",
		};
		state.playing = true;
		state.lastAction = `Spila af Deildu: ${playback.title}`;
		upsertMedia(state.media);
		recordPlayback(state.media);
		broadcast();
		return true;
	} catch (error) {
		await stopDeilduStream();
		const message =
			error instanceof Error ? error.message : "Deildu-spilun mistókst";
		state.playing = false;
		state.media.status = "error";
		state.media.subtitle = message;
		state.lastAction = message;
		broadcast();
		return false;
	}
}

function castSourceLabel(source: CastSource) {
	if (source === "airplay") return "Apple AirPlay";
	if (source === "miracast") return "Android Miracast";
	return "Android Cast";
}

function startCast(input: {
	source: CastSource;
	mode: CastMode;
	url: string;
	title: string;
	subtitle: string;
	deviceName: string;
	duration: number;
}) {
	if (!/^https?:\/\/[^\s]{1,2000}$/.test(input.url) || input.url.includes("@"))
		return false;
	castPrevious ??= {
		media: { ...state.media },
		playing: state.playing,
		view: state.view,
		previousView: state.previousView,
	};
	state.cast = {
		source: input.source,
		mode: input.mode,
		deviceName: input.deviceName,
		startedAt: Date.now(),
	};
	state.previousView = state.view;
	state.view = "media";
	state.playing = true;
	state.media = {
		id: `cast-${Date.now()}`,
		kind: "video",
		title: input.title,
		subtitle: input.subtitle,
		source: castSourceLabel(input.source),
		src: input.url,
		artwork: "",
		live: input.mode === "mirror" || input.duration === 0,
		currentTime: 0,
		duration: input.duration,
		playbackRate: 1,
		subtitleTrack: "Slökkt",
		audioTrack: "Aðalhljóð",
		subtitles: [],
		audioTracks: ["Aðalhljóð"],
		epg: [],
		panel: null,
		fullscreen: true,
		favorite: false,
		status: "loading",
	};
	state.lastAction = `${input.source} cast: ${input.title}`;
	upsertMedia(state.media);
	broadcast();
	return true;
}

function stopCast() {
	if (!state.cast) return false;
	const previous = castPrevious;
	castPrevious = null;
	state.cast = null;
	if (previous) {
		state.media = previous.media;
		state.playing = previous.playing;
		state.view = previous.view;
		state.previousView = previous.previousView;
	} else {
		state.playing = false;
		state.media.fullscreen = false;
	}
	state.lastAction = "Cast stöðvað";
	broadcast();
	return true;
}

type Palette = "morning" | "day" | "evening" | "night";
type SolarCache = { fetchedAt: number; days: any[]; source: string };
let solarCache = getCache<SolarCache>("solar")?.value;
const dateAt = (offset: number) =>
	new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

async function solarStatus() {
	if (!solarCache || Date.now() - solarCache.fetchedAt > config.solarCacheMs) {
		try {
			const url = new URL(config.solarApiUrl);
			url.search = new URLSearchParams({
				lat: config.latitude,
				lng: config.longitude,
				tz: config.timezone,
				time_format: "unix",
				date_start: dateAt(-1),
				date_end: dateAt(1),
			}).toString();
			const data = await fetch(url).then((response) => {
				if (!response.ok) throw new Error("solar API unavailable");
				return response.json();
			});
			solarCache = {
				fetchedAt: Date.now(),
				days: data.days,
				source: "sunrise-sunset.org",
			};
			setCache("solar", solarCache, solarCache.fetchedAt);
		} catch {
			const days = [-1, 0, 1].map((offset) => {
				const date = dateAt(offset);
				const base = Date.parse(`${date}T00:00:00Z`) / 1000;
				return {
					date,
					sunrise: base + 6 * 3600,
					sunset: base + 18 * 3600,
					solar_noon: base + 12 * 3600,
					day_length: 12 * 3600,
					civil_twilight_begin: base + 5 * 3600,
					civil_twilight_end: base + 19 * 3600,
					golden_hour: {
						morning: { end: base + 7 * 3600 },
						evening: { begin: base + 17 * 3600 },
					},
					solar_position: { solar_noon_altitude: 0 },
					moon_phase: "Unknown",
					moon_illumination: 0,
				};
			});
			solarCache = { fetchedAt: Date.now(), days, source: "local fallback" };
			setCache("solar", solarCache, solarCache.fetchedAt);
		}
	}

	const frames: { at: number; theme: Palette }[] = [];
	for (const day of solarCache.days) {
		const sunrise = day.sunrise;
		const sunset = day.sunset;
		const dawn = day.civil_twilight_begin ?? sunrise - 90 * 60;
		const morningEnd = day.golden_hour?.morning?.end ?? sunrise + 90 * 60;
		const dayStart = morningEnd + 60 * 60;
		const eveningStart = day.golden_hour?.evening?.begin ?? sunset - 90 * 60;
		const eveningEnd = day.civil_twilight_end ?? sunset + 45 * 60;
		frames.push(
			{ at: dawn, theme: "night" },
			{ at: sunrise, theme: "morning" },
			{ at: morningEnd, theme: "morning" },
			{ at: dayStart, theme: "day" },
			{ at: eveningStart, theme: "day" },
			{ at: sunset, theme: "evening" },
			{ at: eveningEnd, theme: "evening" },
			{ at: eveningEnd + 60 * 60, theme: "night" },
		);
	}
	frames.sort((a, b) => a.at - b.at);
	const now = Date.now() / 1000;
	const before =
		[...frames].reverse().find((frame) => frame.at <= now) ?? frames[0];
	const after = frames.find((frame) => frame.at > now) ?? frames.at(-1)!;
	const progress =
		before.theme === after.theme
			? 0
			: Math.max(0, Math.min(1, (now - before.at) / (after.at - before.at)));
	const nextChange =
		frames.find((frame) => frame.at > now && frame.theme !== before.theme) ??
		after;
	const today =
		solarCache.days.find((day) => day.date === dateAt(0)) ?? solarCache.days[1];
	return {
		location: config.location,
		source: solarCache.source,
		from: before.theme,
		to: after.theme,
		progress,
		sunrise: today.sunrise,
		sunset: today.sunset,
		solarNoon: today.solar_noon,
		dayLength: today.day_length,
		solarNoonAltitude: today.solar_position?.solar_noon_altitude ?? 0,
		moonPhase: today.moon_phase,
		moonIllumination: today.moon_illumination,
		nextTheme: nextChange.theme,
		nextChangeAt: nextChange.at,
	};
}

const corsJson = (
	request: Request,
	data: unknown,
	maxAgeSec = 300,
	status = 200,
) =>
	Response.json(data, {
		status,
		headers: corsHeaders(request, config.allowedOrigins, maxAgeSec),
	});
const errorResponse = (request: Request, message: string, status: number) =>
	corsJson(request, { error: message }, 0, status);
const badRequest = (request: Request, message: string) =>
	errorResponse(request, message, 400);
const boundedInt = (
	value: string | null,
	fallback: number,
	min: number,
	max: number,
) => {
	if (value === null) return fallback;
	if (!/^\d+$/.test(value)) return null;
	const number = Number(value);
	return Number.isSafeInteger(number) && number >= min && number <= max
		? number
		: null;
};

const server = Bun.serve({
	port: config.port,
	hostname: "0.0.0.0",
	idleTimeout: Math.min(
		255,
		Math.ceil(config.deilduStreamRangeWaitMs / 1_000) + 5,
	),
	async fetch(req, server) {
		let url: URL;
		try {
			url = new URL(req.url);
		} catch {
			return errorResponse(req, "invalid URL", 400);
		}
		if (url.pathname === "/cast/session") {
			if (
				!config.castIngressToken ||
				req.headers.get("x-tv-kit-cast-token") !== config.castIngressToken
			)
				return errorResponse(req, "cast ingress is not configured", 503);
			if (req.method === "DELETE")
				return stopCast()
					? corsJson(req, { ok: true })
					: corsJson(req, { ok: true, active: false });
			if (req.method !== "POST")
				return errorResponse(req, "method not allowed", 405);
			let payload: unknown;
			try {
				payload = await req.json();
			} catch {
				return badRequest(req, "invalid JSON");
			}
			if (!payload || typeof payload !== "object" || Array.isArray(payload))
				return badRequest(req, "object body required");
			const input = payload as Record<string, unknown>;
			const source = input.source;
			const mode = input.mode;
			const urlValue = input.url;
			if (
				(source !== "airplay" &&
					source !== "android-cast" &&
					source !== "miracast") ||
				(mode !== "stream" && mode !== "mirror") ||
				typeof urlValue !== "string"
			) {
				return badRequest(req, "source, mode, and url are invalid");
			}
			const title =
				typeof input.title === "string" && input.title.length <= 256
					? input.title
					: "Myndefni úr tæki";
			const subtitle =
				typeof input.subtitle === "string" && input.subtitle.length <= 256
					? input.subtitle
					: "";
			const deviceName =
				typeof input.deviceName === "string" && input.deviceName.length <= 128
					? input.deviceName
					: "Óþekkt tæki";
			const duration =
				typeof input.duration === "number" &&
				Number.isFinite(input.duration) &&
				input.duration >= 0 &&
				input.duration <= Number.MAX_SAFE_INTEGER
					? input.duration
					: 0;
			return startCast({
				source,
				mode,
				url: urlValue,
				title,
				subtitle,
				deviceName,
				duration,
			})
				? corsJson(req, { ok: true, state })
				: badRequest(req, "cast URL is invalid");
		}
		if (url.pathname === "/ws") {
			if (req.method !== "GET")
				return errorResponse(req, "method not allowed", 405);
			if (!requestOriginAllowed(req, config.allowedOrigins, false))
				return errorResponse(req, "origin not allowed", 403);
			return server.upgrade(req)
				? undefined
				: errorResponse(req, "WebSocket upgrade required", 400);
		}
		if (req.method === "OPTIONS")
			return preflightResponse(req, config.allowedOrigins);
		if (!requestOriginAllowed(req, config.allowedOrigins))
			return errorResponse(req, "origin not allowed", 403);
		if (url.pathname === "/agent/tasks/deildu-import") {
			if (req.method === "GET")
				return corsJson(
					req,
					{ task: deilduCleanupState, scrape: scrapeState },
					0,
				);
			if (req.method !== "POST")
				return errorResponse(req, "method not allowed", 405);
			if (!scrapeState.running && !deilduCleanupState.running)
				void scrapeDeildu(config.deilduScrapePages, broadcast);
			return corsJson(
				req,
				{ accepted: true, task: deilduCleanupState, scrape: scrapeState },
				0,
				202,
			);
		}
		if (url.pathname === "/agent/chat") {
			if (req.method === "GET")
				return corsJson(req, { messages: agentChatMessages() }, 0);
			if (req.method !== "POST")
				return errorResponse(req, "method not allowed", 405);
			if (!config.localLlmBaseUrl || !config.localLlmApiKey)
				return errorResponse(req, "local agent is not configured", 503);
			let payload: unknown;
			try {
				payload = await req.json();
			} catch {
				return badRequest(req, "invalid JSON");
			}
			const message =
				payload &&
				typeof payload === "object" &&
				!Array.isArray(payload) &&
				typeof (payload as Record<string, unknown>).message === "string"
					? (payload as Record<string, string>).message.trim()
					: "";
			if (!message || message.length > 2_000)
				return badRequest(req, "message must be 1–2000 characters");
			const history = listAgentChatMessages(40).map(({ role, content }) => ({
				role,
				content,
			}));
			appendAgentChatMessage("user", message);
			try {
				const result = await chatWithLocalAgent({
					baseUrl: config.localLlmBaseUrl,
					apiKey: config.localLlmApiKey,
					model: config.localLlmModel,
					timeoutMs: config.localLlmTimeoutMs,
					history: [...history, { role: "user", content: message }],
					context: {
						getState: () => state,
						listChannels: () => listRuvChannels("tv"),
						getNow: (slug) => getRuvNow(slug),
						tuneChannel: (slug) => tuneTvSlug(slug),
						setView: (view) => {
							state.previousView = state.view;
							state.view = view;
							state.newsArticleId = 0;
							state.lastAction = `Opnaði ${view}`;
							broadcast();
						},
						togglePlayback: () => {
							state.playing = !state.playing;
							state.lastAction = state.playing
								? "Spilun hafin"
								: "Spilun í pásu";
							broadcast();
						},
						setVolume: (volume) => {
							state.volume = volume;
							state.lastAction = `Hljóðstyrkur ${volume}%`;
							broadcast();
						},
					},
				});
				appendAgentChatMessage("assistant", JSON.stringify(result.reply));
				return corsJson(
					req,
					{
						message: result.reply,
						tools: result.tools,
						messages: agentChatMessages(),
					},
					0,
				);
			} catch (error) {
				console.error(
					"local agent request failed",
					error instanceof Error ? error.message : error,
				);
				return errorResponse(req, "local agent request failed", 502);
			}
		}
		const torrentMatch = url.pathname.match(
			/^\/torrent\/media\/([a-z0-9-]{1,64})(?:\/(poster))?$/,
		);
		if (torrentMatch) {
			if (req.method !== "GET" && req.method !== "HEAD")
				return errorResponse(req, "method not allowed", 405);
			return serveTorrentMedia(
				req,
				torrentMatch[1],
				torrentMatch[2] === "poster" ? "poster" : "video",
			);
		}
		const torrentStreamMatch = url.pathname.match(
			/^\/torrent\/media\/stream\/([a-z0-9-]{1,64})$/,
		);
		if (torrentStreamMatch) {
			if (req.method !== "GET" && req.method !== "HEAD")
				return errorResponse(req, "method not allowed", 405);
			return serveTorrentMediaStream(req, torrentStreamMatch[1]);
		}
		const deilduStreamMatch = url.pathname.match(
			/^\/deildu\/stream\/(\d{1,12})$/,
		);
		if (deilduStreamMatch) {
			if (req.method !== "GET" && req.method !== "HEAD")
				return errorResponse(req, "method not allowed", 405);
			return serveDeilduStream(req, Number(deilduStreamMatch[1]));
		}
		if (req.method !== "GET") {
			const response = errorResponse(req, "method not allowed", 405);
			response.headers.set("Allow", "GET, OPTIONS");
			return response;
		}
		if (url.pathname === "/health")
			return corsJson(
				req,
				{ ok: true, service: "tvserverd", clients: clients.size, state },
				0,
			);
		if (url.pathname === "/solar")
			return solarStatus().then((data) => corsJson(req, data));
		if (url.pathname === "/radio/stations")
			return corsJson(req, {
				source: config.radioSourceName,
				stations: radioStations(),
			});
		if (url.pathname === "/dashboard/content") {
			const deilduPage = boundedInt(
				url.searchParams.get("deilduPage"),
				1,
				1,
				10_000,
			);
			const deilduCategory = boundedInt(
				url.searchParams.get("deilduCategory"),
				0,
				0,
				Number.MAX_SAFE_INTEGER,
			);
			const deilduPageSize = boundedInt(
				url.searchParams.get("deilduPageSize"),
				DEILDU_PAGE_SIZE,
				1,
				100,
			);
			if (
				deilduPage === null ||
				deilduCategory === null ||
				deilduPageSize === null
			)
				return badRequest(req, "invalid Deildu pagination");
			const deilduCategories = listDeilduCategories();
			if (
				deilduCategory > 0 &&
				!deilduCategories.some((category) => category.id === deilduCategory)
			)
				return badRequest(req, "unknown Deildu category");
			const deildu = listDeilduItems(
				deilduPage,
				deilduPageSize,
				deilduCategory,
			);
			return corsJson(
				req,
				{
					...dashboardContent(),
					torrentMovies: listTorrentMedia(),
					deilduCategories,
					deilduItems: deildu.items,
					deilduPagination: deildu.pagination,
					deilduScrape: { ...scrapeState },
				},
				60,
			);
		}
		if (url.pathname === "/ruv/continue") {
			const limit = boundedInt(url.searchParams.get("limit"), 12, 1, 50);
			if (limit === null)
				return badRequest(req, "limit must be an integer from 1 to 50");
			return corsJson(req, { items: listContinueWatching(limit) }, 0);
		}
		if (url.pathname === "/ruv/channels")
			return corsJson(req, { channels: listRuvChannels() });
		if (url.pathname === "/ruv/now") {
			const channel = url.searchParams.get("channel");
			if (!channel || !/^[a-z0-9-]{1,24}$/.test(channel))
				return badRequest(req, "valid channel query param required");
			const result = getRuvNow(channel);
			return result
				? corsJson(req, result, 30)
				: errorResponse(req, "not found", 404);
		}
		if (url.pathname === "/ruv/programs") {
			const limit = boundedInt(url.searchParams.get("limit"), 40, 1, 100);
			if (limit === null)
				return badRequest(req, "limit must be an integer from 1 to 100");
			const featured = url.searchParams.get("featured") !== "false";
			return corsJson(req, { programs: listRuvPrograms(limit, featured) });
		}
		const programMatch = url.pathname.match(/^\/ruv\/programs\/(\d+)$/);
		if (programMatch) {
			const id = boundedInt(programMatch[1], 0, 1, Number.MAX_SAFE_INTEGER);
			if (id === null) return badRequest(req, "invalid program id");
			const program = getRuvProgram(id);
			return program
				? corsJson(req, { program, episodes: listRuvEpisodes(id) })
				: errorResponse(req, "not found", 404);
		}
		if (url.pathname === "/ruv/epg") {
			const channel = url.searchParams.get("channel");
			if (!channel || !listRuvChannels().some((item) => item.slug === channel))
				return badRequest(req, "known channel query param required");
			const from = boundedInt(
				url.searchParams.get("from"),
				Date.now(),
				0,
				Number.MAX_SAFE_INTEGER,
			);
			const to = boundedInt(
				url.searchParams.get("to"),
				Date.now() + 86_400_000,
				0,
				Number.MAX_SAFE_INTEGER,
			);
			const limit = boundedInt(url.searchParams.get("limit"), 200, 1, 500);
			if (
				from === null ||
				to === null ||
				limit === null ||
				to <= from ||
				to - from > 31 * 86_400_000
			)
				return badRequest(req, "invalid EPG range or limit");
			return corsJson(
				req,
				{ channel, events: listRuvEpg(channel, from, to, limit) },
				60,
			);
		}
		if (url.pathname === "/ruv/news") {
			const category = url.searchParams.get("category") || undefined;
			const limit = boundedInt(url.searchParams.get("limit"), 40, 1, 100);
			if (limit === null || (category && !/^[a-z0-9-]{1,64}$/.test(category)))
				return badRequest(req, "invalid category or limit");
			return corsJson(req, { articles: listRuvNews(limit, category) }, 120);
		}
		const articleMatch = url.pathname.match(/^\/ruv\/news\/(\d+)$/);
		if (articleMatch) {
			const id = boundedInt(articleMatch[1], 0, 1, Number.MAX_SAFE_INTEGER);
			if (id === null) return badRequest(req, "invalid article id");
			const article = getRuvNewsArticle(id);
			return article
				? corsJson(req, { article }, 300)
				: errorResponse(req, "not found", 404);
		}
		return corsJson(req, { service: "tvserverd", websocket: "/ws" }, 0);
	},
	websocket: {
		open(ws) {
			clients.add(ws);
			ws.send(JSON.stringify({ type: "state", state }));
		},
		close(ws) {
			clients.delete(ws);
		},
		message(ws, raw) {
			let decoded: unknown;
			try {
				decoded = JSON.parse(String(raw));
			} catch {
				return;
			}
			if (
				decoded &&
				typeof decoded === "object" &&
				"type" in decoded &&
				decoded.type === "ping"
			) {
				ws.send(JSON.stringify({ type: "pong" }));
				return;
			}
			const message = parseCommandMessage(decoded);
			if (!message) return;

			if (message.action === "news-article") {
				if (message.value && !getRuvNewsArticle(message.value)) return;
				state.previousView = state.view;
				state.view = "news";
				state.newsArticleId = message.value;
				state.lastAction = message.label || "Frétt";
				broadcast();
				return;
			}
			if (message.action === "news-scroll") {
				const payload = JSON.stringify({
					type: "news-scroll",
					value: message.value,
				});
				for (const client of clients) if (client !== ws) client.send(payload);
				return;
			}
			if (message.action === "channel") {
				tuneTvNumber(message.value);
				return;
			}
			if (message.action === "ruv-channel") {
				tuneTvSlug(message.value);
				return;
			}
			if (message.action === "ruv-episode") {
				playRuvEpisode(message.value);
				return;
			}
			if (message.action === "torrent-media") {
				void playTorrentMedia(message.value);
				return;
			}
			if (message.action === "deildu-scrape") {
				void scrapeDeildu(message.value?.pages, () => {
					state.lastAction = scrapeState.message;
					broadcast();
				});
				return;
			}
			if (message.action === "deildu-play") {
				void playDeilduItem(message.value);
				return;
			}
			if (message.action === "deildu-category") {
				if (
					message.value &&
					!listDeilduCategories().some(
						(category) => category.id === message.value,
					)
				)
					return;
				state.previousView = state.view;
				state.view = "deildu";
				state.deilduCategoryId = message.value;
				state.lastAction = message.label || "Deildu-flokkur";
				broadcast();
				return;
			}
			if (message.action === "ruv-program") {
				playRuvProgram(message.value);
				return;
			}
			if (message.action === "radio") {
				tuneRadio(message.value);
				return;
			}
			if (message.action === "radio-favorite") {
				if (!radioStations().some((station) => station.id === message.value))
					return;
				toggleRadioFavorite(message.value);
				state.radioFavorites = listRadioFavorites();
				if (state.media.id === `radio-${message.value}`)
					state.media.favorite = state.radioFavorites.includes(message.value);
			} else if (message.action === "tv-favorite") {
				if (
					!listRuvChannels("tv").some(
						(channel) => channel.slug === message.value,
					)
				)
					return;
				toggleTvFavorite(message.value);
				state.tvFavorites = listTvFavorites();
				if (state.media.id === `ruv-channel-${message.value}`)
					state.media.favorite = state.tvFavorites.includes(message.value);
			} else if (
				message.action === "media-next" ||
				(message.action === "key" && message.value === "next")
			) {
				if (state.media.kind === "radio") stepRadio(1);
				else if (state.media.id.startsWith("ruv-channel-")) stepTv(1);
				else {
					state.media.currentTime = Math.min(
						state.media.duration,
						state.media.currentTime + 30,
					);
					broadcast();
				}
				return;
			} else if (
				message.action === "media-previous" ||
				(message.action === "key" && message.value === "previous")
			) {
				if (state.media.kind === "radio") stepRadio(-1);
				else if (state.media.id.startsWith("ruv-channel-")) stepTv(-1);
				else {
					state.media.currentTime = Math.max(0, state.media.currentTime - 15);
					broadcast();
				}
				return;
			} else if (message.action === "program-favorite") {
				if (!getRuvProgram(message.value)) return;
				toggleProgramFavorite(message.value);
				state.programFavorites = listProgramFavorites();
				const playingEpisodeProgram = state.media.id.startsWith("ruv-episode-")
					? getRuvEpisode(state.media.id.replace("ruv-episode-", ""))?.programId
					: undefined;
				if (playingEpisodeProgram === message.value)
					state.media.favorite = state.programFavorites.includes(message.value);
			} else if (message.action === "toggle-favorite") {
				if (state.media.kind === "radio") {
					const id = Number(state.media.id.replace("radio-", ""));
					if (
						!Number.isSafeInteger(id) ||
						!radioStations().some((station) => station.id === id)
					)
						return;
					toggleRadioFavorite(id);
					state.radioFavorites = listRadioFavorites();
					state.media.favorite = state.radioFavorites.includes(id);
				} else if (state.media.id.startsWith("ruv-channel-")) {
					const slug = state.media.id.replace("ruv-channel-", "");
					if (!listRuvChannels("tv").some((channel) => channel.slug === slug))
						return;
					toggleTvFavorite(slug);
					state.tvFavorites = listTvFavorites();
					state.media.favorite = state.tvFavorites.includes(slug);
				} else if (state.media.id.startsWith("ruv-episode-")) {
					const episode = getRuvEpisode(
						state.media.id.replace("ruv-episode-", ""),
					);
					if (!episode) return;
					toggleProgramFavorite(episode.programId);
					state.programFavorites = listProgramFavorites();
					state.media.favorite = state.programFavorites.includes(
						episode.programId,
					);
				} else return;
			} else if (message.action === "cast-stop") {
				stopCast();
				return;
			} else if (message.action === "toggle-play")
				state.playing = !state.playing;
			else if (message.action === "toggle-mute") state.muted = !state.muted;
			else if (message.action === "volume") state.volume = message.value;
			else if (message.action === "scene") state.scene = message.value;
			else if (message.action === "lights") state.lights = message.value;
			else if (message.action === "view") {
				state.previousView = state.view;
				state.view = message.value;
				state.newsArticleId = 0;
			} else if (message.action === "back") {
				const next = state.previousView;
				state.previousView = state.view;
				state.view = next;
			} else if (message.action === "power") state.power = !state.power;
			else if (message.action === "media-duration") {
				state.media.duration = message.value;
				upsertMedia(state.media);
			} else if (
				message.action === "seek" ||
				message.action === "media-progress"
			) {
				state.media.currentTime = Math.min(
					state.media.duration || Number.MAX_SAFE_INTEGER,
					message.value,
				);
				persistEpisodeProgress();
			} else if (message.action === "playback-rate")
				state.media.playbackRate = message.value;
			else if (message.action === "subtitle") {
				if (!state.media.subtitles.includes(message.value)) return;
				state.media.subtitleTrack = message.value;
			} else if (message.action === "audio-track") {
				if (!state.media.audioTracks.includes(message.value)) return;
				state.media.audioTrack = message.value;
			} else if (message.action === "player-panel")
				state.media.panel = (message.value || null) as PlayerPanel;
			else if (message.action === "fullscreen")
				state.media.fullscreen = message.value;
			else if (message.action === "player-status")
				state.media.status = message.value as MediaItem["status"];
			else if (message.action === "player-tracks") {
				if (message.value.source !== state.media.src) return;
				const subtitles = message.value.subtitles.filter(
					(track, index, tracks) =>
						tracks.findIndex((item) => item.label === track.label) === index,
				);
				state.media.textTracks = subtitles;
				state.media.subtitles = [
					"Slökkt",
					...subtitles.map((track) => track.label),
				];
				state.media.audioTracks = message.value.audioTracks.length
					? message.value.audioTracks
					: ["Aðalhljóð"];
				if (!state.media.subtitles.includes(state.media.subtitleTrack))
					state.media.subtitleTrack = "Slökkt";
				if (!state.media.audioTracks.includes(state.media.audioTrack))
					state.media.audioTrack = state.media.audioTracks[0];
				upsertMedia(state.media);
			} else if (message.action !== "key") return;

			state.lastAction =
				message.label ||
				("value" in message ? String(message.value) : message.action);
			broadcast();
		},
	},
});

const projectRoot = resolve(import.meta.dir, "../../..");
const ruvScheduler = new RuvScheduler({
	dailyIntervalMs: config.ruvSyncIntervalMs,
	newsIntervalMs: config.ruvNewsSyncIntervalMs,
	startDelayMs: config.ruvSchedulerStartDelayMs,
	pollMs: config.ruvSchedulerPollMs,
	childTimeoutMs: config.ruvChildTimeoutMs,
	lastSuccess(job) {
		const run = lastSuccessfulRuvScrape(`scheduler-${job}`);
		return run?.finished_at ?? undefined;
	},
	spawn(job: RuvJob) {
		const child = Bun.spawn({
			cmd: config.ruvScraperBin
				? [config.ruvScraperBin, job]
				: [process.execPath, "apps/server/src/ruvscraper.ts", job],
			cwd: projectRoot,
			env: process.env,
			stdout: "pipe",
			stderr: "pipe",
		});
		const output = Promise.all([
			new Response(child.stdout).text(),
			new Response(child.stderr).text(),
		]).then((parts) => parts.filter(Boolean).join("\n"));
		return { exited: child.exited, output, stop: () => child.kill("SIGTERM") };
	},
	recordStart(job) {
		return startRuvScrape(`scheduler-${job}`);
	},
	recordFinish(id, result) {
		finishRuvScrape(id, {
			itemCount: 0,
			added: 0,
			updated: 0,
			error: result.error,
		});
	},
	log(message) {
		console.log(message);
	},
});
ruvScheduler.start();

const runDeilduIfDue = () => {
	if (
		scrapeState.running ||
		(scrapeState.lastRun &&
			Date.now() - scrapeState.lastRun < config.deilduSyncIntervalMs)
	)
		return;
	void scrapeDeildu(config.deilduScrapePages, () => {
		state.lastAction = scrapeState.message;
		broadcast();
	});
};
const deilduStartTimer = setTimeout(
	runDeilduIfDue,
	config.deilduSchedulerStartDelayMs,
);
deilduStartTimer.unref();
const deilduSyncTimer = setInterval(
	runDeilduIfDue,
	config.deilduSyncIntervalMs,
);
deilduSyncTimer.unref();

let shuttingDown = false;
function shutdown() {
	if (shuttingDown) return;
	shuttingDown = true;
	clearTimeout(deilduStartTimer);
	clearInterval(deilduSyncTimer);
	ruvScheduler.stop();
	void stopDeilduStream();
	void server.stop(true);
	setTimeout(() => process.exit(0), 1_000).unref();
}
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
process.once("exit", () => {
	ruvScheduler.stop();
	void stopDeilduStream();
});

console.log(`tvserverd listening on port ${config.port}`);
