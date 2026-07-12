---
id: TASK-005
title: "Add schedules mock to agent chat"
status: in-progress
priority: high
assignee: "pi"
epic: ""
created: "2026-07-12"
updated: "2026-07-12"
---

# TASK-005: Add schedules mock to agent chat

## Context

Prototype a polished Schedules page inside TV Kit chat for natural-language and script jobs, recurring intervals, and manual one-off runs.

## Done

- [x] Chat has a Schedules view with empty/list states.
- [x] Accessible modal creates script or natural-language mock jobs.
- [x] Mock jobs can be run, paused, resumed, and removed locally.
- [x] TV-local checks pass and the deployed remote is browser-verified.

## Subtasks

- [x] SUB-001 Build the one-file mock UI.
- [x] SUB-002 Check, deploy, and browser-verify.

## Notes

- Mock state is intentionally in-memory; persistence and execution are out of scope.
- Added a requested one-run Titan LLM batch demo for cleaning 403 filenames with animated progress.
- `tvctl kit check`: 21 tests, 0 failures, 0 Svelte errors/warnings.
- Browser verified schedules navigation and modal; screenshot: `/tmp/tv-kit-schedules-mock.png`.
