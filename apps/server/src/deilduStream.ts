import { chmodSync, existsSync, mkdirSync, statSync } from "node:fs";
import { basename, extname, relative, resolve, sep } from "node:path";
import type { MediaKind } from "../../../packages/protocol";
import { config } from "./config";
import { statement } from "./db";
import { deilduEpisodeTarget, getDeilduItem } from "./deilduScraper";
import { corsHeaders } from "./httpAccess";

type BValue = number | Uint8Array | BValue[] | { [key: string]: BValue };
type BDictionary = { [key: string]: BValue };

type TorrentFile = {
	index: number;
	path: string;
	length: number;
	offset: number;
};

type TorrentMetadata = {
	name: string;
	files: TorrentFile[];
	pieceLength: number;
	totalLength: number;
	multiFile: boolean;
};

type AriaFile = {
	index: string;
	path: string;
	length: string;
	completedLength: string;
	selected: string;
};

type AriaStatus = {
	gid: string;
	status: "active" | "waiting" | "paused" | "error" | "complete" | "removed";
	bitfield?: string;
	completedLength: string;
	totalLength: string;
	downloadSpeed?: string;
	connections?: string;
	numSeeders?: string;
	errorMessage?: string;
	files: AriaFile[];
};

type DownloadRow = {
	item_id: number;
	file_index: number;
	file_path: string;
	file_size: number;
	status: "missing" | "starting" | "downloading" | "paused" | "ready" | "error";
	downloaded_bytes: number;
	error: string;
	updated_at: number;
};

// Live transfer telemetry for the single active stream; the loading overlay
// on the TV frame renders peers/speed/percent from this snapshot.
export type TransferStats = {
	peers: number;
	seeders: number;
	speedBps: number;
	downloadedBytes: number;
	totalBytes: number;
};
let lastTransfer: TransferStats | null = null;
export function transferStats() {
	return lastTransfer;
}

export type DownloadState = {
	fileIndex: number;
	filePath: string; // relative to ctx.root
	fileSize: number;
	status: DownloadRow["status"];
	downloadedBytes: number;
	error?: string;
};

// One generic torrent source (deildu item or curated torrent_media row). The
// engine owns a single aria2 process — correct for a single TV — so both flow
// through the same activeStream singleton.
export type StreamContext = {
	key: string;
	root: string; // base dir; persisted filePath is relative to this
	itemDir: string; // root/<id>, aria2 --dir
	mediaKind: string;
	fetchTorrent(): Promise<Uint8Array>;
	load(): DownloadState | null;
	save(state: DownloadState): void;
};

type ActiveStream = {
	ctx: StreamContext;
	gid: string;
	path: string;
	fileName: string;
	fileLength: number;
	fileOffset: number;
	pieceLength: number;
	status: "downloading" | "ready";
};

export type DeilduPlayback = {
	id: number;
	title: string;
	fileName: string;
	kind: MediaKind;
	src: string;
	mpvSrc: string;
};

export function mpvStreamSource(
	stream: { status: "downloading" | "ready"; path: string },
	httpSrc: string,
) {
	return stream.status === "ready" ? stream.path : httpSrc;
}

const downloadRoot = resolve(config.torrentMediaDir, "deildu");
mkdirSync(downloadRoot, { recursive: true, mode: 0o700 });

let activeProcess: ReturnType<typeof Bun.spawn> | null = null;
let activeStream: ActiveStream | null = null;
let monitorGeneration = 0;

const sleep = (ms: number) =>
	new Promise((resolvePromise) => setTimeout(resolvePromise, ms));

function safePath(root: string, path: string) {
	const resolved = resolve(root, path);
	if (resolved !== root && !resolved.startsWith(`${root}${sep}`))
		throw new Error("Torrent-slóð fer út fyrir niðurhalsmöppu");
	return resolved;
}

class BencodeDecoder {
	private position = 0;

	constructor(private readonly bytes: Uint8Array) {}

	decode(depth = 0): BValue {
		if (depth > 64 || this.position >= this.bytes.length)
			throw new Error("Ógild torrent-lýsigögn");
		const token = this.bytes[this.position];
		if (token === 0x64) return this.dictionary(depth + 1);
		if (token === 0x6c) return this.list(depth + 1);
		if (token === 0x69) return this.integer();
		if (token >= 0x30 && token <= 0x39) return this.byteString();
		throw new Error("Óþekkt bencode-gildi");
	}

