import { config } from "./config";
import { statement } from "./db";
import { cleanImportedPublicTorrents } from "./publicTorrentCleanupJob";
import {
	scrapeAllSourcesConcurrent,
	type TorrentSource,
} from "./publicTorrentSources";


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
	sources?: TorrentSource[],
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
	try {
		const summary = await scrapeAllSourcesConcurrent({
			onSourceStart: (source) =>
				progress({ message: `Sæki frá ${source}…` }, onProgress),
			onBatch: (source, batchInserted, batchUpdated, sampleTitle) =>
				progress(
					{
						inserted: publicTorrentScrapeState.inserted + batchInserted,
						updated: publicTorrentScrapeState.updated + batchUpdated,
						itemCount:
							publicTorrentScrapeState.itemCount +
							batchInserted +
							batchUpdated,
						message: batchInserted
							? `${source}: +${batchInserted} nýir torrentar${sampleTitle ? ` · ${sampleTitle}` : ""}`
							: `${source}: uppfærði ${batchUpdated}`,
					},
					onProgress,
				),
			onSourceDone: (source, total) =>
				progress(
					{ message: `${source} búið · ${total} torrentar` },
					onProgress,
				),
			},
			sources,
		);
		if (!summary.total && !publicTorrentScrapeState.itemCount)
			throw new Error("Engin gögn sótt frá neinum vísi");
		progress(
			{
				sourceCount: summary.sources,
				message: "Hreinsa opinbera torrent-titla…",
			},
			onProgress,
		);
		const cleanup = await cleanImportedPublicTorrents(onProgress);
		const status = cleanup.phase === "error" ? "partial" : "complete";
		const errorText = cleanup.lastError ?? "";
		statement(
			`UPDATE public_torrent_scrape_runs
			 SET finished_at=?,status=?,source_count=?,item_count=?,added_count=?,updated_count=?,
			     cleaned_count=?,enriched_count=?,review_count=?,error=?
			 WHERE id=?`,
		).run(
			Date.now(),
			status,
			publicTorrentScrapeState.sourceCount,
			publicTorrentScrapeState.itemCount,
			publicTorrentScrapeState.inserted,
			publicTorrentScrapeState.updated,
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
