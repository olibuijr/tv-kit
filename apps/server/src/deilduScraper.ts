import {
	DEILDU_PAGE_SIZE,
	type DeilduCategory,
	type DeilduItem,
	type DeilduMediaKind,
	type DeilduPagination,
	type DeilduScrapeState,
} from "../../../packages/protocol";
import { config } from "./config";
import { cleanImportedDeildu, deilduCleanupState } from "./deilduCleanupJob";
import { db, statement } from "./db";

type CategoryRow = {
	id: number;
	name: string;
	media_kind: DeilduMediaKind;
	playable: number;
	sort_order: number;
	item_count: number;
};

type ItemRow = {
	id: number;
	category_id: number;
	category_name: string;
	media_kind: DeilduMediaKind;
	playable: number;
	title: string;
	metadata: string;
	size_bytes: number;
	seeders: number;
	leechers: number;
	added_at: number | null;
	ai_cleaned: number;
	status: DeilduItem["status"];
	downloaded_bytes: number;
	total_bytes: number;
	error: string;
	updated_at: number;
};

export type DeilduBrowseItem = {
	id: number;
	categoryId: number;
	title: string;
	sizeBytes: number;
	seeders: number;
	leechers: number;
	addedAt: number | null;
};

type RunRow = {
	started_at: number;
	finished_at: number | null;
	status: "running" | "complete" | "partial" | "error";
	category_count: number;
	item_count: number;
	added_count: number;
	updated_count: number;
	error: string | null;
};

const idleState: DeilduScrapeState = {
	running: false,
	status: "idle",
	message: "",
	lastRun: null,
	lastError: "",
	inserted: 0,
	updated: 0,
	itemCount: 0,
	categoryCount: 0,
	completedPages: 0,
	totalPages: 0,
};

function latestState(): DeilduScrapeState {
	const row = statement(
		"SELECT * FROM deildu_scrape_runs ORDER BY started_at DESC LIMIT 1",
	).get() as RunRow | null;
	if (!row) return { ...idleState };
	const interrupted = row.status === "running";
	return {
		...idleState,
		status: interrupted ? "error" : row.status,
		message: interrupted
			? "Fyrri Deildu-samstilling stöðvaðist"
			: row.status === "complete"
				? "Deildu-efni uppfært"
				: "Deildu-samstilling lauk með villu",
		lastRun: row.finished_at ?? row.started_at,
		lastError: interrupted
			? "Samstilling stöðvaðist áður en henni lauk"
			: (row.error ?? ""),
		inserted: row.added_count,
		updated: row.updated_count,
		itemCount: row.item_count,
		categoryCount: row.category_count,
	};
}

export const scrapeState: DeilduScrapeState = latestState();

const categoryQuery = `
	SELECT c.*, COUNT(i.id) AS item_count
	FROM deildu_categories c
	LEFT JOIN deildu_items i ON i.category_id=c.id
	GROUP BY c.id
	ORDER BY c.sort_order, c.id
`;

const itemSelect = `
	SELECT i.id, i.category_id, c.name AS category_name,
		c.media_kind, c.playable, i.title, i.metadata, i.size_bytes,
		i.seeders, i.leechers, i.added_at, i.ai_cleaned,
		COALESCE(d.status, 'missing') AS status,
		COALESCE(d.downloaded_bytes, 0) AS downloaded_bytes,
		CASE WHEN d.file_size > 0 THEN d.file_size ELSE i.size_bytes END AS total_bytes,
		COALESCE(d.error, '') AS error,
		MAX(i.updated_at, COALESCE(d.updated_at, 0)) AS updated_at
	FROM deildu_items i
	JOIN deildu_categories c ON c.id=i.category_id
	LEFT JOIN deildu_downloads d ON d.item_id=i.id
`;

function categoryDto(row: CategoryRow): DeilduCategory {
	return {
		id: row.id,
		name: row.name,
		mediaKind: row.media_kind,
		playable: Boolean(row.playable),
		sortOrder: row.sort_order,
		itemCount: row.item_count,
	};
}

function itemDto(row: ItemRow): DeilduItem {
	let posterPath = "";
	try {
		const metadata = JSON.parse(row.metadata) as {
			tmdb?: { poster_path?: unknown };
		};
		if (typeof metadata.tmdb?.poster_path === "string")
			posterPath = metadata.tmdb.poster_path;
	} catch {
		/* legacy metadata remains without artwork */
	}
	return {
		id: row.id,
		categoryId: row.category_id,
		categoryName: row.category_name,
		mediaKind: row.media_kind,
		playable: Boolean(row.playable),
		title: row.title,
		artwork:
			posterPath && config.tmdbImageBase
				? `${config.tmdbImageBase}${posterPath}`
				: "",
		sizeBytes: row.size_bytes,
		seeders: row.seeders,
		leechers: row.leechers,
		addedAt: row.added_at,
		aiCleaned: Boolean(row.ai_cleaned),
		status: row.status,
		downloadedBytes: row.downloaded_bytes,
		totalBytes: row.total_bytes,
		error: row.error,
		updatedAt: row.updated_at,
	};
}

