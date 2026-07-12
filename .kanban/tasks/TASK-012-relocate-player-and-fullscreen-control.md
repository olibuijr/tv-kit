---
id: TASK-012
title: "Remove page player and dock fullscreen on the mobile player"
status: todo
priority: medium
assignee: ""
epic: ""
created: "2026-07-12"
updated: "2026-07-12"
---

# TASK-012: Remove page player and dock fullscreen on the mobile player

## Context

The player should not occupy the main Heim page or the other content pages. Playback controls should remain on the tablet's global player, with fullscreen available there directly above the remote navigation bar.

## Done

- [ ] The player UI is removed from Heim and all other TV dashboard content pages without stopping active playback.
- [ ] The tablet remote retains one global player docked at the bottom immediately above the navigation bar.
- [ ] The fullscreen button is moved into that mobile global player and removed from its previous location.
- [ ] The docked player and fullscreen control remain visible and usable across every tablet tab without obscuring page content or the navigation bar.
- [ ] Fullscreen state continues through the existing server-authoritative WebSocket command/state flow and remains synchronized with the TV.
- [ ] Safe-area insets, narrow tablet layouts, keyboard focus, and reduced-motion preferences are handled.
- [ ] Automated checks cover persistent playback across page changes and fullscreen toggling; `tvctl kit check` passes.
- [ ] Tablet browser and physical-TV verification confirm placement, page clearance, fullscreen entry/exit, and uninterrupted playback.

## Subtasks

- [ ] SUB-001 Remove the dashboard page-level player presentation without changing playback ownership.
- [ ] SUB-002 Dock the tablet global player above the bottom navigation.
- [ ] SUB-003 Move and verify the fullscreen control in the docked mobile player.

## Notes

Reuse the existing player state and `fullscreen` command. Do not introduce another player instance or client-side playback state.
