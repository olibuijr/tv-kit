---
id: TASK-011
title: "Make the video OSD adaptive and remotely toggleable"
status: todo
priority: medium
assignee: ""
epic: ""
created: "2026-07-12"
updated: "2026-07-12"
---

# TASK-011: Make the video OSD adaptive and remotely toggleable

## Context

The video-player OSD text must remain readable over both light and dark video. During playback it should leave the screen automatically, while the tablet remote provides an explicit way to show or close it.

## Done

- [ ] OSD text and icons maintain accessible contrast over representative light, dark, and mixed video backgrounds without obscuring more video than necessary.
- [ ] The OSD smoothly slides down and out after 10 seconds of continuous playback.
- [ ] The hide timer starts or resets when playback starts, the station/media changes, or the OSD is reopened, and does not incorrectly expire while playback is paused.
- [ ] The tablet remote has a subtitles-icon button that toggles the OSD open and closed through the existing WebSocket command/state flow.
- [ ] The TV dashboard remains display-only and exposes no clickable OSD control.
- [ ] OSD visibility is server-authoritative and remains consistent between the tablet and TV after reconnects.
- [ ] Enter and exit motion respects the reduced-motion preference.
- [ ] Automated checks cover light/dark contrast styling, the 10-second lifecycle, timer reset, and remote toggle; `tvctl kit check` passes.
- [ ] Physical-TV and tablet browser verification confirm contrast, timing, slide motion, and open/close behavior during real video playback.

## Subtasks

- [ ] SUB-001 Add adaptive contrast styling to the existing video OSD.
- [ ] SUB-002 Add the playback-aware 10-second visibility lifecycle.
- [ ] SUB-003 Add the tablet subtitles-icon toggle using the existing command protocol.
- [ ] SUB-004 Verify behavior over light and dark video on both devices.

## Notes

Reuse the existing OSD, player state, and `player-panel`/subtitle command patterns. Do not add a second overlay or client-only visibility state.
