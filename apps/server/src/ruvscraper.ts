import type { RuvEpgEvent, RuvNewsArticle } from "../../../packages/protocol";
import { config } from "./config";
import { db } from "./db";
import {
  finishRuvScrape,
  getRuvNewsArticleMeta,
  getRuvProgram,
  lastSuccessfulRuvScrape,
  markExpiredRuvEpisodes,
  markMissingRuvEpisodesUnavailable,
  reconcileRuvEpg,
  replaceRuvChannels,
  setFeaturedRuvPrograms,
  startRuvScrape,
  upsertRuvEpisodeRecord,
  upsertRuvNewsRecord,
  upsertRuvProgramRecord,
  type RuvEpgRecord
} from "./ruvdb";

const RUV_CHANNELS = [
  { slug: "ruv", name: "RÚV", kind: "tv" as const },
  { slug: "ruv2", name: "RÚV 2", kind: "tv" as const },
  { slug: "ras1", name: "Rás 1", kind: "radio" as const },
  { slug: "ras2", name: "Rás 2", kind: "radio" as const }
];

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

class RuvHttpError extends Error {
  constructor(message: string, readonly retryable: boolean) { super(message); }
}

function transientStatus(status: number) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

async function fetchText(url: string, init?: RequestInit) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= config.ruvFetchRetries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.ruvFetchTimeoutMs);
    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
        headers: { "User-Agent": config.ruvUserAgent, ...init?.headers }
      });
      if (!response.ok) throw new RuvHttpError(`${url} returned HTTP ${response.status}`, transientStatus(response.status));
      return await response.text();
    } catch (error) {
      if (error instanceof RuvHttpError && !error.retryable) throw error;
      lastError = error;
    } finally {
      clearTimeout(timeout);
    }
    if (attempt < config.ruvFetchRetries) await delay(Math.min(4_000, 400 * 2 ** (attempt - 1)));
  }
  throw lastError instanceof Error ? lastError : new Error(`${url} failed`);
}

async function fetchJson<T>(url: string, init?: RequestInit) {
  const body = await fetchText(url, init);
  try { return JSON.parse(body) as T; }
  catch { throw new Error(`${url} returned invalid JSON`); }
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

async function mapSettledWithConcurrency<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>) {
  return mapWithConcurrency(items, concurrency, async item => {
    try { return { status: "fulfilled" as const, value: await fn(item) }; }
    catch (reason) { return { status: "rejected" as const, reason }; }
  });
}

// --- Channels ------------------------------------------------------------

type ChannelSource = { url: string; geoblock?: boolean };

export async function scrapeRuvChannels() {
  const runId = startRuvScrape("channels");
  try {
    const checkedAt = Date.now();
    const sources = await mapWithConcurrency(RUV_CHANNELS, 2, async channel => {
      const data = await fetchJson<ChannelSource>(`${config.ruvLiveBase}/channel/${channel.slug}`);
      if (!data.url) throw new Error(`RÚV channel ${channel.slug} returned no stream URL`);
      return { ...channel, streamUrl: data.url, geoblock: Boolean(data.geoblock), checkedAt };
    });
    const counts = replaceRuvChannels(sources);
    finishRuvScrape(runId, { itemCount: sources.length, added: counts.added, updated: counts.updated });
    return { channels: sources.length, ...counts };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    finishRuvScrape(runId, { itemCount: 0, added: 0, updated: 0, error: message });
    throw error;
  }
}

// --- VOD catalog ---------------------------------------------------------

type SourceEpisode = {
  id: string; number?: number; firstrun?: string; file_expires?: string; rating?: number; duration?: number;
  duration_friendly?: string; event?: number; title?: string; slug?: string; description?: unknown;
  image?: string; subtitles?: unknown; subtitles_url?: string | null; file?: string;
};
type SourceProgram = {
  id: number; title: string; foreign_title?: string; slug?: string; description?: unknown; short_description?: string;
  image?: string; portrait_image?: string; categories?: { title: string; slug: string }[]; channel?: string;
  web_available_episodes?: number; web_player_url?: string; episodes?: SourceEpisode[];
};
type FeaturedResponse = { panels?: { programs?: SourceProgram[] }[] };

function textOf(value: unknown): string {
  if (Array.isArray(value)) return value.map(textOf).filter(Boolean).join(" ");
  return typeof value === "string" ? value : "";
}

