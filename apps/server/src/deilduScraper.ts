/**
 * deilduScraper.ts — Deildu.net torrent scraper for TV Kit.
 *
 * Ported from BunFast's deildu-client.ts + deildu-peer-scrape.ts.
 * Discovers movie torrents from Deildu.net and inserts them into
 * the torrent_media catalog. Credentials from env vars.
 *
 * Commands (via WebSocket):
 *   deildu-scrape: { type: "command", action: "deildu-scrape", value: { pages?: number } }
 *
 * Env vars:
 *   DEILDU_PASSKEY  — required for scraping (from Deildu.net profile)
 *   DEILDU_USERNAME — optional, needed for browse.php (login)
 *   DEILDU_PASSWORD — optional, needed for browse.php (login)
 */

import { statement } from "./db";

// ── Types ────────────────────────────────────────────────────────────

export interface DeilduScrapeState {
	running: boolean;
	lastRun: number | null;
	lastError: string | null;
	inserted: number;
	updated: number;
	currentPage: number;
}

interface DeilduTorrentMeta {
	id: number;
	guid: string;
	name: string;
	sizeBytes: number;
}

interface PeerRow {
	title: string;
	seeders: number;
	leechers: number;
	torrentId: string;
	catName: string | null;
}

// ── State ────────────────────────────────────────────────────────────

export const scrapeState: DeilduScrapeState = {
	running: false,
	lastRun: null,
	lastError: null,
	inserted: 0,
	updated: 0,
	currentPage: 0,
};

// ── Credentials ──────────────────────────────────────────────────────

const GUID_OFFSET = 1_000_000_000_000;

function passkey(): string {
	return Bun.env.DEILDU_PASSKEY?.trim() ?? "";
}

function deilduCreds(): {
	username: string;
	password: string;
	passkey: string;
} | null {
	const username = Bun.env.DEILDU_USERNAME?.trim();
	const password = Bun.env.DEILDU_PASSWORD?.trim();
	const pk = passkey();
	if (!username || !password || !pk) return null;
	return { username, password, passkey: pk };
}

// ── Minimal bencode decoder ──────────────────────────────────────────

class Bencode {
	constructor(
		private buf: Uint8Array,
		private pos = 0,
	) {}

	decode(): unknown {
		const c = this.buf[this.pos];
		if (c === 0x64) return this.decodeDict();
		if (c === 0x6c) return this.decodeList();
		if (c === 0x69) return this.decodeInt();
		return this.decodeBytes();
	}

	private decodeInt(): number {
		this.pos++;
		const end = this.buf.indexOf(0x65, this.pos);
		const n = Number(
			new TextDecoder().decode(this.buf.subarray(this.pos, end)),
		);
		this.pos = end + 1;
		return n;
	}

	private decodeBytes(): Uint8Array {
		const colon = this.buf.indexOf(0x3a, this.pos);
		const len = Number(
			new TextDecoder().decode(this.buf.subarray(this.pos, colon)),
		);
		const start = colon + 1;
		const bytes = this.buf.subarray(start, start + len);
		this.pos = start + len;
		return bytes;
	}

	private decodeList(): unknown[] {
		this.pos++;
		const out: unknown[] = [];
		while (this.buf[this.pos] !== 0x65) out.push(this.decode());
		this.pos++;
		return out;
	}

	private decodeDict(): Record<string, unknown> {
		this.pos++;
		const out: Record<string, unknown> = {};
		while (this.buf[this.pos] !== 0x65) {
			const key = new TextDecoder().decode(this.decodeBytes());
			out[key] = this.decode();
		}
		this.pos++;
		return out;
	}
}

// ── Torrent metadata via download.php ────────────────────────────────

async function fetchTorrentMeta(
	id: number,
	pk: string,
): Promise<DeilduTorrentMeta | null> {
	const url = `https://deildu.net/download.php/${id}/x.torrent?passkey=${pk}`;
	let resp: Response;
	try {
		resp = await fetch(url, { headers: { "User-Agent": "tvserverd/1.0" } });
	} catch {
		return null;
	}
	if (!resp.ok) return null;

	try {
		const buf = new Uint8Array(await resp.arrayBuffer());
		const root = new Bencode(buf).decode() as Record<string, unknown>;
		const info = root.info as Record<string, unknown> | undefined;
		if (!info) return null;
		const rawName = info.name;
		const name =
			rawName instanceof Uint8Array && rawName.length > 2
				? new TextDecoder("utf-8", { fatal: false }).decode(rawName)
				: "";
		if (name.length < 3) return null;

		let sizeBytes = 0;
		if (typeof info.length === "number") {
			sizeBytes = info.length;
		} else if (Array.isArray(info.files)) {
			for (const f of info.files as Record<string, unknown>[]) {
				sizeBytes += typeof f.length === "number" ? f.length : 0;
			}
		}

		return { id, guid: String(GUID_OFFSET + id), name, sizeBytes };
	} catch {
		return null;
	}
}