	private integer() {
		const end = this.bytes.indexOf(0x65, ++this.position);
		if (end < 0) throw new Error("Ólokið bencode-heiltala");
		const value = Number(
			new TextDecoder().decode(this.bytes.subarray(this.position, end)),
		);
		if (!Number.isSafeInteger(value)) throw new Error("Ógild bencode-heiltala");
		this.position = end + 1;
		return value;
	}

	private byteString() {
		const colon = this.bytes.indexOf(0x3a, this.position);
		if (colon < 0) throw new Error("Ógild bencode-strengslengd");
		const length = Number(
			new TextDecoder().decode(this.bytes.subarray(this.position, colon)),
		);
		const start = colon + 1;
		const end = start + length;
		if (!Number.isSafeInteger(length) || length < 0 || end > this.bytes.length)
			throw new Error("Ógild bencode-strengslengd");
		this.position = end;
		return this.bytes.subarray(start, end);
	}

	private list(depth: number) {
		this.position++;
		const values: BValue[] = [];
		while (this.bytes[this.position] !== 0x65) values.push(this.decode(depth));
		this.position++;
		return values;
	}

	private dictionary(depth: number) {
		this.position++;
		const values: BDictionary = {};
		while (this.bytes[this.position] !== 0x65) {
			const key = new TextDecoder().decode(this.byteString());
			values[key] = this.decode(depth);
		}
		this.position++;
		return values;
	}
}

const bytes = (value: BValue | undefined) =>
	value instanceof Uint8Array ? value : null;
const dictionary = (value: BValue | undefined) =>
	value &&
	!Array.isArray(value) &&
	!(value instanceof Uint8Array) &&
	typeof value === "object"
		? (value as BDictionary)
		: null;
const list = (value: BValue | undefined) =>
	Array.isArray(value) ? value : null;
const integer = (value: BValue | undefined) =>
	typeof value === "number" ? value : null;
const decodeText = (value: BValue | undefined) => {
	const payload = bytes(value);
	return payload
		? new TextDecoder("utf-8", { fatal: false }).decode(payload)
		: "";
};

function safeComponent(value: string) {
	if (
		!value ||
		value === "." ||
		value === ".." ||
		value.includes("/") ||
		value.includes("\\") ||
		value.includes("\0")
	)
		throw new Error("Torrent inniheldur óöruggt skráarheiti");
	return value;
}

export function parseTorrentMetadata(payload: Uint8Array): TorrentMetadata {
	if (!payload.length || payload.length > 5 * 1024 * 1024)
		throw new Error("Torrent-lýsigögn eru tóm eða of stór");
	const root = dictionary(new BencodeDecoder(payload).decode());
	const info = dictionary(root?.info);
	if (!info) throw new Error("Torrent vantar info-hluta");
	const name = safeComponent(
		decodeText(info["name.utf-8"] ?? info.name).trim(),
	);
	const pieceLength = integer(info["piece length"]);
	if (!pieceLength || pieceLength < 16_384)
		throw new Error("Torrent hefur ógilda stykkjastærð");

	const fileRows = list(info.files);
	const files: TorrentFile[] = [];
	let offset = 0;
	if (fileRows) {
		for (const [position, value] of fileRows.entries()) {
			const row = dictionary(value);
			const length = integer(row?.length);
			const parts = list(row?.["path.utf-8"] ?? row?.path)?.map((part) =>
				safeComponent(decodeText(part)),
			);
			if (length === null || length < 0 || !parts?.length)
				throw new Error("Torrent inniheldur ógilda skrá");
			files.push({
				index: position + 1,
				path: parts.join("/"),
				length,
				offset,
			});
			offset += length;
		}
	} else {
		const length = integer(info.length);
		if (length === null || length < 1)
			throw new Error("Torrent inniheldur enga skrá");
		files.push({ index: 1, path: name, length, offset: 0 });
		offset = length;
	}
	return {
		name,
		files,
		pieceLength,
		totalLength: offset,
		multiFile: Boolean(fileRows),
	};
}

const videoExtensions = new Set([
	".mp4",
	".m4v",
	".webm",
	".mkv",
	".mov",
	".avi",
]);
const audioExtensions = new Set([
	".mp3",
	".m4a",
	".aac",
	".ogg",
	".opus",
	".flac",
	".wav",
]);

