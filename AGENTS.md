# TV Kit engineering rules

## Agent operations entrypoint

- For every TV Kit runtime or UI operation, load `.pi/skills/tv-kit-operations/SKILL.md` first.
- Use `docs/AI_AGENT_TOOLS.md` as the shared command/tool index for coding agents and TV Kit's internal chat agent.
- Reuse the maintained `tvctl` CLI and native `agent_browser`; do not invent one-off operational scripts.

## Kanban task board

- All tv-fast platform tasks live in `.kanban/`. Read `.kanban/README.md` for the full workflow.
- Before starting new work, check `.kanban/tasks/` for unassigned tasks (`grep -l 'assignee: ""' .kanban/tasks/*.md`).
- When you begin a task, set `assignee` to your agent name and `status` to `in-progress`. Update `updated` on every status change.
- When done, set `status: review`. Another agent reviews, sets `status: done`, and moves the file to `.kanban/done/`.
- Create new tasks by copying `.kanban/templates/task.md`. Group related tasks under an epic (`.kanban/templates/epic.md`).
- One agent per task at a time. Never delete done tasks — archive them in `.kanban/done/` as the project log.
- Do not scan `.kanban/done/` during normal task discovery, search, or status checks. Consult archived filenames only when avoiding ID reuse.

## Runtime architecture

- Source may be edited in `~/Projects/tv-kit` on either midget or Titan; Syncthing mirrors the working tree while `.git` remains host-local (Titan only).
- TV Kit is a **no-build** project deployed with `tvctl kit sync` (deployment lives in the `tvctl` CLI; `deploy.sh` is a deprecated shim). Sync rsyncs source to the TV's `~/.tv-kit/src`; `bun --watch` and Vite HMR pick edits up instantly, so code-only deploys restart nothing. Git commit+push (fired from Titan in the background by `kit sync`) is archiving only and never gates a deploy.
- The TV computer is the only runtime host. Its app home is `~/.tv-kit/` (`src/` synced source, `data/tv-kit.sqlite` live DB, `env` TV-local overrides such as `TV_KIT_DB`). `tvserverd.service`, SQLite, the dashboard/remote Vite dev servers, RÚV/radio background scraping, and kiosk all run on TV as systemd user units. Do not run TV Kit services on Titan.
- The TV's legacy `/opt/tv-kit` compiled deployment and the dead `~/Projects` NFS automount were retired by `tvctl kit setup`; never reintroduce either.
- The TV dashboard and Android tablet remote are clients of the TV-local `tvserverd`. They must not create a second authoritative state store or write directly to SQLite.

## Data is never hardcoded

- SQLite is the source of truth for all runtime, user, household, content, media, EPG, station, widget, event, preference, favourite, playback, and sync data.
- Never hardcode a value in TypeScript, Svelte, CSS, or service definitions when it can live in SQLite or an environment variable.
- User-visible records, catalogs, schedules, channels, widget content, defaults, and feature flags belong in database rows. Insert defaults through idempotent migrations or seed routines, never frontend fixture arrays.
- Deployment values such as hosts, ports, upstream URLs, coordinates, filesystem paths, refresh intervals, timeouts, concurrency, and feature toggles belong in the protected `.env` consumed by services and Vite. Keep a non-secret `.env.example` synchronized with every required variable.
- Hardcoded values are limited to real protocol/schema invariants, type-safe enums, and migration identifiers. When unsure, use the database for data and environment variables for deployment configuration.

## Persistence and migrations

- Every mutation accepted by `tvserverd` must be committed to SQLite before it is broadcast to clients.
- Every persistent schema change requires a new ordered migration. Never edit an applied migration, manually alter production tables, or delete/recreate `data/tv-kit.sqlite` to make a change work.
- Keep SQLite in WAL mode with foreign keys enabled. API syncs that replace catalogs must be transactional.
- Keep secrets out of source, Markdown, CLI arguments, and SQLite. Resolve secrets from the existing vault or protected environment files.

## Radio catalog

- Read stations from the configured Spilarinn catalog URL only in `radioscraper`; clients read the validated SQLite catalog through `tvserverd`.
- Validate streams with a bounded GET because Icecast commonly rejects HEAD. Follow redirects and retain only streams whose final response is HTTP 200.
- A successful scrape atomically upserts new/changed stations and removes failed or missing stations. A failed upstream fetch or an all-stream network failure must preserve the last healthy catalog.
- Record every scraper run, counts, timestamps, and errors in SQLite. RÚV scraping is an asynchronous child process supervised by `tvserverd`; it must be due-driven, non-overlapping, and terminated cleanly with the daemon.

## Torrent streaming (Deildu + media catalog)

