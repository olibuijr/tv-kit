---
id: TASK-032
title: "Add podcast page and playback"
status: in-progress
priority: medium
assignee: "Main"
epic: ""
created: "2026-07-14"
updated: "2026-07-14"
---

# TASK-032: Add podcast page and playback

## Context

Add a native TV podcast page and a tablet-remote navigation item backed by public podcast media.

## Done

- [ ] Podcast catalog and episodes persist in SQLite and refresh from public RSS feeds.
- [ ] Í ljósi sögunnar is the first listed podcast.
- [ ] Tablet remote exposes a podcast page and can start an episode.
- [ ] Native TV Frame renders the podcast page and plays podcast audio through embedded mpv.
- [ ] Focused checks and end-to-end playback verification pass.

## Subtasks

- [ ] SUB-001 Server catalog and playback
- [ ] SUB-002 Native frame view
- [ ] SUB-003 Tablet remote page

## Notes

Public source: RÚV RSS feed `https://www.ruv.is/rss/hladvarp/i-ljosi-sogunnar`, confirmed through Apple's public podcast lookup and direct RSS inspection.
