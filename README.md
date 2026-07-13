# TV Kit

TV Kit is the TV-local media, dashboard, and tablet-remote stack for the Arch Linux KDE machine at `192.168.1.12`. Source is edited in this repository and deployed without a build step to `~/.tv-kit/src` with the maintained `tvctl` CLI.

## Start here

- Engineering/runtime rules: [AGENTS.md](AGENTS.md)
- Agent command index: [docs/AI_AGENT_TOOLS.md](docs/AI_AGENT_TOOLS.md)
- Runtime skill: [.pi/skills/tv-kit-operations/SKILL.md](.pi/skills/tv-kit-operations/SKILL.md)
- Typed Pi tools: [.pi/extensions/tv-extension.ts](.pi/extensions/tv-extension.ts)
- Canonical CLI: [tools/tvctl](tools/tvctl)
- Active work board: [.kanban/README.md](.kanban/README.md)

## Common commands

```bash
/home/olafurbui/.local/bin/tvctl status
/home/olafurbui/.local/bin/tvctl snapshot
/home/olafurbui/.local/bin/tvctl now
/home/olafurbui/.local/bin/tvctl kit status
/home/olafurbui/.local/bin/tvctl kit check
/home/olafurbui/.local/bin/tvctl kit verify
```

Pi sessions opened in this repository automatically receive `tv_snapshot`, `tv_deildu`, `tv_playback`, `tv_mpv`, and `tv_kit`. These are typed adapters over the same CLI, not a second TV control implementation. The `~/.local/bin/tvctl` and installed skill entrypoints are small launchers for `tools/tvctl`.

Read-only Deildu discovery and live mpv track inspection:

```bash
tvctl deildu search "Hildur S01E06"
tvctl deildu item 1214359
tvctl deildu links 1214359
tvctl deildu files 1214359
tvctl mpv tracks
```

The link/file commands redact passkey-bearing download, announce, and magnet values. Track changes use `tvctl mpv audio ID|auto|off` and `tvctl mpv subtitle ID|auto|off`.

## Runtime model

- The TV is the only runtime host. SQLite under `~/.tv-kit/data/` is authoritative.
- Normal torrent playback uses the shared aria2 engine plus one on-demand native mpv process. Do not add WebTorrent or a second torrent engine.
- Incomplete torrents use bounded HTTP range serving. Completed, piece-verified files are opened locally by mpv.
- For multi-file torrents, aria2 writes `<item-dir>/<torrent-name>.aria2`. A full apparent media-file size or stale DB `ready` value is not completion while that file exists.
- Direct maintenance mpv is out-of-band: stop TV Kit media/kiosk services, run exactly one systemd-owned mpv, and do not treat its state as persisted TV Kit state.

## Uninterrupted viewing

`tvctl kit sync` intentionally stops the kiosk and cleans Chrome, mpv, aria2, and playback verifiers. Never deploy while uninterrupted viewing is requested. Patch and test locally, leave the task pending deployment, and sync only after explicit permission.

## Development

```bash
bun test
bun run typecheck
```

Run `tvctl kit check` after deployment and `tvctl kit verify` after service, boot, or WebSocket changes.
