---
id: TASK-028
title: "Port the TV dashboard to a native Qt/QML frame"
status: in-progress
priority: high
assignee: "root"
epic: ""
created: "2026-07-13"
updated: "2026-07-13"
---

# TASK-028: Port the TV dashboard to a native Qt/QML frame

## Context

Chrome cannot reliably layer the existing dashboard OSD over native mpv on Wayland. Replace the kiosk dashboard client with a native Qt/QML display client that preserves the existing `tvserverd` API, WebSocket state, SQLite authority, and remote-only controls.

## Done

- [ ] A Qt/QML TV Frame connects to the existing dashboard WebSocket and renders shared state without a second store.
- [ ] Native views match the existing dashboard's display-only Home, TV, Radio, Sarpur, Deildu, and News behavior and visual hierarchy.
- [ ] Native mpv video and its OSD occupy one Wayland surface, so the player HUD remains visible during playback.
- [ ] The existing tablet remote remains the sole command surface and every state change is reflected in the native TV Frame.
- [ ] The Qt client is packaged as a TV user service, deployed by `tvctl kit sync`, and verified with a remote-to-TV playback test.

## Subtasks

- [ ] SUB-001 Define the native client protocol adapter and QML shell.
- [ ] SUB-002 Port display pages and content fetches 1:1 from the dashboard.
- [ ] SUB-003 Integrate libmpv/video rendering and native HUD into the QML scene.
- [ ] SUB-004 Install, deploy, and verify the frame from the tablet remote.

## Notes

- This is a client replacement, not a server/database rewrite. `tvserverd`, SQLite, and the web tablet remote remain authoritative.
- GlassNotes provides Qt 6/QML/KDE conventions, but the first frame deliberately avoids its expensive material pipeline on the TV hardware.
