# TV Kit handoff

Updated: 2026-07-11 UTC

## Read first

- Read this project's `AGENTS.md` before changing anything. SQLite is the source of truth for runtime and user-visible data; deployment/configuration belongs in `.env`.
- Source lives in `~/Projects/tv-kit` on midget and Titan (Syncthing-mirrored; `.git` on Titan only). Deployment is `tvctl kit sync` — a no-build rsync to the TV's `~/.tv-kit/src` with hot reload (`bun --watch` + Vite HMR). Git push is background archiving only. NFS is fully retired, including the TV's old `~/Projects` automount.

## Live system

- `tvserverd.service` (port 3110), dashboard 3111, remote 3112 — all systemd user units on the TV running from `~/.tv-kit/src`; SQLite at `~/.tv-kit/data/tv-kit.sqlite` (WAL, FK on).
- `tvserverd-radioscraper.timer` daily with `Persistent=true`; catalog currently 27 validated stations.
- RÚV channels, catalog, episodes, EPG, and news are persisted in SQLite. `tvserverd` owns a non-blocking child-process scheduler for daily RÚV catalog/EPG/archive maintenance and hourly news; there are intentionally no separate RÚV systemd units.
- TV browser: `tv-kiosk.service` user unit (installed and enabled) runs Flatpak Chrome with `--kiosk --incognito --autoplay-policy=no-user-gesture-required ...`. Pre-start it kills stray `/app/extra/chrome` processes, purges stale service-worker caches, and waits until the dashboard answers (prevents the boot-race/stale-SW white screen).

## Completed since previous handoff

- Radio/player UI deployed to the live project: `RadioPage.svelte`, `GlobalPlayer.svelte` (sticky bottom dock, no floating card), dashboard and remote `App.svelte`, demo WebVTT captions.
- Remote has a five-tab bottom nav with a first-class Radio tab; radio mode shows the station browser and hides the TV-remote/favourites/up-next panels; missing CSS completed.
- Dashboard footer removed; radio page headings/labels removed so the station grid uses the space.
- End-to-end verified: remote tunes a station via WebSocket `radio` command, TV state switches to radio view, audio plays on the TV speakers (autoplay unlocked), Vite compiles all sources.
- RÚV backend foundation completed: ordered migration v4, typed camelCase protocol/DTOs, `/dashboard/content` and typed `/ruv/*` APIs, live-channel/VOD commands, TV favourites, EPG↔VOD joins, archive discovery, expiry/featured maintenance, hourly edited-news refresh, and daemon-owned due scheduling.

## Remaining work

1. Install/enable `tv-kiosk.service` user unit on the TV so the kiosk survives reboots (draft was prepared; enablement was aborted).
2. Wire dashboard and remote to the shared `/dashboard/content` payload and real RÚV channel/program/EPG/news records.
3. Add HLS playback handling in `GlobalPlayer.svelte`, using the backend-provided live/VOD URLs and only real subtitle tracks.
4. Remove remaining frontend fixture arrays (`guide`, `agenda`, `home`, `media`, `week`, `channels`, `scenes`, inline schedules/reminders); show DB-backed records or honest empty states.
5. Visual QA of RÚV live TV, Sarpurinn VOD, EPG, news, and the tablet remote on physical devices, plus theme QA (morning/day/evening/night).
6. Confirm live TV/VOD selection, volume, player state, and favourites survive a daemon restart.

## Useful checks

```bash
curl -fsS http://192.168.1.10:3110/health
curl -fsS http://192.168.1.10:3110/radio/stations
curl -fsS http://192.168.1.10:3111/src/App.svelte >/dev/null
curl -fsS http://192.168.1.10:3112/src/App.svelte >/dev/null
```

## External sources

- Station API: <https://bakendi.spilarinn.is/api/stations/>
- Solar data: <https://sunrise-sunset.org/>
