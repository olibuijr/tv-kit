---
id: TASK-010
title: "Stabilize WebSocket client connections and retain diagnostics"
status: review
priority: high
assignee: "root"
epic: ""
created: "2026-07-13"
updated: "2026-07-13"
---

# TASK-010: Stabilize WebSocket client connections and retain diagnostics

## Context

Dashboard and remote connection indicators intermittently cycle while frontend testing.

## Done

- [x] Dashboard and remote reconnect loops cannot survive component disposal or replace a newer socket.
- [x] Server and browser WebSocket lifecycle logging is enabled at trace level with Pino.
- [x] Project checks pass and remote-driven runtime verification is recorded.

## Subtasks

- [x] SUB-001 Trace connection lifecycle and apply minimal shared fix.

## Notes

- Native agent_browser is not exposed to this Codex session; no substitute browser/API control will be used.
- `bunx tsc`, `svelte-check`, 33 Bun tests, and both Vite production builds pass. The existing Svelte CSS warnings remain.
- WebSocket origin-rejection and failed-upgrade paths now emit Pino warnings. Runtime browser verification remains blocked because the required native browser tool is absent after three goal turns.
- Browser verification found the actual loop: a test dashboard and the TV kiosk both used `client=dashboard`, causing server-side replacement/reconnect thrashing. Dashboard identity is now tab-stable and unique; remote identity is now preserved across HMR/reloads too.
- HTTP browser testing exposed a second client bootstrap failure: `crypto.randomUUID` is unavailable on the plain-HTTP remote origin. `browserClientId` uses `getRandomValues` with a fallback and persists the result in session storage.
- Deployed with `tvctl kit sync`; `tvctl kit verify` passed. Agent Browser remote navigation to Útvarp was reflected on the passive dashboard. Pino server logs show independent dashboard and remote IDs pinging continuously for more than one minute without replacement or stale close.
