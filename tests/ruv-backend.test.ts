import { afterAll, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { Database } from "bun:sqlite";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { HomeState } from "../packages/protocol";
import { parseCommandMessage } from "../apps/server/src/commands";
import { parseAllowedOrigins, preflightResponse, requestOriginAllowed } from "../apps/server/src/httpAccess";
import { nextRuvJob, RuvScheduler } from "../apps/server/src/ruvScheduler";
import { createDefaultState, normalizeHomeState } from "../apps/server/src/state";

const root = mkdtempSync(join(tmpdir(), "tv-kit-test-"));
Object.assign(Bun.env, {
  PORT: "31999",
  TV_KIT_DB: join(root, "tv-kit.sqlite"),
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
  HOME_LOCATION: "Akureyri"
});

const database = await import("../apps/server/src/db");
const ruv = await import("../apps/server/src/ruvdb");
const scraper = await import("../apps/server/src/ruvscraper");
const { db } = database;

const media = {
  id: "idle", kind: "tv" as const, title: "Engin spilun", subtitle: "", source: "RÚV", src: "", artwork: "", live: false,
  currentTime: 0, duration: 0, playbackRate: 1, subtitleTrack: "Slökkt", audioTrack: "Aðalhljóð", subtitles: [], textTracks: [],
  audioTracks: ["Aðalhljóð"], epg: [], panel: null, fullscreen: false, favorite: false, status: "idle" as const
};
const state = (lastAction: string): HomeState => ({
  playing: false, volume: 35, channel: 1, scene: "", lights: false, muted: false, view: "home", previousView: "home",
  power: true, lastAction, media, radioFavorites: [], tvFavorites: [], cast: null
});

beforeEach(() => {
  db.exec(`
    DELETE FROM ruv_epg_events;
    DELETE FROM ruv_episodes;
    DELETE FROM ruv_programs;
    DELETE FROM ruv_channels;
    DELETE FROM ruv_news_articles;
    DELETE FROM ruv_scrape_runs;
    DELETE FROM favourites WHERE kind='tv';
    DELETE FROM app_state;
  `);
});

afterAll(() => {
  db.close();
  rmSync(root, { recursive: true, force: true });
});

test("empty database applies ordered migrations and idempotent state seed", () => {
  expect(database.schemaVersions()).toEqual([1, 2, 3, 4, 5]);
  expect(database.databaseIntegrity()).toBe("ok");
  database.seedStateIfMissing(state("fyrsta"));
  database.seedStateIfMissing(state("annað"));
  expect(database.loadState()?.lastAction).toBe("fyrsta");
});

test("RÚV rows serialize as typed camelCase DTOs with parsed values", () => {
  ruv.replaceRuvChannels([{ slug: "ruv", name: "RÚV", kind: "tv", streamUrl: "https://example.test/live.m3u8", geoblock: false, checkedAt: 10 }]);
  ruv.upsertRuvProgramRecord({
    id: 7, title: "Prógramm", foreignTitle: "", slug: "program", description: "Lýsing", shortDescription: "",
    image: "https://example.test/program.webp", portraitImage: "", categories: [{ title: "Fréttir", slug: "frettir" }],
    channel: "RÚV", webAvailableEpisodes: 1, webPlayerUrl: "https://www.ruv.is/sjonvarp/spila/program/7"
  }, true, 100);
  ruv.upsertRuvEpisodeRecord({
    id: "ep1", programId: 7, number: 1, title: "Þáttur 1", description: "", firstRun: "2026-07-11T10:00:00",
    duration: 1200, durationFriendly: "20 mín.", image: "https://example.test/ep.webp", fileUrl: "https://example.test/ep.m3u8",
    subtitles: { is: "https://example.test/is.vtt", en: null }, rating: null, slug: "ep1", eventId: 99, fileExpires: "2099-01-01"
  }, 100);
  const channel = ruv.listRuvChannels()[0];
  const program = ruv.listRuvPrograms(10)[0];
  expect(channel).toEqual({ slug: "ruv", name: "RÚV", kind: "tv", streamUrl: "https://example.test/live.m3u8", geoblock: false, checkedAt: 10 });
  expect(program.categories).toEqual([{ title: "Fréttir", slug: "frettir" }]);
  expect(program.latestEpisode?.textTracks).toEqual([{ label: "IS", language: "is", src: "https://example.test/is.vtt" }]);
  expect(JSON.stringify(program)).not.toContain("foreign_title");
  expect(JSON.stringify(program)).not.toContain("file_url");
});

test("EPG parsing records overlap flags and reconciliation selects non-header current event", () => {
  const parsed = scraper.parseRuvEpgXml(`<?xml version="1.0"?><schedule><event event-id="1" serie-id="8" start-time="2026-07-11 10:00:00" duration="02:00:00"><title>Haus &amp; dagskrá</title><header>yes</header><subevent>no</subevent><live>no</live><rerun>no</rerun></event><event event-id="2" serie-id="9" start-time="2026-07-11 10:30:00" duration="00:30:00"><title><![CDATA[Raunþáttur]]></title><header>no</header><subevent>yes</subevent><live>yes</live><rerun>no</rerun><episode number="2" number-of-episodes="4"/></event></schedule>`, "ruv");
  expect(parsed).toHaveLength(2);
  expect(parsed[0].title).toBe("Haus & dagskrá");
  expect(parsed[0].header).toBe(true);
  expect(parsed[1].subevent).toBe(true);

  ruv.replaceRuvChannels([{ slug: "ruv", name: "RÚV", kind: "tv", streamUrl: "https://example.test/live.m3u8", geoblock: false, checkedAt: 10 }]);
  const now = Date.now();
  ruv.reconcileRuvEpg("ruv", now - 60_000, now + 3_600_000, [
    { eventId: 10, channelSlug: "ruv", seriesId: 1, startTime: now - 60_000, endTime: now + 3_600_000, title: "Haus", originalTitle: "", description: "", category: "", episodeNumber: null, episodeTotal: null, rerun: false, live: false, header: true, subevent: false, moreInfoUrl: "" },
    { eventId: 11, channelSlug: "ruv", seriesId: 2, startTime: now - 30_000, endTime: now + 600_000, title: "Núna", originalTitle: "", description: "", category: "Fréttir", episodeNumber: null, episodeTotal: null, rerun: false, live: true, header: false, subevent: true, moreInfoUrl: "" },
    { eventId: 12, channelSlug: "ruv", seriesId: 3, startTime: now + 600_000, endTime: now + 1_200_000, title: "Næst", originalTitle: "", description: "", category: "", episodeNumber: null, episodeTotal: null, rerun: false, live: false, header: false, subevent: false, moreInfoUrl: "" }
  ]);
  expect(ruv.getRuvNow("ruv", now)?.current?.eventId).toBe(11);
  expect(ruv.listRuvEpg("ruv", now - 60_000, now + 3_600_000).map(event => event.eventId)).toEqual([11, 12]);
});

test("daemon scheduler prioritizes due daily work and never overlaps children", async () => {
  expect(nextRuvJob({ now: 100, dailyIntervalMs: 50, newsIntervalMs: 20, lastDailySuccess: 10, lastNewsSuccess: 90, childRunning: false })).toBe("daily");
  expect(nextRuvJob({ now: 100, dailyIntervalMs: 50, newsIntervalMs: 20, lastDailySuccess: 90, lastNewsSuccess: 70, childRunning: false })).toBe("news");
  expect(nextRuvJob({ now: 100, dailyIntervalMs: 50, newsIntervalMs: 20, lastDailySuccess: 90, lastNewsSuccess: 90, childRunning: false })).toBeNull();

  let resolveExit!: (code: number) => void;
  const exited = new Promise<number>(resolve => resolveExit = resolve);
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
    spawn: () => { spawns++; return { exited, output: Promise.resolve("ok"), stop: () => resolveExit(143) }; },
    recordStart: () => 1,
    recordFinish: (_id, result) => finishes.push(result),
    setTimer: (() => 0) as unknown as typeof setTimeout,
    clearTimer: () => {},
    log: () => {}
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
      exited: new Promise<number>(resolve => stopExit = resolve),
      output: Promise.resolve("terminated"),
      stop: () => { stoppedChildren++; stopExit(143); }
    }),
    recordStart: () => 2,
    recordFinish: () => {},
    setTimer: (() => 0) as unknown as typeof setTimeout,
    clearTimer: () => {},
    log: () => {}
  });
  stoppingScheduler.start();
  const stoppingRun = stoppingScheduler.tick();
  stoppingScheduler.stop();
  expect(stoppedChildren).toBe(1);
  await stoppingRun;
});

