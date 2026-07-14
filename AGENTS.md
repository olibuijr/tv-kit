# TV Kit engineering rules

## Agent operations entrypoint

- For every TV Kit runtime or UI operation, load `.pi/skills/tv-kit-operations/SKILL.md` first.
- Use `docs/AI_AGENT_TOOLS.md` as the shared command/tool index for coding agents and TV Kit's internal chat agent.
- Prefer the typed tools from `.pi/extensions/tv-extension.ts`; fall back to `/home/olafurbui/.local/bin/tvctl` and native `agent_browser`. The only CLI implementation lives at `tools/tvctl`; never copy it into a skill or extension or invent one-off operational scripts.

## Kanban task board

- All tv-fast platform tasks live in `.kanban/`. Read `.kanban/README.md` for the full workflow.
- Before starting new work, check `.kanban/tasks/` for unassigned tasks (`grep -l 'assignee: ""' .kanban/tasks/*.md`).
- When you begin a task, set `assignee` to your agent name and `status` to `in-progress`. Update `updated` on every status change.
- When done, deploy where applicable and verify the live result yourself. For web UI changes inspect the deployed DOM; for native frame changes use frame health plus a physical screenshot. Then set `status: done` and move the file to `.kanban/done/`.
- Create new tasks by copying `.kanban/templates/task.md`. Group related tasks under an epic (`.kanban/templates/epic.md`).
- One agent per task at a time. Never delete done tasks — archive them in `.kanban/done/` as the project log.
- Do not scan `.kanban/done/` during normal task discovery, search, or status checks. Consult archived filenames only when avoiding ID reuse.

## Runtime architecture

- Source may be edited in `~/Projects/tv-kit` on either midget or Titan; Syncthing mirrors the working tree while `.git` remains host-local (Titan only).
- TV Kit server/remote code is **no-build** and deployed with `tvctl kit sync`. Sync first kills orphaned Chrome/mpv/aria2/playback-verifier processes, then rsyncs source to the TV's `~/.tv-kit/src`; `bun --watch` and Vite HMR pick code edits up instantly, while changed service units are reinstalled and restarted. A sync interrupts active playback by design. Git commit+push (fired from Titan in the background by `kit sync`) is archiving only and never gates a deploy.
- The native Qt/QML TV Frame (`apps/tv-frame`) is the display client and is **never built on the TV**: build it on Titan (`tvctl kit frame build` → `~/.cache/tv-kit/frame-build`), push the binary with `tvctl kit frame deploy`, and restart `tv-frame.service`. Titan and the TV run identical Arch Qt/glibc versions, so the binary is directly compatible. The TV carries only Qt runtime libraries — no cmake/ninja/compilers.
- The TV computer is the only **production** runtime host. Its app home is `~/.tv-kit/` (`src/` synced source, `frame-build/tv-frame` binary, `data/tv-kit.sqlite` live DB, `env` TV-local overrides such as `TV_KIT_DB`). `tvserverd.service`, SQLite, the remote Vite dev server, RÚV/radio background scraping, and the TV Frame all run on TV as systemd user units. Titan may run only the disposable `tvctl kit test` environment: transient `tvserverd-test.service`/`tv-remote-test.service` units, isolated ports and `~/.tv-kit-test/`, and a consistent SQLite online-backup clone that never writes back to the TV. Never point Titan test services at the live TV database.
- The TV's legacy `/opt/tv-kit` compiled deployment and the dead `~/Projects` NFS automount were retired by `tvctl kit setup`; never reintroduce either.
- The TV Frame and Android tablet remote are clients of the TV-local `tvserverd`. They must not create a second authoritative state store or write directly to SQLite.

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
- Playback is remote-triggered (`deildu-play <id>`, `torrent-media <id>`) and renders through the native frame's `PlayerHud` exactly like RÚV/radio. The server picks the media file and returns its progressive range URL as soon as aria2 is active; range requests wait only for their required pieces at `/deildu/stream/:id` and `/torrent/media/stream/:id`. Start-of-playback choppiness while the middle fills is expected.
- `torrent_media` rows stream from their public `http(s)` `.torrent` URI on demand — do not require a pre-downloaded file or gate the remote card on `status==='ready'`. The engine's internal statuses map onto the table's narrower CHECK set in `torrentMedia.ts` without a migration. Magnet URIs are unsupported (the bencode parser needs `.torrent` metadata); Deildu fetches need the passkey.
- Native mpv embedded in `tv-frame` is the only normal playback engine. `tvserverd` publishes `state.media`; the frame loads it through mpvqt and reports real progress, buffering, status, and discovered tracks over WebSocket. Never add a second mpv process or browser player beside the frame. Confirm `engine:"mpv"`, advancing frame-reported position, and real pixels.
- Embedded libmpv handles the required H.264/H.265, AAC, AC3/EAC3/DTS, MP4, and MKV releases. Diagnose uncertain releases with frame state, logs, and `ffprobe`; browser codec limits no longer apply because browser playback is retired.
- Torrent playback is transient across daemon restarts: startup clears persisted `playing`, stale torrent `src`, engine, and fullscreen state because `reconcileStreams()` has no active producer to resume. The user must select the item again after a restart; never autoplay stale partial bytes.
- A torrent is complete only when its selected file has the expected size and aria2's correct control file is absent. For multi-file torrents that file is `<item-dir>/<torrent-name>.aria2`, not `<media-file>.aria2`; never trust apparent file size or a stale DB `ready` value alone.
- Completed verified files are passed to mpv as local paths. Only incomplete active torrents use progressive HTTP range URLs.

