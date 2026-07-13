import { config } from "./config";
import { db, statement } from "./db";
import { cleanImportedPublicTorrents } from "./publicTorrentCleanupJob";


export type PublicTorrentRecord = {
	infoHash: string;
	sourceId: string;
	source: string;
	sourceUrl: string;
	tracker: string;
	trackerId: string;
	category: string;
	categoryIds: number[];
	torrentUri: string | null;
	magnetUri: string;
	originalTitle: string;
	mediaKind: "movie" | "tv";
	sizeBytes: number;
	seeders: number;
	leechers: number;
	grabs: number | null;
	virusScore: number | null;
	publishedAt: number | null;
	lastSeenAt: number;
};

type PublicTorrentFetch = (
	input: URL | RequestInfo,
	init?: RequestInit,
) => Promise<Response>;

type RunRow = {
	started_at: number;
	finished_at: number | null;
	status: "running" | "complete" | "partial" | "error";
	source_count: number;
	item_count: number;
	added_count: number;
	updated_count: number;
	cleaned_count: number;
	enriched_count: number;
	review_count: number;
	error: string | null;
};

export type PublicTorrentScrapeState = {
	running: boolean;
	status: "idle" | "running" | "complete" | "partial" | "error";
	message: string;
	lastRun: number | null;
	lastError: string;
	inserted: number;
	updated: number;
	itemCount: number;
	sourceCount: number;
	completedPages: number;
	totalPages: number;
	cleaned: number;
	enriched: number;
	reviewed: number;
};

const idleState: PublicTorrentScrapeState = {
	running: false,
	status: "idle",
	message: "",
	lastRun: null,
	lastError: "",
	inserted: 0,
	updated: 0,
	itemCount: 0,
	sourceCount: 0,
	completedPages: 0,
	totalPages: 0,
	cleaned: 0,
	enriched: 0,
	reviewed: 0,
};

function latestState(): PublicTorrentScrapeState {
	const row = statement(
		"SELECT * FROM public_torrent_scrape_runs ORDER BY started_at DESC LIMIT 1",
	).get() as RunRow | null;
	if (!row) return { ...idleState };
	const interrupted = row.status === "running";
	return {
		...idleState,
		status: interrupted ? "error" : row.status,
		message: interrupted
			? "Fyrri opinber torrent-samstilling stöðvaðist"
			: row.status === "complete"
				? "Opinber torrent-gögn uppfærð"
				: "Opinber torrent-samstilling lauk með villu",
		lastRun: row.finished_at ?? row.started_at,
		lastError: interrupted
			? "Samstilling stöðvaðist áður en henni lauk"
			: (row.error ?? ""),
		inserted: row.added_count,
		updated: row.updated_count,
		itemCount: row.item_count,
		sourceCount: row.source_count,
		cleaned: row.cleaned_count,
		enriched: row.enriched_count,
		reviewed: row.review_count,
	};
}

export const publicTorrentScrapeState = latestState();

function finiteInteger(value: unknown, fallback = 0) {
	const number = Number(value);
	return Number.isSafeInteger(number) && number >= 0 ? number : fallback;
}

function finiteNumber(value: unknown) {
	const number = Number(value);
	return Number.isFinite(number) ? number : null;
}

