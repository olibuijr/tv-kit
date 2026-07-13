---
id: TASK-025
title: "Preserve full Deildu titles and remove release-marker noise"
status: review
priority: high
assignee: "root"
epic: ""
created: "2026-07-13"
updated: "2026-07-13"
---

# TASK-025: Preserve full Deildu titles and remove release-marker noise

## Context

The whole-catalog audit found 638 release-noisy titles. Some are marked clean because the parser misses compact or parenthesized year/season/release-marker layouts; others retain scraper-truncated source text.

## Done

- [x] Browse scraper preserves the full source title where Deildu exposes it.
- [x] Cleaner removes supported release-marker layouts without inventing metadata.
- [x] Existing noisy rows are retried and the live full-table audit improves.

## Subtasks

- [x] SUB-001 Trace the browse title extraction and cleanup candidate boundary.

## Notes

- Scraper now prefers Deildu's `data-title`/`data-full-title` over the shortened display title. Cleaner handles parenthesized years, compact season/episode tokens, language flags, and uppercase release markers, and retries rows that are still visibly noisy even if previously marked clean.
- Live audit after the remote-triggered run: 6,662 / 6,987 rows cleaned; noisy release titles fell from 638 to 68. The remaining 68 are all unresolved/truncated `missing_model_output` rows without a deterministic marker, except one invalid year and one invalid title; they were not guessed.
- Targeted cleaner/parser tests and type/Svelte checks passed; `tvctl kit verify` passed. The full TV check retains three unrelated environment-state failures: GolfBox child timeout, missing Big Buck Bunny fixture bytes, and a duplicate Deildu test id.