function selectMediaFile(
	metadata: TorrentMetadata,
	mediaKind: string,
	target?: { season: number; episode: number | null } | null,
) {
	const preferred = mediaKind === "audio" ? audioExtensions : videoExtensions;
	const fallback = mediaKind === "audio" ? videoExtensions : audioExtensions;
	const candidates = metadata.files.filter((file) =>
		preferred.has(extname(file.path).toLowerCase()),
	);
	const usable = candidates.length
		? candidates
		: metadata.files.filter((file) =>
				fallback.has(extname(file.path).toLowerCase()),
			);
	const episodePattern = target?.episode === null
		? null
		: new RegExp(`(?:s0?${target?.season}[^a-z0-9]*e0?${target?.episode}|${target?.season}x0?${target?.episode})\\b`, "i");
	const matching = episodePattern ? usable.filter((file) => episodePattern.test(file.path)) : [];
	const selected = (matching.length ? matching : usable).sort((left, right) =>
		target?.episode === null
			? left.path.localeCompare(right.path, undefined, { numeric: true })
			: right.length - left.length,
	)[0];
	if (!selected)
		throw new Error("Torrent inniheldur ekkert myndefni eða hljóðefni");
	return selected;
}

function contentType(path: string) {
	switch (extname(path).toLowerCase()) {
		case ".mp4":
		case ".m4v":
			return "video/mp4";
		case ".webm":
			return "video/webm";
		case ".mkv":
			return "video/x-matroska";
		case ".mov":
			return "video/quicktime";
		case ".mp3":
			return "audio/mpeg";
		case ".m4a":
			return "audio/mp4";
		case ".ogg":
		case ".opus":
			return "audio/ogg";
		case ".flac":
			return "audio/flac";
		default:
			return "application/octet-stream";
	}
}

async function boundedBody(response: Response, maximum: number) {
	const declared = Number(response.headers.get("content-length") ?? 0);
	if (declared > maximum) throw new Error("Torrent-lýsigögn eru of stór");
	const reader = response.body?.getReader();
	if (!reader) throw new Error("Torrent-svar var tómt");
	const chunks: Uint8Array[] = [];
	let length = 0;
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		length += value.length;
		if (length > maximum) {
			await reader.cancel();
			throw new Error("Torrent-lýsigögn eru of stór");
		}
		chunks.push(value);
	}
	const result = new Uint8Array(length);
	let offset = 0;
	for (const chunk of chunks) {
		result.set(chunk, offset);
		offset += chunk.length;
	}
	return result;
}

async function fetchTorrent(itemId: number) {
	if (!config.deilduPasskey)
		throw new Error("Deildu-passkey vantar í verndað umhverfi");
	const response = await fetch(
		`${config.deilduBaseUrl}/download.php/${itemId}/x.torrent?passkey=${encodeURIComponent(config.deilduPasskey)}`,
		{
			headers: { "User-Agent": config.deilduUserAgent },
			signal: AbortSignal.timeout(config.deilduFetchTimeoutMs),
		},
	);
	if (!response.ok)
		throw new Error(`Torrent-sókn svaraði HTTP ${response.status}`);
	return boundedBody(response, 5 * 1024 * 1024);
}

async function rpc<T>(method: string, params: unknown[] = []): Promise<T> {
	const response = await fetch(
		`http://127.0.0.1:${config.deilduStreamRpcPort}/jsonrpc`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ jsonrpc: "2.0", id: "tv-kit", method, params }),
			signal: AbortSignal.timeout(3_000),
		},
	);
	const body = (await response.json()) as {
		result?: T;
		error?: { message?: string };
	};
	if (body.error || body.result === undefined)
		throw new Error(body.error?.message ?? "aria2 RPC svaraði ekki");
	return body.result;
}

async function waitForRpc(deadline: number) {
	while (Date.now() < deadline) {
		try {
			await rpc("aria2.getVersion");
			return;
		} catch {
			await sleep(200);
		}
	}
	throw new Error("aria2 ræsti ekki innan tímamarka");
}

