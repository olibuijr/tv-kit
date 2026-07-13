---
id: TASK-021
title: "Make TV Kit agent conversation memory reliable"
status: in-progress
priority: high
assignee: "Codex"
epic: ""
created: "2026-07-13"
updated: "2026-07-13"
---

# TASK-021: Make TV Kit agent conversation memory reliable

## Context

The remote agent chat stores rows in SQLite but follow-up messages do not
reliably use prior turns. This is a follow-up to TASK-002.

## Done

- [x] Completed user/assistant turns are persisted and reconstructed in chronological order.
- [x] Stored assistant envelopes are normalized into useful conversational context.
- [x] Incomplete failed requests do not corrupt the next model conversation.
- [x] A test proves a follow-up model request receives the prior completed turn.
- [x] Local tests and typechecks pass without interrupting active playback.
- [ ] Deployment and live two-turn verification are completed when playback may be interrupted.

## Subtasks

- [x] SUB-001 Diagnose persisted rows and model request construction.
- [x] SUB-002 Implement the smallest server-side memory fix.
- [x] SUB-003 Test locally and hand off deployment safely.

## Notes

- Existing production rows confirm SQLite persistence, but recent failed requests left three consecutive user-only rows.
- Successful turns now commit user and assistant rows in one SQLite transaction.
- Legacy incomplete rows remain preserved in SQLite but are excluded from UI/model history.
- The full suite passes: 33 tests, TypeScript, and Svelte checks with zero errors.
- Deployment remains pending because `tvctl kit sync` intentionally kills the active direct mpv process.
