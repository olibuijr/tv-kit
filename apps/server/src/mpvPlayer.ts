import { existsSync, rmSync } from "node:fs";
import type { Socket } from "bun";
import type { MediaItem } from "../../../packages/protocol";
import { config } from "./config";

// Native mpv video backend for the GlobalPlayer. tvserverd starts mpv on demand
// with VA-API hardware decode and drives it over the JSON IPC socket.
// mpv owns the screen fullscreen-on-top while a video is loaded (idle=yes +
// force-window=no means no window otherwise); the native TV Frame beneath it
// renders the UI. mpv only engages when available, so without it playback
// falls back to the browser <video> unchanged.

type MpvUpdate = {
	timePos?: number;
	duration?: number;
	pause?: boolean;
	eof?: boolean;
	loaded?: boolean;
	restarted?: boolean;
	pausedForCache?: boolean;
	bufferingPercent?: number;
};

let child: ReturnType<typeof Bun.spawn> | null = null;
let socket: Socket | null = null;
let connected = false;
let starting: Promise<void> | null = null;
let requestId = 0;
let buffer = "";

let loadedId: string | null = null;
let pendingSeek = 0;
let lastPause: boolean | null = null;
let lastVolume: number | null = null;

let onUpdate: ((update: MpvUpdate) => void) | null = null;

export function setMpvUpdateHandler(handler: (update: MpvUpdate) => void) {
	onUpdate = handler;
}

export function mpvAvailable() {
	return connected;
}

function send(command: unknown[]) {
	if (!socket || !connected) return;
	try {
		socket.write(`${JSON.stringify({ command, request_id: ++requestId })}\n`);
		socket.flush();
	} catch {
		/* dropped write; reconnect logic handles recovery */
	}
}

function handleLine(line: string) {
	if (!line.trim()) return;
	let message: {
		event?: string;
		name?: string;
		data?: unknown;
	};
	try {
		message = JSON.parse(line);
	} catch {
		return;
	}
	if (message.event === "file-loaded") {
		if (pendingSeek > 0) send(["seek", pendingSeek, "absolute"]);
		pendingSeek = 0;
		onUpdate?.({ loaded: true });
		return;
	}
	if (message.event === "playback-restart") {
		onUpdate?.({ restarted: true });
		return;
	}
	if (message.event !== "property-change" || !onUpdate) return;
	if (message.name === "time-pos" && typeof message.data === "number")
		onUpdate({ timePos: message.data });
	else if (message.name === "duration" && typeof message.data === "number")
		onUpdate({ duration: message.data });
	else if (message.name === "pause" && typeof message.data === "boolean")
		onUpdate({ pause: message.data });
	else if (message.name === "eof-reached" && message.data === true)
		onUpdate({ eof: true });
	else if (message.name === "paused-for-cache" && typeof message.data === "boolean")
		onUpdate({ pausedForCache: message.data });
	else if (message.name === "cache-buffering-state" && typeof message.data === "number")
		onUpdate({ bufferingPercent: message.data });
}

async function connect() {
	if (connected || !existsSync(config.mpvIpcSocket)) return;
	try {
		socket = await Bun.connect({
			unix: config.mpvIpcSocket,
			socket: {
				data(_socket, chunk) {
					buffer += chunk.toString();
					let index = buffer.indexOf("\n");
					while (index >= 0) {
						handleLine(buffer.slice(0, index));
						buffer = buffer.slice(index + 1);
						index = buffer.indexOf("\n");
					}
				},
				close() {
					connected = false;
					socket = null;
				},
				error() {
					connected = false;
				},
			},
		});
		connected = true;
		loadedId = null;
		pendingSeek = 0;
		lastPause = null;
		lastVolume = null;
		for (const property of [
			"time-pos",
			"duration",
			"pause",
			"eof-reached",
			"paused-for-cache",
			"cache-buffering-state",
		])
			send(["observe_property", 1, property]);
	} catch {
		connected = false;
		socket = null;
	}
}

export async function startMpv() {
	if (connected) return;
	if (starting) return starting;
	starting = startMpvOnce();
	try {
		await starting;
	} finally {
		starting = null;
	}
}

async function startMpvOnce() {
	try {
		if (existsSync(config.mpvIpcSocket)) {
			// Try an already-running mpv first; else spawn our own.
			await connect();
			if (connected) return;
			try {
				rmSync(config.mpvIpcSocket);
			} catch {
				/* stale socket */
			}
		}
		child = Bun.spawn({
			cmd: [
				config.mpvBin,
				"--no-config",
				"--idle=yes",
				"--force-window=no",
				"--fullscreen=yes",
				"--focus-on=never",
				"--border=no",
				"--geometry=100%x100%+0+0",
				"--no-osc",
				"--no-input-default-bindings",
				"--no-input-cursor",
				"--cursor-autohide=always",
				`--hwdec=${config.mpvHwdec}`,
				"--vo=gpu",
				`--video-sync=${config.mpvVideoSync}`,
				"--cache=yes",
				"--cache-pause=yes",
				"--cache-pause-initial=yes",
				`--cache-pause-wait=${config.mpvCachePauseWait}`,
				`--cache-secs=${config.mpvCacheSecs}`,
				`--demuxer-max-bytes=${config.mpvDemuxerMaxBytes}`,
				`--stream-buffer-size=${config.mpvStreamBufferBytes}`,
				"--keep-open=no",
				"--no-terminal",
				`--input-ipc-server=${config.mpvIpcSocket}`,
			],
			stdout: "ignore",
			stderr: "ignore",
			onExit() {
				connected = false;
				socket = null;
				child = null;
			},
		});
		// mpv needs a moment to create the IPC socket.
		for (let attempt = 0; attempt < 40 && !connected; attempt++) {
			await Bun.sleep(100);
			await connect();
		}
		console.log(`mpv startup ${connected ? "connected" : "unavailable"}`);
	} catch {
		// mpv not installed / failed to launch: stay unavailable, browser fallback.
		connected = false;
		child = null;
	}
}

// Reconcile mpv to the current media state. Idempotent: only loads when the media
// id changes, and only pushes pause/volume when they actually change, so it is
// safe to call on every broadcast.
export function syncMpv(
	media: MediaItem,
	playing: boolean,
	volume: number,
	muted: boolean,
) {
	if (!connected) return;
	if (media.engine === "mpv" && media.src) {
		if (loadedId !== media.id) {
			pendingSeek = media.currentTime;
			send(["loadfile", media.src]);
			loadedId = media.id;
			lastPause = null;
			lastVolume = null;
		}
		const pause = !playing;
		if (pause !== lastPause) {
			send(["set_property", "pause", pause]);
			lastPause = pause;
		}
		const target = muted ? 0 : Math.max(0, Math.min(100, volume));
		if (target !== lastVolume) {
			send(["set_property", "volume", target]);
			lastVolume = target;
		}
	} else if (loadedId !== null) stopMpv();
}

export function mpvSeek(seconds: number) {
	if (connected && loadedId) send(["seek", seconds, "absolute"]);
}

export function stopMpv() {
	if (connected) send(["quit"]);
	loadedId = null;
	pendingSeek = 0;
	lastPause = null;
	lastVolume = null;
}
