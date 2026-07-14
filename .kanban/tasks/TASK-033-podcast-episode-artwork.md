---
id: TASK-033
title: "Show podcast episode artwork"
status: in-progress
priority: medium
assignee: "Main"
epic: ""
created: "2026-07-14"
updated: "2026-07-14"
---

# TASK-033: Show podcast episode artwork

## Context

RÚV publishes distinct artwork for each Í ljósi sögunnar episode; the Hlaðvörp pages currently repeat the series cover.

## Done

- [ ] Podcast sync reads episode-specific artwork from RÚV's public series metadata.
- [ ] Episode artwork persists in the existing SQLite podcast episode rows.
- [ ] Native TV Frame episode cards display their own artwork.
- [ ] Tablet remote episode cards display their own artwork.
- [ ] Production screenshot verifies distinct episode images.

## Subtasks

- [ ] SUB-001 RÚV metadata parsing and sync
- [ ] SUB-002 Native and remote card layouts
- [ ] SUB-003 Production verification

## Notes

RÚV embeds normalized `Episode:<id>` records with `title`, `firstrun`, and `image` in the public `window.__APOLLO_STATE__` payload on the series page.
