---
id: TASK-017
title: "Add direct mpv audio and subtitle track control"
status: review
priority: medium
assignee: "Codex"
epic: ""
created: "2026-07-13"
updated: "2026-07-13"
---

# TASK-017: Add direct mpv audio and subtitle track control

## Context

Agents needed a maintained, non-interrupting way to inspect and change tracks on either the direct mpv player or TV Kit's mpv process.

## Done

- [x] `tvctl mpv tracks` lists audio/subtitle tracks and current selections.
- [x] `tvctl mpv audio ID|auto|off` changes the audio selection over mpv IPC.
- [x] `tvctl mpv subtitle ID|auto|off` changes the subtitle selection over mpv IPC.
- [x] Both maintained CLI copies pass `bash -n` and the read-only command works against live playback.
- [x] The installed `tv-control` skill, project operations skill, and shared agent tool index document the commands.

## Subtasks

- [x] SUB-001 Implement and validate direct mpv track commands.

## Notes

The listing command was verified during uninterrupted Hildur S01E05 playback. It reported one selected English AAC stereo track and no subtitles.
