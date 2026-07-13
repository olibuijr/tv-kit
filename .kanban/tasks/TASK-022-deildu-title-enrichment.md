---
id: TASK-022
title: "Fix DB-backed Deildu title cleaning and enrichment"
status: review
priority: high
assignee: "root"
epic: ""
created: "2026-07-13"
updated: "2026-07-13"
---

# TASK-022: Fix DB-backed Deildu title cleaning and enrichment

## Context

Deildu catalog media rows still expose unclean release titles after the cleaner/enrichment process.

## Done

- [x] Root cause is evidenced from the live Deildu catalog and cleanup code.
- [x] Cleaner/enrichment persists usable DB-backed titles without corrupting valid records.
- [x] Checks and a live catalog verification pass.

## Subtasks

- [x] SUB-001 Trace catalog scrape, cleanup, and enrichment persistence.

## Notes

- Cause: cleanup depended entirely on the optional local LLM. When it was unavailable, batches failed and only IDs from the most recent scrape were selected, leaving older `ai_cleaned=0` rows unprocessed.
- Fix: deterministic release-name parsing now cleans eligible rows directly from SQLite, uses the LLM only for unresolved names, and retries transient LLM errors across the whole pending catalog. Validation still leaves truncated sources (`(...)`) for review rather than inventing a title.
- Live run 2026-07-13: 3,571 candidates examined; 1,059 rows updated; completion reported `Titlar hreinsaðir og TMDB gögn sótt`. `tvctl deildu search 'Rick and Morty S09E08'` confirmed normalized DB titles, and both remote and dashboard showed them after refresh.
