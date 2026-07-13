import { expect, test } from "bun:test";
import { cleanupCandidateFromRelease } from "../apps/server/src/deilduCleanupJob";
import { validateDeilduTitleCleanup } from "../apps/server/src/deilduTitleCleanup";

test("cleans standard release titles without the optional LLM", () => {
	expect(
		cleanupCandidateFromRelease({
			id: 1,
			original_title: "Rick and Morty S09E08 1080p WEB h264-EDITH",
			media_kind: "tv",
		}),
	).toEqual({
		id: 1,
		title: "Rick and Morty",
		season: 9,
		episode: 8,
		resolution: "1080p",
		year: undefined,
	});
	expect(
		cleanupCandidateFromRelease({
			id: 2,
			original_title: "Rick and Morty S09E08 1080p WEB (...)",
			media_kind: "tv",
		}),
	).toMatchObject({ title: "Rick and Morty", season: 9, episode: 8 });
	expect(
		cleanupCandidateFromRelease({
			id: 3,
			original_title: "The Sheep Detectives (2026) (1080p AMZN WEB-DL (...)",
			media_kind: "movie",
		}),
	).toMatchObject({ title: "The Sheep Detectives", year: 2026 });
	expect(
		cleanupCandidateFromRelease({
			id: 4,
			original_title: "HeimaeyS01E05 1080p mp4",
			media_kind: "tv",
		}),
	).toMatchObject({ title: "Heimaey", season: 1, episode: 5 });
	expect(
		cleanupCandidateFromRelease({
			id: 5,
			original_title: "The Secret Life Of Pets 2 Isl-taltexti(2019)1080p BRRip",
			media_kind: "movie",
		}),
	).toMatchObject({ title: "The Secret Life Of Pets 2", year: 2019 });
	expect(
		cleanupCandidateFromRelease({
			id: 6,
			original_title: "Love Island S13E41 1080P WEB-DL H264-RAWR",
			media_kind: "tv",
		}),
	).toMatchObject({ title: "Love Island", season: 13, episode: 41, resolution: "1080p" });
});

test("accepts evidence-backed movie and episode cleanup", () => {
	expect(
		validateDeilduTitleCleanup("Backrooms (2026) - TELESYNC", {
			title: "Backrooms",
			year: 2026,
		}),
	).toEqual({ status: "accept", reasons: [] });
	expect(
		validateDeilduTitleCleanup(
			"Agent Kim Reactivated S01E06 1080p WEB h264-EDITH",
			{
				title: "Agent Kim Reactivated",
				season: 1,
				episode: 6,
				resolution: "1080p",
			},
		),
	).toEqual({ status: "accept", reasons: [] });
});

test("rejects unusable titles at the batch boundary", () => {
	expect(
		validateDeilduTitleCleanup("Valid source", { title: "../../escape" })
			.status,
	).toBe("reject");
	expect(validateDeilduTitleCleanup("Valid source", { title: "" }).status).toBe(
		"reject",
	);
	expect(validateDeilduTitleCleanup("", { title: "Invented" }).status).toBe(
		"reject",
	);
});

test("routes hallucinated metadata to review but accepts an evidence-backed truncated prefix", () => {
	const hallucinated = validateDeilduTitleCleanup(
		"Backrooms (2026) - TELESYNC",
		{ title: "Backrooms", year: 1999, resolution: "2160p" },
	);
	expect(hallucinated.status).toBe("review");
	expect(hallucinated.reasons).toEqual([
		"unsupported_year",
		"unsupported_resolution",
	]);

	const truncated = validateDeilduTitleCleanup(
		"Mushoku Tensei S03E03 Life Back a (...)",
		{ title: "Mushoku Tensei", season: 3, episode: 3 },
	);
	expect(truncated).toEqual({
		status: "accept",
		reasons: [],
	});
});

test("routes impossible ranges and unsupported episode claims to review", () => {
	const result = validateDeilduTitleCleanup("Show S01E02 1080p", {
		title: "Show",
		year: 2099,
		season: 101,
		episode: 3,
		resolution: "720p",
	});
	expect(result.status).toBe("review");
	expect(result.reasons).toEqual([
		"invalid_year",
		"invalid_season",
		"unsupported_year",
		"unsupported_resolution",
		"unsupported_season",
		"unsupported_episode",
	]);
});
