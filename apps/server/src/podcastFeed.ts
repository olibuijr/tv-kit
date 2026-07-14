import { createHash } from "node:crypto";
import type { PodcastEpisode } from "../../../packages/protocol";

export type ParsedPodcastFeed = {
	title: string;
	description: string;
	author: string;
	imageUrl: string;
	episodes: PodcastEpisode[];
};

const decodeXml = (value = "") =>
	value
		.replace(/^<!\[CDATA\[|\]\]>$/g, "")
		.replace(/&#(x[\da-f]+|\d+);/gi, (_, code: string) =>
			String.fromCodePoint(code[0].toLowerCase() === "x" ? Number.parseInt(code.slice(1), 16) : Number(code)),
		)
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.trim();

const tag = (xml: string, name: string) => {
	const match = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i"));
	return decodeXml(match?.[1]);
};

const attribute = (xml: string, tagName: string, name: string) => {
	const element = xml.match(new RegExp(`<${tagName}\\b[^>]*>`, "i"))?.[0] ?? "";
	const match = element.match(new RegExp(`\\b${name}=(?:"([^"]*)"|'([^']*)')`, "i"));
	return decodeXml(match?.[1] ?? match?.[2]);
};

const plainText = (value: string) => decodeXml(value).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

const durationSeconds = (value: string) => {
	if (/^\d+$/.test(value)) return Number(value);
	const parts = value.split(":").map(Number);
	if (!parts.length || parts.some((part) => !Number.isFinite(part))) return 0;
	return parts.reduce((total, part) => total * 60 + part, 0);
};

export function parsePodcastFeed(podcastId: string, xml: string): ParsedPodcastFeed {
	const firstItem = xml.indexOf("<item>");
	const channel = firstItem >= 0 ? xml.slice(0, firstItem) : xml;
	const imageUrl = attribute(channel, "itunes:image", "href");
	const episodes = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].flatMap((match) => {
		const item = match[1];
		const audioUrl = attribute(item, "enclosure", "url") || tag(item, "link");
		const title = plainText(tag(item, "title"));
		if (!title || !/^https?:\/\//.test(audioUrl)) return [];
		const episodeNumber = Number(tag(item, "itunes:episode"));
		const suffix = Number.isSafeInteger(episodeNumber) && episodeNumber > 0
			? String(episodeNumber)
			: createHash("sha256").update(audioUrl).digest("hex").slice(0, 16);
		const publishedAt = Date.parse(tag(item, "pubDate"));
		return [{
			id: `${podcastId}-${suffix}`,
			podcastId,
			title,
			description: plainText(tag(item, "description")),
			audioUrl,
			publishedAt: Number.isFinite(publishedAt) ? publishedAt : 0,
			duration: durationSeconds(tag(item, "itunes:duration")),
			episodeNumber: Number.isSafeInteger(episodeNumber) && episodeNumber > 0 ? episodeNumber : null,
			artworkUrl: attribute(item, "itunes:image", "href") || imageUrl,
		} satisfies PodcastEpisode];
	});
	if (!episodes.length) throw new Error("Podcast feed contained no playable episodes");
	return {
		title: plainText(tag(channel, "title")),
		description: plainText(tag(channel, "description")),
		author: plainText(tag(channel, "itunes:author")),
		imageUrl,
		episodes,
	};
}

export type EpisodeArtwork = {
	title: string;
	publishedAt: number;
	imageUrl: string;
};


export function parseRuvEpisodeArtwork(html: string): EpisodeArtwork[] {
	const payload = html.match(
		/<script\b[^>]*\bid=["']apollo["'][^>]*>\s*window\.__APOLLO_STATE__\s*=\s*([\s\S]*?);?\s*<\/script>/i,
	)?.[1];
	if (!payload) throw new Error("RÚV series page contained no Apollo state");
	const state = JSON.parse(payload) as Record<string, unknown>;
	return Object.entries(state).flatMap(([key, value]) => {
		if (!key.startsWith("Episode:") || !value || typeof value !== "object") return [];
		const episode = value as Record<string, unknown>;
		const title = typeof episode.title === "string" ? episode.title.trim() : "";
		const imageUrl = typeof episode.image === "string" ? episode.image : "";
		const publishedAt = typeof episode.firstrun === "string"
			? Date.parse(episode.firstrun)
			: Number.NaN;
		if (!title || !/^https?:\/\//.test(imageUrl) || !Number.isFinite(publishedAt)) return [];
		return [{ title, publishedAt, imageUrl }];
	});
}