## Deildu catalog title cleaning and enrichment

- The `deildu_items` SQLite table is authoritative for cleaned display titles, original release titles, metadata, TMDB ids, cleanup state, and review errors. Clean the pending DB catalog, not only IDs from the latest scrape, so older failed rows are retried.
- Deterministic, evidence-backed release parsing must persist independently of optional enrichment services. A local LLM or TMDB outage may leave only unresolved rows retryable; it must never block safe title cleanup for other rows.
- Preserve `original_title` and send ambiguous or validation-failed names to review. A truncated (`(...)`) source may use an exact title prefix only when its season/episode, year, or release marker supports that prefix; never invent title metadata to make a catalog card look cleaner.
- A remote-triggered catalog job is complete only after its scheduled-task state reports completion and both clients refresh their DB-backed content. Verify a normalized sample in the remote, then confirm the native frame through `frame-health.json` or a physical screenshot; there is no dashboard DOM.
- `tvserverd.service` and `tvctl kit sync` kill stale mpv, aria2, Chrome, and `tvctl` playback-verifier processes. Do not remove this cleanup or allow parallel player engines.
- Playback readiness comes only from the embedded mpv's cache state, rendered-frame restart signal, and advancing `time-pos` reported by the native frame. `playing:true`, URL assignment, or aria2 head/tail priority are not readiness. A no-frame deadline must invoke `stop-playback` once, unload mpv, stop aria2, clear the source/fullscreen state, and never retry automatically.
- Progressive HTTP responses may return a bounded subset of an open-ended request, as allowed by RFC 9110. Bound incomplete responses to the current torrent piece; do not retain large waiting ranges or write/broadcast SQLite progress from request polling.

## Direct mpv maintenance

- Direct mpv is an explicit maintenance mode, not a second authoritative TV Kit player. Stop TV Kit media/kiosk services first, keep exactly one systemd-owned `tv-direct-mpv.service`, and leave SQLite/shared UI state untouched.
- Require a piece-verified local file, VA-API hardware decode, near-zero `avsync`, zero/stable frame drops, and exactly one PipeWire sink. Decoder errors such as `Invalid NAL unit size` indicate missing/corrupt torrent pieces, not an mpv tuning problem; run aria2 integrity repair.
- Use `tvctl mpv tracks` for read-only track discovery and `tvctl mpv audio ID|auto|off` or `tvctl mpv subtitle ID|auto|off` for explicit changes. These operate over JSON IPC without reloading playback.
- Use `tvctl deildu search QUERY`, `item ID`, `links ID`, and `files ID` for fast secret-safe discovery. Never print or reconstruct passkey-bearing download, tracker announce, or magnet values.

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
- Finish autonomous work with evidence-backed production verification: inspect the live result, run the smallest relevant check, update these rules when a durable operational lesson is found, then mark the Kanban task `done` and archive it.

## Native TV Frame (display client)

