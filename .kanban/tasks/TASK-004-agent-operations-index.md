---
id: TASK-004
title: "Document shared AI agent operations"
status: review
priority: high
assignee: "pi"
epic: ""
created: "2026-07-12"
updated: "2026-07-12"
---

# TASK-004: Document shared AI agent operations

## Context

Give external coding agents and TV Kit's internal agent one discoverable operations index and immediate workflows.

## Done

- [x] AGENTS.md points agents to the operations skill and index.
- [x] Project skill documents safe TV Kit operations and verification.
- [x] Internal agent can navigate the same TV Kit views.
- [x] Checks pass and changes are deployed.

## Subtasks

- [x] SUB-001 Add the project skill and tool index.
- [x] SUB-002 Add internal view navigation tooling.
- [x] SUB-003 Check, deploy, and verify.

## Notes

- Reuses the maintained `tvctl` CLI and native `agent_browser`; no second operations CLI.
- `tvctl kit check`: 21 tests passed, with 0 Svelte errors or warnings.
- Live internal-agent request `Opnaðu Deildu.` used `set_tv_view`; dashboard browser QA confirmed Deildu.
