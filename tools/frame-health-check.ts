import { readFile } from "node:fs/promises";

export type FrameHealth = {
	connected: boolean;
	updatedAt: number;
	lastMessageAt: number;
	view?: string;
	[key: string]: unknown;
};

export function validateFrameHealth(
	value: unknown,
	minimumTimestamp = 0,
	now = Date.now(),
): FrameHealth {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error("frame health is not an object");
	}
	const state = value as FrameHealth;
	if (state.connected !== true) throw new Error("frame is disconnected");
	for (const field of ["updatedAt", "lastMessageAt"] as const) {
		const timestamp = state[field];
		if (!Number.isFinite(timestamp) || timestamp <= 0) {
			throw new Error(`frame health ${field} is invalid`);
		}
		if (timestamp < minimumTimestamp) {
			throw new Error(`frame health ${field} predates this deployment`);
		}
		if (now - timestamp > 30_000) {
			throw new Error(`frame health ${field} is stale`);
		}
	}
	return state;
}

export async function waitForFrameHealth(
	path: string,
	minimumTimestamp = 0,
	timeoutMs = 0,
): Promise<FrameHealth> {
	const deadline = Date.now() + timeoutMs;
	let lastError: unknown;
	do {
		try {
			const value = JSON.parse(await readFile(path, "utf8"));
			return validateFrameHealth(value, minimumTimestamp);
		} catch (error) {
			lastError = error;
		}
		if (Date.now() >= deadline) break;
		await Bun.sleep(250);
	} while (true);
	throw lastError;
}

if (import.meta.main) {
	const [path, minimumRaw = "0", timeoutRaw = "0"] = process.argv.slice(2);
	const minimumTimestamp = Number(minimumRaw);
	const timeoutMs = Number(timeoutRaw);
	if (!path || !Number.isSafeInteger(minimumTimestamp) || minimumTimestamp < 0
		|| !Number.isSafeInteger(timeoutMs) || timeoutMs < 0 || timeoutMs > 30_000) {
		console.error("usage: frame-health-check.ts PATH [MINIMUM_TIMESTAMP_MS] [TIMEOUT_MS]");
		process.exit(64);
	}
	try {
		console.log(JSON.stringify(await waitForFrameHealth(path, minimumTimestamp, timeoutMs)));
	} catch (error) {
		console.error(`tvctl: native-frame health failed: ${error instanceof Error ? error.message : String(error)}`);
		process.exit(1);
	}
}