export function listDeilduCategories(): DeilduCategory[] {
	return (statement(categoryQuery).all() as CategoryRow[]).map(categoryDto);
}

export function listDeilduItems(
	page = 1,
	pageSize = DEILDU_PAGE_SIZE,
	categoryId = 0,
): { items: DeilduItem[]; pagination: DeilduPagination } {
	const categories = listDeilduCategories();
	const totalItems = categoryId
		? (categories.find((category) => category.id === categoryId)?.itemCount ??
			0)
		: categories.reduce((sum, category) => sum + category.itemCount, 0);
	const boundedPageSize = Math.max(1, Math.min(100, Math.trunc(pageSize)));
	const totalPages = Math.ceil(totalItems / boundedPageSize);
	const boundedPage = Math.max(1, Math.min(totalPages || 1, Math.trunc(page)));
	const offset = (boundedPage - 1) * boundedPageSize;
	const ranked = categoryId
		? `
			WITH ranked AS (
				SELECT i.*, ROW_NUMBER() OVER (
					ORDER BY COALESCE(i.added_at, 0) DESC, i.id DESC
				) AS page_rank
				FROM deildu_items i
				WHERE i.category_id=?
			)
		`
		: `
			WITH ranked AS (
				SELECT i.*, ROW_NUMBER() OVER (
					ORDER BY COALESCE(i.added_at, 0) DESC, i.id DESC
				) AS page_rank
				FROM deildu_items i
			)
		`;
	const query = `${ranked}
		${itemSelect.replace("FROM deildu_items i", "FROM ranked i")}
		WHERE i.page_rank > ? AND i.page_rank <= ?
		ORDER BY COALESCE(i.added_at, 0) DESC, i.id DESC`;
	const rows = (
		categoryId
			? statement(query).all(categoryId, offset, offset + boundedPageSize)
			: statement(query).all(offset, offset + boundedPageSize)
	) as ItemRow[];
	return {
		items: rows.map(itemDto),
		pagination: {
			categoryId,
			page: boundedPage,
			pageSize: boundedPageSize,
			totalItems,
			totalPages,
		},
	};
}

export function getDeilduItem(id: number): DeilduItem | null {
	const row = statement(`${itemSelect} WHERE i.id=?`).get(id) as ItemRow | null;
	return row ? itemDto(row) : null;
}

const htmlEntities: Record<string, string> = {
	amp: "&",
	apos: "'",
	quot: '"',
	lt: "<",
	gt: ">",
	nbsp: " ",
	aacute: "á",
	Aacute: "Á",
	eth: "ð",
	ETH: "Ð",
	eacute: "é",
	Eacute: "É",
	iacute: "í",
	Iacute: "Í",
	oacute: "ó",
	Oacute: "Ó",
	ouml: "ö",
	Ouml: "Ö",
	thorn: "þ",
	THORN: "Þ",
	uacute: "ú",
	Uacute: "Ú",
	yacute: "ý",
	Yacute: "Ý",
	aelig: "æ",
	AElig: "Æ",
	ndash: "–",
	mdash: "—",
	rsquo: "’",
	lsquo: "‘",
};

function decodeHtml(value: string) {
	return value
		.replace(/&#(\d+);/g, (_, code: string) =>
			String.fromCodePoint(Number(code)),
		)
		.replace(/&#x([\da-f]+);/gi, (_, code: string) =>
			String.fromCodePoint(Number.parseInt(code, 16)),
		)
		.replace(
			/&([a-z][\w]+);/gi,
			(entity, name: string) => htmlEntities[name] ?? entity,
		);
}

function text(value: string) {
	return decodeHtml(
		value
			.replace(/<br\s*\/?>/gi, " ")
			.replace(/<[^>]+>/g, " ")
			.replace(/&nbsp;|&#160;/gi, " ")
			.replace(/\s+/g, " ")
			.trim(),
	);
}

export function parseSizeBytes(value: string) {
	const match = value.trim().match(/^([\d.,]+)\s*(B|KB|MB|GB|TB)$/i);
	if (!match) return 0;
	const amount = Number(match[1].replace(",", "."));
	if (!Number.isFinite(amount) || amount < 0) return 0;
	const power = ["B", "KB", "MB", "GB", "TB"].indexOf(match[2].toUpperCase());
	return Math.round(amount * 1024 ** power);
}

function parseAddedAt(value: string): number | null {
	if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) return null;
	const timestamp = Date.parse(`${value.replace(" ", "T")}Z`);
	return Number.isFinite(timestamp) ? timestamp : null;
}