test("featured flags and episode expiry are maintained without deleting history", () => {
  const base = { foreignTitle: "", slug: "p", description: "", shortDescription: "", image: "", portraitImage: "", categories: [], channel: "RÚV", webAvailableEpisodes: 1, webPlayerUrl: "" };
  ruv.upsertRuvProgramRecord({ id: 1, title: "Eitt", ...base }, true);
  ruv.upsertRuvProgramRecord({ id: 2, title: "Tvö", ...base }, true);
  ruv.upsertRuvEpisodeRecord({ id: "old", programId: 1, number: 1, title: "Gamalt", description: "", firstRun: null, duration: 1, durationFriendly: "", image: "", fileUrl: "https://example.test/old.m3u8", subtitles: {}, rating: null, slug: "", eventId: null, fileExpires: "2020-01-01" });
  ruv.upsertRuvEpisodeRecord({ id: "new", programId: 2, number: 1, title: "Nýtt", description: "", firstRun: null, duration: 1, durationFriendly: "", image: "", fileUrl: "https://example.test/new.m3u8", subtitles: {}, rating: null, slug: "", eventId: null, fileExpires: "2099-01-01" });
  ruv.setFeaturedRuvPrograms([2]);
  expect(ruv.markExpiredRuvEpisodes("2026-07-11")).toBeGreaterThanOrEqual(0);
  expect(ruv.ruvProgramAvailability()).toEqual([{ id: 1, featured: 0, available: 0 }, { id: 2, featured: 1, available: 1 }]);
  expect(ruv.totalRuvEpisodeCount()).toBe(2);
});
