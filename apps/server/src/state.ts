import type {
	CastSession,
	HomeState,
	MediaItem,
	MediaKind,
	PlayerPanel,
	View,
} from "../../../packages/protocol";

const views: Record<View, true> = {
	home: true,
	tv: true,
	radio: true,
	podcasts: true,
	media: true,
	deildu: true,
	news: true,
};
const kinds = new Set<MediaKind>([
	"radio",
	"music",
	"podcast",
	"video",
	"movie",
	"tv",
]);
const panels = new Set<Exclude<PlayerPanel, null>>([
	"epg",
	"queue",
	"subtitles",
	"audio",
]);
const statuses = new Set<MediaItem["status"]>([
	"idle",
	"loading",
	"ready",
	"error",
]);

const string = (value: unknown, fallback: string, maximum = 4_096) =>
	typeof value === "string" && value.length <= maximum ? value : fallback;
const boolean = (value: unknown, fallback: boolean) =>
	typeof value === "boolean" ? value : fallback;
const number = (
	value: unknown,
	fallback: number,
	minimum: number,
	maximum: number,
) =>
	typeof value === "number" && Number.isFinite(value)
		? Math.max(minimum, Math.min(maximum, value))
		: fallback;
const stringArray = (value: unknown, fallback: string[], maximum = 32) =>
	Array.isArray(value) &&
	value.length <= maximum &&
	value.every((item) => typeof item === "string" && item.length <= 256)
		? [...value]
		: [...fallback];

export function createEmptyMedia(): MediaItem {
	return {
		id: "idle",
		kind: "tv",
		title: "Engin spilun",
		subtitle: "Veldu efni í fjarstýringunni",
		source: "RÚV",
		src: "",
		artwork: "",
		live: false,
		currentTime: 0,
		duration: 0,
		playbackRate: 1,
		subtitleTrack: "Slökkt",
		audioTrack: "Aðalhljóð",
		subtitles: [],
		textTracks: [],
		audioTracks: ["Aðalhljóð"],
		epg: [],
		panel: null,
		fullscreen: false,
		favorite: false,
		status: "idle",
	};
}

export function createDefaultState(): HomeState {
	return {
		playing: false,
		volume: 35,
		channel: 1,
		scene: "",
		lights: false,
		muted: false,
		view: "home",
		previousView: "home",
		deilduCategoryId: 0,
		deilduShowId: "",
		newsArticleId: 0,
		power: true,
		lastAction: "Tilbúið",
		media: createEmptyMedia(),
		radioFavorites: [],
		tvFavorites: [],
		programFavorites: [],
		cast: null,
	};
}

