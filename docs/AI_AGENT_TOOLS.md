# TV Kit AI agent tool index

This is the shared operational index for external coding agents and TV Kit's internal chat agent. External Pi agents load `.pi/skills/tv-kit-operations/SKILL.md` and automatically discover `.pi/extensions/tv-extension.ts`; the internal agent receives its executable tools from `apps/server/src/agent.ts`.

## Choose the tool

| Need | External agent | Internal TV Kit agent |
| --- | --- | --- |
| Open a TV Kit page | Native `agent_browser` on the tablet remote, then verify dashboard DOM | `set_tv_view` or “Opnaðu Deildu/Sarp/Sjónvarp/Útvarp/Fréttir/Heim” |
| Read TV state | Dashboard DOM or TV Kit API | `get_tv_state` |
| List/tune RÚV channels | Tablet remote; `tv_kit fullscreen` for fullscreen | `list_tv_channels`, `tune_tv_channel` |
| Play/pause or inspect playback | `tv_playback` | `toggle_playback` |
| List/change mpv tracks | `tv_mpv` | Not exposed |
| Stream a torrent video | `tv_deildu search`, then `tv_playback deildu` once | Not exposed |
| Query Deildu metadata/links | `tv_deildu` | Not exposed |
| Run/verify Deildu catalog cleanup | Tablet remote task control; `tv_deildu search` for a safe DB sample, then dashboard DOM | Not exposed |
| Set volume | Tablet remote | `set_volume` (0–100) |
| Deploy source | `tv_kit sync` | Not permitted |
| Tests/typechecks | `tv_kit check` | Not permitted |
| Service/WS health | `tv_snapshot`; `tv_kit status|verify` | Not permitted |
| EPG inspect/refresh | `tv_kit epg-status|epg-sync` | Not permitted |
| Logs/restart | `tv_kit logs|restart` | Not permitted |
| Device status | `tv_snapshot`; CLI fallback for tablet/doctor | Not permitted |
| Pixel/video proof | `tvctl screenshot /tmp/tv-verify.png` | Not permitted |

Use the typed tools first. For unexposed operations, use the launcher:

```bash
/home/olafurbui/.local/bin/tvctl COMMAND
```

The launcher executes the single canonical implementation at `tools/tvctl`. Never copy that implementation into a skill or extension.

## Common external workflows

### Change a page

1. Open `http://192.168.1.12:3112/` with native `agent_browser`.
2. Take `snapshot -i` and click the current `Deildu`, `Sarpur`, `Sjónvarp`, `Útvarp`, `Fréttir`, or `Heim` control.
3. Open/read `http://192.168.1.12:3111/` in a `tv-dashboard` browser session and confirm the expected heading/content.

Never infer success from the tablet UI alone.

### Deploy code

`kit sync` deliberately interrupts playback: it stops the kiosk and cleans stale Chrome, mpv, aria2, and playback-verifier processes before syncing. Do not deploy while the user wants uninterrupted viewing.

```bash
/home/olafurbui/.local/bin/tvctl doctor
/home/olafurbui/.local/bin/tvctl kit check
/home/olafurbui/.local/bin/tvctl kit sync "short change summary"
```

Code hot-reloads. Restart only when a service/unit/dependency change requires it.

### Control playback

```bash
/home/olafurbui/.local/bin/tvctl kit playback state
/home/olafurbui/.local/bin/tvctl kit playback search "Hildur S01E04"
/home/olafurbui/.local/bin/tvctl kit playback deildu ITEM_ID
/home/olafurbui/.local/bin/tvctl kit playback stop
```

Inspect or change tracks on the active direct or TV Kit mpv without reloading playback:

```bash
/home/olafurbui/.local/bin/tvctl mpv tracks
/home/olafurbui/.local/bin/tvctl mpv audio 1
/home/olafurbui/.local/bin/tvctl mpv subtitle off
```

`mpv tracks` is read-only. The change commands accept a positive track ID, `auto`, or `off` and return the resulting selections.

Query Deildu without starting playback or exposing credentials:

```bash
/home/olafurbui/.local/bin/tvctl deildu search "Hildur S01E06"
/home/olafurbui/.local/bin/tvctl deildu item 1214359
/home/olafurbui/.local/bin/tvctl deildu links 1214359
/home/olafurbui/.local/bin/tvctl deildu files 1214359
```

`links` returns only the public detail URL, local stream URL, and cached torrent path; the authenticated download URL is redacted. `files` removes private tracker announce and magnet values while retaining safe metadata and file paths.

