---
id: TASK-035
title: "Validate native pages, playback HUD, and track controls"
status: in-progress
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

- [ ] Every routed remote and frame page is reachable and presents a valid loading, empty, content, or error state.
- [ ] Playback HUD state and remote transport controls are verified against embedded mpv telemetry.
- [ ] Subtitle and audio-track discovery and selection are verified on real media.
- [ ] Confirmed defects are repaired without adding a client-side state store or a second player.
- [ ] Focused checks, project checks, frame health, and physical screenshots pass.

## Subtasks

- [ ] SUB-001 Inventory and exercise page routes on both clients.
- [ ] SUB-002 Exercise playback, HUD, seek, subtitles, audio, and fullscreen.
- [ ] SUB-003 Repair defects and add narrow regression coverage.
- [ ] SUB-004 Deploy and capture live evidence.

## Notes

The project Kanban CLI is absent in this board version; this card follows the repository file workflow.
