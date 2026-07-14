import { join, resolve } from "node:path";
import { mkdirSync } from "node:fs";
import type { MediaKind } from "../../../packages/protocol";
import { config } from "./config";
import { statement } from "./db";
import {
	beginStream,
	type DownloadState,
	mpvStreamSource,
	playbackKind,
	serveStream,
	type StreamContext,
	waitForContiguousPieces,
} from "./deilduStream";

// Transient per-info-hash download state, shared between the playback context
// and each stream-serving context in this process. Torrent playback is cleared
// on restart, so an in-memory map (not SQLite) is the correct lifetime.
const publicDownloads = new Map<string, DownloadState>();

const publicRoot = resolve(config.torrentMediaDir, "public");
mkdirSync(publicRoot, { recursive: true, mode: 0o700 });

type PublicRow = {
	title: string;
	torrent_uri: string | null;
	media_kind: string;
};

function publicRow(infoHash: string): PublicRow | null {
	return statement(
		`SELECT COALESCE(NULLIF(title,''),original_title) AS title,torrent_uri,media_kind
		 FROM public_torrents WHERE info_hash=?`,
	).get(infoHash) as PublicRow | null;
}

export function getPublicTorrentMeta(
	infoHash: string,
): { title: string; mediaKind: string } | null {
	const row = publicRow(infoHash);
	return row ? { title: row.title, mediaKind: row.media_kind } : null;
}

// Public trackers hand out magnets, but the bencode parser needs a real
// .torrent. Try the stored http(s) .torrent (Knaben direct links) first, then
// fall back to the itorrents.org cache keyed by the 40-hex info-hash.
async function fetchPublicTorrentFile(
	infoHash: string,
	torrentUri: string | null,
): Promise<Uint8Array> {
	const candidates: string[] = [];
	if (torrentUri && /^https?:\/\//.test(torrentUri)) candidates.push(torrentUri);
	candidates.push(`https://itorrents.org/torrent/${infoHash}.torrent`);
	let lastError = "engin slóð";
	for (const url of candidates) {
		try {
			const response = await fetch(url, {
				signal: AbortSignal.timeout(config.deilduFetchTimeoutMs),
			});
			if (!response.ok) {
				lastError = `HTTP ${response.status}`;
				continue;
			}
			const buffer = await response.arrayBuffer();
			if (buffer.byteLength < 32 || buffer.byteLength > 5 * 1024 * 1024) {
				lastError = "ógild stærð";
				continue;
			}
			const bytes = new Uint8Array(buffer);
			// bencode dictionaries begin with 'd' (0x64); anything else is HTML/error.
			if (bytes[0] !== 0x64) {
				lastError = "ekki torrent-skrá";
				continue;
			}
			return bytes;
		} catch (error) {
			lastError = error instanceof Error ? error.message : String(error);
		}
	}
	throw new Error(`Náði ekki í torrent-lýsigögn (${lastError})`);
}

function publicContext(
	infoHash: string,
	torrentUri: string | null,
	mediaKind: string,
): StreamContext {
	return {
		key: `public-${infoHash}`,
		root: publicRoot,
		itemDir: join(publicRoot, infoHash),
		mediaKind,
		fetchTorrent: () => fetchPublicTorrentFile(infoHash, torrentUri),
		load: () => publicDownloads.get(infoHash) ?? null,
		save: (state) => {
			publicDownloads.set(infoHash, state);
		},
	};
}

export type PublicTorrentPlayback = {
	infoHash: string;
	title: string;
	fileName: string;
	kind: MediaKind;
	src: string;
	mpvSrc: string;
};

export async function startPublicTorrentPlayback(
	infoHash: string,
	onProgress?: () => void,
): Promise<PublicTorrentPlayback> {
	const row = publicRow(infoHash);
	if (!row) throw new Error("Torrent fannst ekki í opinberum lista");
	const ctx = publicContext(infoHash, row.torrent_uri, row.media_kind);
	const stream = await beginStream(ctx, onProgress);
	await waitForContiguousPieces(stream, 80, onProgress);
	const src = `${config.serverUrl}/public-torrents/stream/${infoHash}`;
	return {
		infoHash,
		title: row.title,
		fileName: stream.fileName,
		kind: playbackKind(row.media_kind, stream.fileName),
		src,
		mpvSrc: mpvStreamSource(stream, src),
	};
}

export function servePublicTorrentStream(request: Request, infoHash: string) {
	const row = publicRow(infoHash);
	if (!row) return new Response("not found", { status: 404 });
	return serveStream(
		request,
		publicContext(infoHash, row.torrent_uri, row.media_kind),
	);
}
