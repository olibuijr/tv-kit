---
id: TASK-018
title: "Add fast secret-safe Deildu CLI queries"
status: review
priority: medium
assignee: "Codex"
epic: ""
created: "2026-07-13"
updated: "2026-07-13"
---

# TASK-018: Add fast secret-safe Deildu CLI queries

## Context

Agents needed quick catalog, row, link, and torrent-file discovery without bespoke SQLite/shell commands or leaking passkey-bearing tracker URLs.

## Done

- [x] `tvctl deildu search QUERY` returns bounded catalog JSON.
- [x] `tvctl deildu item ID` returns one joined catalog/download row.
- [x] `tvctl deildu links ID` returns safe public/local links and redacts the authenticated download URL.
- [x] `tvctl deildu files ID` lists safe torrent metadata while removing announce and magnet secrets.
- [x] Both maintained CLI copies pass `bash -n` and live read-only queries succeed.
- [x] Both TV skills and the shared agent tool index document the commands.

## Subtasks

- [x] SUB-001 Implement, secure, document, and validate Deildu queries.

## Notes

Validated against Hildur S01E06 (`1214359`) while pure-mpv playback continued uninterrupted.
