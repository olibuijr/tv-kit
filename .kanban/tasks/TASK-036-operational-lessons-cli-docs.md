---
id: TASK-036
title: "Apply UI playback lessons to docs, skills, and tvctl"
status: in-progress
priority: medium
assignee: "Main"
epic: ""
created: "2026-07-14"
updated: "2026-07-14"
---

# TASK-036: Apply UI playback lessons to docs, skills, and tvctl

## Context

Turn TASK-034/TASK-035 findings into accurate project documentation and a deterministic CLI verification path for future sessions.

## Done

- [ ] Native-frame and torrent-playback docs describe the current embedded-mpv architecture.
- [ ] Frame deployment waits for health written by the newly restarted frame rather than accepting a stale file.
- [ ] CLI regression tests defend the freshness contract.
- [ ] Focused checks and a live frame deploy prove the updated workflow.

## Subtasks

- [ ] SUB-001 Audit docs, project skills, extension routing, and tvctl.
- [ ] SUB-002 Update current architecture and verification guidance.
- [ ] SUB-003 Add and test a fresh-frame health gate.
- [ ] SUB-004 Deploy once and record evidence.

## Notes

The project Kanban CLI is absent in this board version; this card follows the repository file workflow.
