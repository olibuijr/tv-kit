import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { Type } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

const tvctl = process.env.TVCTL_PATH || join(homedir(), ".local/bin/tvctl");
const outputLimit = 64 * 1024;

function run(args: string[], signal?: AbortSignal, timeoutMs = 60_000) {
	return new Promise<{ content: { type: "text"; text: string }[]; details: unknown }>((resolve, reject) => {
		const child = spawn(tvctl, args, { detached: true, stdio: ["ignore", "pipe", "pipe"] });
		let stdout = "";
		let stderr = "";
		let timedOut = false;
		let forceTimer: ReturnType<typeof setTimeout> | undefined;
		const append = (current: string, chunk: Buffer) =>
			(current + chunk.toString()).slice(0, outputLimit);
		child.stdout.on("data", (chunk: Buffer) => (stdout = append(stdout, chunk)));
		child.stderr.on("data", (chunk: Buffer) => (stderr = append(stderr, chunk)));
		const killGroup = (signal: NodeJS.Signals) => {
			try {
				if (child.pid) process.kill(-child.pid, signal);
			} catch {}
		};
		const stop = () => {
			killGroup("SIGTERM");
			forceTimer = setTimeout(() => killGroup("SIGKILL"), 1_000);
			forceTimer.unref();
		};
		signal?.addEventListener("abort", stop, { once: true });
		const timer = setTimeout(() => {
			timedOut = true;
			stop();
		}, timeoutMs);
		child.on("error", reject);
		child.on("close", (code) => {
			clearTimeout(timer);
			if (forceTimer) clearTimeout(forceTimer);
			signal?.removeEventListener("abort", stop);
			if (signal?.aborted) return reject(new Error("TV operation cancelled"));
			if (timedOut) return reject(new Error(`tvctl timed out after ${timeoutMs / 1000}s`));
			const text = stdout.trim();
			if (code !== 0) return reject(new Error((stderr || text || `tvctl exited ${code}`).trim()));
			let data: unknown = text;
			try {
				data = JSON.parse(text);
			} catch {}
			resolve({
				content: [{ type: "text", text: typeof data === "string" ? data || "ok" : JSON.stringify(data, null, 2) }],
				details: { args, data },
			});
		});
	});
}

const tvSnapshot = defineTool({
	name: "tv_snapshot",
	label: "TV snapshot",
	description: "Read TV host load, service health, playback state, and player process counts in one SSH connection. Does not change the TV.",
	promptSnippet: "Read the TV's combined health and playback snapshot.",
	executionMode: "parallel",
	parameters: Type.Object({}),
	execute: (_id, _params, signal) => run(["snapshot"], signal),
});

const tvDeildu = defineTool({
	name: "tv_deildu",
	label: "TV Deildu",
	description: "Search or inspect TV Kit's Deildu catalog using secret-safe tvctl output. Search needs query; other actions need id.",
	promptSnippet: "Search and inspect secret-safe Deildu metadata.",
	executionMode: "parallel",
	parameters: Type.Object({
		action: Type.Union([
			Type.Literal("search"),
			Type.Literal("item"),
			Type.Literal("links"),
			Type.Literal("files"),
		]),
		query: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
		id: Type.Optional(Type.Integer({ minimum: 1 })),
	}),
	execute: (_id, params, signal) => {
		if (params.action === "search") {
			const query = params.query?.trim();
			if (!query) throw new Error("tv_deildu search requires query");
			return run(["deildu", "search", query], signal);
		}
		if (!params.id) throw new Error(`tv_deildu ${params.action} requires id`);
		return run(["deildu", params.action, String(params.id)], signal);
	},
});

const tvPlayback = defineTool({
	name: "tv_playback",
	label: "TV playback",
	description: "Read or idempotently control TV Kit playback through tvctl. Deildu playback needs id and verifies advancing frames; never retry a failed item automatically.",
	promptSnippet: "Read, start, resume, or stop TV Kit playback.",
	executionMode: "sequential",
	parameters: Type.Object({
		action: Type.Union([
			Type.Literal("state"),
			Type.Literal("play"),
			Type.Literal("stop"),
			Type.Literal("deildu"),
		]),
		id: Type.Optional(Type.Integer({ minimum: 1 })),
	}),
	execute: (_id, params, signal) => {
		const args = ["kit", "playback", params.action];
		if (params.action === "deildu") {
			if (!params.id) throw new Error("tv_playback deildu requires id");
			args.push(String(params.id));
		}
		return run(args, signal, params.action === "deildu" ? 40_000 : 60_000);
	},
});

