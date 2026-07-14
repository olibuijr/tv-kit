import { config } from "./config";

export type TmdbTodayItem = {
  id: number;
  title: string;
  posterPath: string;
  backdropPath: string;
  date: string;
  rating: number | null;
  overview: string;
  kind: "movie" | "tv";
};

export type TmdbToday = {
  movies: TmdbTodayItem[];
  tvShows: TmdbTodayItem[];
  fetchedAt: number;
};

let cache: TmdbToday | null = null;
const TTL_MS = 3_600_000; // 1 hour

async function fetchTmdbPage(
  endpoint: string,
  kind: "movie" | "tv",
): Promise<TmdbTodayItem[]> {
  if (!config.tmdbApiKey || !config.tmdbApiBase) return [];

  const params = new URLSearchParams({
    api_key: config.tmdbApiKey,
    language: "is-IS",
    region: "IS",
  });

  try {
    const response = await fetch(
      `${config.tmdbApiBase}/${endpoint}?${params}`,
      { signal: AbortSignal.timeout(15_000) },
    );
    if (!response.ok) return [];

    const payload = (await response.json()) as {
      results?: {
        id: number;
        title?: string;
        name?: string;
        poster_path?: string | null;
        backdrop_path?: string | null;
        release_date?: string;
        first_air_date?: string;
        vote_average?: number;
        overview?: string;
      }[];
    };

    return (payload.results ?? []).slice(0, 20).map((item) => ({
      id: item.id,
      title: item.title ?? item.name ?? "",
      posterPath: item.poster_path && config.tmdbImageBase
        ? `${config.tmdbImageBase}${item.poster_path}`
        : "",
      backdropPath: item.backdrop_path && config.tmdbImageBase
        ? `${config.tmdbImageBase.replace(/w500$/, "w1280")}${item.backdrop_path}`
        : "",
      date: item.release_date ?? item.first_air_date ?? "",
      rating: typeof item.vote_average === "number" && item.vote_average > 0
        ? item.vote_average
        : null,
      overview: item.overview ?? "",
      kind,
    }));
  } catch {
    return [];
  }
}

export async function getTmdbToday(): Promise<TmdbToday> {
  if (cache && Date.now() - cache.fetchedAt < TTL_MS) return cache;

  const [movies, tvShows] = await Promise.all([
    fetchTmdbPage("movie/now_playing", "movie"),
    fetchTmdbPage("tv/airing_today", "tv"),
  ]);

  cache = { movies, tvShows, fetchedAt: Date.now() };
  return cache;
}
