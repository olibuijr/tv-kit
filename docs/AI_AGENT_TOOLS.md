# TV Kit AI agent tool index

This is the shared operational index for external coding agents and TV Kit's internal chat agent. External Pi agents load `.pi/skills/tv-kit-operations/SKILL.md` and automatically discover `.pi/extensions/tv-extension.ts`; the internal agent receives its executable tools from `apps/server/src/agent.ts`.

## Choose the tool

| Need | External agent | Internal TV Kit agent |
| --- | --- | --- |
| Open a TV Kit page | Native `agent_browser` on the tablet remote, then verify the frame (health file `view` / screenshot) | `set_tv_view` or “Opnaðu Deildu/Sarp/Sjónvarp/Útvarp/Fréttir/Heim” |
| Read TV state | TV Kit API (`/health`, `kit playback state`) | `get_tv_state` |
| List/tune RÚV channels | Tablet remote; `tv_kit fullscreen` for fullscreen | `list_tv_channels`, `tune_tv_channel` |
| Play/pause or inspect playback | `tv_playback` | `toggle_playback` |
| List/change mpv tracks | `tv_mpv` | Not exposed |
| Stream a torrent video | `tv_deildu search`, then `tv_playback deildu` once | Not exposed |
| Query Deildu metadata/links | `tv_deildu` | Not exposed |
| Search public trackers / stream a public torrent | `tv_public search`, then `tv_public play HASH` once | Not exposed |
| Scrape/inspect the public torrent catalog | `tv_public scrape` / `state` / `list` | Not exposed |
| Run/verify Deildu catalog cleanup | Tablet remote task control; `tv_deildu search` for a safe DB sample | Not exposed |
| Set volume | Tablet remote | `set_volume` (0–100) |
| Deploy source | `tv_kit sync` | Not permitted |
| Deploy isolated Titan test environment | CLI fallback: `tvctl kit test deploy` | Not permitted |
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
3. Confirm the TV followed: `view` in `~/.tv-kit/frame-health.json` (via `tvctl run`) or a `tvctl screenshot` of the native frame. There is no dashboard DOM anymore.

Never infer success from the tablet UI alone.

### Deploy code

`kit sync` deliberately interrupts playback: it kills stale Chrome, mpv, aria2, and playback-verifier processes before syncing. Do not deploy while the user wants uninterrupted viewing.

```bash
/home/olafurbui/.local/bin/tvctl doctor
/home/olafurbui/.local/bin/tvctl kit check
/home/olafurbui/.local/bin/tvctl kit sync "short change summary"
```

Code hot-reloads. Restart only when a service/unit/dependency change requires it.

### Test with cloned production data on Titan

Use the disposable Titan environment instead of deploying to the TV when
playback must remain uninterrupted:

```bash
/home/olafurbui/.local/bin/tvctl kit test deploy
/home/olafurbui/.local/bin/tvctl kit test status
/home/olafurbui/.local/bin/tvctl kit test verify
/home/olafurbui/.local/bin/tvctl kit test logs server 100
/home/olafurbui/.local/bin/tvctl kit test refresh
/home/olafurbui/.local/bin/tvctl kit test stop
```

`deploy` and `refresh` use SQLite's online backup command against the live TV
database, transfer the consistent snapshot to `~/.tv-kit-test/data/`, and
start isolated transient systemd user services on Titan. Defaults are server
`192.168.1.10:3220`, remote `192.168.1.10:3222`, and aria2 RPC `3223`.
Production services, playback, and the authoritative TV database are not
stopped or modified. The test clone is disposable and never writes back.

### Native TV Frame (Qt/QML)

NEVER build on the TV. Build on Titan and ship the binary:

```bash
/home/olafurbui/.local/bin/tvctl kit frame build    # cmake+ninja on Titan -> ~/.cache/tv-kit/frame-build
/home/olafurbui/.local/bin/tvctl kit frame test     # build + ctest on Titan
/home/olafurbui/.local/bin/tvctl kit frame deploy   # sync, build on Titan, push binary, restart tv-frame.service
/home/olafurbui/.local/bin/tvctl kit frame verify   # health + physical screenshot
```

The TV carries only Qt runtime libraries (`qt6-declarative`, `qt6-websockets`); Titan and the TV share identical Arch package versions, so the binary is directly compatible.

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

### Public torrents (multi-source)

