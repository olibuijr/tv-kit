export type CleanedDeilduTitle = {
	title: string;
	year?: number;
	season?: number;
	episode?: number;
	resolution?: "480p" | "720p" | "1080p" | "2160p";
};

export type CleanupValidation = {
	status: "accept" | "review" | "reject";
	reasons: string[];
};

const currentYear = new Date().getUTCFullYear();

export function validateDeilduTitleCleanup(
	original: string,
	candidate: CleanedDeilduTitle,
): CleanupValidation {
	const reasons: string[] = [];
	const title = candidate.title.trim();
	if (!title || title.length > 200 || /[\x00-\x1f/\\]/.test(title))
		return { status: "reject", reasons: ["invalid_title"] };
	if (!original.trim())
		return { status: "reject", reasons: ["missing_original"] };
	if (
		candidate.year &&
		(candidate.year < 1888 || candidate.year > currentYear + 2)
	)
		reasons.push("invalid_year");
	if (
		candidate.season !== undefined &&
		(candidate.season < 0 || candidate.season > 100)
	)
		reasons.push("invalid_season");
	if (
		candidate.episode !== undefined &&
		(candidate.episode < 0 || candidate.episode > 10_000)
	)
		reasons.push("invalid_episode");
	if (candidate.year && !original.includes(String(candidate.year)))
		reasons.push("unsupported_year");
	if (
		candidate.resolution &&
		!original.toLowerCase().includes(candidate.resolution)
	)
		reasons.push("unsupported_resolution");
	const seasonEpisode = [...original.matchAll(/s(\d{1,3})e(\d{1,5})/gi)];
	if (
		candidate.season !== undefined &&
		!seasonEpisode.some((match) => Number(match[1]) === candidate.season)
	)
		reasons.push("unsupported_season");
	if (
		candidate.episode !== undefined &&
		!seasonEpisode.some((match) => Number(match[2]) === candidate.episode)
	)
		reasons.push("unsupported_episode");
	return { status: reasons.length ? "review" : "accept", reasons };
}
