---
id: TASK-014
title: "Persist and resume Deildu playback position"
status: review
priority: high
assignee: "pi"
epic: ""
created: "2026-07-12"
updated: "2026-07-12"
---

# TASK-014: Persist and resume Deildu playback position

## Context

Store the real mpv position for Deildu items so playback resumes from the same place whether started from Heim or Deildu. Do not interrupt the currently playing TV session while implementing.

## Done

- [x] An ordered migration adds playback position/duration fields to `deildu_items`.
- [x] One shared validated DB function persists real player updates.
- [x] `playDeilduItem` restores the saved position and mpv seeks after loading.
- [x] LSP diagnostics pass; no new media-fixture tests were added per user direction.
- [x] Deployed and verified against real Hildur S01E04 playback.

## Subtasks

- [x] SUB-001 Add schema and shared persistence function.
- [x] SUB-002 Restore position through the shared Deildu playback path.
- [x] SUB-003 Validate, deploy, and verify resume with real media.

## Notes

All Heim/Deildu playback commands converge on `playDeilduItem`. Verified Hildur S01E04 playing with real pixels; SQLite advanced from 28.9s while playback continued.
