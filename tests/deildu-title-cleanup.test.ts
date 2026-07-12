import { expect, test } from "bun:test";
import { validateDeilduTitleCleanup } from "../apps/server/src/deilduTitleCleanup";

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

test("routes hallucinated and truncated metadata to review", () => {
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
		status: "review",
		reasons: ["truncated_source"],
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