async function findTask(deadline: number): Promise<AriaStatus | null> {
	const fields = [
		"gid",
		"status",
		"completedLength",
		"totalLength",
		"downloadSpeed",
		"connections",
		"numSeeders",
		"bitfield",
		"errorMessage",
		"files",
	];
	while (Date.now() < deadline) {
		const active = await rpc<AriaStatus[]>("aria2.tellActive", [fields]);
		if (active[0]) return active[0];
		const waiting = await rpc<AriaStatus[]>("aria2.tellWaiting", [
			0,
			10,
			fields,
		]);
		if (waiting[0]) return waiting[0];
		if (
			activeProcess &&
			(await Promise.race([
				activeProcess.exited,
				sleep(25).then(() => null),
			])) !== null
		)
			return null;
		await sleep(200);
	}
	throw new Error("aria2 fann ekki torrent-verk");
}

function downloadRow(itemId: number) {
	return statement("SELECT * FROM deildu_downloads WHERE item_id=?").get(
		itemId,
	) as DownloadRow | null;
}

function setDownload(
	itemId: number,
	values: {
		fileIndex: number;
		filePath: string;
		fileSize: number;
		status: DownloadRow["status"];
		downloadedBytes: number;
		error?: string;
	},
) {
	statement(`
		INSERT INTO deildu_downloads (
			item_id,file_index,file_path,file_size,status,
			downloaded_bytes,error,updated_at
		) VALUES (?,?,?,?,?,?,?,?)
		ON CONFLICT(item_id) DO UPDATE SET
			file_index=excluded.file_index,
			file_path=excluded.file_path,
			file_size=excluded.file_size,
			status=excluded.status,
			downloaded_bytes=excluded.downloaded_bytes,
			error=excluded.error,
			updated_at=excluded.updated_at
	`).run(
		itemId,
		values.fileIndex,
		values.filePath,
		values.fileSize,
		values.status,
		values.downloadedBytes,
		values.error ?? "",
		Date.now(),
	);
}

function relativeDownloadPath(root: string, path: string) {
	const value = relative(root, path);
	if (!value || value === ".." || value.startsWith(`..${sep}`))
		throw new Error("aria2 skilaði óöruggri skráarslóð");
	return value;
}

function localDownloadPath(root: string, path: string) {
	return safePath(root, path);
}

function deilduContext(itemId: number, mediaKind: string): StreamContext {
	return {
		key: `deildu-${itemId}`,
		root: downloadRoot,
		itemDir: safePath(downloadRoot, String(itemId)),
		mediaKind,
		fetchTorrent: () => fetchTorrent(itemId),
		load() {
			const row = downloadRow(itemId);
			return row
				? {
						fileIndex: row.file_index,
						filePath: row.file_path,
						fileSize: row.file_size,
						status: row.status,
						downloadedBytes: row.downloaded_bytes,
						error: row.error,
					}
				: null;
		},
		save(state) {
			setDownload(itemId, {
				fileIndex: state.fileIndex,
				filePath: state.filePath,
				fileSize: state.fileSize,
				status: state.status,
				downloadedBytes: state.downloadedBytes,
				error: state.error,
			});
		},
	};
}

function isComplete(path: string, length: number, itemDir: string) {
	const topLevel = relative(itemDir, path).split(sep)[0];
	const controlPath = safePath(itemDir, `${topLevel}.aria2`);
	try {
		return statSync(path).size >= length && !existsSync(controlPath);
	} catch {
		return false;
	}
}

async function stopActive(markPaused = true) {
	monitorGeneration++;
	lastTransfer = null;
	const previous = activeStream;
	const child = activeProcess;
	activeProcess = null;
	activeStream = null;
	if (child) {
		child.kill("SIGTERM");
		await Promise.race([child.exited, sleep(3_000)]);
	}
	if (markPaused && previous?.status === "downloading") {
		const row = previous.ctx.load();
		if (row && row.status !== "ready")
			previous.ctx.save({ ...row, status: "paused" });
	}
}

// Enforce a single active torrent: only one aria2 stream runs at a time (the
// activeProcess singleton), but rows can be left flagged downloading/starting
// when a server restart kills the child without running stopActive. Pause every
// such row so the catalog never shows more than the one live stream.
function pauseStaleDeilduDownloads() {
	statement(
		"UPDATE deildu_downloads SET status='paused',updated_at=? WHERE status IN ('downloading','starting')",
	).run(Date.now());
}

