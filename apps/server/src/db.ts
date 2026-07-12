import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { HomeState, MediaItem, Station } from "../../../packages/protocol";
import { config } from "./config";

function parseJson<T>(payload: string): T | undefined {
	try {
		return JSON.parse(payload) as T;
	} catch {
		return undefined;
	}
}

export const databasePath = config.databasePath;
mkdirSync(dirname(databasePath), { recursive: true });

export const db = new Database(databasePath, { create: true, strict: true });
// Bun query() is the cached prepared-statement factory used by the SQLite layer.
export const statement = db.query.bind(db);
db.exec("PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;");
db.exec("PRAGMA journal_mode=WAL;");

const migrations = [
	{
		version: 1,
		sql: `
    CREATE TABLE app_state (
      key TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE client_settings (
      client_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (client_id, key)
    );
    CREATE TABLE radio_stations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      frequency REAL NOT NULL,
      terrestrial INTEGER NOT NULL,
      stream_url TEXT NOT NULL,
      logo_url TEXT NOT NULL,
      source TEXT NOT NULL,
      status_code INTEGER NOT NULL DEFAULT 200,
      checked_at INTEGER NOT NULL
    );
    CREATE TABLE radio_sync_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at INTEGER NOT NULL,
      finished_at INTEGER,
      source_count INTEGER NOT NULL DEFAULT 0,
      healthy_count INTEGER NOT NULL DEFAULT 0,
      added_count INTEGER NOT NULL DEFAULT 0,
      removed_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      error TEXT
    );
    CREATE TABLE api_cache (
      key TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      fetched_at INTEGER NOT NULL
    );
    CREATE TABLE media_items (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      subtitle TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT '',
      src TEXT NOT NULL DEFAULT '',
      artwork TEXT NOT NULL DEFAULT '',
      live INTEGER NOT NULL DEFAULT 0,
      metadata TEXT NOT NULL DEFAULT '{}',
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE epg_programmes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      media_id TEXT NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
      starts_at INTEGER NOT NULL,
      ends_at INTEGER,
      title TEXT NOT NULL,
      detail TEXT NOT NULL DEFAULT '',
      metadata TEXT NOT NULL DEFAULT '{}'
    );
    CREATE INDEX epg_media_start ON epg_programmes(media_id, starts_at);
    CREATE TABLE calendar_events (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      starts_at INTEGER,
      ends_at INTEGER,
      all_day INTEGER NOT NULL DEFAULT 0,
      location TEXT NOT NULL DEFAULT '',
      metadata TEXT NOT NULL DEFAULT '{}',
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE home_widgets (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      payload TEXT NOT NULL DEFAULT '{}',
      sort_order INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 1,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE favourites (
      profile_id TEXT NOT NULL DEFAULT 'home',
      media_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (profile_id, media_id)
    );
    CREATE TABLE playback_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id TEXT NOT NULL DEFAULT 'home',
      media_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      source TEXT NOT NULL,
      position REAL NOT NULL DEFAULT 0,
      duration REAL NOT NULL DEFAULT 0,
      started_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX playback_recent ON playback_history(profile_id, updated_at DESC);
  `,
	},
	{
		version: 2,
		sql: `ALTER TABLE radio_stations ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;`,
	},
	{
		version: 3,
		sql: `
    CREATE TABLE ruv_channels (
      slug TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      kind TEXT NOT NULL,
      stream_url TEXT NOT NULL,
      geoblock INTEGER NOT NULL DEFAULT 0,
      checked_at INTEGER NOT NULL
    );
    CREATE TABLE ruv_programs (
      id INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      foreign_title TEXT NOT NULL DEFAULT '',
      slug TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      short_description TEXT NOT NULL DEFAULT '',
      image TEXT NOT NULL DEFAULT '',
      portrait_image TEXT NOT NULL DEFAULT '',
      categories TEXT NOT NULL DEFAULT '[]',
      channel TEXT NOT NULL DEFAULT '',
      web_available_episodes INTEGER NOT NULL DEFAULT 0,
      web_player_url TEXT NOT NULL DEFAULT '',
      metadata TEXT NOT NULL DEFAULT '{}',
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX ruv_programs_updated ON ruv_programs(updated_at DESC);
    CREATE TABLE ruv_episodes (
      id TEXT PRIMARY KEY,
      program_id INTEGER NOT NULL REFERENCES ruv_programs(id) ON DELETE CASCADE,
      number INTEGER,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      firstrun TEXT,
      duration INTEGER NOT NULL DEFAULT 0,
      duration_friendly TEXT NOT NULL DEFAULT '',
      image TEXT NOT NULL DEFAULT '',
      file_url TEXT NOT NULL DEFAULT '',
      subtitles TEXT NOT NULL DEFAULT '{}',
      rating INTEGER,
      slug TEXT NOT NULL DEFAULT '',
      event_id INTEGER,
      file_expires TEXT,
      metadata TEXT NOT NULL DEFAULT '{}',
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX ruv_episodes_program ON ruv_episodes(program_id, firstrun DESC);
    CREATE TABLE ruv_epg_events (
      event_id INTEGER PRIMARY KEY,
      channel_slug TEXT NOT NULL,
      serie_id INTEGER,
      start_time INTEGER NOT NULL,
      end_time INTEGER,
      title TEXT NOT NULL,
      original_title TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT '',
      episode_number INTEGER,
      episode_total INTEGER,
      rerun INTEGER NOT NULL DEFAULT 0,
      live INTEGER NOT NULL DEFAULT 0,
      more_info_url TEXT NOT NULL DEFAULT '',
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX ruv_epg_channel_start ON ruv_epg_events(channel_slug, start_time);
    CREATE TABLE ruv_news_articles (
      id INTEGER PRIMARY KEY,
      slug TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL,
      subtitle TEXT NOT NULL DEFAULT '',
      url TEXT NOT NULL DEFAULT '',
      category_slug TEXT NOT NULL DEFAULT '',
      category_title TEXT NOT NULL DEFAULT '',
      topic_name TEXT NOT NULL DEFAULT '',
      topic_slug TEXT NOT NULL DEFAULT '',
      authors TEXT NOT NULL DEFAULT '[]',
      tags TEXT NOT NULL DEFAULT '[]',
      main_image_url TEXT NOT NULL DEFAULT '',
      body_html TEXT NOT NULL DEFAULT '',
      body_json TEXT NOT NULL DEFAULT '[]',
      first_published_at INTEGER,
      last_published_at INTEGER,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX ruv_news_published ON ruv_news_articles(first_published_at DESC);
    CREATE TABLE ruv_scrape_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      finished_at INTEGER,
      item_count INTEGER NOT NULL DEFAULT 0,
      added_count INTEGER NOT NULL DEFAULT 0,
      updated_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      error TEXT
    );
    CREATE INDEX ruv_scrape_runs_kind ON ruv_scrape_runs(kind, started_at DESC);
  `,
	},
	{
		version: 4,
		sql: `
    ALTER TABLE ruv_programs ADD COLUMN featured INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE ruv_programs ADD COLUMN available INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE ruv_programs ADD COLUMN last_seen_at INTEGER;
    ALTER TABLE ruv_episodes ADD COLUMN available INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE ruv_epg_events ADD COLUMN header INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE ruv_epg_events ADD COLUMN subevent INTEGER NOT NULL DEFAULT 0;
    CREATE INDEX ruv_programs_featured ON ruv_programs(featured, available, updated_at DESC);
    CREATE INDEX ruv_episodes_available ON ruv_episodes(program_id, available, firstrun DESC);
  `,
	},
	{
		version: 5,
		sql: `
    UPDATE ruv_episodes
    SET available=CASE
      WHEN file_url!='' AND (file_expires IS NULL OR file_expires>=date('now')) THEN 1
      ELSE 0
    END;
    UPDATE ruv_programs
    SET available=CASE WHEN EXISTS (
      SELECT 1 FROM ruv_episodes e
      WHERE e.program_id=ruv_programs.id AND e.available=1 AND e.file_url!=''
    ) THEN 1 ELSE 0 END;
  `,
	},
	{
		version: 6,
		sql: `
    CREATE TABLE watch_progress (
      profile_id TEXT NOT NULL DEFAULT 'home',
      episode_id TEXT NOT NULL,
      program_id INTEGER NOT NULL,
      position REAL NOT NULL DEFAULT 0,
      duration REAL NOT NULL DEFAULT 0,
      finished INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (profile_id, episode_id)
    );
    CREATE INDEX watch_progress_recent ON watch_progress(profile_id, finished, updated_at DESC);
  `,
	},
	{
		version: 7,
		sql: `
    CREATE TABLE ruv_epg_events_v7 (
      event_id INTEGER NOT NULL,
      channel_slug TEXT NOT NULL,
      serie_id INTEGER,
      start_time INTEGER NOT NULL,
      end_time INTEGER,
      title TEXT NOT NULL,
      original_title TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT '',
      episode_number INTEGER,
      episode_total INTEGER,
      rerun INTEGER NOT NULL DEFAULT 0,
      live INTEGER NOT NULL DEFAULT 0,
      more_info_url TEXT NOT NULL DEFAULT '',
      updated_at INTEGER NOT NULL,
      header INTEGER NOT NULL DEFAULT 0,
      subevent INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (channel_slug, event_id)
    );
    INSERT INTO ruv_epg_events_v7 (
      event_id, channel_slug, serie_id, start_time, end_time, title,
      original_title, description, category, episode_number, episode_total,
      rerun, live, more_info_url, updated_at, header, subevent
    )
    SELECT event_id, channel_slug, serie_id, start_time, end_time, title,
      original_title, description, category, episode_number, episode_total,
      rerun, live, more_info_url, updated_at, header, subevent
    FROM ruv_epg_events;
    DROP TABLE ruv_epg_events;
    ALTER TABLE ruv_epg_events_v7 RENAME TO ruv_epg_events;
    CREATE INDEX ruv_epg_channel_start ON ruv_epg_events(channel_slug, start_time);
  `,
	},
	{
		version: 8,
		sql: `
    CREATE TABLE torrent_media (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL,
      license TEXT NOT NULL,
      torrent_uri TEXT NOT NULL,
      file_path TEXT NOT NULL,
      artwork_path TEXT NOT NULL DEFAULT '',
      duration INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'missing' CHECK(status IN ('missing','incomplete','downloading','ready')),
      downloaded_bytes INTEGER NOT NULL DEFAULT 0,
      total_bytes INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    );
    INSERT OR IGNORE INTO torrent_media (
      id, title, description, source, license, torrent_uri, file_path,
      artwork_path, duration, status, downloaded_bytes, total_bytes, updated_at
    ) VALUES (
      'big-buck-bunny',
      'Big Buck Bunny',
      'Opin Blender-kvikmynd sótt með BitTorrent.',
      'WebTorrent · Blender Foundation',
      'CC BY 3.0',
      'https://webtorrent.io/torrents/big-buck-bunny.torrent',
      'big-buck-bunny/Big Buck Bunny/Big Buck Bunny.mp4',
      'big-buck-bunny/Big Buck Bunny/poster.jpg',
      596,
      'missing',
      0,
      276134947,
      CAST(strftime('%s','now') AS INTEGER) * 1000
    );
  `,
	},
	{
		version: 9,
		sql: `
    CREATE TABLE deildu_categories (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      media_kind TEXT NOT NULL CHECK(media_kind IN ('movie','tv','audio','other')),
      playable INTEGER NOT NULL DEFAULT 0 CHECK(playable IN (0,1)),
      sort_order INTEGER NOT NULL
    );
    INSERT INTO deildu_categories (id, name, media_kind, playable, sort_order) VALUES
      (1, 'Tónlist', 'audio', 1, 1),
      (2, 'Kvikmyndir', 'movie', 1, 2),
      (3, 'Leikir', 'other', 0, 3),
      (4, 'Forrit', 'other', 0, 4),
      (5, 'Sjónvarpsefni', 'tv', 1, 5),
      (6, 'Kvikmyndir', 'movie', 1, 6),
      (7, 'Hljóðbækur', 'audio', 1, 7),
      (8, 'Sjónvarpsefni', 'tv', 1, 8),
      (9, 'Fræðsluefni', 'tv', 1, 9),
      (10, 'Íslenskt', 'other', 1, 10),
      (11, 'Teiknimyndir', 'movie', 1, 11),
      (12, 'Þættir', 'tv', 1, 12),
      (13, 'Íþróttir', 'tv', 1, 13),
      (14, 'Annað', 'other', 0, 14);
    CREATE TABLE deildu_items (
      id INTEGER PRIMARY KEY,
      category_id INTEGER NOT NULL REFERENCES deildu_categories(id),
      title TEXT NOT NULL,
      size_bytes INTEGER NOT NULL DEFAULT 0,
      seeders INTEGER NOT NULL DEFAULT 0,
      leechers INTEGER NOT NULL DEFAULT 0,
      added_at INTEGER,
      last_seen_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX deildu_items_category_added
      ON deildu_items(category_id, added_at DESC, id DESC);
    CREATE TABLE deildu_scrape_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at INTEGER NOT NULL,
      finished_at INTEGER,
      status TEXT NOT NULL CHECK(status IN ('running','complete','partial','error')),
      category_count INTEGER NOT NULL DEFAULT 0,
      item_count INTEGER NOT NULL DEFAULT 0,
      added_count INTEGER NOT NULL DEFAULT 0,
      updated_count INTEGER NOT NULL DEFAULT 0,
      error TEXT
    );
    CREATE INDEX deildu_scrape_runs_started
      ON deildu_scrape_runs(started_at DESC);
    CREATE TABLE deildu_downloads (
      item_id INTEGER PRIMARY KEY REFERENCES deildu_items(id) ON DELETE CASCADE,
      file_index INTEGER NOT NULL DEFAULT 0,
      file_path TEXT NOT NULL DEFAULT '',
      file_size INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'missing'
        CHECK(status IN ('missing','starting','downloading','paused','ready','error')),
      downloaded_bytes INTEGER NOT NULL DEFAULT 0,
      error TEXT NOT NULL DEFAULT '',
      updated_at INTEGER NOT NULL
    );
    INSERT OR IGNORE INTO deildu_items (
      id, category_id, title, size_bytes, seeders, leechers,
      added_at, last_seen_at, updated_at
    )
    SELECT CAST(substr(id, 8) AS INTEGER), 2, title, total_bytes, 0, 0,
      updated_at, updated_at, updated_at
    FROM torrent_media
    WHERE id GLOB 'deildu-[0-9]*';
    DELETE FROM torrent_media WHERE id GLOB 'deildu-[0-9]*';
  `,
	},
	{
		version: 10,
		sql: `
    ALTER TABLE deildu_items ADD COLUMN ai_cleaned INTEGER NOT NULL DEFAULT 0
      CHECK(ai_cleaned IN (0,1));
  `,
	},
	{
		version: 11,
		sql: `
    INSERT OR IGNORE INTO app_state(key, payload, updated_at)
      VALUES ('tmdb_api_key', '83cfd9944f3d21bb7c7a3a44ab6b4bca',
        CAST(strftime('%s','now') AS INTEGER) * 1000);
  `,
	},
	{
		version: 12,
		sql: `
    CREATE TABLE agent_chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id TEXT NOT NULL DEFAULT 'home',
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX agent_chat_recent ON agent_chat_messages(profile_id, created_at DESC, id DESC);
  `,
	},
];