// ── Authenticated browsing ───────────────────────────────────────────

let cachedCookie: string | null = null;
let cookieExpires = 0;

async function loginAndGetCookie(): Promise<string | null> {
	if (cachedCookie && Date.now() < cookieExpires) return cachedCookie;

	const creds = deilduCreds();
	if (!creds) return null;

	try {
		const form = new URLSearchParams();
		form.set("username", creds.username);
		form.set("password", creds.password);
		form.set("keeplogged", "1");

		const resp = await fetch("https://deildu.net/takelogin.php", {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
				"User-Agent": "tvserverd/1.0",
			},
			body: form.toString(),
			redirect: "manual",
		});

		const cookies = resp.headers.getSetCookie
			? resp.headers.getSetCookie()
			: [resp.headers.get("set-cookie") ?? ""];
		let uid = "",
			pass = "";
		for (const c of cookies) {
			const u = c.match(/uid=([^;]+)/);
			if (u) uid = u[1];
			const p = c.match(/pass=([^;]+)/);
			if (p) pass = p[1];
		}
		if (!uid || !pass) return null;

		cachedCookie = `uid=${uid}; pass=${pass}`;
		cookieExpires = Date.now() + 55 * 60 * 1000;
		return cachedCookie;
	} catch {
		return null;
	}
}

async function fetchAuthenticated(url: string): Promise<string | null> {
	const cookie = await loginAndGetCookie();
	if (!cookie) return null;

	try {
		const resp = await fetch(url, {
			headers: { Cookie: cookie, "User-Agent": "tvserverd/1.0" },
		});
		if (!resp.ok) return null;
		return resp.text();
	} catch {
		return null;
	}
}

// ── Page parser ──────────────────────────────────────────────────────

const CATEGORY_NAMES: Record<number, string> = {
	1: "Tónlist",
	2: "Kvikmyndir",
	3: "Leikir",
	4: "Forrit",
	5: "Sjónvarpsefni",
	6: "Kvikmyndir",
	7: "Hljóðbækur",
	8: "Sjónvarpsefni",
	9: "Fræðsluefni",
	10: "Íslenskt",
	11: "Teiknimyndir",
	12: "Þættir",
	13: "Íþróttir",
	14: "Annað",
};

