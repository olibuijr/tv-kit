import type { PublicTorrentRecord } from "./publicTorrentScraper";
import { config } from "./config";
import { db, statement } from "./db";

// --- Source adapter interface ---

export interface TorrentSource {
	name: string;
	search(
		query: string,
		mediaKind?: "movie" | "tv",
	): Promise<PublicTorrentRecord[]>;
}

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

// --- Helpers ---

function fetchWithTimeout(
	url: string,
	init: RequestInit = {},
	timeoutMs: number,
	fetchImpl: FetchFn = fetch,
): Promise<Response> {
	return fetchImpl(url, {
		...init,
		signal: AbortSignal.timeout(timeoutMs),
	});
}

function safeJson<T>(response: Response): Promise<T | null> {
	return response
		.json()
		.catch(() => null) as Promise<T | null>;
}

function magnetFromHash(infoHash: string, name: string): string {
	const trackers = [
		"udp://tracker.opentrackr.org:1337/announce",
		"udp://open.stealth.si:80/announce",
		"udp://tracker.torrent.eu.org:451/announce",
		"udp://tracker.coppersurfer.tk:6969/announce",
		"udp://tracker.leechers-paradise.org:6969/announce",
	];
	const tr = trackers.map((t) => `&tr=${encodeURIComponent(t)}`).join("");
	return `magnet:?xt=urn:btih:${infoHash}&dn=${encodeURIComponent(name)}${tr}`;
}

function mediaKindFromTitle(title: string): "movie" | "tv" | null {
	const t = title.toLowerCase();
	if (/\bs\d{1,3}\b/.test(t) || /\bseason\b/.test(t) || /\bepisode\b/.test(t))
		return "tv";
	if (/\b\d{4}\b/.test(t)) return "movie";
	return null;
}

// --- apibay.org (ThePirateBay JSON API) ---

interface ApibayHit {
	id: string;
	name: string;
	info_hash: string;
	seeders: string;
	leechers: string;
	size: string;
	added: string;
	num_files: string;
	status: string;
	category: string;
	imdb: string;
	username: string;
}

const APiBAY_CATEGORIES: Record<string, string> = {
	movie: "200",
	tv: "200", // TPB lumps TV under Video/200
};

function normalizeApibayHit(hit: ApibayHit, now: number): PublicTorrentRecord | null {
	if (!hit.info_hash || hit.info_hash.length !== 40) return null;
	const infoHash = hit.info_hash.toUpperCase();
	if (!/^[A-F0-9]{40}$/.test(infoHash)) return null;
	const title = hit.name?.trim();
	if (!title || title.length > 500) return null;
	const sizeBytes = Number(hit.size) || 0;
	const seeders = Number(hit.seeders) || 0;
	const leechers = Number(hit.leechers) || 0;
	const added = Number(hit.added) || 0;
	const publishedAt = added > 0 ? added * 1000 : null;
	const categoryNum = Number(hit.category) || 0;
	const categoryIds = categoryNum > 0 ? [categoryNum * 1000, categoryNum * 1000 + 1000] : [];
	const categoryName =
		categoryNum === 200
			? "Video"
			: categoryNum === 100
				? "Audio"
				: categoryNum === 300
					? "Applications"
					: categoryNum === 400
						? "Games"
						: "Other";
	const mediaKind = categoryNum === 200
		? mediaKindFromTitle(title) ?? "movie"
		: categoryNum === 500
			? ("tv" as const)
			: null;
	if (!mediaKind) return null;

	return {
		infoHash,
		sourceId: hit.id,
		source: "ThePirateBay",
		sourceUrl: "",
		tracker: "ThePirateBay",
		trackerId: "thepiratebay",
		category: categoryName,
		categoryIds,
		torrentUri: null,
		magnetUri: magnetFromHash(infoHash, title),
		originalTitle: title,
		mediaKind,
		sizeBytes,
		seeders,
		leechers,
		grabs: null,
		virusScore: null,
		publishedAt,
		lastSeenAt: now,
	};
}

function createApibaySource(fetchImpl: FetchFn = fetch): TorrentSource {
	return {
		name: "ThePirateBay",
		async search(query, mediaKind) {
			const cat = mediaKind ? (APiBAY_CATEGORIES[mediaKind] ?? "") : "";
			const url = `${"https://apibay.org"}/q.php?q=${encodeURIComponent(query)}&cat=${cat}`;
			try {
				const response = await fetchWithTimeout(
					url,
					{},
					config.publicTorrentFetchTimeoutMs,
					fetchImpl,
				);
				if (!response.ok) return [];
				const hits = await safeJson<ApibayHit[]>(response);
				if (!hits || !Array.isArray(hits)) return [];
				const now = Date.now();
				return hits
					.map((h) => normalizeApibayHit(h, now))
					.filter((r): r is PublicTorrentRecord => r !== null)
					.filter((r) => !mediaKind || r.mediaKind === mediaKind);
			} catch {
				return [];
			}
		},
	};
}

