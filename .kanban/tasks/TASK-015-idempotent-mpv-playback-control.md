---
id: TASK-015
title: "Make torrent playback control idempotent and prefer mpv"
status: review
priority: high
assignee: "Codex"
epic: ""
created: "2026-07-12"
updated: "2026-07-12"
---

# TASK-015: Make torrent playback control idempotent and prefer mpv

## Context

Deildu playback silently fell back to Chrome while mpv was still connecting, and `tvctl playback stop` toggled state rather than setting it.

## Done

- [x] Torrent playback waits for mpv startup before selecting an engine.
- [x] Playback engine remains explicit in persisted state and CLI output.
- [x] `tvctl kit playback stop|play` sets the requested state idempotently.
- [x] Checks pass and playback is verified on the TV.

## Subtasks

- [x] SUB-001 Implement, deploy, and verify the playback fixes.

## Notes

Chrome HLS playback was contained by stopping `tv-kiosk.service`; playback state was cleared after restarting the wedged server.

Verified Hildur S01E04 on the physical TV with `engine=mpv`; playback advanced from 0.7s to 41.4s. Lifecycle cleanup leaves one mpv and removes stale Chrome, aria2, and tvctl verifier processes on restart/deploy.
