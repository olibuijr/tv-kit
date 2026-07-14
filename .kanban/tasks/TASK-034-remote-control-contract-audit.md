---
id: TASK-034
title: "Audit tablet remote control coverage for native TV Frame"
status: in-progress
priority: high
assignee: "Main"
epic: ""
created: "2026-07-14"
updated: "2026-07-14"
---

# TASK-034: Audit tablet remote control coverage for native TV Frame

## Context

Trace tablet remote controls through tvserverd to the native Qt/QML frame, repair missing or broken paths, and verify both clients against live state.

## Done

- [ ] Every remote command is accepted by tvserverd and reflected by the native frame where applicable.
- [ ] Missing controls and command/state mismatches are repaired without adding a second state store.
- [ ] The tablet remote is exercised with native browser automation against the isolated Titan environment.
- [ ] State-changing remote actions are cross-verified with TV playback state, frame health, or a physical screenshot.
- [ ] Focused checks and the project verification command pass.

## Subtasks

- [ ] SUB-001 Compare remote emitters, backend command handlers, state schema, and frame consumers.
- [ ] SUB-002 Exercise remote controls and record runtime defects.
- [ ] SUB-003 Implement and verify the smallest source fixes.

## Notes

The project Kanban CLI referenced by the newer skill is absent in this board version; this card follows the repository's file-based workflow.
