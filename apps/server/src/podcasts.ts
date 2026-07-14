import { parsePodcastFeed } from "./podcastFeed";
import type { PodcastEpisode, PodcastSeries } from "../../../packages/protocol";
import { config } from "./config";
import { db, statement } from "./db";

type FeedRow = {
	id: string;
	title: string;
	description: string;
	author: string;
	imageUrl: string;
	feedUrl: string;
	position: number;
	lastSyncedAt: number | null;
};


const feeds = () => statement(`
	SELECT id, title, description, author, image_url AS imageUrl,
		feed_url AS feedUrl, position, last_synced_at AS lastSyncedAt
	FROM podcast_feeds WHERE enabled=1 ORDER BY position, title
`).all() as FeedRow[];

export function listPodcasts(): PodcastSeries[] {
	return feeds().map((feed) => ({
		...feed,
		episodes: statement(`
			SELECT id, podcast_id AS podcastId, title, description,
				audio_url AS audioUrl, published_at AS publishedAt, duration,
				episode_number AS episodeNumber, artwork_url AS artworkUrl
			FROM podcast_episodes WHERE podcast_id=?
			ORDER BY published_at DESC, episode_number DESC LIMIT ?
		`).all(feed.id, config.podcastEpisodeLimit) as PodcastEpisode[],
	}));
}

export function getPodcastEpisode(id: string): PodcastEpisode | null {
	return (statement(`
		SELECT id, podcast_id AS podcastId, title, description,
			audio_url AS audioUrl, published_at AS publishedAt, duration,
			episode_number AS episodeNumber, artwork_url AS artworkUrl
		FROM podcast_episodes WHERE id=?
	`).get(id) as PodcastEpisode | null) ?? null;
}

async function syncFeed(feed: FeedRow) {
	try {
		const response = await fetch(feed.feedUrl, {
			signal: AbortSignal.timeout(config.podcastFetchTimeoutMs),
			headers: { "user-agent": "tvserverd-podcasts/1.0" },
		});
		if (!response.ok) throw new Error(`Podcast feed responded ${response.status}`);
		const parsed = parsePodcastFeed(feed.id, await response.text());
		const now = Date.now();
		db.transaction(() => {
			statement(`
				UPDATE podcast_feeds SET title=?, description=?, author=?, image_url=?,
					last_synced_at=?, sync_error='' WHERE id=?
			`).run(parsed.title || feed.title, parsed.description, parsed.author, parsed.imageUrl, now, feed.id);
			statement("DELETE FROM podcast_episodes WHERE podcast_id=?").run(feed.id);
			const insert = statement(`
				INSERT INTO podcast_episodes (
					id, podcast_id, title, description, audio_url, published_at,
					duration, episode_number, artwork_url, updated_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			`);
			for (const episode of parsed.episodes) insert.run(
				episode.id, episode.podcastId, episode.title, episode.description,
				episode.audioUrl, episode.publishedAt, episode.duration,
				episode.episodeNumber, episode.artworkUrl, now,
			);
		})();
		return true;
	} catch (error) {
		statement("UPDATE podcast_feeds SET sync_error=? WHERE id=?").run(
			error instanceof Error ? error.message : "Podcast sync failed",
			feed.id,
		);
		return false;
	}
}

export async function syncPodcastsIfDue() {
	const due = feeds().filter((feed) =>
		!feed.lastSyncedAt || Date.now() - feed.lastSyncedAt >= config.podcastSyncIntervalMs,
	);
	const results = await Promise.all(due.map(syncFeed));
	return results.some(Boolean);
}
