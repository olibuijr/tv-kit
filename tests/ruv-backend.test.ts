import { afterAll, beforeEach, expect, test } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	rmSync,
	truncateSync,
	writeFileSync,
} from "node:fs";
import { Database } from "bun:sqlite";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { HomeState } from "../packages/protocol";
import { parseCommandMessage } from "../apps/server/src/commands";
import {
	parseAllowedOrigins,
	preflightResponse,
	requestOriginAllowed,
} from "../apps/server/src/httpAccess";
import { nextRuvJob, RuvScheduler } from "../apps/server/src/ruvScheduler";
import {
	createDefaultState,
	normalizeHomeState,
} from "../apps/server/src/state";

const root = mkdtempSync(join(tmpdir(), "tv-kit-test-"));
Object.assign(Bun.env, {
	PORT: "31999",
	VITE_TVSERVER_URL: "http://127.0.0.1:31999",
	TV_KIT_DB: join(root, "tv-kit.sqlite"),
	TORRENT_MEDIA_DIR: join(root, "torrents"),
	RADIO_SOURCE_URL: "https://example.invalid/radio",
	RADIO_SOURCE_NAME: "test",
	RADIO_SYNC_INTERVAL_MS: "86400000",
	RADIO_STREAM_TIMEOUT_MS: "8000",
	RADIO_SCRAPE_CONCURRENCY: "2",
	SOLAR_API_URL: "https://example.invalid/solar",
	SOLAR_CACHE_MS: "21600000",
	RUV_API_BASE: "https://api.ruv.is",
	RUV_LIVE_BASE: "https://geo.spilari.ruv.is",
	RUV_EPG_BASE: "https://muninn.ruv.is",
	RUV_SITE_BASE: "https://www.ruv.is",
	RUV_SEARCH_URL: "https://spilari.nyr.ruv.is/gql/",
	RUV_NEWS_CATEGORIES: ",innlent",
	RUV_EPG_DAYS_BACK: "1",
	RUV_EPG_DAYS_FORWARD: "10",
	RUV_SYNC_INTERVAL_MS: "86400000",
	RUV_NEWS_SYNC_INTERVAL_MS: "3600000",
	RUV_SCHEDULER_START_DELAY_MS: "15000",
	RUV_SCHEDULER_POLL_MS: "60000",
	RUV_CHILD_TIMEOUT_MS: "900000",
	RUV_SCRAPE_CONCURRENCY: "2",
	RUV_CATALOG_CONCURRENCY: "2",
	RUV_FETCH_TIMEOUT_MS: "30000",
	RUV_FETCH_RETRIES: "2",
	RUV_USER_AGENT: "tv-kit-test",
	RUV_ARCHIVE_SEARCH_TERMS: "a,á,b",
	RUV_ARCHIVE_SEARCH_BATCH_SIZE: "2",
	RUV_ARCHIVE_SEARCH_PACING_MS: "100",
	TV_ALLOWED_ORIGINS: "http://127.0.0.1:3111,http://127.0.0.1:3112",
	HOME_LATITUDE: "65.68",
	HOME_LONGITUDE: "-18.1",
	HOME_TIMEZONE: "Atlantic/Reykjavik",
	HOME_LOCATION: "Akureyri",
});

const torrentDir = join(root, "torrents/big-buck-bunny/Big Buck Bunny");
mkdirSync(torrentDir, { recursive: true });
const torrentVideo = join(torrentDir, "Big Buck Bunny.mp4");
writeFileSync(torrentVideo, "");
truncateSync(torrentVideo, 276_134_947);
writeFileSync(join(torrentDir, "poster.jpg"), "poster");

const database = await import("../apps/server/src/db");
const ruv = await import("../apps/server/src/ruvdb");
const scraper = await import("../apps/server/src/ruvscraper");
const torrent = await import("../apps/server/src/torrentMedia");
const { db } = database;

const media = {
	id: "idle",
	kind: "tv" as const,
	title: "Engin spilun",
	subtitle: "",
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
	status: "idle" as const,
};
const state = (lastAction: string): HomeState => ({
	playing: false,
	volume: 35,
	channel: 1,
	scene: "",
	lights: false,
	muted: false,
	view: "home",
	previousView: "home",
	power: true,
	lastAction,
	media,
	radioFavorites: [],
	tvFavorites: [],
	programFavorites: [],
	cast: null,
});

