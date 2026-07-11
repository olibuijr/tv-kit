# Deploying TV Kit

TV Kit is a **no-build** project. The TV runs the source tree directly:

- `tvserverd` — `bun --watch apps/server/src/index.ts` (port 3110)
- dashboard — Vite dev server with HMR (port 3111)
- remote — Vite dev server with HMR (port 3112)
- kiosk — Chrome pointed at the dashboard; every (re)start first kills
  lingering Chrome processes

All deployment lives in the `tvctl` CLI (`~/.local/bin/tvctl`, also shipped
with the tv-control skill). `deploy.sh` is a deprecated shim.

## Everyday flow

Edit files in `~/Projects/tv-kit` (midget or Titan — Syncthing mirrors them),
then:

```bash
tvctl kit sync "What changed"
```

`kit sync` rsyncs the source to the TV in ~1s. `bun --watch` and Vite HMR pick
the changes up instantly — no build, no restarts. Dependencies (`bun install`)
and systemd user units are refreshed only when their files actually changed,
and only then are services restarted. A health check hits :3110/health, :3111
and :3112.

Git is **archiving only**: `kit sync` fires a background commit+push from
Titan (the only host with `.git`; log: `/tmp/tv-kit-archive.log`). It never
gates or blocks a deploy. Run `tvctl kit archive "msg"` to archive explicitly.

## Other commands

```bash
tvctl kit setup     # one-time/repair: bun runtime, linger, legacy /opt
                    # cleanup, DB migration, units, then a full sync
tvctl kit status    # unit states + health endpoints
tvctl kit restart   # restart services (kiosk pre-kills stray Chrome)
tvctl kit logs [unit] [lines]
```

## TV layout and data contract

The TV's app home is `~/.tv-kit/`:

- `src/` — the rsynced source tree (includes the shared `.env`)
- `data/tv-kit.sqlite` — the live SQLite source of truth (migrated once from
  the legacy `/var/lib/tv-kit` copy by `kit setup`, never touched by deploys)
- `env` — TV-local overrides loaded after `src/.env` (e.g. `TV_KIT_DB`)
- `deps.sha` — dependency-install marker

`data/`, `node_modules/`, `.git`, and sqlite files are never rsynced. The
background archive commits whatever Syncthing has delivered to Titan at that
moment; an edit made seconds earlier may land in the next archive instead.

Runtime endpoints: `http://192.168.1.12:3110` (API/WS), `:3111` (dashboard),
`:3112` (remote).
