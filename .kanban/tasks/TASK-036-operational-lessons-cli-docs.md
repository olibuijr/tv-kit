---
id: TASK-036
title: "Apply UI playback lessons to docs, skills, and tvctl"
status: review
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

- [x] Native-frame and torrent-playback docs describe the current embedded-mpv architecture.
- [x] Frame deployment waits for health written by the newly restarted frame rather than accepting a stale file.
- [x] CLI regression tests defend the freshness contract.
- [x] Focused checks and a live frame deploy prove the updated workflow.

## Subtasks

- [x] SUB-001 Audit docs, project skills, extension routing, and tvctl.
- [x] SUB-002 Update current architecture and verification guidance.
- [x] SUB-003 Add and test a fresh-frame health gate.
- [x] SUB-004 Deploy once and record evidence.

## Notes

The project Kanban CLI is absent in this board version; this card follows the repository file workflow.

## Review handoff

- Architecture and verification guidance corrected in `AGENTS.md`, `docs/AI_AGENT_TOOLS.md`, `.pi/skills/tv-kit-operations/SKILL.md`, `.pi/skills/tv-kit-operations/references/torrent-playback.md`, and the relevant `.pi/skills/tv-frame-ui/references/`.
- `tools/frame-health-check.ts` is the shared validator. Following independent review, `tools/tvctl` now requires the old frame to stop, removes its health file, records the boundary from the TV clock, and waits up to 20 seconds for both new-frame timestamps to meet it.
- `bun test tests/tvctl.test.ts`: 4 passed, 0 failed. The freshness regression distinguishes old-process evidence from new-frame health.
- `tvctl kit check` after sync: 44 passed, 0 failed; Svelte check 0 errors and 54 pre-existing warnings.
- Live `tvctl kit frame deploy "Enforce fresh native-frame deploy health"` completed in 5.61 seconds through the new gate. Physical evidence: `tv-frame-verify-20260714-151440.png`, connected Home view with populated content.
- Forced stale fixture exits 1 with `tvctl: native-frame health failed: frame health updatedAt predates frame restart`.
- `tvctl kit verify`: HTTP health, WebSocket ping/pong, and enabled/active services passed. Final `tvctl kit frame health`: connected, `view:"home"`, fresh timestamps, and `Tengt`.
- Independent review found and blocked a race in the first implementation: recording the boundary before stopping the old frame allowed a later old-process write to qualify. The corrected ordering above removes that race and will be independently re-reviewed after live verification.
