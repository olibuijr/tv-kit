---
id: TASK-019
title: "Refresh TV Kit runtime and playback documentation"
status: review
priority: medium
assignee: "Codex"
epic: ""
created: "2026-07-13"
updated: "2026-07-13"
---

# TASK-019: Refresh TV Kit runtime and playback documentation

## Context

The Markdown docs still described eager idle mpv startup and automatic Chrome torrent playback, and did not capture the multi-file aria2 completion incident or new secret-safe CLI commands.

## Done

- [x] Add a root README with architecture, commands, uninterrupted-viewing, and verification entry points.
- [x] Update AGENTS with on-demand mpv, correct multi-file `.aria2` semantics, direct maintenance mode, unique remote identities, and click-only GolfBox loading.
- [x] Align the shared agent tool index and torrent playback reference with mpv-default behavior.
- [x] Document `tvctl mpv` track controls and secret-safe `tvctl deildu` queries across both TV skills.
- [x] Remove stale browser-default and idle-mpv guidance from active Markdown docs.

## Subtasks

- [x] SUB-001 Audit and update active TV Kit Markdown documentation.

## Notes

Documentation-only work was completed while Hildur S01E06 continued in direct mpv. No deploy or runtime mutation occurred.
