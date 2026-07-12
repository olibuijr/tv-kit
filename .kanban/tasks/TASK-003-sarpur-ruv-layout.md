---
id: TASK-003
title: "Match Sarpur dashboard to RÚV TV catalog layout"
status: in-progress
priority: medium
assignee: "pi"
epic: ""
created: "2026-07-12"
updated: "2026-07-12"
---

# TASK-003: Match Sarpur dashboard to RÚV TV catalog layout

## Context

Rework the TV dashboard Sarpur page to use the RÚV sjónvarp page's featured hero,
horizontal rails, category sections, and readable large-screen card treatment,
while rendering TV Kit's database-backed RÚV data.

## Done

- [ ] Dashboard Sarpur uses a featured hero and horizontal content rails.
- [ ] Category rails derive from TV Kit RÚV program data without fixture content.
- [ ] Large-screen typography and image treatment remain readable and scrollbar-free.
- [ ] TV-local checks pass and the deployed dashboard is browser-verified.

## Subtasks

- [x] SUB-001 Inspect RÚV DOM/layout and existing Sarpur data flow.
- [ ] SUB-002 Implement the dashboard Sarpur catalog layout.
- [ ] SUB-003 Run checks, deploy, and verify the dashboard visually.

## Notes

- RÚV uses a 1050px centered hero followed by full-width horizontal rails with 192px cards and 32px gaps; TV Kit will preserve that structure with larger dashboard sizing.
