---
id: TASK-030
title: "Index and clean public torrents"
status: review
priority: high
assignee: "Main"
epic: ""
created: "2026-07-13"
updated: "2026-07-13"
---

# TASK-030: Index and clean public torrents

## Context

Ingest broad public movie/TV torrent metadata into the authoritative SQLite database so it can pass through the same evidence-backed title cleaning and TMDB enrichment used for Deildu.

## Done

- [x] Ordered migration creates public torrent and scrape-run tables.
- [x] Knaben adapter fetches bounded movie/TV pages with unsafe and XXX filtering.
- [x] Ingest validates and deduplicates records by infohash, then upserts transactionally.
- [x] Public records reuse deterministic title validation, LLM fallback, and TMDB enrichment behavior.
- [x] Upstream failure preserves the last healthy catalog and records the failed run.
- [x] Focused tests cover normalization, deduplication, transactional persistence, and cleaning.

## Subtasks

- [x] SUB-001 Add schema and source configuration
- [x] SUB-002 Implement public index scraper
- [x] SUB-003 Reuse cleanup and enrichment pipeline
- [x] SUB-004 Add focused behavioral tests

## Notes

Live source probe selected Knaben as the primary aggregator. A filtered 300-row movie/TV request returned 300 hashes across TPB, 1337x, YTS, RuTracker, and Nyaa. This task indexes metadata only; playback promotion is out of scope.

Titan-only live smoke test: one 50-row Knaben page yielded 48 unique movie/TV
hashes from four sources; 44 cleaned deterministically, four entered review,
the scrape run completed without error, and SQLite integrity was `ok`.
No TV runtime, service, playback, or database was touched.