db.exec(
	"CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)",
);
const applied = statement("SELECT version FROM schema_migrations").all() as {
	version: number;
}[];
const versions = new Set(applied.map((row) => row.version));
for (const migration of migrations) {
	if (versions.has(migration.version)) continue;
	db.transaction(() => {
		db.exec(migration.sql);
		statement(
			"INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)",
		).run(migration.version, Date.now());
	})();
}

export function schemaVersions() {
	return (
		statement(
			"SELECT version FROM schema_migrations ORDER BY version",
		).all() as { version: number }[]
	).map((row) => row.version);
}

export type AgentChatMessage = {
	id: number;
	role: "user" | "assistant";
	content: string;
	createdAt: number;
};

export function listAgentChatMessages(limit = 80): AgentChatMessage[] {
	return (
		statement(
			"SELECT id, role, content, created_at FROM agent_chat_messages WHERE profile_id = 'home' ORDER BY id DESC LIMIT ?",
		).all(Math.max(1, Math.min(200, limit))) as Array<{
			id: number;
			role: "user" | "assistant";
			content: string;
			created_at: number;
		}>
	).reverse().map((row) => ({
		id: row.id,
		role: row.role,
		content: row.content,
		createdAt: row.created_at,
	}));
}

export function appendAgentChatMessage(role: "user" | "assistant", content: string) {
	statement(
		"INSERT INTO agent_chat_messages(profile_id, role, content, created_at) VALUES ('home', ?, ?, ?)",
	).run(role, content, Date.now());
}