function timestamp(value: unknown) {
	if (typeof value !== "string" || !value.trim()) return null;
	const parsed = Date.parse(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function webUrl(value: unknown) {
	if (typeof value !== "string") return "";
	try {
		const url = new URL(value);
		return url.protocol === "https:" || url.protocol === "http:"
			? url.toString()
			: "";
	} catch {
		return "";
	}
}

export function normalizeKnabenHit(
	value: unknown,
	now = Date.now(),
): PublicTorrentRecord | null {
	if (!value || typeof value !== "object") return null;
	const field = (key: string): unknown => Reflect.get(value, key);
	const hash = field("hash");
	const infoHash =
		typeof hash === "string" ? hash.trim().toUpperCase() : "";
	if (!/^[A-F0-9]{40}$/.test(infoHash)) return null;
	const rawTitle = field("title");
	const originalTitle = typeof rawTitle === "string" ? rawTitle.trim() : "";
	if (!originalTitle || originalTitle.length > 500) return null;
	const rawCategory = field("category");
	const category = typeof rawCategory === "string" ? rawCategory.trim() : "";
	const mediaKind = /^tv(?:\s|\/|$)/i.test(category)
		? "tv"
		: /^movies?(?:\s|\/|$)/i.test(category)
			? "movie"
			: null;
	if (!mediaKind) return null;
	const rawCategoryIds = field("categoryId");
	const categoryIds = Array.isArray(rawCategoryIds)
		? rawCategoryIds
				.map((item) => Number(item))
				.filter((item) => Number.isSafeInteger(item) && item > 0)
		: [];
	const rawId = field("id");
	const cachedOrigin = field("cachedOrigin");
	const tracker = field("tracker");
	const trackerId = field("trackerId");
	const magnetUrl = field("magnetUrl");
	const grabs = field("grabs");
	const publishedAt = timestamp(field("date"));
	const lastSeenAt = timestamp(field("lastSeen")) ?? publishedAt ?? now;
	const directLink = webUrl(field("link"));
	return {
		infoHash,
		sourceId: typeof rawId === "string" ? rawId : String(rawId ?? infoHash),
		source:
			typeof cachedOrigin === "string" && cachedOrigin.trim()
				? cachedOrigin.trim()
				: typeof tracker === "string" && tracker.trim()
					? tracker.trim()
					: "Knaben",
		sourceUrl: webUrl(field("details")),
		tracker: typeof tracker === "string" ? tracker.trim() : "",
		trackerId: typeof trackerId === "string" ? trackerId.trim() : "",
		category,
		categoryIds,
		torrentUri: directLink || null,
		magnetUri:
			typeof magnetUrl === "string" && magnetUrl.startsWith("magnet:?")
				? magnetUrl
				: "",
		originalTitle,
		mediaKind,
		sizeBytes: finiteInteger(field("bytes")),
		seeders: finiteInteger(field("seeders")),
		leechers: finiteInteger(field("peers")),
		grabs: grabs === null || grabs === undefined ? null : finiteInteger(grabs),
		virusScore: finiteNumber(field("virusDetection")),
		publishedAt,
		lastSeenAt,
	};
}

function preferableRecord(
	current: PublicTorrentRecord,
	candidate: PublicTorrentRecord,
) {
	if (Boolean(candidate.torrentUri) !== Boolean(current.torrentUri))
		return candidate.torrentUri ? candidate : current;
	if (candidate.seeders !== current.seeders)
		return candidate.seeders > current.seeders ? candidate : current;
	return candidate.lastSeenAt > current.lastSeenAt ? candidate : current;
}

export function deduplicatePublicTorrents(records: PublicTorrentRecord[]) {
	const found = new Map<string, PublicTorrentRecord>();
	for (const record of records) {
		const current = found.get(record.infoHash);
		found.set(
			record.infoHash,
			current ? preferableRecord(current, record) : record,
		);
	}
	return [...found.values()];
}

function delay(ms: number) {
	if (!ms) return Promise.resolve();
	const { promise, resolve } = Promise.withResolvers<void>();
	setTimeout(resolve, ms);
	return promise;
}

function progress(
	patch: Partial<PublicTorrentScrapeState>,
	onProgress?: () => void,
) {
	Object.assign(publicTorrentScrapeState, patch);
	onProgress?.();
}

export async function scrapePublicTorrents(
	onProgress?: () => void,
	onComplete?: () => void,
	fetchImpl: PublicTorrentFetch = fetch,
) {
	if (publicTorrentScrapeState.running) return { ...publicTorrentScrapeState };
	const startedAt = Date.now();
	const run = statement(
		`INSERT INTO public_torrent_scrape_runs(started_at,status)
		 VALUES (?,'running')`,
	).run(startedAt);
	const runId = Number(run.lastInsertRowid);
	progress(
		{
			running: true,
			status: "running",
			message: "Tengi við opinbera torrent-vísinn…",
			lastError: "",
			inserted: 0,
			updated: 0,
			itemCount: 0,
			sourceCount: 0,
			completedPages: 0,
			totalPages: config.publicTorrentMaxPages,
			cleaned: 0,
			enriched: 0,
			reviewed: 0,
		},
		onProgress,
	);
	const records: PublicTorrentRecord[] = [];
	const errors: string[] = [];
	let successfulPages = 0;
	try {
		for (let page = 0; page < config.publicTorrentMaxPages; page++) {
			progress(
				{
					message: `Opinber torrent-gögn · síða ${page + 1}/${config.publicTorrentMaxPages}`,
				},
				onProgress,
			);
			try {
				const response = await fetchImpl(config.publicTorrentApiUrl, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"User-Agent": config.publicTorrentUserAgent,
					},
					body: JSON.stringify({
						order_by: "date",
						order_direction: "desc",
						categories: config.publicTorrentCategories,
						from: page * config.publicTorrentPageSize,
						size: config.publicTorrentPageSize,
						hide_unsafe: true,
						hide_xxx: true,
						seconds_since_last_seen: config.publicTorrentLookbackSeconds,
					}),
					signal: AbortSignal.timeout(config.publicTorrentFetchTimeoutMs),
				});
				if (!response.ok)
					throw new Error(`Opinber torrent-vísir svaraði HTTP ${response.status}`);
				const payload: unknown = await response.json();
				if (
					!payload ||
					typeof payload !== "object" ||
					!("hits" in payload) ||
					!Array.isArray(payload.hits)
				)
					throw new Error("Opinber torrent-vísir skilaði ógildu svari");
				const hits = payload.hits;
				for (const hit of hits) {
					const normalized = normalizeKnabenHit(hit);
					if (normalized) records.push(normalized);
				}
				successfulPages++;
				progress(
					{
						completedPages: successfulPages,
						itemCount: records.length,
					},
					onProgress,
				);
				if (hits.length < config.publicTorrentPageSize) break;
			} catch (error) {
				errors.push(error instanceof Error ? error.message : String(error));
				break;
			}
			await delay(config.publicTorrentScrapePacingMs);
		}
		if (!successfulPages) throw new Error(errors[0] ?? "Engin gögn sótt");
		const normalized = deduplicatePublicTorrents(records);
		let inserted = 0;
		let updated = 0;
		const sources = new Set(normalized.map((record) => record.tracker));
		db.transaction(() => {
			const exists = statement(
				"SELECT 1 FROM public_torrents WHERE info_hash=?",
			);
			const upsert = statement(`
				INSERT INTO public_torrents (
					info_hash,source_id,source,source_url,tracker,tracker_id,category,category_ids,
					torrent_uri,magnet_uri,original_title,media_kind,size_bytes,seeders,leechers,
					grabs,virus_score,published_at,last_seen_at,first_seen_at,updated_at
				) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
				ON CONFLICT(info_hash) DO UPDATE SET
					source_id=excluded.source_id,source=excluded.source,
					source_url=CASE WHEN excluded.source_url!='' THEN excluded.source_url ELSE public_torrents.source_url END,
					tracker=excluded.tracker,tracker_id=excluded.tracker_id,
					category=excluded.category,category_ids=excluded.category_ids,
					torrent_uri=COALESCE(excluded.torrent_uri,public_torrents.torrent_uri),
					magnet_uri=CASE WHEN excluded.magnet_uri!='' THEN excluded.magnet_uri ELSE public_torrents.magnet_uri END,
					original_title=excluded.original_title,media_kind=excluded.media_kind,
					size_bytes=excluded.size_bytes,seeders=excluded.seeders,leechers=excluded.leechers,
					grabs=excluded.grabs,virus_score=excluded.virus_score,
					published_at=excluded.published_at,last_seen_at=excluded.last_seen_at,
					updated_at=excluded.updated_at
			`);
			for (const record of normalized) {
				if (exists.get(record.infoHash)) updated++;
				else inserted++;
				upsert.run(
					record.infoHash,
					record.sourceId,
					record.source,
					record.sourceUrl,
					record.tracker,
					record.trackerId,
					record.category,
					JSON.stringify(record.categoryIds),
					record.torrentUri,
					record.magnetUri,
					record.originalTitle,
					record.mediaKind,
					record.sizeBytes,
					record.seeders,
					record.leechers,
					record.grabs,
					record.virusScore,
					record.publishedAt,
					record.lastSeenAt,
					startedAt,
					Date.now(),
				);
			}
		})();
		progress(
			{
				inserted,
				updated,
				itemCount: normalized.length,
				sourceCount: sources.size,
				message: "Hreinsa opinbera torrent-titla…",
			},
			onProgress,
		);
		const cleanup = await cleanImportedPublicTorrents(onProgress);
		const status = errors.length || cleanup.phase === "error" ? "partial" : "complete";
		const errorText = [
			...errors,
			...(cleanup.lastError ? [cleanup.lastError] : []),
		].join(" | ");
		statement(
			`UPDATE public_torrent_scrape_runs
			 SET finished_at=?,status=?,source_count=?,item_count=?,added_count=?,updated_count=?,
			     cleaned_count=?,enriched_count=?,review_count=?,error=?
			 WHERE id=?`,
		).run(
			Date.now(),
			status,
			sources.size,
			normalized.length,
			inserted,
			updated,
			cleanup.cleaned,
			cleanup.enriched,
			cleanup.reviewed,
			errorText || null,
			runId,
		);
		progress(
			{
				running: false,
				status,
				message:
					status === "complete"
						? "Opinber torrent-gögn uppfærð og hreinsuð"
						: "Opinber torrent-gögn uppfærð að hluta",
				lastRun: Date.now(),
				lastError: errorText,
				cleaned: cleanup.cleaned,
				enriched: cleanup.enriched,
				reviewed: cleanup.reviewed,
			},
			onProgress,
		);
		onComplete?.();
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		statement(
			`UPDATE public_torrent_scrape_runs
			 SET finished_at=?,status='error',error=? WHERE id=?`,
		).run(Date.now(), message, runId);
		progress(
			{
				running: false,
				status: "error",
				message: "Opinber torrent-samstilling mistókst",
				lastRun: Date.now(),
				lastError: message,
			},
			onProgress,
		);
	}
	return { ...publicTorrentScrapeState };
}
