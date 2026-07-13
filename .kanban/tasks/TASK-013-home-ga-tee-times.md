---
id: TASK-013
title: "Show today's GA tee-time availability on Heim"
status: review
priority: high
assignee: "pi"
epic: ""
created: "2026-07-12"
updated: "2026-07-12"
---

# TASK-013: Show today's GA tee-time availability on Heim

## Context

Use the public Rastimar/Supabase endpoint documented in `olibuijr/golfkort` to show today's free tee times for Golfklúbbur Akureyrar on both TV Kit home surfaces.

## Done

- [x] The server fetches and validates today's Jaðarsvöllur availability using protected environment configuration.
- [x] Existing cached data is preserved when the upstream request fails.
- [x] The TV dashboard home renders a passive Icelandic tee-time widget.
- [x] The tablet remote home renders the same server-backed availability without a second source of truth.
- [x] LSP diagnostics, TV sync, service/WebSocket verification, and scheduled-task data verification pass.

## Subtasks

- [x] SUB-001 Inspect the golfkort endpoint contract and TV Kit home data flow.
- [x] SUB-002 Implement the shared server-backed read model and both widgets.
- [x] SUB-003 Verify and deploy on TV.

## Notes

Golfkort documents `course_available_slot` as aggregated rows (`course_id`, `date`, `slot`, `count`) from the public Rastimar API. Non-secret GolfBox task values live in SQLite; credentials live only in protected `.env` files. The deployed scheduled task found Agnes Jónsdóttir at 11:00 on July 13 and 14. Visual home-page review can occur after Hildur playback without changing TV state.