export function databaseIntegrity() {
	return (
		statement("PRAGMA integrity_check").get() as { integrity_check: string }
	).integrity_check;
}

export function loadState() {
	const row = statement(
		"SELECT payload FROM app_state WHERE key = 'shared'",
	).get() as { payload: string } | null;
	if (!row) return undefined;
	return parseJson<HomeState>(row.payload);
}

export function saveState(state: HomeState) {
	statement(`
    INSERT INTO app_state(key, payload, updated_at) VALUES ('shared', ?, ?)
    ON CONFLICT(key) DO UPDATE SET payload=excluded.payload, updated_at=excluded.updated_at
  `).run(JSON.stringify(state), Date.now());
}

export function getSetting(key: string): string | null {
	const row = statement("SELECT payload FROM app_state WHERE key = ?").get(
		key,
	) as { payload: string } | null;
	return row ? row.payload : null;
}

export function setSetting(key: string, value: string) {
	statement(`
    INSERT INTO app_state(key, payload, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET payload=excluded.payload, updated_at=excluded.updated_at
  `).run(key, value, Date.now());
}

export function seedStateIfMissing(state: HomeState) {
	statement(
		"INSERT OR IGNORE INTO app_state(key, payload, updated_at) VALUES ('shared', ?, ?)",
	).run(JSON.stringify(state), Date.now());
	return loadState()!;
}

