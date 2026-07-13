---
id: TASK-020
title: "Add a typed Pi extension for fast TV operations"
status: review
priority: high
assignee: "Codex"
epic: ""
created: "2026-07-13"
updated: "2026-07-13"
---

# TASK-020: Add a typed Pi extension for fast TV operations

## Context

Repeated TV work currently spends agent turns rediscovering and composing shell
commands, while two installed copies of `tvctl` have drifted apart.

## Done

- [x] A project-local Pi extension exposes bounded typed tools over the maintained `tvctl` CLI.
- [x] The extension contains no duplicate SSH, SQLite, WebSocket, or mpv implementation.
- [x] One canonical CLI supplies both the normal executable and skill compatibility entrypoint.
- [x] `tvctl` has a fast structured snapshot command and no duplicate command dispatch branches.
- [x] TV skills contain concise policy and routing guidance instead of copied command documentation.
- [x] Extension, CLI, and skill validation pass without mutating TV playback.

## Subtasks

- [x] SUB-001 Implement the thin extension and structured CLI snapshot.
- [x] SUB-002 Canonicalize the installed CLI entrypoints and clean skill docs.
- [x] SUB-003 Run local and read-only live checks.

## Notes

- Do not deploy or restart TV Kit while the user wants playback uninterrupted.
- Pi loaded the extension globally and project-locally without module or duplicate-tool errors.
- `tvctl snapshot` returned valid JSON in about 1.16 seconds while direct mpv remained the only player process.
- Both skills passed `quick_validate.py`; 31 Bun tests, TypeScript, and Svelte error checks passed.
