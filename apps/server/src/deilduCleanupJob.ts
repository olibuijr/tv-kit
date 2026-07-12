import { config } from "./config";
import { statement } from "./db";
import {
	type CleanedDeilduTitle,
	validateDeilduTitleCleanup,
} from "./deilduTitleCleanup";

type Row = {
	id: number;
	original_title: string;
	media_kind: "movie" | "tv" | "audio" | "other";
};
type Candidate = CleanedDeilduTitle & { id: number };

export const deilduCleanupState = {
	running: false,
	phase: "idle" as
		| "idle"
		| "cleanup"
		| "tmdb"
		| "complete"
		| "error"
		| "disabled",
	current: 0,
	total: 0,
	cleaned: 0,
	reviewed: 0,
	enriched: 0,
	message: "Tilbúið",
	lastRun: null as number | null,
	lastError: "",
	tmdbEnabled: Boolean(config.tmdbApiKey && config.tmdbApiBase),
};

function jsonArray(text: string): unknown[] {
	const start = text.indexOf("[");
	const end = text.lastIndexOf("]");
	if (start < 0 || end <= start) return [];
	try {
		const value: unknown = JSON.parse(text.slice(start, end + 1));
		return Array.isArray(value) ? value : [];
	} catch {
		return [];
	}
}

async function cleanBatch(rows: Row[]): Promise<Candidate[]> {
	const response = await fetch(`${config.localLlmBaseUrl}/chat/completions`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${config.localLlmApiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			model: config.localLlmModel,
			temperature: 0,
			max_tokens: 512,
			chat_template_kwargs: { enable_thinking: false },
			messages: [
				{
					role: "system",
					content:
						"Clean torrent release titles. Return only a JSON array. Each item: id, title (human display title only), and evidence-backed optional year, season, episode, resolution (480p|720p|1080p|2160p). Never invent metadata.",
				},
				{
					role: "user",
					content: JSON.stringify(
						rows.map(({ id, original_title }) => ({
							id,
							title: original_title,
						})),
					),
				},
			],
		}),
		signal: AbortSignal.timeout(config.localLlmTimeoutMs),
	});
	if (!response.ok) throw new Error(`Titan LLM HTTP ${response.status}`);
	const payload = (await response.json()) as {
		choices?: { message?: { content?: string } }[];
	};
	return jsonArray(payload.choices?.[0]?.message?.content ?? "").filter(
		(value): value is Candidate =>
			Boolean(
				value &&
					typeof value === "object" &&
					Number.isSafeInteger((value as Candidate).id) &&
					typeof (value as Candidate).title === "string",
			),
	);
}

async function tmdb(candidate: Candidate, kind: Row["media_kind"]) {
	if (
		!config.tmdbApiKey ||
		!config.tmdbApiBase ||
		(kind !== "movie" && kind !== "tv")
	)
		return undefined;
	const params = new URLSearchParams({
		api_key: config.tmdbApiKey,
		query: candidate.title,
		include_adult: "false",
		language: "is-IS",
	});
	if (candidate.year)
		params.set(
			kind === "movie" ? "year" : "first_air_date_year",
			String(candidate.year),
		);
	const response = await fetch(
		`${config.tmdbApiBase}/search/${kind}?${params}`,
		{ signal: AbortSignal.timeout(15_000) },
	);
	if (!response.ok) return undefined;
	const payload = (await response.json()) as {
		results?: Record<string, unknown>[];
	};
	return payload.results?.[0];
}