// Called on server startup. A tvserverd restart/hot-reload can orphan the aria2
// child (it keeps running and holds the RPC port, blocking the next stream), so
// kill any stray aria2 on our RPC port and reconcile rows still marked as live.
export function reconcileStreams() {
	try {
		Bun.spawn({
			cmd: [
				"pkill",
				"-f",
				`aria2c.*rpc-listen-port=${config.deilduStreamRpcPort}`,
			],
			stdout: "ignore",
			stderr: "ignore",
		});
	} catch {
		/* pkill unavailable; DB reconcile below still runs */
	}
	pauseStaleDeilduDownloads();
}

function bitfieldHas(bitfield: string, index: number) {
	const byte = Number.parseInt(
		bitfield.slice(Math.floor(index / 8) * 2, Math.floor(index / 8) * 2 + 2),
		16,
	);
	return Number.isFinite(byte) && Boolean(byte & (0x80 >> (index % 8)));
}

function rangeReady(
	stream: ActiveStream,
	bitfield: string,
	start: number,
	end: number,
) {
	const first = Math.floor((stream.fileOffset + start) / stream.pieceLength);
	const last = Math.floor((stream.fileOffset + end) / stream.pieceLength);
	for (let piece = first; piece <= last; piece++) {
		if (!bitfieldHas(bitfield, piece)) return false;
	}
	return true;
}

async function status(gid: string) {
	return rpc<AriaStatus>("aria2.tellStatus", [
		gid,
		[
			"gid",
			"status",
			"completedLength",
			"totalLength",
			"downloadSpeed",
			"bitfield",
			"errorMessage",
			"files",
		],
	]);
}

function updateProgress(stream: ActiveStream, current: AriaStatus) {
	const completed = Math.min(
		stream.fileLength,
		Number(current.completedLength) || 0,
	);
	lastTransfer = {
		peers: Number(current.connections) || 0,
		seeders: Number(current.numSeeders) || 0,
		speedBps: Number(current.downloadSpeed) || 0,
		downloadedBytes: completed,
		totalBytes: stream.fileLength,
	};
	const nextStatus = current.status === "complete" ? "ready" : "downloading";
	stream.status = nextStatus;
	stream.ctx.save({
		fileIndex: stream.ctx.load()?.fileIndex ?? 0,
		filePath: relativeDownloadPath(stream.ctx.root, stream.path),
		fileSize: stream.fileLength,
		status: nextStatus,
		downloadedBytes:
			current.status === "complete" ? stream.fileLength : completed,
	});
}

function monitor(
	stream: ActiveStream,
	generation: number,
	onProgress?: () => void,
) {
	void (async () => {
		while (generation === monitorGeneration && stream.status !== "ready") {
			try {
				const current = await status(stream.gid);
				if (current.status === "error" || current.status === "removed") {
					stream.ctx.save({
						fileIndex: stream.ctx.load()?.fileIndex ?? 0,
						filePath: relativeDownloadPath(stream.ctx.root, stream.path),
						fileSize: stream.fileLength,
						status: "error",
						downloadedBytes: Number(current.completedLength) || 0,
						error: current.errorMessage || "Torrent-niðurhal mistókst",
					});
					break;
				}
				updateProgress(stream, current);
				onProgress?.();
				if (current.status === "complete") break;
			} catch {
				if (isComplete(stream.path, stream.fileLength, stream.ctx.itemDir)) {
					stream.status = "ready";
					stream.ctx.save({
						fileIndex: stream.ctx.load()?.fileIndex ?? 0,
						filePath: relativeDownloadPath(stream.ctx.root, stream.path),
						fileSize: stream.fileLength,
						status: "ready",
						downloadedBytes: stream.fileLength,
					});
				}
				break;
			}
			await sleep(2_000);
		}
	})();
}

function playbackKind(mediaKind: string, path: string): MediaKind {
	if (audioExtensions.has(extname(path).toLowerCase())) return "music";
	return mediaKind === "tv" ? "tv" : "movie";
}


function cachedReadyStream(ctx: StreamContext): ActiveStream | null {
	const cached = ctx.load();
	if (cached?.status === "ready" && cached.filePath) {
		const path = localDownloadPath(ctx.root, cached.filePath);
		if (isComplete(path, cached.fileSize, ctx.itemDir))
			return {
				ctx,
				gid: "",
				path,
				fileName: basename(path),
				fileLength: cached.fileSize,
				fileOffset: 0,
				pieceLength: 0,
				status: "ready",
			};
	}
	return null;
}

