export type View = "home" | "tv" | "radio" | "podcasts" | "media" | "deildu" | "news";
export type MediaKind =
	| "radio"
	| "music"
	| "podcast"
	| "video"
	| "movie"
	| "tv";
export type PlayerPanel = "epg" | "queue" | "subtitles" | "audio" | null;

export type Programme = {
	start: string;
	startTime?: number;
	endTime?: number | null;
	title: string;
	detail: string;
	current?: boolean;
};

export type MediaTextTrack = {
	label: string;
	language: string;
	src: string;
};

export type CastSource = "airplay" | "android-cast" | "miracast";
export type CastMode = "stream" | "mirror";

export type CastSession = {
	source: CastSource;
	mode: CastMode;
	deviceName: string;
	startedAt: number;
};

export type MediaItem = {
	id: string;
	kind: MediaKind;
	title: string;
	subtitle: string;
	source: string;
	src: string;
	artwork: string;
	live: boolean;
	frequency?: number;
	currentTime: number;
	duration: number;
	playbackRate: number;
	subtitleTrack: string;
	audioTrack: string;
	subtitles: string[];
	textTracks?: MediaTextTrack[];
	audioTracks: string[];
	epg: Programme[];
	panel: PlayerPanel;
	fullscreen: boolean;
	favorite: boolean;
	status: "idle" | "loading" | "ready" | "error";
	// "mpv": video renders via libmpv embedded directly in the native Qt TV
	// Frame (apps/tv-frame's MpvVideo item) — no separate mpv process or
	// window. "browser" is a legacy value kept for stored state.
	engine?: "browser" | "mpv";
	// mpv cache buffering percent (0-100) while status is "loading".
	buffering?: number;
	// Incremented only by an explicit "seek" command (never by the frame's
	// own periodic "media-progress" reports), so the frame can tell a real
	// seek target apart from its own progress echoing back through state.
	seekToken?: number;
	// Live torrent transfer telemetry for the loading overlay.
	transfer?: {
		peers: number;
		seeders: number;
		speedBps: number;
		downloadedBytes: number;
		totalBytes: number;
	};
};

export type Station = {
	id: number;
	name: string;
	frequency: number;
	terrestrial: boolean;
	streamUrl: string;
	logoUrl: string;
};

export type RuvCategory = { title: string; slug: string };

export type RuvChannel = {
	slug: string;
	name: string;
	kind: "tv" | "radio";
	streamUrl: string;
	geoblock: boolean;
	checkedAt: number;
};

export type WatchProgress = {
	position: number;
	duration: number;
	finished: boolean;
	updatedAt: number;
};

export type RuvEpisode = {
	id: string;
	programId: number;
	programTitle: string;
	number: number | null;
	title: string;
	description: string;
	firstRun: string | null;
	duration: number;
	durationFriendly: string;
	image: string;
	fileUrl: string;
	textTracks: MediaTextTrack[];
	rating: number | null;
	slug: string;
	eventId: number | null;
	fileExpires: string | null;
	available: boolean;
	progress?: WatchProgress | null;
	updatedAt: number;
};

export type ContinueWatchingItem = {
	episode: RuvEpisode;
	position: number;
	duration: number;
	progress: number;
	updatedAt: number;
};

export type RuvProgram = {
	id: number;
	kind: "movie" | "series";
	title: string;
	foreignTitle: string;
	slug: string;
	description: string;
	shortDescription: string;
	image: string;
	portraitImage: string;
	categories: RuvCategory[];
	channel: string;
	webAvailableEpisodes: number;
	webPlayerUrl: string;
	featured: boolean;
	available: boolean;
	latestEpisode: RuvEpisode | null;
	updatedAt: number;
};

export type RuvEpgEvent = {
	eventId: number;
	channelSlug: string;
	seriesId: number | null;
	startTime: number;
	endTime: number | null;
	title: string;
	originalTitle: string;
	description: string;
	category: string;
	episodeNumber: number | null;
	episodeTotal: number | null;
	rerun: boolean;
	live: boolean;
	header: boolean;
	subevent: boolean;
	moreInfoUrl: string;
	watchFromStart: RuvEpisode | null;
	updatedAt: number;
};

