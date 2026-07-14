#!/usr/bin/env bun
/**
 * sourcesplash — CLI for the SourceSplash free image/wallpaper API.
 *
 * Usage:
 *   sourcesplash random [--query <q>] [--width <w>] [--height <h>] [--json] [--download <dir>]
 *   sourcesplash search <query> [--page <n>] [--json]
 *   sourcesplash placeholder <width> <height> [--download <dir>]
 *   sourcesplash config [--key <key>]
 *
 * Docs: https://www.sourcesplash.com/docs
 * Base: https://api.sourcesplash.com
 */

const BASE = "https://api.sourcesplash.com";
const CONFIG_DIR = `${Bun.env.HOME || "~"}/.config/sourcesplash`;
const CONFIG_FILE = `${CONFIG_DIR}/key`;

// ── helpers ────────────────────────────────────────────────────────────────

async function readKey(): Promise<string | undefined> {
	if (Bun.env.SOURCESPLASH_KEY) return Bun.env.SOURCESPLASH_KEY;
	try {
		return (await Bun.file(CONFIG_FILE).text()).trim();
	} catch {
		return undefined;
	}
}

async function writeKey(key: string): Promise<void> {
	await Bun.write(CONFIG_DIR, "", { createPath: true }); // ensure dir
	await Bun.write(CONFIG_FILE, key + "\n");
	console.error(`saved key to ${CONFIG_FILE}`);
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
	const key = await readKey();
	const headers: Record<string, string> = {};
	if (key) headers["x-api-key"] = key;
	const res = await fetch(`${BASE}${path}`, { ...init, headers });
	if (!res.ok) {
		const body = await res.text().catch(() => "");
		throw new Error(`API ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`);
	}
	return res.json() as Promise<T>;
}

// ── types ──────────────────────────────────────────────────────────────────

interface SourceSplashImage {
	id: string;
	url: string;
	thumbnail: string;
	width: number;
	height: number;
	author: string;
	author_url: string;
	source: string;
	description: string;
}

interface SearchResponse {
	results: SourceSplashImage[];
	total?: number;
	page?: number;
}

// ── commands ───────────────────────────────────────────────────────────────

async function cmdRandom(args: string[]): Promise<void> {
	let query: string | undefined;
	let w: number | undefined;
	let h: number | undefined;
	let json = false;
	let download: string | undefined;

	for (let i = 0; i < args.length; i++) {
		switch (args[i]) {
			case "--query": case "-q": query = args[++i]; break;
			case "--width": case "-w": w = Number(args[++i]); break;
			case "--height": case "-h": h = Number(args[++i]); break;
			case "--json": case "-j": json = true; break;
			case "--download": case "-d": download = args[++i]; break;
			default:
				console.error(`unknown flag: ${args[i]}`);
				process.exit(64);
		}
	}

	if (json || download) {
		const params = new URLSearchParams();
		if (query) params.set("q", query);
		if (w) params.set("w", String(w));
		if (h) params.set("h", String(h));
		const qs = params.toString();
		const img = await api<SourceSplashImage>(`/api/random${qs ? `?${qs}` : ""}`);

		if (download) {
			const res = await fetch(img.url);
			if (!res.ok) throw new Error(`download failed: ${res.status}`);
			const buffer = await res.arrayBuffer();
			const ext = img.url.split(".").pop()?.split("?").shift() || "jpg";
			const slug = (img.description || img.id).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 48);
			const filename = `${slug}.${ext}`;
			await Bun.write(`${download}/${filename}`, buffer);
			console.log(`downloaded ${(buffer.byteLength / 1024).toFixed(0)} KB → ${download}/${filename}`);
		} else {
			console.log(JSON.stringify(img, null, 2));
		}
	} else {
		const params = new URLSearchParams();
		if (query) params.set("q", query);
		if (w) params.set("w", String(w));
		if (h) params.set("h", String(h));
		const qs = params.toString();
		// /i/random redirects; follow and print the final URL
		const key = await readKey();
		const headers: Record<string, string> = {};
		if (key) headers["x-api-key"] = key;
		const res = await fetch(`${BASE}/i/random${qs ? `?${qs}` : ""}`, { headers, redirect: "manual" });
		if (res.status >= 300 && res.status < 400) {
			const location = res.headers.get("location");
			if (location) console.log(location);
			else console.log(res.url);
		} else if (res.ok) {
			console.log(res.url);
		} else {
			throw new Error(`API ${res.status}`);
		}
	}
}

