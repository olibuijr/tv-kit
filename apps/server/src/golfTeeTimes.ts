import type { GolfTeeTimes } from "../../../packages/protocol";
import { config } from "./config";
import { getCache, getSetting, setCache } from "./db";

const CAPACITY = 4;
type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
const text = (value: unknown, fallback: string) =>
	typeof value === "string" && value.trim()
		? value.trim().slice(0, 120)
		: fallback;

export function parseGolfTeeTimes(
	payload: unknown,
	courseSlug: string,
	date: string,
): GolfTeeTimes {
	if (!Array.isArray(payload)) throw new Error("invalid golf course response");
	const course = payload.find(
		(value) =>
			typeof value === "object" &&
			value !== null &&
			(value as { slug?: unknown }).slug === courseSlug,
	) as Record<string, unknown> | undefined;
	if (!course) throw new Error("configured golf course not found");
	const club =
		typeof course.club === "object" && course.club !== null
			? (course.club as Record<string, unknown>)
			: {};
	const slots = Array.isArray(course.available_slots)
		? course.available_slots
				.map((value) => {
					if (typeof value !== "object" || value === null) return null;
					const row = value as Record<string, unknown>;
					if (
						row.date !== date ||
						typeof row.slot !== "string" ||
						!/^([01]\d|2[0-3]):[0-5]\d$/.test(row.slot) ||
						!Number.isInteger(row.count) ||
						(row.count as number) < 0 ||
						(row.count as number) >= CAPACITY
					)
						return null;
					return {
						time: row.slot,
						openSeats: CAPACITY - (row.count as number),
					};
				})
				.filter((slot) => slot !== null)
				.sort((a, b) => a.time.localeCompare(b.time))
				.slice(0, 100)
		: [];
	const updatedAt = Date.parse(String(course.slots_updated_at ?? ""));
	return {
		date,
		course: text(course.name, courseSlug),
		club: text(club.name, ""),
		updatedAt: Number.isFinite(updatedAt) ? updatedAt : null,
		stale: false,
		slots,
	};
}

export async function getGolfTeeTimes(
	date: string,
	fetcher: Fetcher = fetch,
): Promise<GolfTeeTimes | null> {
	const courseSlug = getSetting("golf_tee_times_course_slug");
	if (!courseSlug) throw new Error("golf_tee_times_course_slug setting is missing");
	const key = `golf-tee-times:${courseSlug}:${date}`;
	const cached = getCache<GolfTeeTimes>(key);
	if (cached && Date.now() - cached.fetchedAt < config.golfCacheMs)
		return cached.value;
	try {
		const url = new URL(config.golfCoursesUrl);
		url.searchParams.set("date", date);
		const response = await fetcher(url, {
			signal: AbortSignal.timeout(config.golfFetchTimeoutMs),
		});
		if (!response.ok)
			throw new Error(`golf endpoint returned ${response.status}`);
		const result = parseGolfTeeTimes(
			await response.json(),
			courseSlug,
			date,
		);
		setCache(key, result);
		return result;
	} catch {
		return cached ? { ...cached.value, stale: true } : null;
	}
}
