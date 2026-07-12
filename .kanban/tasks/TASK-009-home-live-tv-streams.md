---
id: TASK-009
title: "Show live TV station streams on Heim"
status: todo
priority: medium
assignee: ""
epic: ""
created: "2026-07-12"
updated: "2026-07-12"
---

# TASK-009: Show live TV station streams on Heim

## Context

The main Heim view and its TV-station pages should display each station's actual live stream instead of a placeholder or static preview.

## Done

- [ ] TV-station surfaces on the main Heim view render the corresponding station's real live stream.
- [ ] Each station page renders the correct live stream and stays synchronized with the selected station.
- [ ] Stream URLs and station metadata come from the existing SQLite/server state; no station data is hardcoded in either client.
- [ ] Changing station or leaving the page stops and cleans up the previous stream without duplicate playback.
- [ ] Loading, unavailable-stream, and playback-error states are shown honestly without inventing content.
- [ ] Playback follows the existing TV Kit autoplay, audio, and global-player behavior rather than introducing a second player state.
- [ ] Automated checks cover station selection, stream switching, and failure handling; `tvctl kit check` passes.
- [ ] Browser and physical-TV verification confirm that the expected live video appears on Heim and each station page.

## Subtasks

- [ ] SUB-001 Connect Heim station surfaces to the existing live-stream player and server state.
- [ ] SUB-002 Add stream lifecycle and honest fallback handling.
- [ ] SUB-003 Verify each configured station on the running TV UI.

## Notes

Reuse the existing player and station records. Do not add a parallel playback implementation.
