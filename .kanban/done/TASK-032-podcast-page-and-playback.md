---
id: TASK-032
title: "Add podcast page and playback"
status: done
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

- [x] Podcast catalog and episodes persist in SQLite and refresh from public RSS feeds.
- [x] Í ljósi sögunnar is the first listed podcast.
- [x] Tablet remote exposes a podcast page and can start an episode.
- [x] Native TV Frame renders the podcast page and plays podcast audio through embedded mpv.
- [x] Focused checks and end-to-end playback verification pass.

## Subtasks

- [x] SUB-001 Server catalog and playback
- [x] SUB-002 Native frame view
- [x] SUB-003 Tablet remote page

## Notes

Public source: RÚV RSS feed `https://www.ruv.is/rss/hladvarp/i-ljosi-sogunnar`, confirmed through Apple's public podcast lookup and direct RSS inspection.

Reviewer approved after the inherited-object-key validation fix. Production evidence: remote navigation opened Hlaðvörp; latest public episode started as `podcast-i-ljosi-sogunnar-357`; native mpv advanced from 9.01 s to 22.35 s with `status:\"ready\"`; frame health reported `view:\"podcasts\"`; physical screenshot `/tmp/tv-podcasts.png` showed the podcast artwork and latest episode grid. `tvctl kit verify`, frame build/ctest, TypeScript/Svelte checks, remote build, RSS parser test, migration test, and focused command/state tests passed. The full TV-local suite retained three unrelated baseline failures in GolfBox timeout and stateful torrent/Deildu fixtures.
