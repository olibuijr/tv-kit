import { existsSync, statSync } from "node:fs";
import { resolve, sep } from "node:path";
import type { MediaKind, TorrentMedia } from "../../../packages/protocol";
import { config } from "./config";
import { statement } from "./db";
import {
	beginStream,
	type DownloadState,
	playbackKind,
	serveStream,
	type StreamContext,
} from "./deilduStream";
import { corsHeaders } from "./httpAccess";

type TorrentMediaRow = {
	id: string;
	title: string;
	description: string;
	source: string;
	license: string;
	torrent_uri: string;
	file_path: string;
	artwork_path: string;
	duration: number;
	status: TorrentMedia["status"];
	downloaded_bytes: number;
	total_bytes: number;
	updated_at: number;
};

const root = resolve(config.torrentMediaDir);

function mediaPath(relativePath: string) {
	const path = resolve(root, relativePath);
	if (path !== root && !path.startsWith(`${root}${sep}`))
		throw new Error("Torrent media path escapes TORRENT_MEDIA_DIR");
	return path;
}

function refresh(row: TorrentMediaRow) {
	const path = mediaPath(row.file_path);
	let downloadedBytes = 0;
	try {
		downloadedBytes = statSync(path).size;
	} catch {
		// Missing files remain visible as unavailable catalog items.
	}
	const status: TorrentMedia["status"] =
		downloadedBytes >= row.total_bytes && !existsSync(`${path}.aria2`)
			? "ready"
			: existsSync(`${path}.aria2`)
				? "downloading"
				: downloadedBytes
					? "incomplete"
					: "missing";
	if (status !== row.status || downloadedBytes !== row.downloaded_bytes) {
		statement(
			"UPDATE torrent_media SET status=?,downloaded_bytes=?,updated_at=? WHERE id=?",
		).run(status, downloadedBytes, Date.now(), row.id);
		return { ...row, status, downloaded_bytes: downloadedBytes };
	}
	return row;
}

function dto(row: TorrentMediaRow): TorrentMedia {
	return {
		id: row.id,
		title: row.title,
		description: row.description,
		source: row.source,
		license: row.license,
		duration: row.duration,
		artwork: row.artwork_path
			? `${config.serverUrl}/torrent/media/${row.id}/poster`
			: "",
		status: row.status,
		downloadedBytes: row.downloaded_bytes,
		totalBytes: row.total_bytes,
	};
}

function row(id: string) {
	const value = statement("SELECT * FROM torrent_media WHERE id=?").get(
		id,
	) as TorrentMediaRow | null;
	return value ? refresh(value) : null;
}

export function listTorrentMedia() {
	return (
		statement(
			"SELECT * FROM torrent_media ORDER BY title",
		).all() as TorrentMediaRow[]
	).map((item) => dto(refresh(item)));
}

export function getTorrentMedia(id: string) {
	const value = row(id);
	return value ? dto(value) : null;
}

// torrent_media.status uses a narrower CHECK set than the engine's internal
// DownloadState, so the context maps between them (no migration needed).
const toDbStatus: Record<DownloadState["status"], TorrentMedia["status"]> = {
	missing: "missing",
	starting: "downloading",
	downloading: "downloading",
	paused: "incomplete",
	error: "incomplete",
	ready: "ready",
};

