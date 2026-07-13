---
id: TASK-024
title: "Refresh dashboard Deildu content after scan completion"
status: review
priority: high
assignee: "root"
epic: ""
created: "2026-07-13"
updated: "2026-07-13"
---

# TASK-024: Refresh dashboard Deildu content after scan completion

## Context

The dashboard keeps its cached Deildu content until its periodic refresh even after a remote-triggered scan and cleanup finish.

## Done

- [x] Dashboard requests fresh Deildu content when the scan reaches a terminal state.
- [x] Existing periodic polling remains a fallback.
- [x] The change is deployed and verified from remote to dashboard.

## Subtasks

- [x] SUB-001 Trace the completion broadcast and dashboard state handler.

## Notes

- Server emits one `content-refresh` WebSocket event when Deildu scraping reaches a terminal state; dashboard and remote refetch DB-backed content with `cache: "no-store"`.
- Live remote-triggered scan completed 2026-07-13. The dashboard immediately displayed `1058 Deildu-færslur uppfærðar`, matching the terminal server broadcast.
- Follow-up: titles with a safe title prefix before a release marker are cleaned even if the source ends in `(...)`. Live catalog samples now show `House of the Dragon` and `Bobs Burgers` while preserving their original release titles.
