---
id: TASK-031
title: "Deploy isolated Titan test environment"
status: in-progress
priority: high
assignee: "Main"
epic: ""
created: "2026-07-13"
updated: "2026-07-13"
---

# TASK-031: Deploy isolated Titan test environment

## Context

Provide a repeatable TV Kit test deployment on Titan (`192.168.1.10`) using a transactionally consistent clone of the TV's authoritative SQLite database. The test runtime must use isolated ports, paths, and services and must not interrupt TV playback or mutate the TV database.

## Done

- [ ] `tvctl kit test deploy` clones the live TV database safely and starts isolated Titan server and remote services.
- [ ] Test services use dedicated ports, app home, database, torrent directory, and systemd unit names.
- [ ] Status, verification, logs, refresh, and stop lifecycle commands are available through the canonical CLI.
- [ ] The cloned database passes SQLite integrity checks and contains real catalog data.
- [ ] Titan HTTP health and remote endpoints are reachable on `192.168.1.10`.
- [ ] README, agent tool documentation, operational skill, and AkurAI Notes describe the workflow.
- [ ] Focused CLI checks and a live lifecycle smoke test pass without restarting TV services.

## Subtasks

- [ ] SUB-001 Add isolated Titan test lifecycle to `tools/tvctl`
- [ ] SUB-002 Clone the TV database with SQLite online backup
- [ ] SUB-003 Start and verify Titan test services
- [ ] SUB-004 Document the operator and agent workflow
- [ ] SUB-005 Record the workflow in AkurAI Notes

## Notes

The production TV remains the only authoritative runtime. Titan's environment is disposable test infrastructure and never writes back to the TV.