export function parseBrowsePage(
	html: string,
	categoryId: number,
): DeilduBrowseItem[] {
	const table = html.match(
		/<table[^>]*class=["'][^"']*torrentlist[^"']*["'][^>]*>([\s\S]*?)<\/table>/i,
	)?.[1];
	if (!table) return [];

	const items: DeilduBrowseItem[] = [];
	for (const match of table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
		const row = match[1];
		const id = Number(row.match(/download\.php\/(\d+)\//i)?.[1]);
		if (!Number.isSafeInteger(id) || id < 1) continue;
		const cells = row.match(/<td[^>]*>[\s\S]*?<\/td>/gi) ?? [];
		if (cells.length < 10) continue;
		const titleCell = cells[1];
		const titleAttribute = titleCell.match(/\btitle=["']([^"']+)["']/i)?.[1];
		const title = text(titleAttribute ?? titleCell);
		const seeders = Number.parseInt(text(cells[8]), 10);
		const leechers = Number.parseInt(text(cells[9]), 10);
		if (!title || !Number.isSafeInteger(seeders) || seeders < 0) continue;
		items.push({
			id,
			categoryId,
			title: title.slice(0, 512),
			sizeBytes: parseSizeBytes(text(cells[6])),
			seeders,
			leechers: Number.isSafeInteger(leechers) && leechers >= 0 ? leechers : 0,
			addedAt: parseAddedAt(text(cells[5])),
		});
	}
	return items;
}

let cachedCookie = "";
let cookieExpires = 0;

function credentialsConfigured() {
	return Boolean(
		config.deilduUsername && config.deilduPassword && config.deilduPasskey,
	);
}

async function login() {
	if (cachedCookie && Date.now() < cookieExpires) return cachedCookie;
	if (!credentialsConfigured())
		throw new Error("Deildu-auðkenni vantar í verndað umhverfi");

	const form = new URLSearchParams({
		username: config.deilduUsername,
		password: config.deilduPassword,
		keeplogged: "1",
	});
	const response = await fetch(`${config.deilduBaseUrl}/takelogin.php`, {
		method: "POST",
		headers: {
			"Content-Type": "application/x-www-form-urlencoded",
			"User-Agent": config.deilduUserAgent,
		},
		body: form.toString(),
		redirect: "manual",
		signal: AbortSignal.timeout(config.deilduFetchTimeoutMs),
	});
	const cookies = response.headers.getSetCookie();
	let uid = "";
	let pass = "";
	for (const cookie of cookies) {
		uid = cookie.match(/(?:^|;\s*)uid=([^;]+)/)?.[1] ?? uid;
		pass = cookie.match(/(?:^|;\s*)pass=([^;]+)/)?.[1] ?? pass;
	}
	if (!uid || !pass) throw new Error("Deildu-innskráning mistókst");
	cachedCookie = `uid=${uid}; pass=${pass}`;
	cookieExpires = Date.now() + 55 * 60 * 1000;
	return cachedCookie;
}

async function fetchPage(categoryId: number, page: number) {
	const response = await fetch(
		`${config.deilduBaseUrl}/browse.php?page=${page}&cat=${categoryId}`,
		{
			headers: {
				Cookie: await login(),
				"User-Agent": config.deilduUserAgent,
			},
			signal: AbortSignal.timeout(config.deilduFetchTimeoutMs),
		},
	);
	if (!response.ok) throw new Error(`Deildu svaraði HTTP ${response.status}`);
	const bytes = await response.arrayBuffer();
	const utf8 = new TextDecoder().decode(bytes);
	// Deildu occasionally serves legacy Icelandic bytes without declaring charset.
	return utf8.includes("�")
		? new TextDecoder("windows-1252").decode(bytes)
		: utf8;
}

function progress(patch: Partial<DeilduScrapeState>, onProgress?: () => void) {
	Object.assign(scrapeState, patch);
	onProgress?.();
}

const delay = (ms: number) =>
	ms ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();

export async function scrapeDeildu(
	pages = config.deilduScrapePages,
	onProgress?: () => void,
): Promise<DeilduScrapeState> {
	if (scrapeState.running) return { ...scrapeState };
	const boundedPages = Math.max(1, Math.min(20, Math.trunc(pages)));
	const categories = listDeilduCategories();
	const startedAt = Date.now();
	const run = statement(
		`INSERT INTO deildu_scrape_runs
		 (started_at,status,category_count,item_count,added_count,updated_count)
		 VALUES (?,'running',0,0,0,0)`,
	).run(startedAt);
	const runId = Number(run.lastInsertRowid);
	progress(
		{
			running: true,
			status: "running",
			message: "Tengi við Deildu…",
			lastError: "",
			inserted: 0,
			updated: 0,
			itemCount: 0,
			categoryCount: 0,
			completedPages: 0,
			totalPages: categories.length * boundedPages,
		},
		onProgress,
	);

	const found = new Map<number, DeilduBrowseItem>();
	const successfulCategories = new Set<number>();
	const errors: string[] = [];

	try {
		for (const category of categories) {
			let categorySucceeded = false;
			for (let page = 0; page < boundedPages; page++) {
				progress(
					{
						message: `${category.name} · síða ${page + 1}/${boundedPages}`,
					},
					onProgress,
				);
				try {
					const items = parseBrowsePage(
						await fetchPage(category.id, page),
						category.id,
					);
					categorySucceeded = true;
					for (const item of items) found.set(item.id, item);
					progress(
						{
							completedPages: scrapeState.completedPages + 1,
							itemCount: found.size,
						},
						onProgress,
					);
					if (items.length < 100) break;
				} catch (error) {
					const message =
						error instanceof Error ? error.message : String(error);
					errors.push(`${category.name}: ${message}`);
					break;
				}
				await delay(config.deilduScrapePacingMs);
			}
			if (categorySucceeded) successfulCategories.add(category.id);
			await delay(config.deilduScrapePacingMs);
		}

		let inserted = 0;
		let updated = 0;
		const seenAt = Date.now();
		db.transaction(() => {
			const exists = statement("SELECT 1 FROM deildu_items WHERE id=?");
			const upsert = statement(`
				INSERT INTO deildu_items (
					id,category_id,title,original_title,size_bytes,seeders,leechers,
					added_at,last_seen_at,updated_at
				) VALUES (?,?,?,?,?,?,?,?,?,?)
				ON CONFLICT(id) DO UPDATE SET
					category_id=excluded.category_id,
					title=CASE WHEN deildu_items.original_title=excluded.original_title AND deildu_items.ai_cleaned=1 THEN deildu_items.title ELSE excluded.title END,
					original_title=excluded.original_title,
					ai_cleaned=CASE WHEN deildu_items.original_title=excluded.original_title THEN deildu_items.ai_cleaned ELSE 0 END,
					metadata=CASE WHEN deildu_items.original_title=excluded.original_title THEN deildu_items.metadata ELSE '{}' END,
					cleanup_error=CASE WHEN deildu_items.original_title=excluded.original_title THEN deildu_items.cleanup_error ELSE '' END,
					size_bytes=excluded.size_bytes,
					seeders=excluded.seeders,
					leechers=excluded.leechers,
					added_at=COALESCE(excluded.added_at,deildu_items.added_at),
					last_seen_at=excluded.last_seen_at,
					updated_at=excluded.updated_at
			`);
			for (const item of found.values()) {
				if (exists.get(item.id)) updated++;
				else inserted++;
				upsert.run(
					item.id,
					item.categoryId,
					item.title,
					item.title,
					item.sizeBytes,
					item.seeders,
					item.leechers,
					item.addedAt,
					seenAt,
					seenAt,
				);
			}
		})();

		await cleanImportedDeildu([...found.keys()], () => {
			progress(
				{
					message: deilduCleanupState.message,
					completedPages: deilduCleanupState.current,
					totalPages: deilduCleanupState.total,
				},
				onProgress,
			);
		});

		const status: DeilduScrapeState["status"] = errors.length
			? found.size
				? "partial"
				: "error"
			: "complete";
		const lastError = errors.join(" · ").slice(0, 2_000);
		const finishedAt = Date.now();
		statement(
			`UPDATE deildu_scrape_runs SET
			 finished_at=?,status=?,category_count=?,item_count=?,
			 added_count=?,updated_count=?,error=? WHERE id=?`,
		).run(
			finishedAt,
			status,
			successfulCategories.size,
			found.size,
			inserted,
			updated,
			lastError || null,
			runId,
		);
		progress(
			{
				running: false,
				status,
				message:
					status === "complete"
						? `${found.size} Deildu-færslur uppfærðar`
						: `${found.size} færslur uppfærðar með viðvörunum`,
				lastRun: finishedAt,
				lastError,
				inserted,
				updated,
				itemCount: found.size,
				categoryCount: successfulCategories.size,
			},
			onProgress,
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		const finishedAt = Date.now();
		statement(
			`UPDATE deildu_scrape_runs
			 SET finished_at=?,status='error',error=? WHERE id=?`,
		).run(finishedAt, message.slice(0, 2_000), runId);
		progress(
			{
				running: false,
				status: "error",
				message: "Deildu-samstilling mistókst",
				lastRun: finishedAt,
				lastError: message,
			},
			onProgress,
		);
	}
	return { ...scrapeState };
}
