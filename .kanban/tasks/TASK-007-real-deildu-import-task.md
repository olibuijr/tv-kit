---
id: TASK-007
title: "Make Deildu import cleanup task real"
status: review
priority: high
assignee: "pi"
epic: ""
created: "2026-07-12"
updated: "2026-07-12"
---

# TASK-007: Make Deildu import cleanup task real

## Context

Replace the schedules mock with a real Deildu import pipeline using Titan title cleanup, validation, optional TMDB enrichment, and live UI progress.

## Done

- [x] Deildu import preserves source titles and runs validated Titan LLM cleanup in batches.
- [x] Accepted metadata is persisted; outliers remain queued with review reasons.
- [x] TMDB enrichment runs when protected environment configuration is present and is visibly deferred otherwise.
- [x] Schedules UI triggers the real task and polls live progress, counts, errors, and last-run state.
- [x] Migration and validation tests pass on TV.

## Notes

- Migration 13 adds `original_title`, `metadata`, `tmdb_id`, `cleanup_error`, and `cleaned_at`.
- Production verification reached the cleanup phase at `0 / 1061`; Titan service was restarted and verified ready.
- TMDB remains visibly deferred until `TMDB_API_KEY` and `TMDB_API_BASE` are added to the protected TV environment.
- `tvctl kit check`: 25 tests, 0 failures, 0 Svelte errors/warnings.