const programBase = {
	foreignTitle: "",
	slug: "p",
	description: "",
	shortDescription: "",
	image: "https://example.test/p.webp",
	portraitImage: "",
	channel: "RÚV",
	webAvailableEpisodes: 1,
	webPlayerUrl: "",
};
const episodeBase = {
	number: 1,
	description: "",
	firstRun: "2026-07-10T20:00:00",
	durationFriendly: "20 mín.",
	image: "https://example.test/e.webp",
	subtitles: {},
	rating: null,
	slug: "",
	eventId: null,
};
const seedProgram = (
	id: number,
	title: string,
	categories: { title: string; slug: string }[] = [],
) =>
	ruv.upsertRuvProgramRecord({ id, title, categories, ...programBase }, false);
const seedEpisode = (
	id: string,
	programId: number,
	duration = 1200,
	fileExpires = "2099-01-01",
	fileUrl = `https://example.test/${id}.m3u8`,
) =>
	ruv.upsertRuvEpisodeRecord({
		id,
		programId,
		title: `Þáttur ${id}`,
		duration,
		fileUrl,
		fileExpires,
		...episodeBase,
	});

beforeEach(() => {
	db.exec(`
    DELETE FROM watch_progress;
    DELETE FROM favourites;
    DELETE FROM ruv_epg_events;
    DELETE FROM ruv_episodes;
    DELETE FROM ruv_programs;
    DELETE FROM ruv_channels;
    DELETE FROM ruv_news_articles;
    DELETE FROM ruv_scrape_runs;
    DELETE FROM app_state;
  `);
});

afterAll(() => {
	db.close();
	rmSync(root, { recursive: true, force: true });
});

test("empty database applies ordered migrations and idempotent state seed", () => {
	expect(database.schemaVersions()).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
	expect(database.databaseIntegrity()).toBe("ok");
	database.seedStateIfMissing(state("fyrsta"));
	database.seedStateIfMissing(state("annað"));
	expect(database.loadState()?.lastAction).toBe("fyrsta");
});

test("RÚV rows serialize as typed camelCase DTOs with parsed values", () => {
	ruv.replaceRuvChannels([
		{
			slug: "ruv",
			name: "RÚV",
			kind: "tv",
			streamUrl: "https://example.test/live.m3u8",
			geoblock: false,
			checkedAt: 10,
		},
	]);
	ruv.upsertRuvProgramRecord(
		{
			id: 7,
			title: "Prógramm",
			foreignTitle: "",
			slug: "program",
			description: "Lýsing",
			shortDescription: "",
			image: "https://example.test/program.webp",
			portraitImage: "",
			categories: [{ title: "Fréttir", slug: "frettir" }],
			channel: "RÚV",
			webAvailableEpisodes: 1,
			webPlayerUrl: "https://www.ruv.is/sjonvarp/spila/program/7",
		},
		true,
		100,
	);
	ruv.upsertRuvEpisodeRecord(
		{
			id: "ep1",
			programId: 7,
			number: 1,
			title: "Þáttur 1",
			description: "",
			firstRun: "2026-07-11T10:00:00",
			duration: 1200,
			durationFriendly: "20 mín.",
			image: "https://example.test/ep.webp",
			fileUrl: "https://example.test/ep.m3u8",
			subtitles: { is: "https://example.test/is.vtt", en: null },
			rating: null,
			slug: "ep1",
			eventId: 99,
			fileExpires: "2099-01-01",
		},
		100,
	);
	const channel = ruv.listRuvChannels()[0];
	const program = ruv.listRuvPrograms(10)[0];
	expect(channel).toEqual({
		slug: "ruv",
		name: "RÚV",
		kind: "tv",
		streamUrl: "https://example.test/live.m3u8",
		geoblock: false,
		checkedAt: 10,
	});
	expect(program.categories).toEqual([{ title: "Fréttir", slug: "frettir" }]);
	expect(program.latestEpisode?.textTracks).toEqual([
		{ label: "IS", language: "is", src: "https://example.test/is.vtt" },
	]);
	expect(JSON.stringify(program)).not.toContain("foreign_title");
	expect(JSON.stringify(program)).not.toContain("file_url");
});

