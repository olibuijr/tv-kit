import type { DashboardContent, MediaItem, RuvEpgEvent, RuvNow } from "./index";
import { tvServerUrl } from "./index";

export const EMPTY_DASHBOARD_CONTENT: DashboardContent = {
	generatedAt: 0,
	channels: [],
	programs: [],
	movies: [],
	torrentMovies: [],
	deilduCategories: [],
	deilduItems: [],
	deilduScrape: {
		running: false,
		status: "idle",
		message: "",
		lastRun: null,
		lastError: "",
		inserted: 0,
		updated: 0,
		itemCount: 0,
		categoryCount: 0,
		completedPages: 0,
		totalPages: 0,
	},
	news: [],
	continueWatching: [],
	myList: [],
};

export async function fetchDashboardContent(
	signal?: AbortSignal,
): Promise<DashboardContent> {
	const response = await fetch(`${tvServerUrl()}/dashboard/content`, {
		signal,
	});
	if (!response.ok) throw new Error(`tvserverd svaraði ${response.status}`);
	const content = (await response.json()) as DashboardContent;
	return {
		...EMPTY_DASHBOARD_CONTENT,
		...content,
		movies: content.movies ?? [],
		torrentMovies: content.torrentMovies ?? [],
		deilduCategories: content.deilduCategories ?? [],
		deilduItems: content.deilduItems ?? [],
		deilduScrape: content.deilduScrape ?? EMPTY_DASHBOARD_CONTENT.deilduScrape,
	};
}

export function deriveRuvNow(snapshot: RuvNow, now: number): RuvNow {
	const events = [snapshot.current, ...snapshot.upcoming]
		.filter((event): event is RuvEpgEvent => Boolean(event))
		.filter(
			(event, index, all) =>
				all.findIndex((item) => item.eventId === event.eventId) === index,
		)
		.sort((a, b) => a.startTime - b.startTime);
	const current =
		[...events]
			.reverse()
			.find(
				(event) =>
					event.startTime <= now &&
					(event.endTime === null || event.endTime > now),
			) ?? null;
	return {
		channel: snapshot.channel,
		current,
		upcoming: events.filter((event) => event.startTime > now).slice(0, 6),
	};
}

export function eventProgress(event: RuvEpgEvent | null, now: number) {
	if (!event?.endTime || event.endTime <= event.startTime) return 0;
	return Math.max(
		0,
		Math.min(
			100,
			((now - event.startTime) / (event.endTime - event.startTime)) * 100,
		),
	);
}

export function interpolateMediaTime(
	media: MediaItem,
	playing: boolean,
	observedAt: number,
	now: number,
) {
	if (!playing || media.live) return media.currentTime;
	return Math.max(
		0,
		Math.min(
			media.duration || Number.MAX_SAFE_INTEGER,
			media.currentTime + Math.max(0, now - observedAt) / 1_000,
		),
	);
}

export function relativeTime(timestamp: number | null, now: number) {
	if (!timestamp) return "";
	const seconds = Math.round((timestamp - now) / 1_000);
	if (Math.abs(seconds) < 60) return seconds > 0 ? "eftir stutta stund" : "núna";
	let value: number;
	let unit: string;
	if (Math.abs(seconds) < 3_600) {
		value = Math.round(seconds / 60);
		unit = "mín.";
	} else if (Math.abs(seconds) < 86_400) {
		value = Math.round(seconds / 3_600);
		unit = "klst.";
	} else {
		value = Math.round(seconds / 86_400);
		unit = "dögum";
	}
	if (value > 0) return `eftir ${value} ${unit}`;
	return `fyrir ${Math.abs(value)} ${unit}`;
}

export function formatClock(now: number) {
	return new Intl.DateTimeFormat("is-IS", {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: false,
		timeZone: "Atlantic/Reykjavik",
	}).format(now);
}

export function formatDate(now: number) {
	return new Intl.DateTimeFormat("is-IS", {
		weekday: "long",
		day: "numeric",
		month: "long",
		timeZone: "Atlantic/Reykjavik",
	}).format(now);
}

export function formatTime(timestamp: number) {
	return new Intl.DateTimeFormat("is-IS", {
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
		timeZone: "Atlantic/Reykjavik",
	}).format(timestamp);
}

export function formatScheduleTime(timestamp: number, now: number) {
	const date = new Intl.DateTimeFormat("en-CA", { dateStyle: "short", timeZone: "Atlantic/Reykjavik" });
	if (date.format(timestamp) === date.format(now)) return formatTime(timestamp);
	const weekday = new Intl.DateTimeFormat("is-IS", { weekday: "short", timeZone: "Atlantic/Reykjavik" });
	return `${weekday.format(timestamp)} ${formatTime(timestamp)}`;
}

export function formatDuration(seconds: number) {
	if (!Number.isFinite(seconds) || seconds <= 0) return "";
	const hours = Math.floor(seconds / 3_600);
	const minutes = Math.max(1, Math.round((seconds % 3_600) / 60));
	return hours ? `${hours} klst. ${minutes} mín.` : `${minutes} mín.`;
}

export function contentIsStale(
	content: DashboardContent,
	now: number,
	maximumAgeMs: number,
) {
	return !content.generatedAt || now - content.generatedAt > maximumAgeMs;
}