export function normalizeHomeState(
	value: unknown,
	favorites: { radio: number[]; tv: string[]; programs: number[] },
): HomeState {
	const fallback = createDefaultState();
	const source =
		value && typeof value === "object" && !Array.isArray(value)
			? (value as Record<string, unknown>)
			: {};
	const mediaSource =
		source.media &&
		typeof source.media === "object" &&
		!Array.isArray(source.media)
			? (source.media as Record<string, unknown>)
			: {};
	const mediaFallback = fallback.media;
	const subtitles = stringArray(mediaSource.subtitles, mediaFallback.subtitles);
	const audioTracks = stringArray(
		mediaSource.audioTracks,
		mediaFallback.audioTracks,
	);
	const rawTextTracks = Array.isArray(mediaSource.textTracks)
		? mediaSource.textTracks
		: [];
	const textTracks = rawTextTracks
		.flatMap((track) => {
			if (!track || typeof track !== "object" || Array.isArray(track))
				return [];
			const item = track as Record<string, unknown>;
			if (
				typeof item.label !== "string" ||
				typeof item.language !== "string" ||
				typeof item.src !== "string" ||
				!/^https?:\/\//.test(item.src)
			)
				return [];
			return [
				{
					label: item.label.slice(0, 96),
					language: item.language.slice(0, 16),
					src: item.src,
				},
			];
		})
		.slice(0, 32);
	const epg = Array.isArray(mediaSource.epg)
		? mediaSource.epg
				.flatMap((item) => {
					if (!item || typeof item !== "object" || Array.isArray(item))
						return [];
					const row = item as Record<string, unknown>;
					if (
						typeof row.start !== "string" ||
						typeof row.title !== "string" ||
						typeof row.detail !== "string"
					)
						return [];
					return [
						{
							start: row.start.slice(0, 32),
							title: row.title.slice(0, 256),
							detail: row.detail.slice(0, 1_024),
							...(typeof row.current === "boolean"
								? { current: row.current }
								: {}),
						},
					];
				})
				.slice(0, 64)
		: [];
	const kind =
		typeof mediaSource.kind === "string" &&
		kinds.has(mediaSource.kind as MediaKind)
			? (mediaSource.kind as MediaKind)
			: mediaFallback.kind;
	const panel =
		mediaSource.panel === null || mediaSource.panel === undefined
			? null
			: typeof mediaSource.panel === "string" &&
					panels.has(mediaSource.panel as Exclude<PlayerPanel, null>)
				? (mediaSource.panel as Exclude<PlayerPanel, null>)
				: null;
	const status =
		typeof mediaSource.status === "string" &&
		statuses.has(mediaSource.status as MediaItem["status"])
			? (mediaSource.status as MediaItem["status"])
			: mediaFallback.status;
	const subtitleCandidate = string(
		mediaSource.subtitleTrack,
		mediaFallback.subtitleTrack,
		96,
	);
	const audioCandidate = string(
		mediaSource.audioTrack,
		mediaFallback.audioTrack,
		96,
	);
	const duration = number(
		mediaSource.duration,
		mediaFallback.duration,
		0,
		Number.MAX_SAFE_INTEGER,
	);
	const media: MediaItem = {
		id: string(mediaSource.id, mediaFallback.id, 128),
		kind,
		title: string(mediaSource.title, mediaFallback.title, 512),
		subtitle: string(mediaSource.subtitle, mediaFallback.subtitle, 512),
		source: string(mediaSource.source, mediaFallback.source, 256),
		src: string(mediaSource.src, mediaFallback.src),
		artwork: string(mediaSource.artwork, mediaFallback.artwork),
		live: boolean(mediaSource.live, mediaFallback.live),
		...(typeof mediaSource.frequency === "number" &&
		Number.isFinite(mediaSource.frequency)
			? { frequency: mediaSource.frequency }
			: {}),
		currentTime: number(
			mediaSource.currentTime,
			mediaFallback.currentTime,
			0,
			duration || Number.MAX_SAFE_INTEGER,
		),
		duration,
		playbackRate: number(
			mediaSource.playbackRate,
			mediaFallback.playbackRate,
			0.5,
			2,
		),
		subtitleTrack:
			subtitleCandidate === "Slökkt" || subtitles.includes(subtitleCandidate)
				? subtitleCandidate
				: "Slökkt",
		audioTrack: audioTracks.includes(audioCandidate)
			? audioCandidate
			: (audioTracks[0] ?? "Aðalhljóð"),
		subtitles,
		textTracks,
		audioTracks: audioTracks.length ? audioTracks : ["Aðalhljóð"],
		epg,
		panel,
		fullscreen: boolean(mediaSource.fullscreen, mediaFallback.fullscreen),
		favorite: boolean(mediaSource.favorite, mediaFallback.favorite),
		status,
		...(mediaSource.engine === "mpv" || mediaSource.engine === "browser"
			? { engine: mediaSource.engine as "mpv" | "browser" }
			: {}),
	};
	const view =
		typeof source.view === "string" && Object.hasOwn(views, source.view)
			? (source.view as View)
			: fallback.view;
	const previousView =
		typeof source.previousView === "string" &&
		Object.hasOwn(views, source.previousView)
			? (source.previousView as View)
			: fallback.previousView;
	const rawCast =
		source.cast &&
		typeof source.cast === "object" &&
		!Array.isArray(source.cast)
			? (source.cast as Record<string, unknown>)
			: null;
	const cast: CastSession | null =
		rawCast &&
		(rawCast.source === "airplay" ||
			rawCast.source === "android-cast" ||
			rawCast.source === "miracast") &&
		(rawCast.mode === "stream" || rawCast.mode === "mirror") &&
		typeof rawCast.deviceName === "string" &&
		typeof rawCast.startedAt === "number"
			? {
					source: rawCast.source,
					mode: rawCast.mode,
					deviceName: rawCast.deviceName.slice(0, 128),
					startedAt: rawCast.startedAt,
				}
			: null;
	return {
		playing: boolean(source.playing, fallback.playing),
		volume: number(source.volume, fallback.volume, 0, 100),
		channel: Math.round(number(source.channel, fallback.channel, 1, 2)),
		scene: string(source.scene, fallback.scene, 64),
		lights: boolean(source.lights, fallback.lights),
		muted: boolean(source.muted, fallback.muted),
		view,
		previousView,
		deilduCategoryId: Math.round(
			number(
				source.deilduCategoryId,
				fallback.deilduCategoryId,
				0,
				Number.MAX_SAFE_INTEGER,
			),
		),
		deilduShowId: string(source.deilduShowId, fallback.deilduShowId, 256),
		newsArticleId: Math.round(
			number(
				source.newsArticleId,
				fallback.newsArticleId,
				0,
				Number.MAX_SAFE_INTEGER,
			),
		),
		power: boolean(source.power, fallback.power),
		lastAction: string(source.lastAction, fallback.lastAction, 256),
		media,
		radioFavorites: [...favorites.radio],
		tvFavorites: [...favorites.tv],
		programFavorites: [...favorites.programs],
		cast,
	};
}

export function stopTransientPlaybackOnStartup(state: HomeState): HomeState {
	if (
		!state.media.id.startsWith("deildu-") &&
		!state.media.id.startsWith("torrent-")
	)
		return state;
	return {
		...state,
		playing: false,
		lastAction: "Tilbúið",
		media: {
			...state.media,
			src: "",
			status: "idle",
			fullscreen: false,
			engine: undefined,
		},
	};
}
