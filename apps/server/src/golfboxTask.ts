import type {
	GolfBooking,
	GolfFriend,
	GolfPersonDetail,
} from "../../../packages/protocol";
import { config } from "./config";
import { getCache, getSetting, setCache } from "./db";

const CACHE_KEY = "golfbox-person-bookings";
const ROUNDS_CACHE_KEY = "golfbox-person-rounds";
const FRIENDS_CACHE_KEY = "golfbox-person-friends";
type CacheValue = { person: string; bookings: GolfBooking[] };

function requiredSetting(key: string) {
	const value = getSetting(key);
	if (!value) throw new Error(`${key} setting is missing`);
	return value;
}

function numberSetting(key: string, minimum: number, maximum: number) {
	const value = Number(requiredSetting(key));
	if (!Number.isSafeInteger(value) || value < minimum || value > maximum)
		throw new Error(`${key} setting is invalid`);
	return value;
}

export const golfboxScheduleIntervalMs = () =>
	numberSetting("golfbox_sync_interval_ms", 60_000, 604_800_000);

export const golfboxTaskState = {
	title: requiredSetting("golfbox_task_title"),
	running: false,
	phase: "idle" as "idle" | "fetch" | "complete" | "error",
	current: 0,
	total: numberSetting("golfbox_sync_days", 1, 31),
	message: "Tilbúið",
	lastRun: null as number | null,
	lastError: "",
};

export function cachedGolfBoxBookings() {
	return getCache<CacheValue>(CACHE_KEY)?.value ?? null;
}

let bookingsFetch: Promise<CacheValue> | null = null;

// Live GolfBox fetch (spawns golfboxctl). No cache read; caches the fresh result
// and throws on failure. This is the on-demand source of truth.
export async function fetchGolfBoxBookings(): Promise<CacheValue> {
	if (bookingsFetch) return bookingsFetch;
	bookingsFetch = fetchGolfBoxBookingsOnce();
	try {
		return await bookingsFetch;
	} finally {
		bookingsFetch = null;
	}
}

async function fetchGolfBoxBookingsOnce(): Promise<CacheValue> {
	const person = requiredSetting("golfbox_person");
	const resource = requiredSetting("golfbox_resource");
	const syncDays = numberSetting("golfbox_sync_days", 1, 31);
	const child = Bun.spawn({
		cmd: [
			config.golfboxCtlBin,
			"person",
			person,
			"--days",
			String(syncDays),
			"--resource",
			resource,
		],
		env: { ...process.env, GOLFBOX_ENV_FILE: config.golfboxEnvFile },
		stdout: "pipe",
		stderr: "pipe",
	});
	const timeout = setTimeout(
		() => child.kill("SIGTERM"),
		config.golfboxTaskTimeoutMs,
	);
	try {
		const [exitCode, stdout, stderr] = await Promise.all([
			child.exited,
			new Response(child.stdout).text(),
			new Response(child.stderr).text(),
		]);
		if (exitCode !== 0)
			throw new Error(stderr.trim() || `golfboxctl exited ${exitCode}`);
		const result = validate(JSON.parse(stdout), person);
		setCache(CACHE_KEY, result);
		return result;
	} finally {
		clearTimeout(timeout);
	}
}

// On-demand fetch for the content build, mirroring getGolfTeeTimes: refetch when
// the cache is older than the golf cache window, else reuse, and fall back to
// stale cache on failure so a GolfBox outage never blanks the widget.
// ponytail: reuses golfCacheMs (60s) as the freshness window; add a dedicated
// GOLFBOX_CACHE_MS only if bookings need a different cadence than tee times.
export async function getGolfBoxBookings(): Promise<CacheValue | null> {
	const cached = getCache<CacheValue>(CACHE_KEY);
	if (cached && Date.now() - cached.fetchedAt < config.golfCacheMs)
		return cached.value;
	// ponytail: if a golfboxctl fetch is already in flight, don't spawn another
	if (golfboxTaskState.running) return cached?.value ?? null;
	try {
		return await fetchGolfBoxBookings();
	} catch {
		return cached?.value ?? null;
	}
}

