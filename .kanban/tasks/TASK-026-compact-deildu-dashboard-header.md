---
id: TASK-026
title: "Compact the TV dashboard Deildu header"
status: review
priority: medium
assignee: "root"
epic: ""
created: "2026-07-13"
updated: "2026-07-13"
---

# TASK-026: Compact the TV dashboard Deildu header

## Context

The selected-category dashboard view duplicates the category title and uses a full-width database-status banner above the media grid.

## Done

- [x] One compact passive header carries Deildu category, count, and scan status.
- [x] The selected-category grid has no duplicate title/banner above it.
- [x] TV dashboard visual verification confirms the reclaimed space.

## Subtasks

- [x] SUB-001 Review current TV Deildu layout and shared visual tokens.

## Notes

- Deployed 2026-07-13. The selected view now uses one 52px passive header: `DEILDU · Þættir · 2043 færslur` plus database/scan status. The media grid begins immediately below it; the duplicated selected-category section header is hidden.
- `bun run typecheck` and `tvctl kit verify` passed. Full `tvctl kit check` retains three unrelated environment-state failures: GolfBox timeout, missing Big Buck Bunny fixture bytes, and a duplicate Deildu test id.