async function cmdSearch(args: string[]): Promise<void> {
	if (args.length === 0 || args[0].startsWith("--")) {
		console.error("usage: sourcesplash search <query> [--page <n>] [--json]");
		process.exit(64);
	}

	const query = args[0];
	let page: number | undefined;
	let json = false;

	for (let i = 1; i < args.length; i++) {
		switch (args[i]) {
			case "--page": case "-p": page = Number(args[++i]); break;
			case "--json": case "-j": json = true; break;
			default:
				console.error(`unknown flag: ${args[i]}`);
				process.exit(64);
		}
	}

	const params = new URLSearchParams({ q: query });
	if (page) params.set("page", String(page));
	const data = await api<SearchResponse>(`/api/search?${params}`);

	if (json) {
		console.log(JSON.stringify(data, null, 2));
	} else {
		for (const img of data.results) {
			const dims = `${img.width}x${img.height}`;
			console.log(`${img.id}  ${dims}  ${img.author}  ${img.url}`);
		}
		if (data.total) console.error(`\n${data.results.length} of ${data.total} results`);
	}
}

async function cmdPlaceholder(args: string[]): Promise<void> {
	const w = Number(args[0]);
	const h = Number(args[1]);
	if (!Number.isFinite(w) || !Number.isFinite(h) || w < 1 || h < 1) {
		console.error("usage: sourcesplash placeholder <width> <height> [--download <dir>]");
		process.exit(64);
	}

	let download: string | undefined;
	for (let i = 2; i < args.length; i++) {
		if (args[i] === "--download" || args[i] === "-d") download = args[++i];
		else { console.error(`unknown flag: ${args[i]}`); process.exit(64); }
	}

	const url = `${BASE}/i/${w}x${h}/placeholder`;
	if (download) {
		const res = await fetch(url);
		if (!res.ok) throw new Error(`download failed: ${res.status}`);
		const buffer = await res.arrayBuffer();
		const filename = `placeholder_${w}x${h}.png`;
		await Bun.write(`${download}/${filename}`, buffer);
		console.log(`downloaded ${(buffer.byteLength / 1024).toFixed(0)} KB → ${download}/${filename}`);
	} else {
		console.log(url);
	}
}

async function cmdConfig(args: string[]): Promise<void> {
	if (args.includes("--key") || args.includes("-k")) {
		const idx = args.indexOf("--key") !== -1 ? args.indexOf("--key") : args.indexOf("-k");
		const key = args[idx + 1];
		if (!key) { console.error("usage: sourcesplash config --key <key>"); process.exit(64); }
		await writeKey(key);
	} else {
		const key = await readKey();
		console.log(key ? `key: ${key.slice(0, 8)}…${key.slice(-4)}` : "no key configured");
	}
}

// ── main ───────────────────────────────────────────────────────────────────

async function main() {
	const cmd = process.argv[2];
	const args = process.argv.slice(3);

	switch (cmd) {
		case "random":
		case "r":
			await cmdRandom(args);
			break;
		case "search":
		case "s":
			await cmdSearch(args);
			break;
		case "placeholder":
		case "p":
			await cmdPlaceholder(args);
			break;
		case "config":
		case "c":
			await cmdConfig(args);
			break;
		case "--help":
		case "-h":
		case undefined:
			console.log(`
sourcesplash — SourceSplash free wallpaper/image API CLI

Usage:
  sourcesplash random [opts]        Random wallpaper (URL by default)
    -q, --query <q>                 Search query
    -w, --width <px>                Image width
    -h, --height <px>               Image height
    -j, --json                      Output JSON metadata
    -d, --download <dir>            Download to directory

  sourcesplash search <query> [opts] Search wallpapers
    -p, --page <n>                  Page number
    -j, --json                      Output full JSON

  sourcesplash placeholder <w> <h>   Placeholder image URL
    -d, --download <dir>            Download to directory

  sourcesplash config [opts]         View/set API key
    -k, --key <key>                 Set API key (saved to ~/.config/sourcesplash/key)
    Or set env SOURCESPLASH_KEY

Docs: https://www.sourcesplash.com/docs
`.trim());
			break;
		default:
			console.error(`unknown command: ${cmd}`);
			process.exit(64);
	}
}

if (import.meta.main) {
	main().catch((err) => {
		console.error(`sourcesplash: ${err instanceof Error ? err.message : String(err)}`);
		process.exit(1);
	});
}