export type RuvNow = {
	channel: RuvChannel;
	current: RuvEpgEvent | null;
	upcoming: RuvEpgEvent[];
};

export type RuvNewsArticle = {
	id: number;
	slug: string;
	title: string;
	subtitle: string;
	url: string;
	categorySlug: string;
	categoryTitle: string;
	topicName: string;
	topicSlug: string;
	authors: { name: string }[];
	tags: { name: string; slug: string }[];
	mainImageUrl: string;
	bodyHtml?: string;
	firstPublishedAt: number | null;
	lastPublishedAt: number | null;
	updatedAt: number;
};

export type TorrentMedia = {
	id: string;
	title: string;
	description: string;
	source: string;
	license: string;
	duration: number;
	artwork: string;
	status: "missing" | "incomplete" | "downloading" | "ready";
	downloadedBytes: number;
	totalBytes: number;
};

export type DeilduMediaKind = "movie" | "tv" | "audio" | "other";
export type DeilduDownloadStatus =
	| "missing"
	| "starting"
	| "downloading"
	| "paused"
	| "ready"
	| "error";

export type DeilduCategory = {
	id: number;
	name: string;
	mediaKind: DeilduMediaKind;
	playable: boolean;
	sortOrder: number;
	itemCount: number;
};

export type DeilduItem = {
	id: number;
	categoryId: number;
	categoryName: string;
	mediaKind: DeilduMediaKind;
	playable: boolean;
	title: string;
	artwork: string;
	sizeBytes: number;
	seeders: number;
	leechers: number;
	addedAt: number | null;
	aiCleaned: boolean;
	status: DeilduDownloadStatus;
	downloadedBytes: number;
	totalBytes: number;
	error: string;
	playbackPosition: number;
	playbackDuration: number;
	updatedAt: number;
};

export type DeilduEpisode = {
	season: number;
	episode: number | null;
	title: string;
	artwork: string;
	seeders: number;
	itemId: number;
	archive: boolean;
};

export type DeilduShow = {
	id: string;
	title: string;
	artwork: string;
	backdrop: string;
	description: string;
	year: number | null;
	rating: number | null;
	votes: number;
	seasons: number[];
	episodes: DeilduEpisode[];
	progress: number | null;
};

export type DeilduScrapeState = {
	running: boolean;
	status: "idle" | "running" | "complete" | "partial" | "error";
	message: string;
	lastRun: number | null;
	lastError: string;
	inserted: number;
	updated: number;
	itemCount: number;
	categoryCount: number;
	completedPages: number;
	totalPages: number;
};

export const DEILDU_PAGE_SIZE = 24;

export type DeilduPagination = {
	categoryId: number;
	page: number;
	pageSize: number;
	totalItems: number;
	totalPages: number;
};

export type PodcastEpisode = {
	id: string;
	podcastId: string;
	title: string;
	description: string;
	audioUrl: string;
	publishedAt: number;
	duration: number;
	episodeNumber: number | null;
	artworkUrl: string;
};

export type PodcastSeries = {
	id: string;
	title: string;
	description: string;
	author: string;
	imageUrl: string;
	feedUrl: string;
	position: number;
	episodes: PodcastEpisode[];
};

export type GolfBooking = { date: string; time: string; name: string };

export type GolfRound = {
	date: string;
	time: string;
	course: string;
	club: string;
	tee: string;
	marker: string;
	type: number | null;
	par: number | null;
	rating: number | null;
	slope: number | null;
	gross: number | null;
	differential: number | null;
	hcpBefore: number | null;
	hcpAfter: number | null;
};

export type GolfFriend = {
	name: string;
	memberNumber: string;
	handicap: number | null;
	club: string;
};

export type GolfPersonDetail = {
	name: string;
	club: string;
	handicap: number | null;
	totalRounds: number;
	byCourse: Record<string, GolfRound[]>;
};

export type GolfTeeTimes = {
	date: string;
	course: string;
	club: string;
	updatedAt: number | null;
	stale: boolean;
	slots: { time: string; openSeats: number }[];
};