async function fetchTorrentFile(uri: string) {
	if (!/^https?:\/\//.test(uri))
		throw new Error("Torrent-slóð verður að vera http(s) .torrent skrá");
	const response = await fetch(uri, {
		signal: AbortSignal.timeout(config.deilduFetchTimeoutMs),
	});
	if (!response.ok)
		throw new Error(`Torrent-sókn svaraði HTTP ${response.status}`);
	const buffer = await response.arrayBuffer();
	if (buffer.byteLength > 5 * 1024 * 1024)
		throw new Error("Torrent-lýsigögn eru of stór");
	return new Uint8Array(buffer);
}

function torrentMediaContext(id: string, torrentUri: string): StreamContext {
	return {
		key: `torrent-${id}`,
		root,
		itemDir: mediaPath(id),
		mediaKind: "movie",
		fetchTorrent: () => fetchTorrentFile(torrentUri),
		load() {
			const value = statement(
				"SELECT file_path,status,downloaded_bytes,total_bytes FROM torrent_media WHERE id=?",
			).get(id) as {
				file_path: string;
				status: TorrentMedia["status"];
				downloaded_bytes: number;
				total_bytes: number;
			} | null;
			if (!value) return null;
			return {
				fileIndex: 0,
				filePath: value.file_path,
				fileSize: value.total_bytes,
				status: value.status === "incomplete" ? "paused" : value.status,
				downloadedBytes: value.downloaded_bytes,
			};
		},
		save(state) {
			statement(
				"UPDATE torrent_media SET file_path=?,status=?,downloaded_bytes=?,total_bytes=?,updated_at=? WHERE id=?",
			).run(
				state.filePath,
				toDbStatus[state.status],
				state.downloadedBytes,
				state.fileSize,
				Date.now(),
				id,
			);
		},
	};
}

export type TorrentPlayback = {
	id: string;
	title: string;
	fileName: string;
	kind: MediaKind;
	src: string;
};

export async function startTorrentMediaPlayback(
	id: string,
	onProgress?: () => void,
): Promise<TorrentPlayback> {
	const value = statement(
		"SELECT title,torrent_uri FROM torrent_media WHERE id=?",
	).get(id) as { title: string; torrent_uri: string } | null;
	if (!value) throw new Error("Torrent-efni fannst ekki");
	const stream = await beginStream(
		torrentMediaContext(id, value.torrent_uri),
		onProgress,
	);
	return {
		id,
		title: value.title,
		fileName: stream.fileName,
		kind: playbackKind("movie", stream.fileName),
		src: `${config.serverUrl}/torrent/media/stream/${id}`,
	};
}

export function serveTorrentMediaStream(request: Request, id: string) {
	const value = statement(
		"SELECT torrent_uri FROM torrent_media WHERE id=?",
	).get(id) as { torrent_uri: string } | null;
	if (!value) return new Response("not found", { status: 404 });
	return serveStream(request, torrentMediaContext(id, value.torrent_uri));
}

export function serveTorrentMedia(
	request: Request,
	id: string,
	asset: "video" | "poster" = "video",
) {
	const value = row(id);
	if (!value || (asset === "video" && value.status !== "ready"))
		return new Response("not found", { status: 404 });
	const relativePath =
		asset === "poster" ? value.artwork_path : value.file_path;
	if (!relativePath) return new Response("not found", { status: 404 });
	const path = mediaPath(relativePath);
	if (!existsSync(path)) return new Response("not found", { status: 404 });

	const file = Bun.file(path);
	const headers = corsHeaders(
		request,
		config.allowedOrigins,
		asset === "poster" ? 3600 : 0,
	);
	headers.set("Accept-Ranges", "bytes");
	headers.set(
		"Content-Type",
		file.type || (asset === "video" ? "video/mp4" : "image/jpeg"),
	);
	const range = request.headers.get("Range");
	if (!range) {
		headers.set("Content-Length", String(file.size));
		return new Response(request.method === "HEAD" ? null : file, { headers });
	}

	const match = range.match(/^bytes=(\d*)-(\d*)$/);
	if (!match || (!match[1] && !match[2])) {
		headers.set("Content-Range", `bytes */${file.size}`);
		return new Response(null, { status: 416, headers });
	}
	const start = match[1]
		? Number(match[1])
		: Math.max(0, file.size - Number(match[2]));
	const end = match[1] && match[2] ? Number(match[2]) : file.size - 1;
	if (
		!Number.isSafeInteger(start) ||
		!Number.isSafeInteger(end) ||
		start < 0 ||
		start > end ||
		start >= file.size
	) {
		headers.set("Content-Range", `bytes */${file.size}`);
		return new Response(null, { status: 416, headers });
	}
	const boundedEnd = Math.min(end, file.size - 1);
	headers.set("Content-Range", `bytes ${start}-${boundedEnd}/${file.size}`);
	headers.set("Content-Length", String(boundedEnd - start + 1));
	return new Response(
		request.method === "HEAD" ? null : file.slice(start, boundedEnd + 1),
		{ status: 206, headers },
	);
}
