import type { Command, View } from "../../../packages/protocol";

export type ParsedCommand = Command & { label?: string };

const views: Record<View, true> = { home: true, tv: true, radio: true, podcasts: true, media: true, deildu: true, news: true };
const noValueActions = new Set([
	"toggle-play",
	"stop-playback",
	"toggle-mute",
	"back",
	"power",
	"media-next",
	"media-previous",
	"toggle-favorite",
	"cast-stop",
]);
const keyValues = new Set([
	"up",
	"down",
	"left",
	"right",
	"select",
	"next",
	"previous",
]);
const panelValues = new Set(["", "epg", "queue", "subtitles", "audio"]);
const statusValues = new Set(["idle", "loading", "ready", "error"]);

function finiteNumber(
	value: unknown,
	minimum: number,
	maximum: number,
	integer = false,
) {
	return (
		typeof value === "number" &&
		Number.isFinite(value) &&
		value >= minimum &&
		value <= maximum &&
		(!integer || Number.isSafeInteger(value))
	);
}

function shortString(value: unknown, maximum = 128) {
	return (
		typeof value === "string" && value.length > 0 && value.length <= maximum
	);
}

export function parseCommandMessage(raw: unknown): ParsedCommand | null {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
	const candidate = raw as Record<string, unknown>;
	if (candidate.type !== "command" || typeof candidate.action !== "string")
		return null;
	if (
		candidate.label !== undefined &&
		(typeof candidate.label !== "string" || candidate.label.length > 128)
	)
		return null;
	const label =
		typeof candidate.label === "string" ? candidate.label : undefined;
	const action = candidate.action;
	if (action === "set-playing" && typeof candidate.value === "boolean")
		return {
			type: "command",
			action,
			value: candidate.value,
			...(label === undefined ? {} : { label }),
		};

	if (noValueActions.has(action)) {
		if (candidate.value !== undefined) return null;
		return {
			type: "command",
			action: action as Extract<Command, { value?: never }>["action"],
			...(label === undefined ? {} : { label }),
		} as ParsedCommand;
	}

	if (action === "volume" && finiteNumber(candidate.value, 0, 100))
		return {
			type: "command",
			action,
			value: candidate.value as number,
			...(label === undefined ? {} : { label }),
		};
	if (action === "channel" && finiteNumber(candidate.value, 1, 2, true))
		return {
			type: "command",
			action,
			value: candidate.value as number,
			...(label === undefined ? {} : { label }),
		};
	if (
		(action === "deildu-category" || action === "news-article" || action === "media-program") &&
		finiteNumber(candidate.value, 0, Number.MAX_SAFE_INTEGER, true)
	)
		return {
			type: "command",
			action,
			value: candidate.value as number,
			...(label === undefined ? {} : { label }),
		};
	if (
		(action === "radio" ||
			action === "radio-favorite" ||
			action === "ruv-program" ||
			action === "program-favorite" ||
			action === "deildu-play") &&
		finiteNumber(candidate.value, 1, Number.MAX_SAFE_INTEGER, true)
	) {
		return {
			type: "command",
			action,
			value: candidate.value as number,
			...(label === undefined ? {} : { label }),
		};
	}
	if (
		(action === "seek" ||
			action === "media-progress" ||
			action === "media-duration") &&
		finiteNumber(candidate.value, 0, Number.MAX_SAFE_INTEGER)
	) {
		return {
			type: "command",
			action,
			value: candidate.value as number,
			...(label === undefined ? {} : { label }),
		};
	}
	if (action === "news-scroll" && finiteNumber(candidate.value, 0, 1))
		return {
			type: "command",
			action,
			value: candidate.value as number,
			...(label === undefined ? {} : { label }),
		};
	if (action === "media-buffering" && finiteNumber(candidate.value, 0, 100))
		return {
			type: "command",
			action,
			value: candidate.value as number,
			...(label === undefined ? {} : { label }),
		};
	if (action === "playback-rate" && finiteNumber(candidate.value, 0.5, 2))
		return {
			type: "command",
			action,
			value: candidate.value as number,
			...(label === undefined ? {} : { label }),
		};
	if (
		(action === "fullscreen" || action === "lights") &&
		typeof candidate.value === "boolean"
	) {
		return {
			type: "command",
			action,
			value: candidate.value,
			...(label === undefined ? {} : { label }),
		};
	}
	if (
		action === "view" &&
		typeof candidate.value === "string" &&
		Object.hasOwn(views, candidate.value)
	) {
		return {
			type: "command",
			action,
			value: candidate.value as View,
			...(label === undefined ? {} : { label }),
		};
	}
	if (action === "deildu-show" && typeof candidate.value === "string" && candidate.value.length <= 256)
		return {
			type: "command",
			action: "deildu-show",
			value: candidate.value,
			...(label === undefined ? {} : { label }),
		};
	if (
		action === "key" &&
		typeof candidate.value === "string" &&
		keyValues.has(candidate.value)
	) {
		return {
			type: "command",
			action,
			value: candidate.value,
			...(label === undefined ? {} : { label }),
		};
	}
	if (
		action === "player-panel" &&
		typeof candidate.value === "string" &&
		panelValues.has(candidate.value)
	) {
		return {
			type: "command",
			action,
			value: candidate.value,
			...(label === undefined ? {} : { label }),
		};
	}
	if (
		action === "player-status" &&
		typeof candidate.value === "string" &&
		statusValues.has(candidate.value)
	) {
		return {
			type: "command",
			action,
			value: candidate.value,
			...(label === undefined ? {} : { label }),
		};
	}
	if (
		(action === "subtitle" || action === "audio-track") &&
		shortString(candidate.value, 96)
	) {
		return {
			type: "command",
			action,
			value: candidate.value as string,
			...(label === undefined ? {} : { label }),
		};
	}
	if (
		(action === "ruv-channel" || action === "tv-favorite") &&
		typeof candidate.value === "string" &&
		/^(ruv|ruv2)$/.test(candidate.value)
	) {
		return {
			type: "command",
			action,
			value: candidate.value,
			...(label === undefined ? {} : { label }),
		};
	}
	if (
		(action === "ruv-episode" ||
			action === "torrent-media" ||
			action === "public-torrent-play" ||
			action === "podcast-play") &&
		typeof candidate.value === "string" &&
		/^[a-zA-Z0-9_-]{1,64}$/.test(candidate.value)
	) {
		return {
			type: "command",
			action,
			value: candidate.value,
			...(label === undefined ? {} : { label }),
		};
	}
	if (
		action === "scene" &&
		typeof candidate.value === "string" &&
		candidate.value.length <= 64
	) {
		return {
			type: "command",
			action,
			value: candidate.value,
			...(label === undefined ? {} : { label }),
		};
	}
	if (action === "deildu-scrape") {
		if (
			candidate.value !== undefined &&
			candidate.value !== null &&
			(typeof candidate.value !== "object" || Array.isArray(candidate.value))
	)
			return null;
		const value = candidate.value as { pages?: unknown } | undefined;
		let pages: number | undefined;
		if (value?.pages !== undefined) {
			if (!finiteNumber(value.pages, 1, 20, true)) return null;
			pages = value.pages as number;
		}
		return {
			type: "command",
			action,
			value: pages === undefined ? undefined : { pages },
			...(label === undefined ? {} : { label }),
		} as ParsedCommand;
	}
	if (
		action === "player-tracks" &&
		candidate.value &&
		typeof candidate.value === "object" &&
		!Array.isArray(candidate.value)
	) {
		const report = candidate.value as Record<string, unknown>;
		if (
			!shortString(report.source, 4_096) ||
			!Array.isArray(report.subtitles) ||
			report.subtitles.length > 16 ||
			!Array.isArray(report.audioTracks) ||
			report.audioTracks.length > 16
		)
			return null;
		const subtitles = report.subtitles.flatMap((track) => {
			if (!track || typeof track !== "object" || Array.isArray(track))
				return [];
			const item = track as Record<string, unknown>;
			if (
				!shortString(item.label, 96) ||
				typeof item.language !== "string" ||
				item.language.length > 16 ||
				typeof item.src !== "string" ||
				item.src.length > 4_096 ||
				(item.src && !/^https?:\/\//.test(item.src))
			)
				return [];
			return [
				{ label: item.label as string, language: item.language, src: item.src },
			];
		});
		if (
			subtitles.length !== report.subtitles.length ||
			!report.audioTracks.every((track) => shortString(track, 96))
		)
			return null;
		return {
			type: "command",
			action,
			value: {
				source: report.source as string,
				subtitles,
				audioTracks: [...new Set(report.audioTracks as string[])],
			},
			...(label === undefined ? {} : { label }),
		};
	}
	return null;
}