function episodeSubtitles(episode: SourceEpisode) {
  const subtitles = episode.subtitles && typeof episode.subtitles === "object" ? { ...(episode.subtitles as Record<string, unknown>) } : {};
  if (episode.subtitles_url && /^https?:\/\//.test(episode.subtitles_url)) subtitles.is = episode.subtitles_url;
  return subtitles;
}

async function scrapeProgram(programId: number, featured: boolean) {
  const program = await fetchJson<SourceProgram>(`${config.ruvApiBase}/api/programs/program/${programId}/all`);
  const episodes = program.episodes ?? [];
  let added = 0, updated = 0;
  db.transaction(() => {
    const programStatus = upsertRuvProgramRecord({
      id: program.id,
      title: program.title,
      foreignTitle: program.foreign_title ?? "",
      slug: program.slug ?? "",
      description: textOf(program.description),
      shortDescription: program.short_description ?? "",
      image: program.image ?? "",
      portraitImage: program.portrait_image ?? "",
      categories: program.categories ?? [],
      channel: program.channel ?? "",
      webAvailableEpisodes: program.web_available_episodes ?? episodes.length,
      webPlayerUrl: program.web_player_url ?? ""
    }, featured);
    if (programStatus === "added") added++; else if (programStatus === "updated") updated++;
    for (const episode of episodes) {
      const status = upsertRuvEpisodeRecord({
        id: episode.id,
        programId: program.id,
        number: episode.number ?? null,
        title: episode.title ?? program.title,
        description: textOf(episode.description),
        firstRun: episode.firstrun ?? null,
        duration: episode.duration ?? 0,
        durationFriendly: episode.duration_friendly ?? "",
        image: episode.image ?? program.image ?? "",
        fileUrl: episode.file ?? "",
        subtitles: episodeSubtitles(episode),
        rating: episode.rating ?? null,
        slug: episode.slug ?? "",
        eventId: episode.event ?? null,
        fileExpires: episode.file_expires ?? null
      });
      if (status === "added") added++; else if (status === "updated") updated++;
    }
    updated += markMissingRuvEpisodesUnavailable(program.id, episodes.map(episode => episode.id));
  })();
  return { added, updated, episodes: episodes.length };
}

export async function scrapeRuvCatalog() {
  const runId = startRuvScrape("catalog");
  try {
    const featured = await fetchJson<FeaturedResponse>(`${config.ruvApiBase}/api/programs/featured/tv`);
    const programs = new Map<number, SourceProgram>();
    for (const panel of featured.panels ?? []) for (const program of panel.programs ?? []) programs.set(program.id, program);
    if (!programs.size) throw new Error("RÚV featured catalog returned no programs");
    const ids = [...programs.keys()];
    const results = await mapSettledWithConcurrency(ids, config.ruvCatalogConcurrency, id => scrapeProgram(id, true));
    setFeaturedRuvPrograms(ids);
    const failures = results.filter(result => result.status === "rejected");
    const successes = results.filter((result): result is { status: "fulfilled"; value: { added: number; updated: number; episodes: number } } => result.status === "fulfilled");
    const added = successes.reduce((sum, result) => sum + result.value.added, 0);
    const updated = successes.reduce((sum, result) => sum + result.value.updated, 0);
    const error = failures.length ? `${failures.length}/${ids.length} program requests failed; first: ${String((failures[0] as any).reason)}` : undefined;
    finishRuvScrape(runId, { itemCount: successes.length, added, updated, error });
    if (error) throw new Error(error);
    return { programs: successes.length, added, updated };
  } catch (error) {
    const row = db.query("SELECT status FROM ruv_scrape_runs WHERE id=?").get(runId) as { status: string } | null;
    if (row?.status === "running") finishRuvScrape(runId, { itemCount: 0, added: 0, updated: 0, error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

// --- Low-rate archive discovery -----------------------------------------

type SearchResponse = { data?: { Search?: { id: string; title: string }[] }; errors?: unknown[] };
const SEARCH_QUERY = "query getSearch($type: SearchQueryType!, $text: String!) { Search(type: $type, text: $text) { id title } }";

export async function scrapeRuvArchive() {
  const runId = startRuvScrape("archive");
  try {
    const terms = config.ruvArchiveSearchTerms;
    const start = Math.floor(Date.now() / 86_400_000) % terms.length;
    const discovered: number[] = [];
    let searched = 0;
    for (let offset = 0; offset < terms.length && discovered.length < config.ruvArchiveSearchBatchSize; offset++) {
      const term = terms[(start + offset) % terms.length];
      const response = await fetchJson<SearchResponse>(config.ruvSearchUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operationName: "getSearch", query: SEARCH_QUERY, variables: { type: "tv", text: term } })
      });
      searched++;
      for (const result of response.data?.Search ?? []) {
        const id = Number(result.id);
        if (Number.isInteger(id) && !discovered.includes(id) && !getRuvProgram(id)) discovered.push(id);
        if (discovered.length >= config.ruvArchiveSearchBatchSize) break;
      }
      if (discovered.length < config.ruvArchiveSearchBatchSize) await delay(config.ruvArchiveSearchPacingMs);
    }
    let added = 0, updated = 0;
    const failures: string[] = [];
    for (const id of discovered) {
      try {
        const result = await scrapeProgram(id, false);
        added += result.added;
        updated += result.updated;
      } catch (error) { failures.push(`${id}: ${error instanceof Error ? error.message : String(error)}`); }
      await delay(config.ruvArchiveSearchPacingMs);
    }
    const error = failures.length ? `${failures.length}/${discovered.length} archive programs failed; ${failures[0]}` : undefined;
    finishRuvScrape(runId, { itemCount: discovered.length, added, updated, error });
    if (error) throw new Error(error);
    return { searched, discovered: discovered.length, added, updated };
  } catch (error) {
    const row = db.query("SELECT status FROM ruv_scrape_runs WHERE id=?").get(runId) as { status: string } | null;
    if (row?.status === "running") finishRuvScrape(runId, { itemCount: 0, added: 0, updated: 0, error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

// --- EPG -----------------------------------------------------------------

const EVENT_RE = /<event\s+([^>]*)>([\s\S]*?)<\/event>/g;
const ATTR_RE = /([\w-]+)="([^"]*)"/g;

function decodeXml(value: string) {
  return value.replace(/&#(x?[0-9a-f]+);|&(amp|lt|gt|quot|apos);/gi, (_match, numeric, named) => {
    if (numeric) return String.fromCodePoint(parseInt(numeric.replace(/^x/i, ""), numeric[0].toLowerCase() === "x" ? 16 : 10));
    return ({ amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'" } as Record<string, string>)[String(named).toLowerCase()] ?? _match;
  });
}

function parseAttrs(source: string) {
  const attrs: Record<string, string> = {};
  for (const match of source.matchAll(ATTR_RE)) attrs[match[1]] = decodeXml(match[2]);
  return attrs;
}

function tagText(block: string, tag: string) {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`)) ?? block.match(new RegExp(`<${tag}[^>]*/>`));
  if (!match) return "";
  const raw = match[1] ?? "";
  const cdata = raw.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
  return decodeXml((cdata ? cdata[1] : raw).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function toEpochMs(icelandTime: string) {
  const ms = Date.parse(`${icelandTime.trim().replace(" ", "T")}Z`);
  return Number.isFinite(ms) ? ms : null;
}

function durationToMs(duration: string) {
  const [h = "0", m = "0", s = "0"] = duration.split(":");
  return ((Number(h) * 60 + Number(m)) * 60 + Number(s)) * 1000;
}

function dateStr(offsetDays: number) {
  return new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

export function parseRuvEpgXml(xml: string, channelSlug: string): RuvEpgRecord[] {
  const events: RuvEpgRecord[] = [];
  for (const match of xml.matchAll(EVENT_RE)) {
    const attrs = parseAttrs(match[1]);
    const block = match[2];
    const startTime = toEpochMs(attrs["start-time"] ?? "");
    const eventId = Number(attrs["event-id"]);
    if (!Number.isInteger(eventId) || startTime === null) continue;
    const durationMs = attrs.duration ? durationToMs(attrs.duration) : null;
    const categoryMatch = block.match(/<category[^>]*>([\s\S]*?)<\/category>/);
    const episodeAttrs = parseAttrs(block.match(/<episode\s+([^/]*)\/>/)?.[1] ?? "");
    events.push({
      eventId,
      channelSlug,
      seriesId: attrs["serie-id"] ? Number(attrs["serie-id"]) : null,
      startTime,
      endTime: durationMs !== null ? startTime + durationMs : null,
      title: tagText(block, "title"),
      originalTitle: tagText(block, "original-title"),
      description: tagText(block, "description"),
      category: categoryMatch ? decodeXml(categoryMatch[1].replace(/<[^>]+>/g, "").trim()) : "",
      episodeNumber: episodeAttrs.number ? Number(episodeAttrs.number) : null,
      episodeTotal: episodeAttrs["number-of-episodes"] ? Number(episodeAttrs["number-of-episodes"]) : null,
      rerun: tagText(block, "rerun") === "yes",
      live: tagText(block, "live") === "yes",
      header: tagText(block, "header") === "yes",
      subevent: tagText(block, "subevent") === "yes",
      moreInfoUrl: tagText(block, "more-info")
    });
  }
  return events;
}

async function scrapeChannelEpg(slug: string) {
  const fromDate = dateStr(-config.ruvEpgDaysBack);
  const toDate = dateStr(config.ruvEpgDaysForward);
  const xml = await fetchText(`${config.ruvEpgBase}/files/xml/${slug}/${fromDate}/${toDate}/`);
  const events = parseRuvEpgXml(xml, slug);
  if (!events.length) throw new Error(`RÚV EPG ${slug} returned no events`);
  const from = Date.parse(`${fromDate}T00:00:00Z`);
  const to = Date.parse(`${toDate}T00:00:00Z`) + 86_400_000;
  return { count: events.length, ...reconcileRuvEpg(slug, from, to, events) };
}

export async function scrapeRuvEpg() {
  const runId = startRuvScrape("epg");
  const results = await mapSettledWithConcurrency(RUV_CHANNELS, 2, channel => scrapeChannelEpg(channel.slug));
  const successes = results.filter((result): result is { status: "fulfilled"; value: { count: number; added: number; updated: number; removed: number } } => result.status === "fulfilled");
  const failures = results.filter(result => result.status === "rejected");
  const itemCount = successes.reduce((sum, result) => sum + result.value.count, 0);
  const added = successes.reduce((sum, result) => sum + result.value.added, 0);
  const updated = successes.reduce((sum, result) => sum + result.value.updated, 0);
  const error = failures.length ? `${failures.length}/${RUV_CHANNELS.length} EPG channels failed; first: ${String((failures[0] as any).reason)}` : undefined;
  finishRuvScrape(runId, { itemCount, added, updated, error });
  if (error) throw new Error(error);
  return { events: itemCount, added, updated };
}

// --- News ----------------------------------------------------------------

type NewsStub = {
  id: number; title: string; subtitle?: string; url: string; slug: string; first_published_at: string; last_published_at?: string;
  parent?: { slug: string; title: string }; main_image?: { renditions?: { medium?: { src?: string } } };
};
type NewsPageData = { cachedArticles?: NewsStub[] };
type ArticleBodyBlock = { block_type?: string; text_block?: { html: string }; headline_block?: { text?: string } };
type ArticleDetail = {
  id: number; title: string; subtitle?: string; url: string; slug: string; first_published_at: string; last_published_at?: string;
  parent?: { slug: string; title: string }; topic?: { name: string; slug: string };
  authors?: { name: string }[]; tags?: { name: string; slug: string }[];
  main_image?: { original_url?: string; renditions?: { medium?: { src?: string } } }; body?: ArticleBodyBlock[];
};

function extractNextData<T>(html: string): T | null {
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!match) return null;
  try { return JSON.parse(match[1]) as T; } catch { return null; }
}

function renderBodyHtml(body: ArticleBodyBlock[] | undefined) {
  return (body ?? []).map(block => block.text_block?.html ?? block.headline_block?.text ?? "").filter(Boolean).join("\n");
}

async function fetchArticleDetail(stubUrl: string) {
  const publicUrl = stubUrl.replace("nyr.ruv.is", config.ruvSiteBase.replace(/^https?:\/\//, ""));
  const html = await fetchText(publicUrl);
  const data = extractNextData<{ props: { pageProps: { data: { article?: ArticleDetail } } } }>(html);
  if (!data?.props.pageProps.data.article) throw new Error(`RÚV article detail missing for ${publicUrl}`);
  return data.props.pageProps.data.article;
}

export async function scrapeRuvNews() {
  const runId = startRuvScrape("news");
  try {
    const stubs = new Map<number, NewsStub>();
    for (const category of config.ruvNewsCategories) {
      const path = category ? `/frettir/${category}/` : "/frettir/";
      const html = await fetchText(`${config.ruvSiteBase}${path}`);
      const data = extractNextData<{ props: { pageProps: { data: NewsPageData } } }>(html);
      if (!data) throw new Error(`RÚV news page ${path} contained no __NEXT_DATA__`);
      for (const stub of data.props.pageProps.data.cachedArticles ?? []) stubs.set(stub.id, stub);
    }
    const candidates = [...stubs.values()].filter(stub => {
      const stored = getRuvNewsArticleMeta(stub.id);
      const sourceUpdated = stub.last_published_at ? Date.parse(stub.last_published_at) : null;
      return !stored || stored.last_published_at !== sourceUpdated;
    });
    const settled = await mapSettledWithConcurrency(candidates, config.ruvScrapeConcurrency, async stub => {
      const article = await fetchArticleDetail(stub.url);
      return upsertRuvNewsRecord({
        id: article.id,
        slug: article.slug,
        title: article.title,
        subtitle: article.subtitle ?? "",
        url: article.url,
        categorySlug: article.parent?.slug ?? "",
        categoryTitle: article.parent?.title ?? "",
        topicName: article.topic?.name ?? "",
        topicSlug: article.topic?.slug ?? "",
        authors: article.authors ?? [],
        tags: article.tags ?? [],
        mainImageUrl: article.main_image?.renditions?.medium?.src ?? article.main_image?.original_url ?? "",
        bodyHtml: renderBodyHtml(article.body),
        bodyJson: article.body ?? [],
        firstPublishedAt: article.first_published_at ? Date.parse(article.first_published_at) : null,
        lastPublishedAt: article.last_published_at ? Date.parse(article.last_published_at) : null
      });
    });
    const failures = settled.filter(result => result.status === "rejected");
    const statuses = settled.filter((result): result is { status: "fulfilled"; value: "added" | "updated" | "unchanged" } => result.status === "fulfilled").map(result => result.value);
    const added = statuses.filter(status => status === "added").length;
    const updated = statuses.filter(status => status === "updated").length;
    const widespread = failures.length >= Math.max(2, Math.ceil(candidates.length / 2));
    const error = widespread ? `${failures.length}/${candidates.length} RÚV article details failed; first: ${String((failures[0] as any)?.reason)}` : undefined;
    finishRuvScrape(runId, { itemCount: stubs.size, added, updated, error });
    if (error) throw new Error(error);
    return { seen: stubs.size, candidates: candidates.length, added, updated, failed: failures.length };
  } catch (error) {
    const row = db.query("SELECT status FROM ruv_scrape_runs WHERE id=?").get(runId) as { status: string } | null;
    if (row?.status === "running") finishRuvScrape(runId, { itemCount: 0, added: 0, updated: 0, error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

export async function runRuvMaintenance() {
  const runId = startRuvScrape("maintenance");
  try {
    const expired = markExpiredRuvEpisodes();
    finishRuvScrape(runId, { itemCount: expired, added: 0, updated: expired });
    return { expired };
  } catch (error) {
    finishRuvScrape(runId, { itemCount: 0, added: 0, updated: 0, error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

async function independently(stages: Record<string, () => Promise<unknown>>) {
  const result: Record<string, unknown> = {};
  const errors: string[] = [];
  for (const [name, stage] of Object.entries(stages)) {
    try { result[name] = await stage(); }
    catch (error) { const message = error instanceof Error ? error.message : String(error); result[name] = { error: message }; errors.push(`${name}: ${message}`); }
  }
  return { result, errors };
}

export async function scrapeRuvDaily() {
  const { result, errors } = await independently({
    channels: scrapeRuvChannels,
    catalog: scrapeRuvCatalog,
    epg: scrapeRuvEpg,
    archive: scrapeRuvArchive,
    maintenance: runRuvMaintenance
  });
  if (errors.length) throw Object.assign(new Error(errors.join("; ")), { result });
  return result;
}

export async function scrapeRuvAll() {
  const { result, errors } = await independently({ daily: scrapeRuvDaily, news: scrapeRuvNews });
  if (errors.length) throw Object.assign(new Error(errors.join("; ")), { result });
  return result;
}

export async function scrapeRuvIfDue(kind: "daily" | "news" = "daily") {
  const runKind = kind === "news" ? "news" : "catalog";
  const maxAge = kind === "news" ? config.ruvNewsSyncIntervalMs : config.ruvSyncIntervalMs;
  const last = lastSuccessfulRuvScrape(runKind);
  if (last?.finished_at && Date.now() - last.finished_at < maxAge) return { skipped: true, lastFinishedAt: last.finished_at };
  return kind === "news" ? scrapeRuvNews() : scrapeRuvDaily();
}

if (import.meta.main) {
  const mode = process.argv[2] ?? "daily";
  try {
    const result = mode === "news" ? await scrapeRuvNews()
      : mode === "all" ? await scrapeRuvAll()
      : mode === "news-if-due" ? await scrapeRuvIfDue("news")
      : mode === "daily-if-due" ? await scrapeRuvIfDue("daily")
      : mode === "daily" ? await scrapeRuvDaily()
      : (() => { throw new Error(`Unknown RÚV scraper mode: ${mode}`); })();
    console.log(JSON.stringify(result));
    db.close();
    process.exit(0);
  } catch (error) {
    const result = error && typeof error === "object" && "result" in error ? (error as any).result : undefined;
    console.error(JSON.stringify({ error: error instanceof Error ? error.message : String(error), result }));
    db.close();
    process.exit(1);
  }
}
