import { parseAllowedOrigins } from "./httpAccess";

function required(name: string) {
	const value = Bun.env[name]?.trim();
	if (!value) throw new Error(`Missing required environment variable: ${name}`);
	return value;
}

function optional(name: string) {
	return Bun.env[name]?.trim() || "";
}

function number(name: string, minimum = 1, maximum = Number.MAX_SAFE_INTEGER) {
	const value = Number(required(name));
	if (!Number.isFinite(value) || value < minimum || value > maximum) {
		throw new Error(
			`Environment variable ${name} must be between ${minimum} and ${maximum}`,
		);
	}
	return value;
}

function optionalNumber(name: string, fallback: number, minimum = 1, maximum = Number.MAX_SAFE_INTEGER) {
	const raw = optional(name);
	if (!raw) return fallback;
	const value = Number(raw);
	if (!Number.isFinite(value) || value < minimum || value > maximum) {
		throw new Error(
			`Environment variable ${name} must be between ${minimum} and ${maximum}`,
		);
	}
	return value;
}

export const config = Object.freeze({
	port: number("PORT", 1, 65_535),
	serverUrl: required("VITE_TVSERVER_URL").replace(/\/$/, ""),
	databasePath: required("TV_KIT_DB"),
	torrentMediaDir: required("TORRENT_MEDIA_DIR"),
	deilduBaseUrl: required("DEILDU_BASE_URL").replace(/\/$/, ""),
	deilduUsername: optional("DEILDU_USERNAME"),
	deilduPassword: optional("DEILDU_PASSWORD"),
	deilduPasskey: optional("DEILDU_PASSKEY"),
	deilduUserAgent: required("DEILDU_USER_AGENT"),
	deilduSyncIntervalMs: number("DEILDU_SYNC_INTERVAL_MS", 60_000),
	deilduSchedulerStartDelayMs: number(
		"DEILDU_SCHEDULER_START_DELAY_MS",
		1_000,
		3_600_000,
	),
	deilduScrapePages: number("DEILDU_SCRAPE_PAGES", 1, 20),
	deilduScrapePacingMs: number("DEILDU_SCRAPE_PACING_MS", 0, 60_000),
	deilduFetchTimeoutMs: number("DEILDU_FETCH_TIMEOUT_MS", 1_000, 120_000),
	deilduAria2Bin: required("DEILDU_ARIA2_BIN"),
	deilduStreamRpcPort: number("DEILDU_STREAM_RPC_PORT", 1, 65_535),
	deilduStreamStartTimeoutMs: number(
		"DEILDU_STREAM_START_TIMEOUT_MS",
		5_000,
		300_000,
	),
	deilduStreamRangeWaitMs: number(
		"DEILDU_STREAM_RANGE_WAIT_MS",
		1_000,
		300_000,
	),
	deilduStreamBufferBytes: number(
		"DEILDU_STREAM_BUFFER_BYTES",
		1_048_576,
		268_435_456,
	),
	radioSourceUrl: required("RADIO_SOURCE_URL"),
	radioSourceName: required("RADIO_SOURCE_NAME"),
	radioSyncIntervalMs: number("RADIO_SYNC_INTERVAL_MS"),
	radioStreamTimeoutMs: number("RADIO_STREAM_TIMEOUT_MS", 1_000, 120_000),
	radioScrapeConcurrency: number("RADIO_SCRAPE_CONCURRENCY", 1, 32),
	solarApiUrl: required("SOLAR_API_URL"),
	solarCacheMs: number("SOLAR_CACHE_MS"),
	ruvApiBase: required("RUV_API_BASE"),
	ruvLiveBase: required("RUV_LIVE_BASE"),
	ruvEpgBase: required("RUV_EPG_BASE"),
	ruvSiteBase: required("RUV_SITE_BASE"),
	ruvSearchUrl: required("RUV_SEARCH_URL"),
	ruvNewsCategories: required("RUV_NEWS_CATEGORIES")
		.split(",")
		.map((value) => value.trim()),
	ruvEpgDaysBack: number("RUV_EPG_DAYS_BACK", 0, 30),
	ruvEpgDaysForward: number("RUV_EPG_DAYS_FORWARD", 1, 30),
	ruvSyncIntervalMs: number("RUV_SYNC_INTERVAL_MS"),
	ruvNewsSyncIntervalMs: number("RUV_NEWS_SYNC_INTERVAL_MS"),
	ruvSchedulerStartDelayMs: number(
		"RUV_SCHEDULER_START_DELAY_MS",
		1_000,
		3_600_000,
	),
	ruvSchedulerPollMs: number("RUV_SCHEDULER_POLL_MS", 10_000, 3_600_000),
	ruvChildTimeoutMs: number("RUV_CHILD_TIMEOUT_MS", 60_000, 3_600_000),
	ruvScraperBin: optional("RUV_SCRAPER_BIN"),
	ruvScrapeConcurrency: number("RUV_SCRAPE_CONCURRENCY", 1, 16),
	ruvCatalogConcurrency: number("RUV_CATALOG_CONCURRENCY", 1, 16),
	ruvFetchTimeoutMs: number("RUV_FETCH_TIMEOUT_MS", 1_000, 120_000),
	ruvFetchRetries: number("RUV_FETCH_RETRIES", 1, 5),
	ruvUserAgent: required("RUV_USER_AGENT"),
	ruvArchiveSearchTerms: required("RUV_ARCHIVE_SEARCH_TERMS")
		.split(",")
		.map((value) => value.trim())
		.filter(Boolean),
	ruvArchiveSearchBatchSize: number("RUV_ARCHIVE_SEARCH_BATCH_SIZE", 1, 8),
	ruvArchiveSearchPacingMs: number("RUV_ARCHIVE_SEARCH_PACING_MS", 100, 60_000),
	allowedOrigins: parseAllowedOrigins(required("TV_ALLOWED_ORIGINS")),
	localLlmBaseUrl: optional("LOCAL_LLM_BASE_URL").replace(/\/$/, ""),
	localLlmApiKey: optional("LOCAL_LLM_API_KEY"),
	localLlmModel: optional("LOCAL_LLM_MODEL") || "empero-ai/Qwythos-9B-v2-GGUF",
	localLlmTimeoutMs: optionalNumber("LOCAL_LLM_TIMEOUT_MS", 120_000, 5_000, 300_000),
	castIngressToken: optional("CAST_INGRESS_TOKEN"),
	latitude: required("HOME_LATITUDE"),
	longitude: required("HOME_LONGITUDE"),
	timezone: required("HOME_TIMEZONE"),
	location: required("HOME_LOCATION"),
});
