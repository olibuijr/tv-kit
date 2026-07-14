import { expect, test } from "bun:test";
import { parsePodcastFeed } from "../apps/server/src/podcastFeed";

test("podcast RSS exposes stable public audio episodes", () => {
	const feed = parsePodcastFeed("history", `
		<rss><channel>
			<title>History &amp; culture</title>
			<description><![CDATA[Stories <b>from</b> history]]></description>
			<itunes:author>Public Radio</itunes:author>
			<itunes:image href="https://example.com/art.jpg"/>
			<item>
				<title>Episode one</title>
				<description>A public episode</description>
				<pubDate>Fri, 26 Jun 2026 09:03:00 -0000</pubDate>
				<enclosure type="audio/mpeg" url="https://example.com/episode.mp3"/>
				<itunes:duration>0:40:20</itunes:duration>
				<itunes:episode>357</itunes:episode>
			</item>
		</channel></rss>
	`);

	expect(feed).toMatchObject({
		title: "History & culture",
		description: "Stories from history",
		author: "Public Radio",
		imageUrl: "https://example.com/art.jpg",
	});
	expect(feed.episodes).toEqual([
		expect.objectContaining({
			id: "history-357",
			audioUrl: "https://example.com/episode.mp3",
			duration: 2_420,
			episodeNumber: 357,
		}),
	]);
});