- Both Deildu items and the `torrent_media` catalog stream on demand through one shared aria2 engine in `apps/server/src/deilduStream.ts` (`beginStream`/`serveStream` over a `StreamContext`). It owns a single active stream and a single aria2 process — correct for one TV, one playback. Never add a second torrent client (e.g. the WebTorrent npm package) or a parallel aria2 process; add new torrent sources as a new `StreamContext` adapter instead.
- Playback is remote-triggered (`deildu-play <id>`, `torrent-media <id>`) and renders into the dashboard `GlobalPlayer` HUD exactly like RÚV/radio. The server picks the media file, buffers head+tail before returning `src`, then serves progressive HTTP range requests at `/deildu/stream/:id` and `/torrent/media/stream/:id`. Start-of-playback choppiness while the middle fills is expected.
- `torrent_media` rows stream from their public `http(s)` `.torrent` URI on demand — do not require a pre-downloaded file or gate the remote card on `status==='ready'`. The engine's internal statuses map onto the table's narrower CHECK set in `torrentMedia.ts` without a migration. Magnet URIs are unsupported (the bencode parser needs `.torrent` metadata); Deildu fetches need the passkey.
- Browser codec limit: the dashboard `<video>` only decodes browser-native codecs (H.264/AAC in mp4). x265/HEVC, 10-bit, AC3/EAC3/DTS audio, and MKV releases will not play in Chrome — those need native mpv or a server-side transcode to H.264/AAC, a deliberate separate change. Do not assume every torrent plays in the HUD; probe with `ffprobe` before blaming the player.

## RÚV EPG

- Treat RÚV event ids as channel-scoped. The schema key is `(channel_slug, event_id)`; reconciliation deduplicates and upserts that key transactionally so one malformed/repeated upstream row cannot abort a channel refresh.
- Diagnose schedule gaps with `tvctl kit epg status`, the latest `ruv_scrape_runs` row, and the configured RÚV XML before changing UI fallbacks. A successful scrape can honestly return no current event when RÚV is off-air or its XML has a gap; never extend the prior programme or invent an event.
- Use `tvctl kit epg sync` for a bounded forced refresh. It must refuse to overlap a running RÚV scraper, preserve the last healthy rows on upstream failure, and finish by reporting schema integrity, per-channel counts, and the latest run.

## Verification

- Run `tvctl kit verify` after service, boot, or WebSocket changes; it requires every persistent unit to be enabled and active, all HTTP endpoints healthy, and a WebSocket ping/pong round trip.
- Run `tvctl kit check`; it executes the TV-local Bun tests plus TypeScript and Svelte checks without relying on a missing `bunx` symlink.
- Test schema migration from an empty temporary database and startup from an existing database.
- Test one forced radio scrape and one due-check skip. Confirm the API count equals the SQLite count.
- For EPG changes, run `tvctl kit epg sync`, require a complete latest run and nonzero counts for all configured channels, then compare any remaining gap with the upstream XML.
- Verify TV and remote commands survive a `tvserverd` restart before considering a data feature complete.

## TV kiosk browser

- The TV (`192.168.1.12`) renders the dashboard in Flatpak Google Chrome launched in kiosk mode with `--kiosk --autoplay-policy=no-user-gesture-required --noerrdialogs --disable-session-crashed-bubble --disable-infobars --start-fullscreen` pointed at the dashboard URL.
- The autoplay flag is required: without it Chrome blocks `audio.play()` until a user gesture, so remote-initiated radio playback silently fails with a "needs another press" player error.
- Never launch the TV browser bare. Relaunch it with the same flag set (transient unit `tv-kiosk`, or the `tv-kiosk.service` user unit once installed on the TV). The Wayland session env on the TV is `DISPLAY=:1`, `WAYLAND_DISPLAY=wayland-0`.
- Never show native scrollbar chrome on the TV dashboard. Scrollable views remain scrollable, but both standards-based and WebKit scrollbar rendering stay hidden.

## Global player and radio UI

- `apps/dashboard/src/GlobalPlayer.svelte` is mounted globally and docked sticky to the bottom edge (full width, top border only, no floating margins or radius). Keep it that way.
- Live-TV OSD copy derives the current programme from DB-backed dashboard content so schedule transitions update without retuning. Deduplicate title/subtitle/source values; a gap should read as the channel plus an honest live-broadcast status, never `RÚV · RÚV` or a missing-data warning.
- When the user wants uninterrupted viewing during edits, use `tvctl kit fullscreen ruv` (or `ruv2`) and leave it enabled. Retuning resets fullscreen, so the CLI deliberately tunes first and reapplies fullscreen.
- The dashboard is render-only: radio playback state changes come from the tablet remote through `tvserverd` WebSocket commands (`radio`, `toggle-play`, `media-next`/`media-previous`, `volume`, `player-panel`, `fullscreen`).
- The remote (`apps/remote`) exposes Radio as a first-class bottom-nav tab; radio mode hides the TV remote/favourites/up-next panels and shows the station browser fed by `GET /radio/stations`.
- The radio EPG must stay honest: Spilarinn supplies streams only, so show the live-broadcast placeholder rather than invented programme data.

## Interaction model

- The TV dashboard is display-only. Never render pressable controls (buttons, sliders, links) on the dashboard; render passive indicators instead. Every interactive control lives on the tablet remote and mutates state through `tvserverd` WebSocket commands.
- Remote and dashboard WebSockets use application-level ping/pong (10-second ping, 30-second stale timeout) because tablet sleep and network roaming can leave browser sockets half-open without firing `close`. Preserve the visibility-triggered stale check and verify the path with `tvctl kit verify`.
- The dashboard `GlobalPlayer` shows transport/tool state as passive chips; seek, panels, subtitles, audio track, speed, favourite, and fullscreen are all remote commands (`seek`, `player-panel`, `subtitle`, `audio-track`, `playback-rate`, `toggle-favorite`, `radio-favorite`, `fullscreen`).
- The fullscreen button must never appear on the TV; fullscreen is toggled only from the remote.