export function getCache<T>(key: string) {
	const row = statement(
		"SELECT payload, fetched_at FROM api_cache WHERE key = ?",
	).get(key) as { payload: string; fetched_at: number } | null;
	if (!row) return undefined;
	const value = parseJson<T>(row.payload);
	return value === undefined ? undefined : { value, fetchedAt: row.fetched_at };
}

export function setCache(key: string, value: unknown, fetchedAt = Date.now()) {
	statement(`
    INSERT INTO api_cache(key, payload, fetched_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET payload=excluded.payload, fetched_at=excluded.fetched_at
  `).run(key, JSON.stringify(value), fetchedAt);
}

export function listRadioStations() {
	return (
		statement(
			"SELECT id, name, frequency, terrestrial, stream_url, logo_url FROM radio_stations ORDER BY sort_order, id",
		).all() as any[]
	).map(
		(row) =>
			({
				id: row.id,
				name: row.name,
				frequency: row.frequency,
				terrestrial: Boolean(row.terrestrial),
				streamUrl: row.stream_url,
				logoUrl: row.logo_url,
			}) satisfies Station,
	);
}

export function radioCatalogCheckedAt() {
	const row = statement(
		"SELECT MAX(checked_at) AS checked_at FROM radio_stations",
	).get() as { checked_at: number | null };
	return row.checked_at ?? 0;
}

