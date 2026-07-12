---
id: TASK-008
title: "Show scheduled-task progress notifications on TV and tablet"
status: todo
priority: medium
assignee: ""
epic: ""
created: "2026-07-12"
updated: "2026-07-12"
---

# TASK-008: Show scheduled-task progress notifications on TV and tablet

## Context

Make active scheduled work visible without opening another view. Reuse the existing scheduled-task card and authoritative server state rather than creating separate client-side task state.

## Done

- [ ] A passive notification widget appears in the lower-right corner of both the TV dashboard and tablet remote while a scheduled task is running.
- [ ] The widget renders the same task card content and live progress shown by the existing scheduled-task UI.
- [ ] The widget smoothly slides up when work starts and smoothly slides down when it finishes, including tasks already running when a client connects or reconnects.
- [ ] Multiple or sequential task updates do not create duplicate cards or stale notifications.
- [ ] The TV widget remains display-only; the tablet widget introduces no task controls unless they already exist on the reused card.
- [ ] Motion respects the client's reduced-motion preference.
- [ ] Automated checks cover running, progress-update, completion, and reconnect state; `tvctl kit check` passes.
- [ ] Browser verification confirms placement, content, and enter/exit transitions on both TV and tablet without obscuring existing bottom-docked UI.

## Subtasks

- [ ] SUB-001 Reuse the scheduled-task progress card in a shared notification surface.
- [ ] SUB-002 Mount and style the notification surface in both clients.
- [ ] SUB-003 Verify lifecycle, reconnect behavior, animation, and layout.

## Notes

Keep SQLite/tvserverd as the source of truth and use the existing WebSocket state flow. Do not duplicate scheduled-task state in either client.
