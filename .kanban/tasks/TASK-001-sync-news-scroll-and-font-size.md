---
id: TASK-001
title: "Sync news scrolling and restore readable article type"
status: in-progress
priority: medium
assignee: "pi"
epic: ""
created: "2026-07-12"
updated: "2026-07-12"
---

## Context

Scrolling Fréttir on the tablet remote should scroll the TV news page, and
article copy should follow the dashboard page typography scale.

## Done

- [x] Remote Fréttir scrolling is mirrored on the TV.
- [ ] News article images display without cropping.
- [ ] News article copy uses larger roles from each page typography scale.
- [ ] TV-local checks pass; user performs the visual review.

## Subtasks

- [x] SUB-001 Trace existing navigation/scroll command flow and shared typography.
- [x] SUB-002 Implement the smallest shared-state change.
- [x] SUB-003 Deploy and cross-verify remote-to-TV behavior.

## Notes

- Deployed with `tvctl kit sync`; 18 tests and Svelte checks pass.
- User confirmed synchronized scrolling works and requested manual visual review.
- Manual review found cropped images and article type still too small.