export function replaceRadioStations(
	stations: Station[],
	checkedAt: number,
	sourceName: string,
) {
	const insert = statement(`
    INSERT INTO radio_stations(id, name, frequency, terrestrial, stream_url, logo_url, source, status_code, checked_at, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, 200, ?, ?)
  `);
	db.transaction(() => {
		db.exec("DELETE FROM radio_stations");
		stations.forEach((station, index) =>
			insert.run(
				station.id,
				station.name,
				station.frequency,
				Number(station.terrestrial),
				station.streamUrl,
				station.logoUrl,
				sourceName,
				checkedAt,
				index,
			),
		);
	})();
}

export function startRadioSync() {
	const row = statement(
		"INSERT INTO radio_sync_runs(started_at, status) VALUES (?, 'running') RETURNING id",
	).get(Date.now()) as { id: number };
	return row.id;
}

export function finishRadioSync(
	id: number,
	result: {
		source: number;
		healthy: number;
		added: number;
		removed: number;
		error?: string;
	},
) {
	statement(`
    UPDATE radio_sync_runs SET finished_at=?, source_count=?, healthy_count=?, added_count=?, removed_count=?, status=?, error=? WHERE id=?
  `).run(
		Date.now(),
		result.source,
		result.healthy,
		result.added,
		result.removed,
		result.error ? "failed" : "complete",
		result.error ?? null,
		id,
	);
}