## Remote-to-TV cross-verification (mandatory)

- After every remote interaction that changes the TV state (navigation, tuning, playback, fullscreen), verify the TV dashboard reflects the change. Do not assume a remote click succeeded just because the remote UI updated.
- **Primary verification**: dashboard DOM text. `agent_browser get text body --session tv-dashboard` is authoritative for state, navigation, and content changes. Cross-reference key text (page heading, item counts, titles) against the remote state.
- **Physical screenshot** (`tvctl screenshot /tmp/tv-verify.png`): reserved for pixel-level verification — video playback, visual regressions, layout issues, or when the user asks what's on the TV screen. DOM text covers everything else.
- When screenshot analysis is needed and the current model lacks vision support, spawn a one-shot agent:

  ```sh
  pi -p "Read the screenshot at /tmp/tv-verify.png and describe every section, text, and UI element visible." \
     --provider openai-codex --model gpt-5.6-luna --no-lsp
  ```

## Radio favourites

- Favourite stations persist in the existing `favourites` table (`profile_id` `home`, `media_id` `radio-<id>`, `kind` `radio`); no separate table. The server exposes them in shared state as `radioFavorites: number[]` and accepts the `radio-favorite` command (station id) plus `toggle-favorite` for the currently tuned station.
- Both UIs show favourites in an "Uppáhaldsstöðvar" section above "Allar stöðvar", animated between lists with Svelte crossfade + flip. Do not duplicate favourites client-side; derive from `state.radioFavorites`.

## Audio visualization

- The RadioPage bars are driven by a shared Web Audio `AnalyserNode` (`apps/dashboard/src/audioAnalysis.ts`) fed by the player media element, rendered per-frame with `requestAnimationFrame`. Never reintroduce randomized CSS keyframe equalizers; visualization must reflect the actual stream. Analyser attachment is wrapped in try/catch so a non-CORS stream can never break playback.

## Visual language

- Depth comes from the shared `--shadow-card` and `--shadow-soft` tokens defined on the app shells; apply them to cards/panels instead of ad-hoc shadows.
- Station and channel logos render in strict 1:1 boxes with `object-fit`/`background-size: contain`; never crop logos to non-square aspect ratios.
- User-facing copy on the radio and player surfaces is Icelandic; server-supplied radio EPG strings are Icelandic too. Continue translating remaining surfaces to Icelandic as they are touched.

## Browser automation and screenshots (mandatory)

- When Pi needs browser interaction, page inspection, web UI automation, web research requiring page interaction, or a browser screenshot, use the native `agent_browser` tool provided by `pi-agent-browser-native`.
- Do not invoke the `agent-browser` CLI through Bash or substitute ad-hoc browser-driving scripts, Playwright, Puppeteer, or browser DevTools for interactive browser work, unless you are explicitly implementing/testing browser code or the user explicitly requests another workflow.
- Follow the native workflow: `open` → `snapshot -i` → interact with current refs or stable locators → take a fresh `snapshot -i` after navigation or DOM changes. Save requested artifacts to the exact path and verify them before reporting success.
- Device-specific captures such as `tvctl screenshot` remain appropriate when the task is a device diagnostic rather than browser automation; use the native tool for any browser inspection or screenshot around that workflow.

## Autonomous goal mode (mandatory for persistent tasks)

- Use pi-goal's `/goal <objective>` for multi-step implementation, debugging, refactoring, verification, or other work that should continue until it is actually complete. Use `/goal --tokens <budget> <objective>` when a bounded budget is appropriate.
- While a goal is active, continue through implementation and verification rather than stopping at a plan or partial progress. Completion requires the native `goal_complete({ goal_id, summary })` tool with concrete evidence for every requirement.
- Use `goal_blocked({ goal_id, reason, evidence, repeated_turns })` only for a genuine external or terminal blocker that has recurred for at least three consecutive goal turns; difficulty, uncertainty, normal clarification, or a recoverable tool failure is not enough.
- Use `/goal pause`, `/goal resume`, `/goal edit`, and `/goal clear` for goal lifecycle control. Do not create a competing global or directory-based goal state.

## pi-lens

- `pi-lens` is installed globally in Pi via `npm:pi-lens`; restart Pi after installation or upgrades so its extension and skills load.
- Use its LSP diagnostics/navigation, linters, formatters, type-checkers, and structural analysis as feedback while editing code. Fix relevant diagnostics before moving on, while still running the project's normal tests and checks.
- For code discovery, prefer the `symbol_search` → `module_report` → `read_symbol` funnel; use AST search/replace for structural changes when appropriate.
- Treat pi-lens diagnostics as advisory project feedback: do not hide, suppress, or bypass a finding without understanding and documenting the reason.
