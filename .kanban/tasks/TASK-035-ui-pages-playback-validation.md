---
id: TASK-035
title: "Validate native pages, playback HUD, and track controls"
status: review
priority: high
assignee: "Main"
epic: ""
created: "2026-07-14"
updated: "2026-07-14"
---

# TASK-035: Validate native pages, playback HUD, and track controls

## Context

Exercise every tablet-remote and native-frame page, repair confirmed UI defects, and prove embedded playback, HUD, subtitle, and audio controls end to end.

## Done

- [x] Every routed remote and frame page is reachable and presents a valid loading, empty, content, or error state.
- [x] Playback HUD state and remote transport controls are verified against embedded mpv telemetry.
- [x] Subtitle and audio-track discovery and selection are verified on real RÚV and Deildu media.
- [x] Confirmed defects are repaired without adding a client-side state store or a second player.
- [x] Focused checks, project checks, frame health, and physical screenshots pass.

## Subtasks

- [x] SUB-001 Inventory and exercise page routes on both clients.
- [x] SUB-002 Exercise playback, HUD, seek, subtitles, audio, and fullscreen.
- [x] SUB-003 Repair defects and add narrow regression coverage.
- [x] SUB-004 Deploy and capture live evidence.

## Notes

The project Kanban CLI is absent in this board version; this card follows the repository file workflow.

- Added the missing tablet Sjónvarp page with two DB-backed channels, live/upcoming EPG, tune actions, favourites, responsive cards, and 24-hour Icelandic times.
- Repaired the unstyled componentized tablet header, server-view/tab synchronization after reload, and stale stopped-player controls.
- Repaired native HUD visibility: persistent on menu pages with selected media, transient over fullscreen video, and always visible under an OSD panel.
- Removed stale stopped-media copy from frame health and the home hero.
- RÚV evidence: embedded mpv advanced; `ice` subtitles rendered as physical pixels; audio `Hljóðrás 2` selection continued advancing; HUD and subtitle panel rendered together.
- Deildu evidence: one start of item `1220662` returned `engine:\"mpv\"`, `status:\"ready\"`, position `2.044`; later positions advanced through `17.226`, `90.757`, and `152.235`; real video pixels and `en-US` subtitles rendered; cleanup stopped playback and cleared source/fullscreen/panel.
- Page evidence: Agent Browser exercised Heim, Sjónvarp, Útvarp, Hlaðvörp, Deildu, Sarpur, Fréttir, and Spjall. Frame health independently confirmed all seven native views connected with the expected heading.
- Checks: `kit check` passed 43 tests with 0 failures and Svelte 0 errors; `kit frame test` passed 1/1; `kit verify` passed HTTP, WebSocket, and service gates.
- Screenshots: `/tmp/tv-remote-television-final.png`, `/tmp/tv-hud-repaired.png`, `/tmp/tv-subtitle-panel-repaired.png`, `/tmp/tv-subtitle-video-final.png`, `/tmp/tv-deildu-playback.png`, `/tmp/tv-deildu-subtitles.png`, `/tmp/tv-deildu-hud.png`, `/tmp/tv-pages-final-home-clean.png`.
