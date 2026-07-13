---
id: TASK-029
title: "Native TV Frame port: retire Chrome kiosk, mpv-only playback"
status: review
priority: high
assignee: "claude"
epic: ""
created: "2026-07-13"
updated: "2026-07-13"
---

# TASK-029: Native TV Frame port: retire Chrome kiosk, mpv-only playback

## Context

Replace the Chrome kiosk + Svelte dashboard with the native Qt/QML TV Frame
(apps/tv-frame) and route all playback through tvserverd-owned mpv.

## Done

- [x] tvctl builds the frame on Titan only (`kit frame build/test/deploy/push`); TV keeps Qt runtime libs, no compilers
- [x] All playback paths (RÚV live, Sarpurinn, radio, torrents, cast) set `engine:"mpv"`; browser fallback + probe code removed; live radio/TV resumes after daemon restart
- [x] mpv flags fixed for v0.41 (`--focus-on=never`) and fullscreen-on-top under the frame
- [x] QML views ported: home, tv, radio, media, deildu, news + PlayerHud + Stremio-style LoadingOverlay (pulsing fill title, peers/speed/% from `media.transfer` + `media.buffering`)
- [x] Kiosk retired: tv-kiosk/tv-dashboard units deleted (repo + TV), apps/dashboard removed, tvctl arrays/health/snapshot updated, `kit press` removed
- [x] `TV_ALLOWED_ORIGINS` now carries the frame origin `http://127.0.0.1:3110`
- [x] Docs: AGENTS.md rewritten for the frame; `.pi/skills/tv-frame-ui` index + per-page references created
- [x] Verified: 33 bun tests, tsc, svelte-check, ctest pass; `kit verify` green; all six views screenshot-verified with live DB data; remote-origin WS command changes the frame view (health file + /health state)

## Notes

- Playback verification of a fresh torrent through the new overlay still worth
  one cold-start run (HotD S03E04 aria2 download was ~94% at port time).
- Reviewer: check `tvctl kit frame deploy` end-to-end from a clean TV state.