// Shared aria2 torrent-streaming engine. Fetches the torrent for `ctx`, picks the
// media file, spawns aria2 in-order, buffers head+tail, and leaves activeStream
// ready to serve progressive range requests. Reused by deildu and torrent_media.
export async function beginStream(
	ctx: StreamContext,
	onProgress?: () => void,
	onMetadata?: (metadata: TorrentMetadata) => void,
	selectFile?: (metadata: TorrentMetadata) => TorrentFile,
): Promise<ActiveStream> {
	// Kill the current stream (download + streaming) before starting another, and
	// pause any stale rows so exactly one torrent is ever active.
	await stopActive();
	pauseStaleDeilduDownloads();
	const ready = cachedReadyStream(ctx);
	if (ready) {
		activeStream = ready;
		return ready;
	}

	const payload = await ctx.fetchTorrent();
	const metadata = parseTorrentMetadata(payload);
	const selected = selectFile?.(metadata) ?? selectMediaFile(metadata, ctx.mediaKind);
	mkdirSync(ctx.itemDir, { recursive: true, mode: 0o700 });
	const torrentPath = safePath(ctx.itemDir, "source.torrent");
	await Bun.write(torrentPath, payload);
	chmodSync(torrentPath, 0o600);
	const expectedPath = safePath(
		ctx.itemDir,
		metadata.multiFile ? `${metadata.name}/${selected.path}` : selected.path,
	);
	onMetadata?.(metadata);
	ctx.save({
		fileIndex: selected.index,
		filePath: relativeDownloadPath(ctx.root, expectedPath),
		fileSize: selected.length,
		status: "starting",
		downloadedBytes: ctx.load()?.downloadedBytes ?? 0,
	});
	onProgress?.();

	activeProcess = Bun.spawn({
		cmd: [
			config.deilduAria2Bin,
			"--enable-rpc=true",
			"--rpc-listen-all=true",
			`--rpc-listen-port=${config.deilduStreamRpcPort}`,
			"--allow-overwrite=true",
			"--auto-file-renaming=false",
			"--continue=true",
			"--stream-piece-selector=inorder",
			`--bt-prioritize-piece=head=${config.deilduStreamBufferBytes},tail=${config.deilduStreamBufferBytes}`,
			`--select-file=${selected.index}`,
			"--seed-time=0",
			// Peer discovery: with few tracker seeders, DHT + peer-exchange +
			// local peer discovery find far more peers than the torrent's own
			// trackers, and a wide peer cap keeps the pipe full. This is the
			// software fix for a laggy, thinly-seeded stream (no router port
			// forward required for these outbound-discovered peers).
			"--enable-dht=true",
			"--enable-peer-exchange=true",
			"--bt-enable-lpd=true",
			"--dht-listen-port=6881-6999",
			"--listen-port=6881-6999",
			"--bt-max-peers=200",
			// Streaming must not synchronously preallocate a multi-gigabyte file:
			// ext4 journal commits can stall tvserverd and reset the player source.
			"--file-allocation=none",
			"--summary-interval=0",
			"--console-log-level=warn",
			`--dir=${ctx.itemDir}`,
			torrentPath,
		],
		stdout: "ignore",
		stderr: "ignore",
	});
	const deadline = Date.now() + config.deilduStreamStartTimeoutMs;
	await waitForRpc(deadline);
	const task = await findTask(deadline);
	if (!task) {
		if (!isComplete(expectedPath, selected.length, ctx.itemDir))
			throw new Error("aria2 lauk án þess að búa til spilunarskrá");
		activeStream = {
			ctx,
			gid: "",
			path: expectedPath,
			fileName: basename(expectedPath),
			fileLength: selected.length,
			fileOffset: selected.offset,
			pieceLength: metadata.pieceLength,
			status: "ready",
		};
	} else {
		const ariaFile = task.files.find(
			(file) => Number(file.index) === selected.index,
		);
		const path = ariaFile?.path
			? safePath(ctx.root, ariaFile.path)
			: expectedPath;
		activeStream = {
			ctx,
			gid: task.gid,
			path,
			fileName: basename(path),
			fileLength: selected.length,
			fileOffset: selected.offset,
			pieceLength: metadata.pieceLength,
			status: task.status === "complete" ? "ready" : "downloading",
		};
		ctx.save({
			fileIndex: selected.index,
			filePath: relativeDownloadPath(ctx.root, path),
			fileSize: selected.length,
			status: activeStream.status,
			downloadedBytes: Math.min(
				selected.length,
				Number(task.completedLength) || 0,
			),
		});
	}

	const stream = activeStream;
	const generation = ++monitorGeneration;
	if (stream.status === "downloading") monitor(stream, generation, onProgress);
	onProgress?.();
	return stream;
}

