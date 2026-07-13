---
id: TASK-027
title: "Build Deildu show detail views and archive-aware episode playback"
status: in-progress
priority: high
assignee: "root"
epic: ""
created: "2026-07-13"
updated: "2026-07-13"
---

# TASK-027: Build Deildu show detail views and archive-aware episode playback

## Context

The series catalog currently exposes release-level cards. Viewers need one enriched show card, a clear show detail experience, stable season and episode order, and simple playback that selects the highest-seeder compatible release, including full-season torrents.

## Done

- [x] Series entries are grouped into one enriched show card in the \"Þættir\" catalog.
- [x] Remote and dashboard show a media detail surface with artwork, metadata, sorted seasons, and sorted episodes.
- [x] The remote exposes only a Play action for an episode; release selection stays server-side.
- [x] Multi-file season torrents select the matching `SxxEyy` file when present, or the first sortable episode for a season pack.
- [x] The feature is checked, deployed, and cross-verified from remote to dashboard.
- [x] Detail views surface stored plot and rating metadata, with two-column episode lists.
- [ ] Native torrent playback keeps the dashboard OSD visible and exits mpv on stop.

## Subtasks

- [x] SUB-001 Map catalog metadata and existing torrent file-selection behavior.
- [x] SUB-002 Add server grouping and archive-aware playback selection.
- [x] SUB-003 Build responsive show catalog and detail UI.
- [x] SUB-004 Deploy and verify with the remote and dashboard.

## Notes

- No database reset is permitted. Prefer a derived SQLite-backed catalog representation; use an ordered migration only if persistent fields prove necessary.
- Deployed 2026-07-13. The catalog is derived from authoritative `deildu_items` rows, so no migration or database reset was required.
- Verified from the tablet remote: opened Deildu, opened Love Island, and observed Series 13 in episode order with only Play actions. The dashboard DOM and screenshots reflected the same selected-show detail.
- Episode cards now show the enriched artwork for every episode, falling back to the show poster when the catalog has no episode-specific still.
- Reopened to improve TV-distance typography, repair detail hero artwork, and put the latest season first.
- The hero now selects enriched art from any release in the show group rather than relying on the top-seeded release. Latest season is the primary section and older seasons follow in descending order. Remote and dashboard screenshots verified the larger text and repaired artwork.
- Reopened to compose the detail as a split episode-and-poster layout over a widescreen artwork backdrop.
- The split detail now uses a TMDB backdrop separately from the portrait poster and shows stored year, rating, vote count, season count, episode count, and plot when upstream metadata supplies it. Episode lists use two columns on the remote and TV dashboard. Watch progress is derived from persisted unfinished Deildu playback and renders as a line at the base of the show poster.
- Reopened after House of the Dragon S03E01 exposed an idle fullscreen mpv window covering the Chrome OSD and repeated progressive-stream rebuffering.
