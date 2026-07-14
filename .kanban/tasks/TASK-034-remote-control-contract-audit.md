---
id: TASK-034
title: "Audit tablet remote control coverage for native TV Frame"
status: review
priority: high
assignee: "Main"
epic: ""
created: "2026-07-14"
updated: "2026-07-14"
---

# TASK-034: Audit tablet remote control coverage for native TV Frame

## Context

Trace tablet remote controls through tvserverd to the native Qt/QML frame, repair missing or broken paths, and verify both clients against live state.

## Done

- [x] Every remote command is accepted by tvserverd and reflected by the native frame where applicable.
- [x] Missing controls and command/state mismatches are repaired without adding a second state store.
- [x] The tablet remote is exercised with native browser automation against the isolated Titan environment.
- [x] State-changing remote actions are cross-verified with TV playback state, frame health, or a physical screenshot.
- [x] Focused checks and the project verification command pass.

## Subtasks

- [x] SUB-001 Compare remote emitters, backend command handlers, state schema, and frame consumers.
- [x] SUB-002 Exercise remote controls and record runtime defects.
- [x] SUB-003 Implement and verify the smallest source fixes.

## Notes

The project Kanban CLI referenced by the newer skill is absent in this board version; this card follows the repository's file-based workflow.

- Fixed rejected `media-program` and `media-buffering` commands, persisted `mediaProgramId`, and synchronized Sarpur detail close state.
- Restored Sjónvarp navigation plus seek, volume, mute, stop, standby, and fullscreen controls on the remote.
- Wired server-authoritative volume, mute, rate, subtitle, and audio-track state into embedded mpv; frame reports discovered tracks.
- Repaired stale SQLite WAL contamination in `kit test deploy` and isolated TV-local test files in `kit check`.
- Evidence: `kit frame test` passed; local `bun test` passed 43/43; `kit check` passed 43/43 plus TypeScript/Svelte; `kit verify` passed HTTP, WebSocket, and service gates.
- Browser evidence: isolated volume 50→55, mute false→true, view media→tv; programme detail 0→35164→0; production controls restored to volume 50, unmuted, powered on, fullscreen off, view `tv`.
- TV evidence: `/tmp/tv-standby-verify.png`, `/tmp/tv-fullscreen-control.png`, `/tmp/tv-remote-final.png`; final frame health connected with view `tv`.