- The TV (`192.168.1.12`) renders the UI with the native Qt/QML TV Frame (`apps/tv-frame`) running as `tv-frame.service`. The Chrome kiosk and the Svelte dashboard are retired — never reintroduce them, a second display client, or browser `<video>` playback.
- Build the frame ONLY on Titan (`tvctl kit frame build`/`test`); `tvctl kit frame deploy` pushes the binary to the TV's `~/.tv-kit/frame-build/tv-frame` and restarts the service. QML/C++ changes require a frame deploy; `kit sync` alone only hot-reloads server/remote code.
- All playback (RÚV live, Sarpurinn episodes, radio, Deildu/torrents) renders through libmpv embedded directly in the frame process (`apps/tv-frame/src/mpvvideo.{h,cpp}`, `MpvVideo` via the `mpvqt` package) — mpv is a normal QML item, not a separate process/window, so the HUD/OSD panel composite over it as ordinary QML children. `tvserverd` owns only *what* to play (`state.media.src`/`engine:"mpv"`); the frame owns *how* — it loads/pauses/seeks mpv directly and reports progress/status back over its own WebSocket connection (`media-progress`, `media-duration`, `media-buffering`, `player-status`).
- The frame is documented per page in `.pi/skills/tv-frame-ui/SKILL.md` (index + references). Load it before frame UI work.
- The frame writes `~/.tv-kit/frame-health.json` every 5 s; `tvctl kit frame health`/`verify` gate on it. The Wayland session env on the TV is `DISPLAY=:1`, `WAYLAND_DISPLAY=wayland-0`.
- A Stremio-style `LoadingOverlay` covers the frame while a torrent buffers, driven by `state.media.transfer` (aria2 peers/speed/bytes) and `state.media.buffering` (mpv cache percent). Both fields are transient and never persisted.
- The `LoadingOverlay`'s visibility is gated on `state.media.status === "loading"` for a `deildu-`/`torrent-` item (`Main.qml`). The frame's `player-status` report MUST be **symmetric**: `MpvVideo.onPausedForCacheChanged` sends `"loading"` when `paused-for-cache` sets AND `"ready"` when it clears. If the recovery branch is missing, `status` stays `"loading"` after any mid-stream rebuffer and the overlay stays stuck over playing video — the tell is **advancing `time-pos` + audible audio behind a frozen 100% overlay**. Diagnose this as a status/overlay-dismiss bug, NOT a streaming stall: if `tvctl kit playback state` shows `position` advancing while `status:"loading"`, the torrent is fine and the fix is in the frame's status reporting, not aria2. A live overlay can be dismissed without a redeploy by injecting `player-status:"ready"` over the tvserverd WebSocket (`ws://127.0.0.1:3110/ws`); the server sets `state.media.status` from any client's `player-status` when `media.src` is set.
- Every QML-exposed C++ class in `apps/tv-frame/src/` MUST use `QML_ELEMENT` (`#include <qqmlintegration.h>`) and MUST NOT also be registered manually via `qmlRegisterType`/`qmlRegisterModule` in `main.cpp`. Mixing the two registration paths for the same module URI is a real Qt6 footgun: `qt_add_qml_module`'s auto-generated `qml_register_types_<Module>()` only emits a `qmlRegisterTypesAndRevisions` call for classes that actually carry `QML_ELEMENT`, and a stray manual `qmlRegisterType` call for one class can leave a *different*, auto-registered class unresolved at runtime ("X is not a type") even though it compiles cleanly. Diagnose by reading the generated `<build>/tv-frame_qmltyperegistrations.cpp` and `<build>/meta_types/qt6tv-frame_metatypes.json` directly rather than guessing from the QML error text.
- `OsdPanel.qml` (Dagskrá/EPG, subtitles, audio track) is a liquid-glass dropdown: translucent tint over a blurred backdrop (`Main.qml` renders a full-window `MultiEffect` sampling `video`, painted just below the panel in z-order so it only shows through the panel's own bounds) that slides open via the `open` property. Known gap: the *close* transition doesn't read as a slide (opacity reaches ~0 before the `y` animation finishes, so it just fades) and `PlayerHud` has no matching slide-close at all — see `.pi/skills/tv-frame-ui/references/osd-panel.md`.

## Global player and radio UI

- `apps/tv-frame/qml/PlayerHud.qml` is the passive transport strip docked to the bottom edge (full width, top border only, no floating margins or radius). It remains visible with selected media on menu pages, auto-hides over fullscreen video, and remains visible beneath any open OSD panel.
- Live-TV OSD copy derives the current programme from DB-backed dashboard content so schedule transitions update without retuning. Deduplicate title/subtitle/source values; a gap should read as the channel plus an honest live-broadcast status, never `RÚV · RÚV` or a missing-data warning.
- When the user wants uninterrupted viewing during edits, use `tvctl kit fullscreen ruv` (or `ruv2`) and leave it enabled. Retuning resets fullscreen, so the CLI deliberately tunes first and reapplies fullscreen.
- The frame is render-only: playback state changes come from the tablet remote through `tvserverd` WebSocket commands, including tune/play/pause/stop, seek, volume/mute, playback rate, panels, subtitle/audio selection, favourites, power, and fullscreen.
- The remote (`apps/remote`) exposes dedicated Sjónvarp and Radio bottom-nav pages. Sjónvarp lists DB-backed channels, current/upcoming EPG, favourites, and tune actions; Radio shows the station browser from `GET /radio/stations`. The corresponding frame views read the same server content through `FrameClient`.
- The radio EPG must stay honest: Spilarinn supplies streams only, so show the live-broadcast placeholder rather than invented programme data.

## Interaction model

- The TV frame is display-only. Never render pressable controls (buttons, sliders, links) on the frame; render passive indicators instead. Every interactive control lives on the tablet remote and mutates state through `tvserverd` WebSocket commands.
- Remote and frame WebSockets use application-level ping/pong (10-second ping, 30-second stale timeout) because tablet sleep and network roaming can leave sockets half-open without firing `close`. Preserve the stale check and verify the path with `tvctl kit verify`.
- Each remote browser tab uses a stable unique `remote-<id>` WebSocket identity, and the frame connects as `native-frame-<machine-id>`. Never collapse clients back to a shared id; server de-duplication would make clients replace one another.
- GolfBox round/friend endpoints are explicit detail-view actions only. Do not call them from remote startup, WebSocket reconnect, or visibility handlers.
- The frame `PlayerHud` shows transport/tool state passively. The remote owns seek, volume/mute, panels, subtitles, audio tracks, speed, favourite, power, stop, and fullscreen; `MpvVideo` applies the resulting server-authoritative state to embedded mpv and reports discovered subtitle/audio tracks back through `player-tracks`.
- The fullscreen button must never appear on the TV; fullscreen is toggled only from the remote.

## Remote-to-TV cross-verification (mandatory)

- After every remote interaction that changes the TV state (navigation, tuning, playback, fullscreen), verify the TV reflects the change. Do not assume a remote click succeeded just because the remote UI updated.
- **Primary verification**: `tvctl kit frame health` — the `view` field for navigation, `elements[]` array (heading/date/clock/connection/now_playing) for UI content verification as plain text. Prefer this over screenshots for non-pixel checks; non-vision models can read it directly.
- **Physical screenshot** (`tvctl screenshot /tmp/tv-verify.png`): fallback for frame layout, video pixels, and visual regressions when `elements[]` is insufficient.
- For UI changes spanning both clients, verify them as two distinct surfaces: use native `agent_browser` only for the tablet remote (`http://192.168.1.12:3112/`) and use `tvctl kit frame health` (then screenshot only if needed) for the native TV dashboard (`tv-frame`). Do not treat `http://192.168.1.12:3110/` as a dashboard DOM; it is the `tvserverd` API.
- When validating remote control, interact in the remote browser tab first, then confirm the resulting native TV view with `tvctl kit frame health` (and a screenshot only if elements are inconclusive). A remote DOM change alone is not proof that the TV changed.
- When a screenshot IS needed and the current model lacks vision, use `tvctl kit frame health` first; if visual confirmation is still required, spawn a one-shot vision agent.

## Radio favourites

- Favourite stations persist in the existing `favourites` table (`profile_id` `home`, `media_id` `radio-<id>`, `kind` `radio`); no separate table. The server exposes them in shared state as `radioFavorites: number[]` and accepts the `radio-favorite` command (station id) plus `toggle-favorite` for the currently tuned station.
- Both UIs show favourites in an "Uppáhaldsstöðvar" section above "Allar stöðvar"; the frame derives both lists from `state.radioFavorites`, the remote animates with Svelte crossfade + flip. Do not duplicate favourites client-side.

## Audio visualization

- The remote's radio bars must reflect the actual stream where implemented; never reintroduce randomized CSS keyframe equalizers. The native frame currently renders no equalizer (mpv owns audio); if one is added, drive it from real playback telemetry.

## Visual language

- Depth on the frame comes from `Theme.qml` tokens (surface/raised/border); on the remote from the shared `--shadow-card` and `--shadow-soft` tokens. Apply tokens instead of ad-hoc values.
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