test("EPG parsing records overlap flags and reconciliation selects non-header current event", () => {
	const parsed = scraper.parseRuvEpgXml(
		`<?xml version="1.0"?><schedule><event event-id="1" serie-id="8" start-time="2026-07-11 10:00:00" duration="02:00:00"><title>Haus &amp; dagskrá</title><header>yes</header><subevent>no</subevent><live>no</live><rerun>no</rerun></event><event event-id="2" serie-id="9" start-time="2026-07-11 10:30:00" duration="00:30:00"><title><![CDATA[Raunþáttur]]></title><header>no</header><subevent>yes</subevent><live>yes</live><rerun>no</rerun><episode number="2" number-of-episodes="4"/></event></schedule>`,
		"ruv",
	);
	expect(parsed).toHaveLength(2);
	expect(parsed[0].title).toBe("Haus & dagskrá");
	expect(parsed[0].header).toBe(true);
	expect(parsed[1].subevent).toBe(true);

	ruv.replaceRuvChannels([
		{
			slug: "ruv",
			name: "RÚV",
			kind: "tv",
			streamUrl: "https://example.test/live.m3u8",
			geoblock: false,
			checkedAt: 10,
		},
		{
			slug: "ruv2",
			name: "RÚV 2",
			kind: "tv",
			streamUrl: "https://example.test/live2.m3u8",
			geoblock: false,
			checkedAt: 10,
		},
	]);
	const now = Date.now();
	ruv.reconcileRuvEpg("ruv", now - 60_000, now + 3_600_000, [
		{
			eventId: 10,
			channelSlug: "ruv",
			seriesId: 1,
			startTime: now - 60_000,
			endTime: now + 3_600_000,
			title: "Haus",
			originalTitle: "",
			description: "",
			category: "",
			episodeNumber: null,
			episodeTotal: null,
			rerun: false,
			live: false,
			header: true,
			subevent: false,
			moreInfoUrl: "",
		},
		{
			eventId: 11,
			channelSlug: "ruv",
			seriesId: 2,
			startTime: now - 30_000,
			endTime: now + 600_000,
			title: "Núna",
			originalTitle: "",
			description: "",
			category: "Fréttir",
			episodeNumber: null,
			episodeTotal: null,
			rerun: false,
			live: true,
			header: false,
			subevent: true,
			moreInfoUrl: "",
		},
		{
			eventId: 12,
			channelSlug: "ruv",
			seriesId: 3,
			startTime: now + 600_000,
			endTime: now + 1_200_000,
			title: "Næst",
			originalTitle: "",
			description: "",
			category: "",
			episodeNumber: null,
			episodeTotal: null,
			rerun: false,
			live: false,
			header: false,
			subevent: false,
			moreInfoUrl: "",
		},
	]);
	expect(ruv.getRuvNow("ruv", now)?.current?.eventId).toBe(11);
	expect(
		ruv
			.listRuvEpg("ruv", now - 60_000, now + 3_600_000)
			.map((event) => event.eventId),
	).toEqual([11, 12]);

	// RÚV event ids are channel-scoped; the same id must never break a sync.
	ruv.reconcileRuvEpg("ruv2", now - 60_000, now + 3_600_000, [
		{
			...parsed[1],
			eventId: 11,
			channelSlug: "ruv2",
			startTime: now - 30_000,
			endTime: now + 600_000,
			title: "RÚV 2 núna",
		},
	]);
	expect(ruv.getRuvNow("ruv", now)?.current?.title).toBe("Núna");
	expect(ruv.getRuvNow("ruv2", now)?.current?.title).toBe("RÚV 2 núna");
});

