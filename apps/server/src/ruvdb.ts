import type {
  DashboardContent,
  MediaTextTrack,
  RuvCategory,
  RuvChannel,
  RuvEpgEvent,
  RuvEpisode,
  RuvNewsArticle,
  RuvNow,
  RuvProgram
} from "../../../packages/protocol";
import { db } from "./db";

const json = <T>(value: unknown, fallback: T): T => {
  if (typeof value !== "string") return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
};
const bool = (value: unknown) => Boolean(Number(value));

function textTracks(value: unknown): MediaTextTrack[] {
  const source = typeof value === "string" ? json<unknown>(value, {}) : value;
  if (!source || typeof source !== "object") return [];
  const tracks: MediaTextTrack[] = [];
  for (const [language, candidate] of Object.entries(source as Record<string, unknown>)) {
    const src = typeof candidate === "string" ? candidate : candidate && typeof candidate === "object"
      ? Object.values(candidate as Record<string, unknown>).find(item => typeof item === "string" && /^https?:\/\//.test(item))
      : undefined;
    if (typeof src === "string" && /^https?:\/\//.test(src)) tracks.push({ label: language.toUpperCase(), language, src });
  }
  return tracks;
}

function channelDto(row: any): RuvChannel {
  return { slug: row.slug, name: row.name, kind: row.kind, streamUrl: row.stream_url, geoblock: bool(row.geoblock), checkedAt: row.checked_at };
}

function episodeDto(row: any): RuvEpisode {
  return {
    id: row.id,
    programId: row.program_id,
    programTitle: row.program_title ?? "",
    number: row.number ?? null,
    title: row.title,
    description: row.description,
    firstRun: row.firstrun ?? null,
    duration: row.duration,
    durationFriendly: row.duration_friendly,
    image: row.image,
    fileUrl: row.file_url,
    textTracks: textTracks(row.subtitles),
    rating: row.rating ?? null,
    slug: row.slug,
    eventId: row.event_id ?? null,
    fileExpires: row.file_expires ?? null,
    available: bool(row.available),
    updatedAt: row.updated_at
  };
}

function latestEpisode(programId: number) {
  const row = db.query(`
    SELECT e.*, p.title AS program_title FROM ruv_episodes e
    JOIN ruv_programs p ON p.id=e.program_id
    WHERE e.program_id=? AND e.available=1 AND e.file_url!=''
    ORDER BY COALESCE(e.firstrun, '') DESC, e.updated_at DESC LIMIT 1
  `).get(programId) as any;
  return row ? episodeDto(row) : null;
}

function programDto(row: any): RuvProgram {
  return {
    id: row.id,
    title: row.title,
    foreignTitle: row.foreign_title,
    slug: row.slug,
    description: row.description,
    shortDescription: row.short_description,
    image: row.image,
    portraitImage: row.portrait_image,
    categories: json<RuvCategory[]>(row.categories, []),
    channel: row.channel,
    webAvailableEpisodes: row.web_available_episodes,
    webPlayerUrl: row.web_player_url,
    featured: bool(row.featured),
    available: bool(row.available),
    latestEpisode: latestEpisode(row.id),
    updatedAt: row.updated_at
  };
}

function eventDto(row: any): RuvEpgEvent {
  const vod = row.event_id == null ? null : getRuvEpisodeByEvent(row.event_id);
  return {
    eventId: row.event_id,
    channelSlug: row.channel_slug,
    seriesId: row.serie_id ?? null,
    startTime: row.start_time,
    endTime: row.end_time ?? null,
    title: row.title,
    originalTitle: row.original_title,
    description: row.description,
    category: row.category,
    episodeNumber: row.episode_number ?? null,
    episodeTotal: row.episode_total ?? null,
    rerun: bool(row.rerun),
    live: bool(row.live),
    header: bool(row.header),
    subevent: bool(row.subevent),
    moreInfoUrl: row.more_info_url,
    watchFromStart: vod,
    updatedAt: row.updated_at
  };
}

function newsDto(row: any, includeBody = false): RuvNewsArticle {
  const result: RuvNewsArticle = {
    id: row.id,
    slug: row.slug,
    title: row.title,
    subtitle: row.subtitle,
    url: row.url,
    categorySlug: row.category_slug,
    categoryTitle: row.category_title,
    topicName: row.topic_name,
    topicSlug: row.topic_slug,
    authors: json(row.authors, []),
    tags: json(row.tags, []),
    mainImageUrl: row.main_image_url,
    firstPublishedAt: row.first_published_at ?? null,
    lastPublishedAt: row.last_published_at ?? null,
    updatedAt: row.updated_at
  };
  if (includeBody) result.bodyHtml = row.body_html;
  return result;
}

export function listRuvChannels(kind?: "tv" | "radio"): RuvChannel[] {
  const rows = kind
    ? db.query("SELECT * FROM ruv_channels WHERE kind=? ORDER BY CASE slug WHEN 'ruv' THEN 1 WHEN 'ruv2' THEN 2 WHEN 'ras1' THEN 3 ELSE 4 END").all(kind)
    : db.query("SELECT * FROM ruv_channels ORDER BY kind, slug").all();
  return (rows as any[]).map(channelDto);
}

export function replaceRuvChannels(channels: RuvChannel[]) {
  const before = new Map(listRuvChannels().map(channel => [channel.slug, JSON.stringify(channel)]));
  const insert = db.query(`INSERT INTO ruv_channels(slug,name,kind,stream_url,geoblock,checked_at) VALUES (?,?,?,?,?,?)
    ON CONFLICT(slug) DO UPDATE SET name=excluded.name,kind=excluded.kind,stream_url=excluded.stream_url,geoblock=excluded.geoblock,checked_at=excluded.checked_at`);
  db.transaction(() => {
    const slugs = new Set(channels.map(channel => channel.slug));
    for (const channel of channels) insert.run(channel.slug, channel.name, channel.kind, channel.streamUrl, Number(channel.geoblock), channel.checkedAt);
    for (const slug of before.keys()) if (!slugs.has(slug)) db.query("DELETE FROM ruv_channels WHERE slug=?").run(slug);
  })();
  let added = 0, updated = 0;
  for (const channel of channels) {
    const old = before.get(channel.slug);
    if (!old) added++; else if (old !== JSON.stringify(channel)) updated++;
  }
  return { added, updated, removed: [...before.keys()].filter(slug => !channels.some(channel => channel.slug === slug)).length };
}

export type RuvProgramRecord = Omit<RuvProgram, "featured" | "available" | "latestEpisode" | "updatedAt">;
export type RuvEpisodeRecord = Omit<RuvEpisode, "programTitle" | "textTracks" | "available" | "updatedAt"> & { subtitles: unknown };

export function upsertRuvProgramRecord(program: RuvProgramRecord, featured: boolean, updatedAt = Date.now()) {
  const existing = db.query("SELECT title,foreign_title,slug,description,short_description,image,portrait_image,categories,channel,web_available_episodes,web_player_url,featured FROM ruv_programs WHERE id=?").get(program.id) as any;
  const categories = JSON.stringify(program.categories);
  const values = [program.title, program.foreignTitle, program.slug, program.description, program.shortDescription, program.image, program.portraitImage, categories, program.channel, program.webAvailableEpisodes, program.webPlayerUrl, Number(featured)];
  const old = existing && [existing.title, existing.foreign_title, existing.slug, existing.description, existing.short_description, existing.image, existing.portrait_image, existing.categories, existing.channel, existing.web_available_episodes, existing.web_player_url, existing.featured];
  const changed = !old || values.some((value, index) => value !== old[index]);
  db.query(`INSERT INTO ruv_programs(id,title,foreign_title,slug,description,short_description,image,portrait_image,categories,channel,web_available_episodes,web_player_url,metadata,updated_at,featured,available,last_seen_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?)
    ON CONFLICT(id) DO UPDATE SET title=excluded.title,foreign_title=excluded.foreign_title,slug=excluded.slug,description=excluded.description,
      short_description=excluded.short_description,image=excluded.image,portrait_image=excluded.portrait_image,categories=excluded.categories,
      channel=excluded.channel,web_available_episodes=excluded.web_available_episodes,web_player_url=excluded.web_player_url,
      updated_at=CASE WHEN ruv_programs.title!=excluded.title OR ruv_programs.foreign_title!=excluded.foreign_title OR ruv_programs.description!=excluded.description OR ruv_programs.image!=excluded.image OR ruv_programs.categories!=excluded.categories THEN excluded.updated_at ELSE ruv_programs.updated_at END,
      featured=MAX(ruv_programs.featured,excluded.featured),available=1,last_seen_at=excluded.last_seen_at`)
    .run(program.id, ...values.slice(0, 11), "{}", updatedAt, Number(featured), updatedAt);
  return existing ? (changed ? "updated" : "unchanged") : "added";
}

export function upsertRuvEpisodeRecord(episode: RuvEpisodeRecord, updatedAt = Date.now()) {
  const existing = db.query("SELECT title,description,firstrun,duration,duration_friendly,image,file_url,subtitles,rating,slug,event_id,file_expires,available FROM ruv_episodes WHERE id=?").get(episode.id) as any;
  const subtitles = JSON.stringify(episode.subtitles ?? {});
  const available = Boolean(episode.fileUrl) && (!episode.fileExpires || episode.fileExpires >= new Date().toISOString().slice(0, 10));
  const values = [episode.title, episode.description, episode.firstRun, episode.duration, episode.durationFriendly, episode.image, episode.fileUrl, subtitles, episode.rating, episode.slug, episode.eventId, episode.fileExpires, Number(available)];
  const old = existing && [existing.title, existing.description, existing.firstrun, existing.duration, existing.duration_friendly, existing.image, existing.file_url, existing.subtitles, existing.rating, existing.slug, existing.event_id, existing.file_expires, existing.available];
  const changed = !old || values.some((value, index) => value !== old[index]);
  db.query(`INSERT INTO ruv_episodes(id,program_id,number,title,description,firstrun,duration,duration_friendly,image,file_url,subtitles,rating,slug,event_id,file_expires,metadata,updated_at,available)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET program_id=excluded.program_id,number=excluded.number,title=excluded.title,description=excluded.description,
      firstrun=excluded.firstrun,duration=excluded.duration,duration_friendly=excluded.duration_friendly,image=excluded.image,file_url=excluded.file_url,
      subtitles=excluded.subtitles,rating=excluded.rating,slug=excluded.slug,event_id=excluded.event_id,file_expires=excluded.file_expires,
      updated_at=CASE WHEN ruv_episodes.file_url!=excluded.file_url OR ruv_episodes.file_expires IS NOT excluded.file_expires OR ruv_episodes.title!=excluded.title OR ruv_episodes.description!=excluded.description THEN excluded.updated_at ELSE ruv_episodes.updated_at END,
      available=excluded.available`)
    .run(episode.id, episode.programId, episode.number, ...values.slice(0, 12), "{}", updatedAt, Number(available));
  return existing ? (changed ? "updated" : "unchanged") : "added";
}

export function markMissingRuvEpisodesUnavailable(programId: number, currentIds: string[]) {
  const result = currentIds.length
    ? db.query(`UPDATE ruv_episodes SET available=0 WHERE program_id=? AND id NOT IN (${currentIds.map(() => "?").join(",")})`).run(programId, ...currentIds)
    : db.query("UPDATE ruv_episodes SET available=0 WHERE program_id=?").run(programId);
  db.query(`UPDATE ruv_programs SET available=CASE WHEN EXISTS (
    SELECT 1 FROM ruv_episodes e WHERE e.program_id=? AND e.available=1 AND e.file_url!=''
  ) THEN 1 ELSE 0 END WHERE id=?`).run(programId, programId);
  return result.changes;
}

export function setFeaturedRuvPrograms(ids: number[], seenAt = Date.now()) {
  const update = db.query("UPDATE ruv_programs SET featured=1,available=1,last_seen_at=? WHERE id=?");
  db.transaction(() => {
    db.exec("UPDATE ruv_programs SET featured=0");
    for (const id of ids) update.run(seenAt, id);
  })();
}

export function markExpiredRuvEpisodes(today = new Date().toISOString().slice(0, 10)) {
  const result = db.query("UPDATE ruv_episodes SET available=0 WHERE available=1 AND (file_url='' OR (file_expires IS NOT NULL AND file_expires < ?))").run(today);
  db.exec(`UPDATE ruv_programs SET available=CASE WHEN EXISTS (
    SELECT 1 FROM ruv_episodes e WHERE e.program_id=ruv_programs.id AND e.available=1 AND e.file_url!=''
  ) THEN 1 ELSE 0 END`);
  return result.changes;
}

export function listRuvPrograms(limit = 40, featuredOnly = true): RuvProgram[] {
  const rows = db.query(`SELECT * FROM ruv_programs WHERE available=1 ${featuredOnly ? "AND featured=1" : ""} ORDER BY featured DESC, updated_at DESC, title LIMIT ?`).all(limit) as any[];
  return rows.map(programDto);
}

export function getRuvProgram(id: number): RuvProgram | null {
  const row = db.query("SELECT * FROM ruv_programs WHERE id=?").get(id) as any;
  return row ? programDto(row) : null;
}

export function listRuvEpisodes(programId: number): RuvEpisode[] {
  return (db.query("SELECT e.*,p.title AS program_title FROM ruv_episodes e JOIN ruv_programs p ON p.id=e.program_id WHERE e.program_id=? ORDER BY COALESCE(e.firstrun,'') DESC").all(programId) as any[]).map(episodeDto);
}

export function getRuvEpisode(id: string): RuvEpisode | null {
  const row = db.query("SELECT e.*,p.title AS program_title FROM ruv_episodes e JOIN ruv_programs p ON p.id=e.program_id WHERE e.id=?").get(id) as any;
  return row ? episodeDto(row) : null;
}

export function getRuvEpisodeByEvent(eventId: number): RuvEpisode | null {
  const row = db.query("SELECT e.*,p.title AS program_title FROM ruv_episodes e JOIN ruv_programs p ON p.id=e.program_id WHERE e.event_id=? AND e.available=1 ORDER BY e.updated_at DESC LIMIT 1").get(eventId) as any;
  return row ? episodeDto(row) : null;
}

export type RuvEpgRecord = Omit<RuvEpgEvent, "watchFromStart" | "updatedAt">;

export function reconcileRuvEpg(channelSlug: string, from: number, to: number, events: RuvEpgRecord[], updatedAt = Date.now()) {
  const before = new Set((db.query("SELECT event_id FROM ruv_epg_events WHERE channel_slug=? AND start_time>=? AND start_time<?").all(channelSlug, from, to) as any[]).map(row => row.event_id));
  const insert = db.query(`INSERT INTO ruv_epg_events(event_id,channel_slug,serie_id,start_time,end_time,title,original_title,description,category,episode_number,episode_total,rerun,live,more_info_url,updated_at,header,subevent)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  db.transaction(() => {
    db.query("DELETE FROM ruv_epg_events WHERE channel_slug=? AND start_time>=? AND start_time<?").run(channelSlug, from, to);
    for (const event of events) insert.run(event.eventId,event.channelSlug,event.seriesId,event.startTime,event.endTime,event.title,event.originalTitle,event.description,event.category,event.episodeNumber,event.episodeTotal,Number(event.rerun),Number(event.live),event.moreInfoUrl,updatedAt,Number(event.header),Number(event.subevent));
  })();
  const current = new Set(events.map(event => event.eventId));
  return { added: events.filter(event => !before.has(event.eventId)).length, updated: events.filter(event => before.has(event.eventId)).length, removed: [...before].filter(id => !current.has(id)).length };
}

export function listRuvEpg(channelSlug: string, from: number, to: number, limit = 200): RuvEpgEvent[] {
  return (db.query("SELECT * FROM ruv_epg_events WHERE channel_slug=? AND header=0 AND start_time<? AND (end_time IS NULL OR end_time>?) ORDER BY start_time LIMIT ?").all(channelSlug, to, from, limit) as any[]).map(eventDto);
}

export function getRuvNow(channelSlug: string, now = Date.now(), upcomingLimit = 6): RuvNow | null {
  const channel = listRuvChannels().find(item => item.slug === channelSlug);
  if (!channel) return null;
  const currentRow = db.query("SELECT * FROM ruv_epg_events WHERE channel_slug=? AND header=0 AND start_time<=? AND (end_time IS NULL OR end_time>?) ORDER BY start_time DESC LIMIT 1").get(channelSlug, now, now) as any;
  const upcomingRows = db.query("SELECT * FROM ruv_epg_events WHERE channel_slug=? AND header=0 AND start_time>? ORDER BY start_time LIMIT ?").all(channelSlug, now, upcomingLimit) as any[];
  return { channel, current: currentRow ? eventDto(currentRow) : null, upcoming: upcomingRows.map(eventDto) };
}

export type RuvNewsRecord = Omit<RuvNewsArticle, "bodyHtml" | "updatedAt"> & { bodyHtml: string; bodyJson: unknown };

export function getRuvNewsArticleMeta(id: number) {
  return db.query("SELECT id,last_published_at FROM ruv_news_articles WHERE id=?").get(id) as { id: number; last_published_at: number | null } | null;
}

export function upsertRuvNewsRecord(article: RuvNewsRecord, updatedAt = Date.now()) {
  const existing = getRuvNewsArticleMeta(article.id);
  const status = !existing ? "added" : existing.last_published_at !== article.lastPublishedAt ? "updated" : "unchanged";
  db.query(`INSERT INTO ruv_news_articles(id,slug,title,subtitle,url,category_slug,category_title,topic_name,topic_slug,authors,tags,main_image_url,body_html,body_json,first_published_at,last_published_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET slug=excluded.slug,title=excluded.title,subtitle=excluded.subtitle,url=excluded.url,
      category_slug=excluded.category_slug,category_title=excluded.category_title,topic_name=excluded.topic_name,topic_slug=excluded.topic_slug,
      authors=excluded.authors,tags=excluded.tags,main_image_url=excluded.main_image_url,body_html=excluded.body_html,body_json=excluded.body_json,
      first_published_at=excluded.first_published_at,last_published_at=excluded.last_published_at,updated_at=excluded.updated_at`)
    .run(article.id,article.slug,article.title,article.subtitle,article.url,article.categorySlug,article.categoryTitle,article.topicName,article.topicSlug,JSON.stringify(article.authors),JSON.stringify(article.tags),article.mainImageUrl,article.bodyHtml,JSON.stringify(article.bodyJson),article.firstPublishedAt,article.lastPublishedAt,updatedAt);
  return status;
}

export function listRuvNews(limit = 40, categorySlug?: string): RuvNewsArticle[] {
  const rows = categorySlug
    ? db.query("SELECT * FROM ruv_news_articles WHERE category_slug=? ORDER BY first_published_at DESC LIMIT ?").all(categorySlug, limit)
    : db.query("SELECT * FROM ruv_news_articles ORDER BY first_published_at DESC LIMIT ?").all(limit);
  return (rows as any[]).map(row => newsDto(row));
}

export function getRuvNewsArticle(id: number): RuvNewsArticle | null {
  const row = db.query("SELECT * FROM ruv_news_articles WHERE id=?").get(id) as any;
  return row ? newsDto(row, true) : null;
}

export function startRuvScrape(kind: string) {
  const now = Date.now();
  db.query("UPDATE ruv_scrape_runs SET finished_at=?,status='failed',error='superseded by a new run after previous process ended' WHERE kind=? AND status='running'")
    .run(now, kind);
  return Number((db.query("INSERT INTO ruv_scrape_runs(kind,started_at,status) VALUES (?,?,'running') RETURNING id").get(kind, now) as any).id);
}

export function finishRuvScrape(id: number, result: { itemCount: number; added: number; updated: number; error?: string }) {
  db.query("UPDATE ruv_scrape_runs SET finished_at=?,item_count=?,added_count=?,updated_count=?,status=?,error=? WHERE id=?")
    .run(Date.now(),result.itemCount,result.added,result.updated,result.error ? "failed" : "complete",result.error ?? null,id);
}

export function lastSuccessfulRuvScrape(kind: string) {
  return db.query("SELECT * FROM ruv_scrape_runs WHERE kind=? AND status='complete' ORDER BY finished_at DESC LIMIT 1").get(kind) as any;
}

export function listTvFavorites() {
  return (db.query("SELECT media_id FROM favourites WHERE profile_id='home' AND kind='tv' ORDER BY created_at").all() as { media_id: string }[])
    .map(row => row.media_id.replace(/^ruv-channel-/, ""));
}

export function toggleTvFavorite(slug: string) {
  const mediaId = `ruv-channel-${slug}`;
  const existing = db.query("SELECT 1 AS present FROM favourites WHERE profile_id='home' AND media_id=? AND kind='tv'").get(mediaId);
  if (existing) db.query("DELETE FROM favourites WHERE profile_id='home' AND media_id=? AND kind='tv'").run(mediaId);
  else db.query("INSERT INTO favourites(profile_id,media_id,kind,created_at) VALUES ('home',?,'tv',?)").run(mediaId, Date.now());
  return !existing;
}

export function ruvProgramAvailability() {
  return db.query("SELECT id,featured,available FROM ruv_programs ORDER BY id").all() as { id: number; featured: number; available: number }[];
}

export function totalRuvEpisodeCount() {
  return (db.query("SELECT COUNT(*) AS count FROM ruv_episodes").get() as { count: number }).count;
}

export function dashboardContent(): DashboardContent {
  return {
    generatedAt: Date.now(),
    channels: listRuvChannels("tv").map(channel => getRuvNow(channel.slug)).filter((item): item is RuvNow => Boolean(item)),
    programs: listRuvPrograms(24, true),
    news: listRuvNews(20)
  };
}