export type DashboardContent = {
	generatedAt: number;
	golfTeeTimes: GolfTeeTimes | null;
	golfPerson: string;
	golfBookings: GolfBooking[];
	channels: RuvNow[];
	programs: RuvProgram[];
	sarpurCategories: {title: string; slug: string; programs: RuvProgram[]}[];
	movies: RuvProgram[];
	torrentMovies: TorrentMedia[];
	deilduCategories: DeilduCategory[];
	deilduItems: DeilduItem[];
	deilduShows: DeilduShow[];
	deilduShow: DeilduShow | null;
	deilduPagination: DeilduPagination;
	deilduScrape: DeilduScrapeState;
	podcasts: PodcastSeries[];
	news: RuvNewsArticle[];
	continueWatching: ContinueWatchingItem[];
	myList: RuvProgram[];
};

export type PlayerTrackReport = {
	source: string;
	subtitles: MediaTextTrack[];
	audioTracks: string[];
};

export type HomeState = {
	playing: boolean;
	volume: number;
	channel: number;
	scene: string;
	lights: boolean;
	muted: boolean;
	view: View;
	previousView: View;
	deilduCategoryId: number;
	deilduShowId: string;
	newsArticleId: number;
	power: boolean;
	lastAction: string;
	media: MediaItem;
	radioFavorites: number[];
	tvFavorites: string[];
	programFavorites: number[];
	cast: CastSession | null;
};

export type Command =
	| {
			type: "command";
			action: "set-playing";
			value: boolean;
	  }
	| {
			type: "command";
			action:
				| "toggle-play"
				| "stop-playback"
				| "toggle-mute"
				| "back"
				| "power"
				| "media-next"
				| "media-previous"
				| "toggle-favorite"
				| "cast-stop";
	  }
	| {
			type: "command";
			action:
				| "volume"
				| "channel"
				| "radio"
				| "radio-favorite"
				| "seek"
				| "playback-rate"
				| "media-progress"
				| "media-duration"
				| "media-buffering"
				| "news-scroll"
				| "news-article"
				| "ruv-program"
				| "program-favorite"
				| "deildu-play"
				| "deildu-category";
			value: number;
	  }
	| {
			type: "command";
			action:
				| "key"
				| "subtitle"
				| "audio-track"
				| "player-panel"
				| "player-status"
				| "ruv-channel"
				| "ruv-episode"
				| "torrent-media"
				| "public-torrent-play"
				| "tv-favorite"
				| "podcast-play";
			value: string;
	  }
	| { type: "command"; action: "deildu-show"; value: string }
	| { type: "command"; action: "fullscreen" | "lights"; value: boolean }
	| { type: "command"; action: "view"; value: View }
	| { type: "command"; action: "scene"; value: string }
	| { type: "command"; action: "deildu-scrape"; value?: { pages?: number } }
	| { type: "command"; action: "player-tracks"; value: PlayerTrackReport };

export type RuvChannelsResponse = { channels: RuvChannel[] };
export type RuvProgramsResponse = { programs: RuvProgram[] };
export type RuvProgramResponse = {
	program: RuvProgram;
	episodes: RuvEpisode[];
};
export type RuvEpgResponse = { channel: string; events: RuvEpgEvent[] };
export type RuvNewsResponse = { articles: RuvNewsArticle[] };
export type RuvNewsArticleResponse = { article: RuvNewsArticle };
export type RuvContinueResponse = { items: ContinueWatchingItem[] };

export function tvServerUrl() {
	const env = (import.meta as ImportMeta & { env?: Record<string, string> })
		.env;
	const value = env?.VITE_TVSERVER_URL?.replace(/\/$/, "");
	if (!value) throw new Error("Missing VITE_TVSERVER_URL");
	return value;
}

export function tvServerWebSocketUrl(client = "app") {
	return `${tvServerUrl().replace(/^http/, "ws")}/ws?client=${encodeURIComponent(client)}`;
}

export function browserClientId(kind: "dashboard" | "remote") {
	const key = `tv-kit-${kind}-client`;
	const existing = sessionStorage.getItem(key);
	if (existing) return existing;
	const id = globalThis.crypto?.randomUUID?.()
		?? globalThis.crypto?.getRandomValues(new Uint32Array(2)).join("")
		?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
	const clientId = `${kind}-${id.slice(0, 16)}`;
	sessionStorage.setItem(key, clientId);
	return clientId;
}