function validate(value: unknown, person: string): CacheValue {
	if (typeof value !== "object" || value === null)
		throw new Error("invalid GolfBox script output");
	const bookings = (value as { bookings?: unknown }).bookings;
	if (!Array.isArray(bookings)) throw new Error("GolfBox bookings are missing");
	return {
		person,
		bookings: bookings.slice(0, 100).map((booking) => {
			if (typeof booking !== "object" || booking === null)
				throw new Error("invalid GolfBox booking");
			const row = booking as Record<string, unknown>;
			if (
				typeof row.date !== "string" ||
				!/^\d{4}-\d{2}-\d{2}$/.test(row.date) ||
				typeof row.time !== "string" ||
				!/^([01]\d|2[0-3]):[0-5]\d$/.test(row.time) ||
				row.name !== person
			)
				throw new Error("invalid GolfBox booking fields");
			return { date: row.date, time: row.time, name: person };
		}),
	};
}

export async function runGolfBoxTask(onProgress?: () => void) {
	if (golfboxTaskState.running) return golfboxTaskState;
	const syncDays = numberSetting("golfbox_sync_days", 1, 31);
	Object.assign(golfboxTaskState, {
		running: true,
		phase: "fetch",
		current: 0,
		total: syncDays,
		message: `Sæki næstu ${syncDays} daga`,
		lastError: "",
	});
	onProgress?.();
	try {
		const result = await fetchGolfBoxBookings();
		Object.assign(golfboxTaskState, {
			running: false,
			phase: "complete",
			current: syncDays,
			message: result.bookings.length
				? `${result.bookings.length} rástímar fundust`
				: "Engir rástímar fundust",
			lastRun: Date.now(),
		});
	} catch (error) {
		Object.assign(golfboxTaskState, {
			running: false,
			phase: "error",
			message: "GolfBox samstilling mistókst",
			lastRun: Date.now(),
			lastError: error instanceof Error ? error.message : String(error),
		});
	}
	onProgress?.();
	return golfboxTaskState;
}

export async function fetchGolfBoxRounds(): Promise<GolfPersonDetail> {
	const child = Bun.spawn({
		cmd: [config.golfboxCtlBin, "rounds"],
		env: { ...process.env, GOLFBOX_ENV_FILE: config.golfboxEnvFile },
		stdout: "pipe",
		stderr: "pipe",
	});
	const timeout = setTimeout(
		() => child.kill("SIGTERM"),
		config.golfboxTaskTimeoutMs,
	);
	try {
		const [exitCode, stdout] = await Promise.all([
			child.exited,
			new Response(child.stdout).text(),
		]);
		if (exitCode !== 0) throw new Error(`golfboxctl rounds exited ${exitCode}`);
		const result = JSON.parse(stdout) as GolfPersonDetail;
		setCache(ROUNDS_CACHE_KEY, result);
		return result;
	} finally {
		clearTimeout(timeout);
	}
}

export function cachedGolfBoxRounds(): GolfPersonDetail | null {
	return getCache<GolfPersonDetail>(ROUNDS_CACHE_KEY)?.value ?? null;
}

export async function fetchGolfBoxFriends(): Promise<GolfFriend[]> {
	const child = Bun.spawn({
		cmd: [config.golfboxCtlBin, "friends"],
		env: { ...process.env, GOLFBOX_ENV_FILE: config.golfboxEnvFile },
		stdout: "pipe",
		stderr: "pipe",
	});
	const timeout = setTimeout(
		() => child.kill("SIGTERM"),
		config.golfboxTaskTimeoutMs,
	);
	try {
		const [exitCode, stdout] = await Promise.all([
			child.exited,
			new Response(child.stdout).text(),
		]);
		if (exitCode !== 0)
			throw new Error(`golfboxctl friends exited ${exitCode}`);
		const result = JSON.parse(stdout) as GolfFriend[];
		setCache(FRIENDS_CACHE_KEY, result);
		return result;
	} finally {
		clearTimeout(timeout);
	}
}

export function cachedGolfBoxFriends(): GolfFriend[] | null {
	return getCache<GolfFriend[]>(FRIENDS_CACHE_KEY)?.value ?? null;
}