Use this maintained path instead of ad-hoc browser/WebSocket scripts. `deildu` waits for advancing frames from the codec-selected player; if none arrive within its deadline, it sends authoritative `stop-playback`, cleans the stream, and exits nonzero. Never retry automatically. Verify real video with `tvctl screenshot` and never treat `playing: true`, an assigned URL, `status:"ready"`, or a black screen as pixel proof.

Successful normal torrent verification requires `engine:"mpv"`, one on-demand mpv process, advancing `currentTime`, and real video pixels. Browser torrent playback is gated by `BROWSER_TORRENT_PLAYBACK_ENABLED` and is off by default; do not count it as the normal success path. A stationary timestamp is a failure. `tvctl kit setup` installs mpv; service restart/deploy cleanup removes stale player and verifier processes. Torrent state is intentionally stopped and its stale source cleared whenever `tvserverd` starts.

Completed torrent files are opened locally by mpv; progressive HTTP range playback is reserved for incomplete streams. Verify hardware decoding, near-zero `avsync`, stable frame-drop counts, and one PipeWire sink when diagnosing 1080p60 choppiness or A/V drift.

For aria2 multi-file torrents, the incomplete-state file is `<item-dir>/<torrent-name>.aria2`, not `<media-file>.aria2`. File size and a persisted `ready` status are insufficient completion evidence while that top-level control file exists; run an aria2 integrity check before blaming mpv for decoder corruption.

Direct maintenance mpv is out-of-band and must never run beside TV Kit's kiosk/media services. Keep one systemd-owned process and require `hwdec-current` to report VA-API, `avsync` near zero, stable frame-drop counters, and one PipeWire sink. `Invalid NAL unit size` or similar decoder errors require torrent integrity repair, not more player flags.

Implementation references: [aria2 BitTorrent piece priority](https://aria2.github.io/manual/en/html/aria2c.html#cmdoption-bt-prioritize-piece), [aria2 JSON-RPC status](https://aria2.github.io/manual/en/html/aria2c.html#aria2.tellStatus), [mpv JSON IPC and cache properties](https://mpv.io/manual/stable/#json-ipc), and [RFC 9110 partial content](https://www.rfc-editor.org/rfc/rfc9110.html#name-206-partial-content).

### Verify runtime changes

```bash
/home/olafurbui/.local/bin/tvctl kit verify
/home/olafurbui/.local/bin/tvctl kit status
```

`kit verify` checks enabled/active units, all HTTP endpoints, and WebSocket ping/pong.

### Verify a Deildu catalog job

Start the job only from the tablet remote. Wait for the scheduled-task notice to finish, then sample a cleaned title through `tv_deildu search` and confirm the same title in the dashboard DOM after its content refresh. A truncated `(...)` source may be cleaned only when an exact title prefix is supported by a release marker; otherwise retain it for review.

### Diagnose EPG

```bash
/home/olafurbui/.local/bin/tvctl kit epg status
/home/olafurbui/.local/bin/tvctl kit epg sync
```

A real schedule gap is valid; never invent or extend programmes.

### Keep live TV fullscreen

```bash
/home/olafurbui/.local/bin/tvctl kit fullscreen ruv
/home/olafurbui/.local/bin/tvctl kit fullscreen ruv2
/home/olafurbui/.local/bin/tvctl kit fullscreen off
```

Tuning resets fullscreen, so always use this command instead of separate tune/fullscreen actions.

## Internal agent usage

The internal agent may perform only its declared function tools. It must use a tool before claiming an action succeeded and must not expose configuration or secrets.

Examples:

- “Opnaðu Deildu.” → `set_tv_view({"view":"deildu"})`
- “Skiptu yfir á RÚV 2.” → `tune_tv_channel({"slug":"ruv2"})`
- “Stilltu hljóðið á 35.” → `set_volume({"volume":35})`
- “Hvað er í gangi?” → `get_tv_state({})`

Common page values: `home`, `tv`, `radio`, `media` (Sarpur), `deildu`, `news`.

## Safety and authority

- SQLite on TV is authoritative; never mutate it manually.
- Clients use tvserverd APIs/WebSockets, never direct database writes.
- Secrets stay in protected environment/vault files, never source, Markdown, logs, or command arguments.
- Dashboard is display-only; interactive controls belong on the tablet remote.
- Use native `agent_browser`, never ad-hoc Playwright/Puppeteer/browser shell scripts.
- Use `tvctl screenshot` only for visual evidence; DOM text is authoritative for state/navigation.