export function listRadioFavorites() {
	return (
		statement(
			"SELECT media_id FROM favourites WHERE profile_id = 'home' AND kind = 'radio'",
		).all() as { media_id: string }[]
	)
		.map((row) => Number(row.media_id.replace("radio-", "")))
		.filter(Number.isFinite);
}

export function toggleRadioFavorite(id: number) {
	const mediaId = `radio-${id}`;
	const existing = statement(
		"SELECT 1 AS present FROM favourites WHERE profile_id = 'home' AND media_id = ?",
	).get(mediaId);
	if (existing)
		statement(
			"DELETE FROM favourites WHERE profile_id = 'home' AND media_id = ?",
		).run(mediaId);
	else
		statement(
			"INSERT INTO favourites(profile_id, media_id, kind, created_at) VALUES ('home', ?, 'radio', ?)",
		).run(mediaId, Date.now());
	return !existing;
}

export function recordPlayback(media: MediaItem) {
	const now = Date.now();
	statement(`
    INSERT INTO playback_history(media_id, kind, title, source, position, duration, started_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
		media.id,
		media.kind,
		media.title,
		media.source,
		media.currentTime,
		media.duration,
		now,
		now,
	);
}

export function upsertMedia(media: MediaItem) {
	statement(`
    INSERT INTO media_items(id, kind, title, subtitle, source, src, artwork, live, metadata, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET kind=excluded.kind, title=excluded.title, subtitle=excluded.subtitle,
      source=excluded.source, src=excluded.src, artwork=excluded.artwork, live=excluded.live,
      metadata=excluded.metadata, updated_at=excluded.updated_at
  `).run(
		media.id,
		media.kind,
		media.title,
		media.subtitle,
		media.source,
		media.src,
		media.artwork,
		Number(media.live),
		JSON.stringify(media),
		Date.now(),
	);
}

export function getMedia(id: string) {
	const row = statement("SELECT metadata FROM media_items WHERE id = ?").get(
		id,
	) as { metadata: string } | null;
	return row ? parseJson<MediaItem>(row.metadata) : undefined;
}

export function getMediaByKind(kind: string) {
	const row = statement(
		"SELECT metadata FROM media_items WHERE kind = ? ORDER BY updated_at DESC LIMIT 1",
	).get(kind) as { metadata: string } | null;
	return row ? parseJson<MediaItem>(row.metadata) : undefined;
}