// Count how many consecutive pieces from position 0 are fully downloaded.
// aria2's bitfield is a hex string; each byte's MSB is the lowest piece index
// within that byte, so we read bits left-to-right through the hex.
function countContiguousPieces(bitfield: string): number {
	let count = 0;
	for (let i = 0; i < bitfield.length; i++) {
		const nibble = parseInt(bitfield[i], 16);
		// Each hex char is 4 bits; iterate MSB..LSB within the nibble.
		for (let shift = 3; shift >= 0; shift--) {
			if (nibble & (1 << shift)) {
				count++;
			} else {
				return count;
			}
		}
	}
	return count;
}

// Wait until at least `minPieces` contiguous pieces from the start of the
// torrent are downloaded, polling aria2 every second. This prevents mpv from
// starting playback only to immediately stall because the next piece hasn't
// arrived yet — the Stremio-style pre-buffer approach.
export async function waitForContiguousPieces(
	stream: ActiveStream,
	minPieces: number,
	onProgress?: () => void,
): Promise<void> {
	if (stream.status === "ready") return;
	if (!stream.gid) return;
	const deadline = Date.now() + config.deilduStreamStartTimeoutMs;
	while (Date.now() < deadline) {
		try {
			const status = await rpc<any>("aria2.tellStatus", [stream.gid]);
			const contig = countContiguousPieces(status.bitfield ?? "");
			if (contig >= minPieces) return;
		} catch {
			// RPC may fail briefly during startup — retry
		}
		onProgress?.();
		await sleep(1000);
	}
	// Timed out — start anyway rather than blocking forever.
}
export async function startDeilduPlayback(
	itemId: number,
	onProgress?: () => void,
): Promise<DeilduPlayback> {
	const item = getDeilduItem(itemId);
	if (!item) throw new Error("Deildu-færsla fannst ekki");
	if (!item.playable)
		throw new Error("Þessi Deildu-flokkur er ekki spilunarflokkur");
	const ctx = deilduContext(itemId, item.mediaKind);
	const target = deilduEpisodeTarget(itemId);
	const stream = await beginStream(ctx, onProgress, (metadata) => {
		statement(
			"UPDATE deildu_items SET title=?,size_bytes=?,updated_at=? WHERE id=?",
		).run(
			metadata.name.slice(0, 512),
			metadata.totalLength,
			Date.now(),
			itemId,
		);
	}, (metadata) => selectMediaFile(metadata, item.mediaKind, target));
	// Stremio-style pre-buffer: don't start mpv until enough contiguous pieces
	// are verified, so playback doesn't stall after 10-15 seconds on a
	// thinly-seeded torrent. 80 pieces at 1 MB each = ~60-80 seconds of
	// buffer at typical 1080p bitrates, giving aria2 time to fetch more.
	await waitForContiguousPieces(stream, 80, onProgress);
	const src = `${config.serverUrl}/deildu/stream/${itemId}`;
	return {
		id: itemId,
		title: getDeilduItem(itemId)?.title ?? item.title,
		fileName: stream.fileName,
		kind: playbackKind(item.mediaKind, stream.path),
		src,
		mpvSrc: mpvStreamSource(stream, src),
	};
}

async function waitForRange(
	stream: ActiveStream,
	start: number,
	end: number,
	signal: AbortSignal,
) {
	if (stream.status === "ready") return;
	const deadline = Date.now() + config.deilduStreamRangeWaitMs;
	while (Date.now() < deadline) {
		if (signal.aborted) throw new DOMException("Request aborted", "AbortError");
		const current = await status(stream.gid);
		if (current.status === "error" || current.status === "removed")
			throw new Error(current.errorMessage || "Torrent-niðurhal mistókst");
		if (
			current.status === "complete" ||
			(current.bitfield && rangeReady(stream, current.bitfield, start, end))
		)
			return;
		await sleep(250);
	}
	throw new Error("Beðið var of lengi eftir torrent-stykki");
}

