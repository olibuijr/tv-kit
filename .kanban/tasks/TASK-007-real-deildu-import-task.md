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
- Production processed 746 imported rows in eight-item Titan batches. A later transient model outage left retryable rows behind.
- Titan model serving was restarted and verified ready on 2026-07-12.
- Cleanup now allows 2,048 output tokens per batch and retries `missing_model_output`, connection failures, and transient Titan HTTP failures instead of leaving those rows permanently stale.
- A fresh cleanup/enrichment run was triggered after deployment of the retry fix.
- TMDB remains visibly deferred until `TMDB_API_KEY` and `TMDB_API_BASE` are added to the protected TV environment.
- Latest full check: 25 tests, 0 failures, 0 Svelte errors, 1 warning.