// --- Knaben search source ---

interface KnabenHit {
	hash: string;
	title: string;
	bytes: number;
	seeders: number;
	peers: number;
	category: string;
	categoryId: number[];
	cachedOrigin: string;
	tracker: string;
	trackerId: string;
	details: string;
	magnetUrl: string;
	link: string | null;
	date: string;
	lastSeen: string;
	grabs: number;
	virusDetection: number;
	id: string;
}

function normalizeKnabenSearchHit(
	hit: KnabenHit,
	now: number,
	mediaKind: "movie" | "tv" | null,
): PublicTorrentRecord | null {
	const infoHash = (hit.hash ?? "").trim().toUpperCase();
	if (!/^[A-F0-9]{40}$/.test(infoHash)) return null;
	const originalTitle = (hit.title ?? "").trim();
	if (!originalTitle || originalTitle.length > 500) return null;
	const category = (hit.category ?? "").trim();
	const kind = /^tv(?:\s|\/|$)/i.test(category)
		? "tv"
		: /^movies?(?:\s|\/|$)/i.test(category)
			? "movie"
			: mediaKind;
	if (!kind) return null;
	const rawCategoryIds = hit.categoryId;
	const categoryIds = Array.isArray(rawCategoryIds)
		? rawCategoryIds
				.map((item) => Number(item))
				.filter((item) => Number.isSafeInteger(item) && item > 0)
		: [];
	const publishedAt = hit.date ? Date.parse(hit.date) : null;
	const lastSeen = hit.lastSeen ? Date.parse(hit.lastSeen) : null;
	const lastSeenAt = Number.isFinite(lastSeen) ? (lastSeen as number) : (publishedAt ?? now);

	return {
		infoHash,
		sourceId: hit.id ?? infoHash,
		source: hit.cachedOrigin || hit.tracker || "Knaben",
		sourceUrl: hit.details ?? "",
		tracker: hit.tracker ?? "",
		trackerId: hit.trackerId ?? "",
		category,
		categoryIds,
		torrentUri: hit.link && (hit.link.startsWith("https://") || hit.link.startsWith("http://"))
			? hit.link
			: null,
		magnetUri: hit.magnetUrl?.startsWith("magnet:?") ? hit.magnetUrl : "",
		originalTitle,
		mediaKind: kind,
		sizeBytes: Number.isSafeInteger(hit.bytes) && hit.bytes > 0 ? hit.bytes : 0,
		seeders: Number.isSafeInteger(hit.seeders) && hit.seeders >= 0 ? hit.seeders : 0,
		leechers: Number.isSafeInteger(hit.peers) && hit.peers >= 0 ? hit.peers : 0,
		grabs: Number.isSafeInteger(hit.grabs) ? hit.grabs : null,
		virusScore: Number.isFinite(hit.virusDetection) ? hit.virusDetection : null,
		publishedAt: Number.isFinite(publishedAt) ? (publishedAt as number) : null,
		lastSeenAt: Number.isFinite(lastSeenAt) ? (lastSeenAt as number) : now,
	};
}

const KNABEN_SEARCH_CATEGORIES: Record<string, number[]> = {
	movie: [2001000, 2002000, 2003000, 2005000, 3001000, 3002000, 3003000, 3005000],
	tv: [5001000, 5002000, 5003000, 5005000],
};

function createKnabenSource(fetchImpl: FetchFn = fetch): TorrentSource {
	return {
		name: "Knaben",
		async search(query, mediaKind) {
			const categoryIds = mediaKind
				? (KNABEN_SEARCH_CATEGORIES[mediaKind] ?? config.publicTorrentCategories)
				: config.publicTorrentCategories;
			try {
				const response = await fetchWithTimeout(
					config.publicTorrentApiUrl,
					{
						method: "POST",
						headers: {
							"Content-Type": "application/json",
							"User-Agent": config.publicTorrentUserAgent,
						},
						body: JSON.stringify({
							query,
							search_field: "title",
							search_type: "70%",
							order_by: "seeders",
							order_direction: "desc",
							categories: categoryIds,
							from: 0,
							size: 50,
							hide_unsafe: true,
							hide_xxx: true,
						}),
					},
					config.publicTorrentFetchTimeoutMs,
					fetchImpl,
				);
				if (!response.ok) return [];
				const payload = await safeJson<{ hits: KnabenHit[] }>(response);
				if (!payload?.hits || !Array.isArray(payload.hits)) return [];
				const now = Date.now();
				return payload.hits
					.map((h) => normalizeKnabenSearchHit(h, now, mediaKind ?? null))
					.filter((r): r is PublicTorrentRecord => r !== null)
					.filter((r) => !mediaKind || r.mediaKind === mediaKind);
			} catch {
				return [];
			}
		},
	};
}


