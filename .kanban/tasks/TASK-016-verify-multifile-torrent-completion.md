---
id: TASK-016
title: "Verify multi-file torrent completion before playback"
status: in-progress
priority: high
assignee: "Codex"
epic: ""
created: "2026-07-13"
updated: "2026-07-13"
---

# TASK-016: Verify multi-file torrent completion before playback

## Context

Hildur S01E05 was falsely treated as ready because aria2 stores a multi-file torrent's control file beside the top-level torrent directory, not beside the selected media file. The sparse file was only 75% piece-valid and produced H.264 corruption, choppy video, and A/V drift.

## Done

- [x] Completion checks reject a selected file while its top-level `.aria2` control file exists.
- [x] HTTP serving and cached playback use the same completion check.
- [x] Automated coverage reproduces the multi-file control-file layout.
- [x] Local tests and TypeScript/Svelte checks pass.
- [ ] Deploy after active direct-mpv playback may be interrupted.
- [ ] Verify a repaired torrent resumes with zero decoder errors and advancing frames.

## Subtasks

- [x] SUB-001 Fix and test multi-file aria2 completion detection.
- [ ] SUB-002 Deploy and verify without interrupting active viewing.

## Notes

The integrity repair found only 75% valid pieces despite a full apparent file size and a DB status of `ready`. Direct mpv playback is intentionally left untouched; deployment is waiting for explicit permission.
