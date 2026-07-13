---
id: TASK-023
title: "Document Deildu catalog cleanup and two-client verification rules"
status: review
priority: high
assignee: "root"
epic: ""
created: "2026-07-13"
updated: "2026-07-13"
---

# TASK-023: Document Deildu catalog cleanup and two-client verification rules

## Context

Recent live cleanup showed that an optional LLM outage could leave older DB rows unprocessed, and dashboard polling can briefly lag a completed remote-triggered data job.

## Done

- [x] Engineering rules specify the DB-first cleaner, safe fallback, and review boundary.
- [x] Rules require completion and remote/dashboard verification for background catalog jobs.
- [x] Updated guidance is checked against the live Deildu run.

## Subtasks

- [x] SUB-001 Record durable operational lessons from the live cleanup.

## Notes

- Verified 2026-07-13 against the live completed run: remote and dashboard both reported `1059 Deildu-færslur uppfærðar` and displayed normalized titles such as `Rick and Morty`; `tvctl kit verify` passed all health and WebSocket checks.
