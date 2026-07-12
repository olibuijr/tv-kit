---
name: tv-kit-operations
description: Operates, deploys, checks, and verifies the TV Kit application and its TV, dashboard, tablet remote, content jobs, and internal AI agent. Use for any TV Kit runtime operation or UI state change.
compatibility: Requires the user-global tv-control skill, tvctl, and native agent_browser.
---

# TV Kit operations

Read [`../../../docs/AI_AGENT_TOOLS.md`](../../../docs/AI_AGENT_TOOLS.md) before operating TV Kit. It is the shared tool index for coding agents and TV Kit's internal agent.

## Fast path

1. Use `/home/olafurbui/.local/bin/tvctl` for machine and service operations.
2. Use native `agent_browser` for remote/dashboard interaction: open → snapshot → click current ref/semantic locator → fresh snapshot.
3. After any state-changing remote action, verify dashboard DOM text. Use `tvctl screenshot` only for pixel/video evidence.
4. Deploy with `tvctl kit sync "message"`; check with `tvctl kit check`; use `kit verify` after service or WebSocket changes.

Never run TV Kit services on midget/Titan, write SQLite directly, expose secrets, launch the kiosk browser bare, or substitute browser-driving shell scripts.