test("daemon scheduler prioritizes due daily work and never overlaps children", async () => {
	expect(
		nextRuvJob({
			now: 100,
			dailyIntervalMs: 50,
			newsIntervalMs: 20,
			lastDailySuccess: 10,
			lastNewsSuccess: 90,
			childRunning: false,
		}),
	).toBe("daily");
	expect(
		nextRuvJob({
			now: 100,
			dailyIntervalMs: 50,
			newsIntervalMs: 20,
			lastDailySuccess: 90,
			lastNewsSuccess: 70,
			childRunning: false,
		}),
	).toBe("news");
	expect(
		nextRuvJob({
			now: 100,
			dailyIntervalMs: 50,
			newsIntervalMs: 20,
			lastDailySuccess: 90,
			lastNewsSuccess: 90,
			childRunning: false,
		}),
	).toBeNull();

	let resolveExit!: (code: number) => void;
	const exited = new Promise<number>((resolve) => (resolveExit = resolve));
	let spawns = 0;
	const finishes: { error?: string }[] = [];
	const scheduler = new RuvScheduler({
		now: () => 100,
		dailyIntervalMs: 50,
		newsIntervalMs: 20,
		startDelayMs: 1,
		pollMs: 10,
		childTimeoutMs: 1_000,
		lastSuccess: () => undefined,
		spawn: () => {
			spawns++;
			return {
				exited,
				output: Promise.resolve("ok"),
				stop: () => resolveExit(143),
			};
		},
		recordStart: () => 1,
		recordFinish: (_id, result) => finishes.push(result),
		setTimer: (() => 0) as unknown as typeof setTimeout,
		clearTimer: () => {},
		log: () => {},
	});
	scheduler.start();
	const first = scheduler.tick();
	await scheduler.tick();
	expect(spawns).toBe(1);
	expect(scheduler.running).toBe(true);
	resolveExit(0);
	await first;
	expect(finishes).toEqual([{}]);
	scheduler.stop();

	let stoppedChildren = 0;
	let stopExit!: (code: number) => void;
	const stoppingScheduler = new RuvScheduler({
		now: () => 100,
		dailyIntervalMs: 50,
		newsIntervalMs: 20,
		startDelayMs: 1,
		pollMs: 10,
		childTimeoutMs: 1_000,
		lastSuccess: () => undefined,
		spawn: () => ({
			exited: new Promise<number>((resolve) => (stopExit = resolve)),
			output: Promise.resolve("terminated"),
			stop: () => {
				stoppedChildren++;
				stopExit(143);
			},
		}),
		recordStart: () => 2,
		recordFinish: () => {},
		setTimer: (() => 0) as unknown as typeof setTimeout,
		clearTimer: () => {},
		log: () => {},
	});
	stoppingScheduler.start();
	const stoppingRun = stoppingScheduler.tick();
	stoppingScheduler.stop();
	expect(stoppedChildren).toBe(1);
	await stoppingRun;
});

test("featured flags and episode expiry are maintained without deleting history", () => {
	const base = {
		foreignTitle: "",
		slug: "p",
		description: "",
		shortDescription: "",
		image: "",
		portraitImage: "",
		categories: [],
		channel: "RÚV",
		webAvailableEpisodes: 1,
		webPlayerUrl: "",
	};
	ruv.upsertRuvProgramRecord({ id: 1, title: "Eitt", ...base }, true);
	ruv.upsertRuvProgramRecord({ id: 2, title: "Tvö", ...base }, true);
	ruv.upsertRuvEpisodeRecord({
		id: "old",
		programId: 1,
		number: 1,
		title: "Gamalt",
		description: "",
		firstRun: null,
		duration: 1,
		durationFriendly: "",
		image: "",
		fileUrl: "https://example.test/old.m3u8",
		subtitles: {},
		rating: null,
		slug: "",
		eventId: null,
		fileExpires: "2020-01-01",
	});
	ruv.upsertRuvEpisodeRecord({
		id: "new",
		programId: 2,
		number: 1,
		title: "Nýtt",
		description: "",
		firstRun: null,
		duration: 1,
		durationFriendly: "",
		image: "",
		fileUrl: "https://example.test/new.m3u8",
		subtitles: {},
		rating: null,
		slug: "",
		eventId: null,
		fileExpires: "2099-01-01",
	});
	ruv.setFeaturedRuvPrograms([2]);
	expect(ruv.markExpiredRuvEpisodes("2026-07-11")).toBeGreaterThanOrEqual(0);
	expect(ruv.ruvProgramAvailability()).toEqual([
		{ id: 1, featured: 0, available: 0 },
		{ id: 2, featured: 1, available: 1 },
	]);
	expect(ruv.totalRuvEpisodeCount()).toBe(2);
});