export async function cleanImportedDeildu(
	ids: number[],
	onProgress?: () => void,
) {
	if (deilduCleanupState.running) return deilduCleanupState;
	if (!config.localLlmBaseUrl || !config.localLlmApiKey) {
		Object.assign(deilduCleanupState, {
			phase: "disabled",
			message: "Titan LLM er ekki stillt",
			lastError: "LOCAL_LLM er ekki stillt",
		});
		onProgress?.();
		return deilduCleanupState;
	}
	const rows = ids.length
		? (statement(
				`SELECT i.id,i.original_title,c.media_kind FROM deildu_items i JOIN deildu_categories c ON c.id=i.category_id WHERE i.ai_cleaned=0 AND i.cleanup_error='' AND i.id IN (${ids.map(() => "?").join(",")}) ORDER BY i.id`,
			).all(...ids) as Row[])
		: [];
	Object.assign(deilduCleanupState, {
		running: true,
		phase: "cleanup",
		current: 0,
		total: rows.length,
		cleaned: 0,
		reviewed: 0,
		enriched: 0,
		message: "Hreinsa titla með Titan LLM",
		lastError: "",
	});
	onProgress?.();
	try {
		for (let offset = 0; offset < rows.length; offset += 8) {
			const batch = rows.slice(offset, offset + 8);
			deilduCleanupState.message = `${offset + 1}–${offset + batch.length}/${rows.length} · ${batch[0].original_title}`;
			console.info(`Deildu cleanup ${deilduCleanupState.message}`);
			onProgress?.();
			let candidates: Candidate[];
			try {
				candidates = await cleanBatch(batch);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				console.error("Deildu cleanup batch failed", deilduCleanupState.message, message);
				for (const row of batch)
					statement("UPDATE deildu_items SET cleanup_error=? WHERE id=?").run(message, row.id);
				deilduCleanupState.reviewed += batch.length;
				deilduCleanupState.current = offset + batch.length;
				onProgress?.();
				continue;
			}
			const matches = new Map(
				await Promise.all(
					batch.map(async (row) => {
						const candidate = candidates.find((item) => item.id === row.id);
						const validation = candidate
							? validateDeilduTitleCleanup(row.original_title, candidate)
							: null;
						return [row.id, candidate && validation?.status === "accept" ? await tmdb(candidate, row.media_kind) : null] as const;
					}),
				),
			);
			for (const row of batch) {
				const candidate = candidates.find((item) => item.id === row.id);
				const validation = candidate
					? validateDeilduTitleCleanup(row.original_title, candidate)
					: { status: "review" as const, reasons: ["missing_model_output"] };
				if (!candidate || validation.status !== "accept") {
					statement("UPDATE deildu_items SET cleanup_error=? WHERE id=?").run(
						validation.reasons.join(","),
						row.id,
					);
					deilduCleanupState.reviewed++;
					continue;
				}
				const metadata: Record<string, unknown> = {
					year: candidate.year,
					season: candidate.season,
					episode: candidate.episode,
					resolution: candidate.resolution,
				};
				deilduCleanupState.phase = "tmdb";
				const match = matches.get(row.id);
				if (match) {
					metadata.tmdb = match;
					deilduCleanupState.enriched++;
				}
				statement(
					"UPDATE deildu_items SET title=?,metadata=?,tmdb_id=?,ai_cleaned=1,cleanup_error='',cleaned_at=?,updated_at=? WHERE id=?",
				).run(
					candidate.title.trim(),
					JSON.stringify(metadata),
					typeof match?.id === "number" ? match.id : null,
					Date.now(),
					Date.now(),
					row.id,
				);
				deilduCleanupState.cleaned++;
			}
			deilduCleanupState.current = offset + batch.length;
			deilduCleanupState.message = `${deilduCleanupState.current}/${rows.length} · ${batch.at(-1)?.original_title}`;
			onProgress?.();
		}
		Object.assign(deilduCleanupState, {
			running: false,
			phase: "complete",
			lastRun: Date.now(),
			message:
				config.tmdbApiKey && config.tmdbApiBase
					? "Titlar hreinsaðir og TMDB gögn sótt"
					: "Titlar hreinsaðir · TMDB bíður eftir stillingum",
		});
	} catch (error) {
		console.error(
			"Deildu cleanup failed",
			deilduCleanupState.message,
			error instanceof Error ? error.message : error,
		);
		Object.assign(deilduCleanupState, {
			running: false,
			phase: "error",
			lastRun: Date.now(),
			lastError: error instanceof Error ? error.message : String(error),
			message: "Titlahreinsun mistókst",
		});
	}
	onProgress?.();
	return deilduCleanupState;
}
