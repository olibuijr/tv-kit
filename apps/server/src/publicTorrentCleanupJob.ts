import { config } from "./config";
import {
	cleanReleaseCandidatesWithLlm,
	cleanupCandidateFromRelease,
	findTmdbReleaseMatch,
	type ReleaseRow,
} from "./deilduCleanupJob";
import { validateDeilduTitleCleanup } from "./deilduTitleCleanup";
import { statement } from "./db";

type PublicReleaseRow = ReleaseRow<string>;

export const publicTorrentCleanupState = {
	running: false,
	phase: "idle" as "idle" | "cleanup" | "tmdb" | "complete" | "error",
	current: 0,
	total: 0,
	cleaned: 0,
	reviewed: 0,
	enriched: 0,
	message: "Tilbúið",
	lastRun: null as number | null,
	lastError: "",
};

export async function cleanImportedPublicTorrents(onProgress?: () => void) {
	if (publicTorrentCleanupState.running) return publicTorrentCleanupState;
	const rows = statement(
		`SELECT info_hash AS id,original_title,media_kind
		 FROM public_torrents
		 WHERE cleanup_status='pending'
		 ORDER BY seeders DESC,last_seen_at DESC
		 LIMIT ?`,
	).all(config.publicTorrentCleanupLimit) as PublicReleaseRow[];
	Object.assign(publicTorrentCleanupState, {
		running: true,
		phase: "cleanup",
		current: 0,
		total: rows.length,
		cleaned: 0,
		reviewed: 0,
		enriched: 0,
		message: "Hreinsa opinbera torrent-titla",
		lastError: "",
	});
	onProgress?.();
	try {
		let llmUnavailable = !config.localLlmBaseUrl || !config.localLlmApiKey;
		for (let offset = 0; offset < rows.length; offset += 8) {
			const batch = rows.slice(offset, offset + 8);
			const deterministic = new Map(
				batch.flatMap((row) => {
					const candidate = cleanupCandidateFromRelease(row);
					return candidate ? [[row.id, candidate] as const] : [];
				}),
			);
			const unresolved = batch.filter((row) => !deterministic.has(row.id));
			let candidates = [...deterministic.values()];
			if (unresolved.length && !llmUnavailable) {
				try {
					candidates = [
						...candidates,
						...(await cleanReleaseCandidatesWithLlm(unresolved)),
					];
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					llmUnavailable = true;
					for (const row of unresolved)
						statement(
							"UPDATE public_torrents SET cleanup_error=?,updated_at=? WHERE info_hash=?",
						).run(message, Date.now(), row.id);
				}
			}
			const matches = new Map(
				await Promise.all(
					batch.map(async (row) => {
						const candidate = candidates.find((item) => item.id === row.id);
						const validation = candidate
							? validateDeilduTitleCleanup(row.original_title, candidate)
							: null;
						return [
							row.id,
							candidate && validation?.status === "accept"
								? await findTmdbReleaseMatch(candidate, row.media_kind)
								: null,
						] as const;
					}),
				),
			);
			for (const row of batch) {
				const candidate = candidates.find((item) => item.id === row.id);
				if (!candidate) {
					statement(
						"UPDATE public_torrents SET cleanup_error=?,updated_at=? WHERE info_hash=?",
					).run("missing_model_output", Date.now(), row.id);
					publicTorrentCleanupState.reviewed++;
					continue;
				}
				const validation = validateDeilduTitleCleanup(
					row.original_title,
					candidate,
				);
				if (validation.status !== "accept") {
					statement(
						"UPDATE public_torrents SET cleanup_status='review',cleanup_error=?,updated_at=? WHERE info_hash=?",
					).run(validation.reasons.join(","), Date.now(), row.id);
					publicTorrentCleanupState.reviewed++;
					continue;
				}
				const metadata: Record<string, unknown> = {
					year: candidate.year,
					season: candidate.season,
					episode: candidate.episode,
					resolution: candidate.resolution,
				};
				publicTorrentCleanupState.phase = "tmdb";
				const match = matches.get(row.id);
				if (match) {
					metadata.tmdb = match;
					publicTorrentCleanupState.enriched++;
				}
				statement(
					`UPDATE public_torrents
					 SET title=?,metadata=?,tmdb_id=?,cleanup_status='clean',cleanup_error='',cleaned_at=?,updated_at=?
					 WHERE info_hash=?`,
				).run(
					candidate.title.trim(),
					JSON.stringify(metadata),
					typeof match?.id === "number" ? match.id : null,
					Date.now(),
					Date.now(),
					row.id,
				);
				publicTorrentCleanupState.cleaned++;
			}
			publicTorrentCleanupState.current = offset + batch.length;
			publicTorrentCleanupState.message = `${publicTorrentCleanupState.current}/${rows.length}`;
			onProgress?.();
		}
		Object.assign(publicTorrentCleanupState, {
			running: false,
			phase: "complete",
			lastRun: Date.now(),
			message: "Opinberir torrent-titlar hreinsaðir",
		});
	} catch (error) {
		Object.assign(publicTorrentCleanupState, {
			running: false,
			phase: "error",
			lastRun: Date.now(),
			lastError: error instanceof Error ? error.message : String(error),
			message: "Hreinsun opinberra torrent-titla mistókst",
		});
	}
	onProgress?.();
	return publicTorrentCleanupState;
}