function parseBrowsePage(html: string, categoryId?: number): PeerRow[] {
	const rows: PeerRow[] = [];
	const tableRe =
		/<table[^>]*class="torrentlist"[^>]*>([\s\S]*?)<\/table>/i;
	const tableMatch = html.match(tableRe);
	if (!tableMatch) return rows;

	let currentCat = categoryId
		? (CATEGORY_NAMES[categoryId] ?? null)
		: null;

	const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
	let rm: RegExpExecArray | null;
	while ((rm = rowRe.exec(tableMatch[1])) !== null) {
		const rowHtml = rm[1];

		if (/class="colhead/.test(rowHtml)) {
			const catMatch = rowHtml.match(/browse\.php\?cat=(\d+)/);
			if (catMatch)
				currentCat = CATEGORY_NAMES[parseInt(catMatch[1], 10)] ?? null;
			continue;
		}
		if (/class="headbg"/.test(rowHtml)) continue;

		const tds = rowHtml.match(/<td[^>]*>[\s\S]*?<\/td>/gi);
		if (!tds || tds.length < 10) continue;

		const texts = tds.map((td) =>
			td
				.replace(/<[^>]+>/g, "")
				.replace(/&nbsp;/g, " ")
				.trim(),
		);
		const title = texts[1];
		const seeders = parseInt(texts[8], 10);
		const leechers = parseInt(texts[9], 10);
		if (!title || isNaN(seeders)) continue;

		const idMatch = rowHtml.match(/download\.php\/(\d+)\//);
		if (!idMatch) continue;

		rows.push({
			title,
			seeders,
			leechers,
			torrentId: idMatch[1],
			catName: currentCat,
		});
	}
	return rows;
}

// ── DB operations ────────────────────────────────────────────────────

function insertTorrentMedia(
	id: string,
	title: string,
	torrentUri: string,
	filePath: string,
	totalBytes: number,
) {
	const upsert = statement(`
    INSERT OR IGNORE INTO torrent_media
      (id, title, description, source, license, torrent_uri, file_path,
       artwork_path, duration, status, downloaded_bytes, total_bytes, updated_at)
    VALUES (?, ?, ?, 'Deildu.net', 'unknown', ?, ?, '', 0, 'missing', 0, ?, ?)
  `);
	upsert.run(
		id,
		title,
		`Deildu.net kvikmynd #${title}`,
		torrentUri,
		filePath,
		totalBytes,
		Date.now(),
	);
}

// ── Main scrape function ─────────────────────────────────────────────

export async function scrapeDeildu(pages = 3): Promise<DeilduScrapeState> {
	const pk = passkey();
	if (!pk) {
		scrapeState.lastError = "DEILDU_PASSKEY not configured";
		return { ...scrapeState };
	}

	if (scrapeState.running) return { ...scrapeState };

	scrapeState.running = true;
	scrapeState.lastError = null;
	scrapeState.inserted = 0;
	scrapeState.updated = 0;
	scrapeState.currentPage = 0;

	const LOG = (msg: string) => {
		console.log(`[deildu-scrape] ${msg}`);
		scrapeState.lastError = msg;
	};

	try {
		// Try authenticated browsing first, fall back to passkey-only backfill
		const cookie = await loginAndGetCookie();
		if (cookie) {
			LOG("logged in, scraping browse pages...");

			for (let page = 0; page < pages; page++) {
				scrapeState.currentPage = page + 1;
				const url = `https://deildu.net/browse.php?page=${page}&cat=2`; // cat=2 = Kvikmyndir (movies)
				const html = await fetchAuthenticated(url);
				if (!html) {
					LOG(`page ${page} returned no HTML, stopping`);
					break;
				}

				const rows = parseBrowsePage(html, 2);
				LOG(`page ${page}: ${rows.length} torrents`);

				for (const row of rows) {
					const sourceId = `deildu-${row.torrentId}`;
					const torrentUri = `https://deildu.net/download.php/${row.torrentId}/x.torrent?passkey=${pk}`;
					const filePath = `deildu/${row.torrentId}/${row.title}`;

					// Check if already in DB
					const existing = statement(
						"SELECT id FROM torrent_media WHERE id = ?",
					).get(sourceId);
					if (existing) {
						scrapeState.updated++;
						continue;
					}

					// Get file size from torrent metadata
					const meta = await fetchTorrentMeta(
						parseInt(row.torrentId, 10),
						pk,
					);
					const totalBytes = meta?.sizeBytes ?? 0;

					insertTorrentMedia(
						sourceId,
						row.title,
						torrentUri,
						filePath,
						totalBytes,
					);
					scrapeState.inserted++;

					// Rate limit
					await new Promise((r) => setTimeout(r, 300));
				}

				await new Promise((r) => setTimeout(r, 500));
			}
		} else {
			// Fallback: just backfill from the newest RSS ID
			LOG("no login credentials, using passkey-only backfill...");
			const newestId = await fetchNewestRssId(pk);
			if (newestId) {
				await backfillRange(newestId, Math.max(0, newestId - 100), pk);
			} else {
				LOG("could not determine newest torrent ID");
			}
		}
	} catch (err) {
		scrapeState.lastError = (err as Error).message;
		LOG(`error: ${scrapeState.lastError}`);
	} finally {
		scrapeState.running = false;
		scrapeState.lastRun = Date.now();
	}

	return { ...scrapeState };
}

async function fetchNewestRssId(pk: string): Promise<number | null> {
	const username = Bun.env.DEILDU_USERNAME?.trim();
	if (!username) return null;
	const url = `https://deildu.net/get_rss.php?feed=direct&user=${encodeURIComponent(username)}&cat=2&passkey=${encodeURIComponent(pk)}`;
	try {
		const resp = await fetch(url, {
			headers: { "User-Agent": "tvserverd/1.0" },
		});
		if (!resp.ok) return null;
		const xml = await resp.text();
		const guids = [...xml.matchAll(/<guid[^>]*>(\d+)<\/guid>/g)].map(
			(m) => Number(m[1]) - GUID_OFFSET,
		);
		return guids.length ? Math.max(...guids) : null;
	} catch {
		return null;
	}
}

async function backfillRange(
	fromId: number,
	toId: number,
	pk: string,
): Promise<void> {
	const LOG = (msg: string) => {
		console.log(`[deildu-scrape] ${msg}`);
		scrapeState.lastError = msg;
	};

	let found = 0;
	for (let id = fromId; id >= toId && id > 0; id--) {
		const sourceId = `deildu-${id}`;
		const existing = statement(
			"SELECT id FROM torrent_media WHERE id = ?",
		).get(sourceId);
		if (existing) continue;

		const meta = await fetchTorrentMeta(id, pk);
		if (!meta) continue;

		found++;
		const torrentUri = `https://deildu.net/download.php/${id}/x.torrent?passkey=${pk}`;
		const filePath = `deildu/${id}/${meta.name}`;
		insertTorrentMedia(sourceId, meta.name, torrentUri, filePath, meta.sizeBytes);
		scrapeState.inserted++;

		await new Promise((r) => setTimeout(r, 250));
	}

	LOG(`backfill: ${fromId}→${toId}, found ${found}`);
}
