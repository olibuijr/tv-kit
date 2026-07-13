---
name: tv-kit-native-frame
description: Build, test, deploy, diagnose, and visually verify TV Kit's native Qt/QML TV Frame and embedded libmpv player. Use for porting the display dashboard from Svelte to QML, native OSD/playback issues, TV Frame systemd health, or the `tvctl kit frame` commands.
---

# TV Kit Native Frame

Use this skill only for the TV display client. Keep `tvserverd`, SQLite, and the tablet remote authoritative.

## Workflow

1. Read `.pi/skills/tv-kit-operations/SKILL.md` and `docs/AI_AGENT_TOOLS.md` before any TV runtime action.
2. Build locally with `tvctl kit frame build`; run `tvctl kit frame test` before deployment.
3. Deploy only through `tvctl kit sync`; it intentionally stops the kiosk and playback.
4. Require `tvctl kit frame verify` after deployment. It checks the user service, WebSocket health, and saves one physical TV screenshot.

## Architecture limits

- QML is a render-only `tvserverd` WebSocket/HTTP client. Do not create a second state store or access SQLite.
- The tablet remote remains the only command surface. The TV Frame must never expose pressable media controls.
- Use libmpv in the same Qt Quick scene for torrent video. Do not stack a second Wayland window above or below mpv, and do not use `--wid` on Wayland.
- Keep one on-demand mpv engine. Playback readiness comes from mpv time/frame evidence, not a client-side `playing` flag.

## Commands

```sh
TV_FRAME_BUILD_JOBS=2 tvctl kit frame build
tvctl kit frame test
tvctl kit frame health
tvctl kit frame verify
```

`verify` is the final gate: it requires an active native-frame service and a fresh `tvctl screenshot` artifact. Use the existing remote session for all state-changing test actions, then verify the native screen.
