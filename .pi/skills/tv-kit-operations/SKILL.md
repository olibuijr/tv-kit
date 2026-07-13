---
name: tv-kit-operations
description: Operate, deploy, diagnose, and verify TV Kit on its TV runtime, dashboard, tablet remote, native mpv player, torrent stream, content jobs, and internal agent. Use for every TV Kit runtime/UI action and for playback failures, black screens, loops, buffering, orphan processes, service health, deployment, or device verification.
---

# TV Kit operations

Read [`docs/AI_AGENT_TOOLS.md`](../../../docs/AI_AGENT_TOOLS.md) before operating TV Kit.

## Route operations

Prefer the typed Pi extension tools:

- `tv_snapshot` for a one-connection runtime snapshot.
- `tv_deildu` for secret-safe catalog discovery.
- `tv_playback` for state, idempotent play/stop, and verified Deildu playback.
- `tv_mpv` for non-interrupting track inspection or selection.
- `tv_kit` for health, logs, checks, deployment, services, EPG, and fullscreen.

Use `/home/olafurbui/.local/bin/tvctl` only as the fallback or for commands not exposed by the extension. Its canonical implementation is [`tools/tvctl`](../../../tools/tvctl); never add another copy. Use native `agent_browser` for browser interaction: open → snapshot → interact with a current ref or stable locator → fresh snapshot.

## Guardrails

1. Keep SQLite authoritative; never write it directly or create client-side state stores.
2. Keep secrets in protected environment files. Never expose Deildu passkeys or tracker URLs.
3. Run runtime services only on `tv`. Never restore legacy `/opt/tv-kit` or the retired NFS deployment.
4. Use `tv_playback stop` for normal cleanup. Recover with process kills only when the daemon is unresponsive.
5. Never deploy during uninterrupted viewing. `tv_kit sync` intentionally stops the kiosk and player processes.
6. Verify every remote state change against dashboard DOM text. Reserve physical screenshots for pixel/video evidence.
7. Run `tv_kit check` after code changes and `tv_kit verify` after service, boot, or WebSocket changes.

## Torrent playback gate

1. Resolve one exact item with `tv_deildu search`.
2. Start it once with `tv_playback deildu`; never retry a failed item automatically.
3. Require native mpv, advancing position, ready state, and real pixels. Assigned URLs, `playing:true`, browser fallback, or black pixels are not success.
4. On failure, inspect `tv_playback state`, `tv_kit logs`, `tv_snapshot`, and one physical screenshot. The playback command already stops a failed attempt.

Read [`references/torrent-playback.md`](references/torrent-playback.md) before changing or diagnosing torrent selection, range serving, buffering, mpv readiness, completion, or cleanup.

Direct mpv is out-of-band maintenance mode. Keep exactly one systemd-owned player, use integrity-verified media, and require VA-API, near-zero A/V offset, stable frame-drop counters, and one PipeWire sink.