// --- 1337x HTML scraper (uses 1337xx.to mirror) ---

const LEETX_MIRRORS = ["https://1337xx.to", "https://1337x.is"];

function parseLeetxSize(value: string): number {
	const m = value.trim().match(/^([\d.]+)\s*(GB|MB|KB|TB)/i);
	if (!m) return 0;
	const num = Number.parseFloat(m[1]);
	const unit = m[2].toUpperCase();
	if (!Number.isFinite(num)) return 0;
	const multipliers: Record<string, number> = { TB: 1e12, GB: 1e9, MB: 1e6, KB: 1e3 };
	return Math.round(num * (multipliers[unit] ?? 1));
}

function parseLeetxRow(html: string, baseUrl: string, now: number): PublicTorrentRecord | null {
	const nameMatch = html.match(/<td class="coll-1 name">.*?<a href="(\/torrent\/\d+\/[^"]+)">([^<]+)<\/a>/);
	if (!nameMatch) return null;
	const detailPath = nameMatch[1];
	const title = nameMatch[2].trim();
	if (!title) return null;
	const seedsMatch = html.match(/<td class="coll-2 seeds">(\d+)<\/td>/);
	const leechesMatch = html.match(/<td class="coll-3 leeches">(\d+)<\/td>/);
	const sizeMatch = html.match(/<td class="coll-4 size[^"]*">([^<]+)<\/td>/);
	const dateMatch = html.match(/<td class="coll-date">([^<]+)<\/td>/);
	const seeders = seedsMatch ? Number(seedsMatch[1]) : 0;
	const leechers = leechesMatch ? Number(leechesMatch[1]) : 0;
	const sizeBytes = sizeMatch ? parseLeetxSize(sizeMatch[1]) : 0;
	const sourceId = detailPath.split("/")[2] ?? title;
	const mediaKind = mediaKindFromTitle(title) ?? "movie";
	return {
		infoHash: "", // filled after detail page fetch
		sourceId,
		source: "1337x",
		sourceUrl: `${baseUrl}${detailPath}`,
		tracker: "1337x",
		trackerId: "1337x",
		category: "",
		categoryIds: [],
		torrentUri: null,
		magnetUri: "",
		originalTitle: title,
		mediaKind,
		sizeBytes,
		seeders,
		leechers,
		grabs: null,
		virusScore: null,
		publishedAt: null,
		lastSeenAt: now,
	};
}

function createLeetxSource(fetchImpl: FetchFn = fetch): TorrentSource {
	return {
		name: "1337x",
		async search(query, mediaKind) {
			for (const baseUrl of LEETX_MIRRORS) {
				try {
					const url = `${baseUrl}/search/${encodeURIComponent(query)}/1/`;
					const response = await fetchWithTimeout(
						url,
						{
							headers: {
								"User-Agent":
									"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
								"Accept": "text/html,application/xhtml+xml",
								"Accept-Language": "en-US,en;q=0.9",
							},
						},
						config.publicTorrentFetchTimeoutMs,
						fetchImpl,
					);
					if (!response.ok) continue;
					const html = await response.text();
					if (html.includes("Just a moment") || html.includes("cf-browser-verification"))
						continue;
					const rows = html.match(/<tr>[\s\S]*?<\/tr>/g);
					if (!rows) continue;
					const now = Date.now();
					return rows
						.map((r) => parseLeetxRow(r, baseUrl, now))
						.filter((r): r is PublicTorrentRecord => r !== null);
				} catch {
					continue;
				}
			}
			return [];
		},
	};
}

// --- EZTV JSON API (TV shows) ---

interface EztvHit {
	id: number;
	hash: string;
	filename: string;
	torrent_url: string;
	magnet_url: string;
	title: string;
	imdb_id: string;
	season: string;
	episode: string;
	seeds: number;
	peers: number;
	date_released_unix: number;
	size_bytes: string;
}