const tvPublic = defineTool({
	name: "tv_public",
	label: "TV public torrents",
	description:
		"Search, inspect, scrape, or stream TV Kit's multi-source public torrent catalog (ThePirateBay/apibay, Knaben, 1337x, EZTV). search needs query; play needs a 40-hex info hash and verifies advancing frames; never retry a failed hash automatically.",
	promptSnippet:
		"Search public trackers, inspect the catalog, or stream a public torrent.",
	executionMode: "sequential",
	parameters: Type.Object({
		action: Type.Union([
			Type.Literal("search"),
			Type.Literal("list"),
			Type.Literal("scrape"),
			Type.Literal("state"),
			Type.Literal("download"),
			Type.Literal("play"),
			Type.Literal("stop"),
		]),
		query: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
		hash: Type.Optional(Type.String({ pattern: "^[A-Fa-f0-9]{40}$" })),
		limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 500 })),
	}),
	execute: (_id, params, signal) => {
		if (params.action === "search") {
			const query = params.query?.trim();
			if (!query) throw new Error("tv_public search requires query");
			return run(["public", "search", query], signal);
		}
		if (params.action === "play" || params.action === "download") {
			if (!params.hash)
				throw new Error(`tv_public ${params.action} requires hash`);
			return run(
				["public", params.action, params.hash],
				signal,
				params.action === "play" ? 130_000 : 45_000,
			);
		}
		if (params.action === "list") {
			return run(["public", "list", String(params.limit ?? 30)], signal);
		}
		return run(["public", params.action], signal);
	},
});

const tvMpv = defineTool({
	name: "tv_mpv",
	label: "TV mpv",
	description: "List or change native mpv audio and subtitle tracks without reloading playback. audio/subtitle need a positive track id, auto, or off.",
	promptSnippet: "List or select native mpv audio and subtitle tracks.",
	executionMode: "sequential",
	parameters: Type.Object({
		action: Type.Union([
			Type.Literal("tracks"),
			Type.Literal("audio"),
			Type.Literal("subtitle"),
		]),
		selection: Type.Optional(Type.Union([
			Type.Integer({ minimum: 1 }),
			Type.Literal("auto"),
			Type.Literal("off"),
		])),
	}),
	execute: (_id, params, signal) => {
		const args = ["mpv", params.action];
		if (params.action !== "tracks") {
			if (params.selection === undefined) throw new Error(`tv_mpv ${params.action} requires selection`);
			args.push(String(params.selection));
		}
		return run(args, signal);
	},
});

const tvKit = defineTool({
	name: "tv_kit",
	label: "TV Kit",
	description: "Run bounded TV Kit health, logs, checks, deployment, restart, EPG, or fullscreen operations through tvctl. sync/restart/fullscreen/epg-sync change live state; sync interrupts playback.",
	promptSnippet: "Diagnose, verify, deploy, or safely operate TV Kit.",
	executionMode: "sequential",
	parameters: Type.Object({
		action: Type.Union([
			Type.Literal("status"),
			Type.Literal("verify"),
			Type.Literal("check"),
			Type.Literal("logs"),
			Type.Literal("restart"),
			Type.Literal("sync"),
			Type.Literal("epg-status"),
			Type.Literal("epg-sync"),
			Type.Literal("fullscreen"),
		]),
		unit: Type.Optional(Type.String({ pattern: "^[A-Za-z0-9@_.:-]+$" })),
		lines: Type.Optional(Type.Integer({ minimum: 1, maximum: 1000 })),
		message: Type.Optional(Type.String({ maxLength: 200 })),
		warnings: Type.Optional(Type.Boolean()),
		mode: Type.Optional(Type.Union([
			Type.Literal("ruv"),
			Type.Literal("ruv2"),
			Type.Literal("off"),
		])),
	}),
	execute: (_id, params, signal) => {
		switch (params.action) {
			case "status":
			case "verify":
				return run(["kit", params.action], signal);
			case "check":
				return run(["kit", "check", ...(params.warnings ? ["warnings"] : [])], signal, 360_000);
			case "logs":
				return run(["kit", "logs", params.unit || "tvserverd.service", String(params.lines || 50)], signal);
			case "restart":
				return run(["kit", "restart", ...(params.unit ? [params.unit] : [])], signal, 120_000);
			case "sync":
				return run(["kit", "sync", params.message || "Pi tv-extension sync"], signal, 240_000);
			case "epg-status":
				return run(["kit", "epg", "status"], signal);
			case "epg-sync":
				return run(["kit", "epg", "sync"], signal, 300_000);
			case "fullscreen":
				if (!params.mode) throw new Error("tv_kit fullscreen requires mode");
				return run(["kit", "fullscreen", params.mode], signal);
		}
	},
});

export default function (pi: ExtensionAPI) {
	pi.registerTool(tvSnapshot);
	pi.registerTool(tvDeildu);
	pi.registerTool(tvPlayback);
	pi.registerTool(tvPublic);
	pi.registerTool(tvMpv);
	pi.registerTool(tvKit);
}