test("watch progress upserts one row per episode, clamps, and marks finished at 95%", () => {
	seedProgram(1, "Prógramm");
	seedEpisode("ep1", 1, 1200);

	expect(
		ruv.saveWatchProgress({
			episodeId: "missing",
			position: 100,
			duration: 1200,
		}),
	).toBeNull();

	const mid = ruv.saveWatchProgress(
		{ episodeId: "ep1", position: 300, duration: 1200 },
		1000,
	)!;
	expect(mid).toMatchObject({
		position: 300,
		duration: 1200,
		finished: false,
		updatedAt: 1000,
	});

	const done = ruv.saveWatchProgress(
		{ episodeId: "ep1", position: 1150, duration: 1200 },
		2000,
	)!;
	expect(done.finished).toBe(true);

	const rows = db
		.prepare("SELECT COUNT(*) AS count FROM watch_progress")
		.get() as { count: number };
	expect(rows.count).toBe(1);
	expect(
		ruv.saveWatchProgress({ episodeId: "ep1", position: -5, duration: 0 })!
			.position,
	).toBe(0);
	expect(
		ruv.saveWatchProgress({ episodeId: "ep1", position: 9999, duration: 1200 })!
			.position,
	).toBe(1200);
	expect(
		ruv.saveWatchProgress({ episodeId: "ep1", position: 60, duration: 0 })!
			.duration,
	).toBe(1200);
});

test("resumePosition returns only meaningful unfinished progress", () => {
	expect(ruv.resumePosition(null, 1200)).toBe(0);
	expect(
		ruv.resumePosition(
			{ position: 5, duration: 1200, finished: false, updatedAt: 1 },
			1200,
		),
	).toBe(0);
	expect(
		ruv.resumePosition(
			{ position: 300, duration: 1200, finished: false, updatedAt: 1 },
			1200,
		),
	).toBe(300);
	expect(
		ruv.resumePosition(
			{ position: 1180, duration: 1200, finished: false, updatedAt: 1 },
			1200,
		),
	).toBe(0);
	expect(
		ruv.resumePosition(
			{ position: 600, duration: 1200, finished: true, updatedAt: 1 },
			1200,
		),
	).toBe(0);
	expect(
		ruv.resumePosition(
			{ position: 300, duration: 0, finished: false, updatedAt: 1 },
			1200,
		),
	).toBe(300);
	expect(
		ruv.resumePosition(
			{ position: 1180, duration: 0, finished: false, updatedAt: 1 },
			1200,
		),
	).toBe(0);
});

test("continue watching lists resumable available episodes in recency order", () => {
	seedProgram(1, "Eitt");
	seedProgram(2, "Tvö");
	seedEpisode("resumable-old", 1, 1200);
	seedEpisode("resumable-new", 1, 1800);
	seedEpisode("finished", 2, 1200);
	seedEpisode("expired", 2, 1200, "2020-01-01");
	seedEpisode("barely-started", 2, 1200);

	ruv.saveWatchProgress(
		{ episodeId: "resumable-old", position: 200, duration: 1200 },
		1000,
	);
	ruv.saveWatchProgress(
		{ episodeId: "resumable-new", position: 900, duration: 1800 },
		2000,
	);
	ruv.saveWatchProgress(
		{ episodeId: "finished", position: 1190, duration: 1200 },
		3000,
	);
	ruv.saveWatchProgress(
		{ episodeId: "expired", position: 400, duration: 1200 },
		4000,
	);
	ruv.saveWatchProgress(
		{ episodeId: "barely-started", position: 4, duration: 1200 },
		5000,
	);

	const items = ruv.listContinueWatching();
	expect(items.map((item) => item.episode.id)).toEqual([
		"resumable-new",
		"resumable-old",
	]);
	expect(items[0].progress).toBeCloseTo(0.5);
	expect(items[0].episode.programTitle).toBe("Eitt");
	expect(ruv.listContinueWatching(1).map((item) => item.episode.id)).toEqual([
		"resumable-new",
	]);
	const withProgress = ruv
		.listRuvEpisodes(1)
		.find((episode) => episode.id === "resumable-new");
	expect(withProgress?.progress).toMatchObject({
		position: 900,
		duration: 1800,
		finished: false,
	});
	expect(ruv.getRuvEpisode("finished")?.progress?.finished).toBe(true);
	expect(ruv.getRuvEpisode("resumable-new")?.progress?.updatedAt).toBe(2000);
});