export function progressiveRangeEnd(
	start: number,
	requestedEnd: number,
	fileSize: number,
	fileOffset: number,
	pieceLength: number,
	fallbackBytes: number,
) {
	const pieceEnd = pieceLength
		? (Math.floor((fileOffset + start) / pieceLength) + 1) * pieceLength -
			1 -
			fileOffset
		: start + fallbackBytes - 1;
	return Math.min(requestedEnd, fileSize - 1, pieceEnd);
}

export async function serveStream(request: Request, ctx: StreamContext) {
	const row = ctx.load();
	if (!row?.filePath || !row.fileSize)
		return new Response("not found", { status: 404 });
	const path = localDownloadPath(ctx.root, row.filePath);
	if (!existsSync(path)) return new Response("not found", { status: 404 });
	const stream = activeStream?.ctx.key === ctx.key ? activeStream : null;
	const ready =
		row.status === "ready" && isComplete(path, row.fileSize, ctx.itemDir);
	if (!ready && !stream) return new Response("not active", { status: 409 });

	const headers = corsHeaders(request, config.allowedOrigins, 0);
	headers.set("Accept-Ranges", "bytes");
	headers.set("Content-Type", contentType(path));
	const range = request.headers.get("Range");
	if (!range) {
		if (!ready) {
			headers.set("Retry-After", "1");
			return new Response("range required while buffering", {
				status: 503,
				headers,
			});
		}
		headers.set("Content-Length", String(row.fileSize));
		return new Response(request.method === "HEAD" ? null : Bun.file(path), {
			headers,
		});
	}

	const match = range.match(/^bytes=(\d*)-(\d*)$/);
	if (!match || (!match[1] && !match[2])) {
		headers.set("Content-Range", `bytes */${row.fileSize}`);
		return new Response(null, { status: 416, headers });
	}
	const start = match[1]
		? Number(match[1])
		: Math.max(0, row.fileSize - Number(match[2]));
	const requestedEnd =
		match[1] && match[2] ? Number(match[2]) : row.fileSize - 1;
	// Players such as mpv commonly request `bytes=0-` up front. While aria2 is
	// still filling the file, waiting for that entire range means a timeout and
	// makes the player retry from byte zero. A 206 response may legally satisfy
	// a bounded sub-range, so feed the player one buffer-sized chunk at a time.
	const end = ready
		? Math.min(requestedEnd, row.fileSize - 1)
		: progressiveRangeEnd(
				start,
				requestedEnd,
				row.fileSize,
				stream?.fileOffset ?? 0,
				stream?.pieceLength ?? 0,
				config.deilduStreamBufferBytes,
			);
	if (
		!Number.isSafeInteger(start) ||
		!Number.isSafeInteger(end) ||
		start < 0 ||
		start > end ||
		start >= row.fileSize
	) {
		headers.set("Content-Range", `bytes */${row.fileSize}`);
		return new Response(null, { status: 416, headers });
	}
	if (!ready && stream) {
		try {
			await waitForRange(stream, start, end, request.signal);
		} catch (error) {
			if (error instanceof DOMException && error.name === "AbortError")
				return new Response(null, { status: 499 });
			console.warn(
				`torrent range unavailable key=${ctx.key} bytes=${start}-${end}: ${error instanceof Error ? error.message : String(error)}`,
			);
			headers.set("Retry-After", "1");
			return new Response("buffering", { status: 503, headers });
		}
	}
	headers.set("Content-Range", `bytes ${start}-${end}/${row.fileSize}`);
	headers.set("Content-Length", String(end - start + 1));
	return new Response(
		request.method === "HEAD" ? null : Bun.file(path).slice(start, end + 1),
		{ status: 206, headers },
	);
}

export function serveDeilduStream(request: Request, itemId: number) {
	const item = getDeilduItem(itemId);
	return serveStream(
		request,
		deilduContext(itemId, item?.mediaKind ?? "movie"),
	);
}

export { playbackKind };

export function stopDeilduStream() {
	return stopActive();
}