function normalizeEztvHit(hit: EztvHit, now: number): PublicTorrentRecord | null {
	const infoHash = (hit.hash ?? "").trim().toUpperCase();
	if (!/^[A-F0-9]{40}$/.test(infoHash)) {
		if (!hit.magnet_url) return null;
		const m = hit.magnet_url.match(/btih:([A-F0-9]{40})/i);
		if (!m) return null;
		// infoHash stays empty if not in standard format — we'll use magnet
	}
	const title = (hit.title ?? hit.filename ?? "").trim();
	if (!title || title.length > 500) return null;
	const sizeBytes = Number(hit.size_bytes) || 0;
	const seeders = Number(hit.seeds) || 0;
	const leechers = Number(hit.peers) || 0;
	const publishedAt = hit.date_released_unix ? hit.date_released_unix * 1000 : null;
	return {
		infoHash,
		sourceId: String(hit.id),
		source: "EZTV",
		sourceUrl: hit.torrent_url ?? "",
		tracker: "EZTV",
		trackerId: "eztv",
		category: "TV",
		categoryIds: [5000000],
		torrentUri: hit.torrent_url ?? null,
		magnetUri: hit.magnet_url ?? "",
		originalTitle: title,
		mediaKind: "tv",
		sizeBytes,
		seeders,
		leechers,
		grabs: null,
		virusScore: null,
		publishedAt,
		lastSeenAt: now,
	};
}

function createEztvSource(fetchImpl: FetchFn = fetch): TorrentSource {
	return {
		name: "EZTV",
		async search(query, _mediaKind) {
			try {
				const url = `https://eztv.re/api/get-torrents?query=${encodeURIComponent(query)}&limit=30`;
				const response = await fetchWithTimeout(
					url,
					{
						headers: {
							"User-Agent":
								"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
							"Accept": "application/json",
						},
					},
					config.publicTorrentFetchTimeoutMs,
					fetchImpl,
				);
				if (!response.ok) return [];
				const payload = await safeJson<{ torrents: EztvHit[] }>(response);
				const hits = payload?.torrents;
				if (!hits || !Array.isArray(hits)) return [];
				const now = Date.now();
				return hits
					.map((h) => normalizeEztvHit(h, now))
					.filter((r): r is PublicTorrentRecord => r !== null && r.infoHash.length === 40);
			} catch {
				return [];
			}
		},
	};
}

// --- Source registry ---

export const torrentSources: TorrentSource[] = [
	createApibaySource(),
	createKnabenSource(),
	createLeetxSource(),
	createEztvSource(),
];

// --- Multi-source search ---

export function deduplicateByHash(records: PublicTorrentRecord[]): PublicTorrentRecord[] {
	const seen = new Map<string, PublicTorrentRecord>();
	for (const r of records) {
		const existing = seen.get(r.infoHash);
		if (!existing || r.seeders > existing.seeders) {
			seen.set(r.infoHash, r);
		}
	}
	return [...seen.values()];
}

export async function searchAllSources(
	query: string,
	mediaKind?: "movie" | "tv",
): Promise<PublicTorrentRecord[]> {
	const cleanQuery = query.trim();
	if (!cleanQuery || cleanQuery.length < 2) return [];
	const results = await Promise.all(
		torrentSources.map((source) =>
			source.search(cleanQuery, mediaKind).catch(() => [] as PublicTorrentRecord[]),
		),
	);
	const all = results.flat();
	return deduplicateByHash(all).sort(
		(a, b) => b.seeders - a.seeders || b.lastSeenAt - a.lastSeenAt,
	);
}

// --- Upsert into public_torrents ---

export function upsertPublicTorrents(
	records: PublicTorrentRecord[],
): { inserted: number; updated: number } {
	let inserted = 0;
	let updated = 0;
	db.transaction(() => {
		const exists = statement("SELECT 1 FROM public_torrents WHERE info_hash=?");
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
		const now = Date.now();
		for (const r of records) {
			if (exists.get(r.infoHash)) updated++;
			else inserted++;
			upsert.run(
				r.infoHash, r.sourceId, r.source, r.sourceUrl,
				r.tracker, r.trackerId, r.category, JSON.stringify(r.categoryIds),
				r.torrentUri, r.magnetUri, r.originalTitle, r.mediaKind,
				r.sizeBytes, r.seeders, r.leechers,
				r.grabs, r.virusScore, r.publishedAt,
				r.lastSeenAt, r.lastSeenAt, now,
			);
		}
	})();
	return { inserted, updated };
}