The `public_torrents` catalog is filled by a concurrent, rate-limited scraper
that fans out one task per source (ThePirateBay/apibay, Knaben's DHT
aggregation, 1337x, EZTV), then cleans and TMDB-enriches titles alongside
Deildu. Every operation is a maintained `tvctl` subcommand — never an ad-hoc
`curl`, WebSocket, or `sqlite3` script:

```bash
/home/olafurbui/.local/bin/tvctl public search "The Piano 1993"   # live multi-source, dedup by info-hash, sort by seeders, persist
/home/olafurbui/.local/bin/tvctl public list 30                   # read-only DB sample, seeders desc
/home/olafurbui/.local/bin/tvctl public scrape                    # trigger concurrent scrape + clean + enrich
/home/olafurbui/.local/bin/tvctl public state                     # scrape run state
/home/olafurbui/.local/bin/tvctl public play <40-hex-info-hash>   # stream through the head+tail engine; verifies advancing frames
/home/olafurbui/.local/bin/tvctl public stop
```

`public play` resolves a real `.torrent` for the info-hash (the stored http(s)
link, else the itorrents.org cache), then streams it through the same aria2
head+tail buffering engine as Deildu — so MP4s with a trailing `moov` atom play
while downloading. Pick a well-seeded release: prefer a higher seeder count and
a lower bitrate (a 14-seeder 720p streams far more smoothly than a 6-seeder
1080p). aria2 uses DHT, peer-exchange, and local peer discovery, so a thinly
tracked torrent still finds peers without a router port forward. Verify with
`engine:"mpv"`, advancing `currentTime`, and a `tvctl screenshot`; never retry a
failed hash automatically.

Successful normal torrent verification requires `engine:"mpv"`, `status:"ready"`, advancing frame-reported `currentTime`, and real video pixels. The player is embedded libmpv inside `tv-frame`; normal mode has no standalone mpv process or browser fallback. A stationary timestamp is a failure. Restart/deploy cleanup removes stale external players, aria2, and playback verifiers. Torrent state is intentionally stopped and its stale source cleared whenever `tvserverd` starts.

Completed torrent files are opened locally by embedded mpv; progressive HTTP range playback is reserved for incomplete streams. Track labels come from mpv and must be read from `state.media.audioTracks` / `subtitles`, not guessed. For subtitles, require continued position growth after selection and confirm rendered text with a physical screenshot. Diagnose hardware decoding or A/V drift from the frame/libmpv path, not the direct-maintenance IPC socket.

For aria2 multi-file torrents, the incomplete-state file is `<item-dir>/<torrent-name>.aria2`, not `<media-file>.aria2`. File size and a persisted `ready` status are insufficient completion evidence while that top-level control file exists; run an aria2 integrity check before blaming mpv for decoder corruption.

Direct maintenance mpv is out-of-band and must never run beside `tv-frame` playback. Stop frame playback first, keep one systemd-owned direct process, and require `hwdec-current` to report VA-API, `avsync` near zero, stable frame-drop counters, and one PipeWire sink. `Invalid NAL unit size` or similar decoder errors require torrent integrity repair, not more player flags.

Implementation references: [aria2 BitTorrent piece priority](https://aria2.github.io/manual/en/html/aria2c.html#cmdoption-bt-prioritize-piece), [aria2 JSON-RPC status](https://aria2.github.io/manual/en/html/aria2c.html#aria2.tellStatus), [mpv cache properties](https://mpv.io/manual/stable/#property-list), and [RFC 9110 partial content](https://www.rfc-editor.org/rfc/rfc9110.html#name-206-partial-content).

### Verify runtime changes

```bash
/home/olafurbui/.local/bin/tvctl kit verify
/home/olafurbui/.local/bin/tvctl kit status
```

`kit verify` checks enabled/active units, all HTTP endpoints, and WebSocket ping/pong. `kit frame deploy` additionally stops the old frame, removes its health file, records a boundary from the TV clock, and waits for connected health whose `updatedAt` and `lastMessageAt` meet that boundary.

### Verify a Deildu catalog job

Start the job only from the tablet remote. Wait for the scheduled-task notice to finish, then sample a cleaned title through `tv_deildu search` and confirm the same title on the frame's Deildu view after its content refresh. A truncated `(...)` source may be cleaned only when an exact title prefix is supported by a release marker; otherwise retain it for review.

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