test("program favourites feed My List and dashboard content", () => {
	seedProgram(1, "Eitt");
	seedProgram(2, "Tvö");
	seedEpisode("e1", 1);
	seedEpisode("e2", 2);
	seedEpisode("resume", 1, 1200);
	ruv.saveWatchProgress({ episodeId: "resume", position: 300, duration: 1200 });

	expect(ruv.toggleProgramFavorite(1)).toBe(true);
	expect(ruv.toggleProgramFavorite(2)).toBe(true);
	expect(ruv.listProgramFavorites()).toEqual([2, 1]);
	expect(ruv.listMyListPrograms().map((program) => program.id)).toEqual([2, 1]);

	const content = ruv.dashboardContent();
	expect(content.myList.map((program) => program.id)).toEqual([2, 1]);
	expect(content.continueWatching.map((item) => item.episode.id)).toEqual([
		"resume",
	]);

	expect(ruv.toggleProgramFavorite(2)).toBe(false);
	expect(ruv.listProgramFavorites()).toEqual([1]);
	ruv.markMissingRuvEpisodesUnavailable(1, []);
	expect(ruv.listMyListPrograms()).toEqual([]);
	expect(ruv.listProgramFavorites()).toEqual([1]);
});

test("movie catalog is derived from persisted RÚV categories", () => {
	seedProgram(1, "Kvikmynd", [{ title: "Kvikmyndir", slug: "kvikmyndir" }]);
	seedProgram(2, "Þáttaröð", [{ title: "Leikið efni", slug: "leikid-efni" }]);
	seedEpisode("movie", 1);
	seedEpisode("series", 2);

	expect(ruv.getRuvProgram(1)?.kind).toBe("movie");
	expect(ruv.getRuvProgram(2)?.kind).toBe("series");
	expect(ruv.listRuvMovies().map((program) => program.id)).toEqual([1]);
	expect(ruv.dashboardContent().movies.map((program) => program.id)).toEqual([
		1,
	]);
});

test("torrent movie is DB-backed and serves HTTP byte ranges", async () => {
	const item = torrent.listTorrentMedia()[0];
	expect(item).toMatchObject({
		id: "big-buck-bunny",
		title: "Big Buck Bunny",
		license: "CC BY 3.0",
		status: "ready",
		downloadedBytes: 276_134_947,
	});
	const response = torrent.serveTorrentMedia(
		new Request("http://127.0.0.1:31999/torrent/media/big-buck-bunny", {
			headers: {
				Origin: "http://127.0.0.1:3111",
				Range: "bytes=10-19",
			},
		}),
		"big-buck-bunny",
	);
	expect(response.status).toBe(206);
	expect(response.headers.get("Content-Range")).toBe("bytes 10-19/276134947");
	expect((await response.arrayBuffer()).byteLength).toBe(10);
	expect(
		torrent.serveTorrentMedia(
			new Request("http://127.0.0.1:31999", {
				headers: { Range: "bytes=999999999-" },
			}),
			"big-buck-bunny",
		).status,
	).toBe(416);
});

test("program-favorite command parses like other integer commands", () => {
	expect(
		parseCommandMessage({
			type: "command",
			action: "program-favorite",
			value: 7,
		}),
	).toEqual({ type: "command", action: "program-favorite", value: 7 });
	expect(
		parseCommandMessage({
			type: "command",
			action: "program-favorite",
			value: 7,
			label: "Minn listi",
		}),
	).toMatchObject({
		action: "program-favorite",
		value: 7,
		label: "Minn listi",
	});
	expect(
		parseCommandMessage({
			type: "command",
			action: "program-favorite",
			value: 0,
		}),
	).toBeNull();
	expect(
		parseCommandMessage({
			type: "command",
			action: "program-favorite",
			value: 1.5,
		}),
	).toBeNull();
	expect(
		parseCommandMessage({
			type: "command",
			action: "program-favorite",
			value: "7",
		}),
	).toBeNull();
	expect(
		parseCommandMessage({ type: "command", action: "program-favorite" }),
	).toBeNull();
	expect(
		parseCommandMessage({
			type: "command",
			action: "media-progress",
			value: 12.5,
		}),
	).toMatchObject({ action: "media-progress", value: 12.5 });
	expect(
		parseCommandMessage({
			type: "command",
			action: "torrent-media",
			value: "big-buck-bunny",
		}),
	).toMatchObject({ action: "torrent-media", value: "big-buck-bunny" });
});

test("shared state normalization carries program favourites", () => {
	expect(createDefaultState().programFavorites).toEqual([]);
	const normalized = normalizeHomeState(
		{},
		{ radio: [3], tv: ["ruv"], programs: [5, 2] },
	);
	expect(normalized.programFavorites).toEqual([5, 2]);
	expect(normalized.radioFavorites).toEqual([3]);
	expect(normalized.tvFavorites).toEqual(["ruv"]);
});
