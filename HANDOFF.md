# TV Kit handoff

Updated: 2026-07-13 UTC

## Read first

- Read this project's `AGENTS.md` before changing anything, then
  `.pi/skills/tv-kit-operations/SKILL.md` for routing, and
  `.pi/skills/tv-frame-ui/SKILL.md` for any Qt/QML frame work.
- Source lives in `~/Projects/tv-kit` on midget and Titan (Syncthing-mirrored;
  `.git` on Titan only). Server/remote code deploys via `tvctl kit sync`
  (no-build rsync + hot reload). The native Qt/QML TV Frame deploys via
  `tvctl kit frame build`/`deploy` — built ONLY on Titan, never on the TV.

## Live system

- The TV (`192.168.1.12`) displays the UI with the native Qt/QML **TV Frame**
  (`apps/tv-frame`, `tv-frame.service`) — **not** a Chrome kiosk and **not**
  the old Svelte dashboard; both are fully retired, do not reintroduce them.
- `tvserverd.service` (port 3110), remote 3112 — systemd user units on the TV
  running from `~/.tv-kit/src`; SQLite at `~/.tv-kit/data/tv-kit.sqlite` (WAL,
  FK on).
- All playback (RÚV live, Sarpurinn episodes, radio, Deildu/torrents) renders
  through **libmpv embedded directly inside the frame process**
  (`apps/tv-frame/src/mpvvideo.{h,cpp}`, `MpvVideo` via the `mpvqt` package).
  There is no separate mpv process/window and no server-side mpv ownership —
  `tvserverd` only decides *what* to play (`state.media.src`/`engine:"mpv"`);
  the frame owns *how*, loading/pausing/seeking mpv directly and reporting
  progress back over its own WebSocket connection.

## Completed this session (2026-07-13)

- **Fixed the tv-frame crash-loop that blocked all playback verification.**
  Root cause: `frameclient.h` predated the `QML_ELEMENT` convention and was
  registered manually via `qmlRegisterType<FrameClient>(...)` in `main.cpp`;
  mixing that with `qt_add_qml_module`'s automatic `QML_ELEMENT`-based
  registration for the same module URI silently dropped the *other*,
  properly-`QML_ELEMENT`-tagged class (`MpvVideo`) from the generated
  registration function, so the frame crash-looped with `"MpvVideo is not a
  type"` every startup. Fixed by adding `QML_ELEMENT` to `FrameClient` and
  deleting the manual registration from `main.cpp` (now just
  `engine.loadFromModule("Tv.Frame", "Main")`); also had to link `Qt6::Qml`
  into the `tst_frameclient` test target once `frameclient.h` started
  including `qqmlintegration.h`. See `AGENTS.md`'s Native TV Frame section
  and `.pi/skills/tv-frame-ui/SKILL.md` invariant 6 for the full gotcha and
  diagnosis method (read the generated `tv-frame_qmltyperegistrations.cpp`
  and `meta_types/qt6tv-frame_metatypes.json` directly, don't guess from the
  QML runtime error text).
- **End-to-end verified real playback post-fix**: `tvctl kit playback play`
  → RÚV live, `engine:"mpv"`, `status:"ready"`, position genuinely advancing
  across polls, physical `tvctl screenshot` shows real broadcast video with
  the EPG-derived title, `Í beinni`/`BEIN ÚTSENDING` status, and the docked
  HUD — confirmed twice, including after a full frame service restart (state
  resumes cleanly from `tvserverd`, no manual retune needed).
- Fixed a pre-existing minor bug while in there: `PlayerHud.qml`'s
  `font.bold: hud.media.live` assigned `undefined` (not `false`) to a bool
  property when `media.live` was unset, logging a QML warning on every
  frame; now `Boolean(hud.media.live)`.
- Built the OSD panel (`OsdPanel.qml`) into a "liquid glass" dropdown:
  translucent tint over a blurred backdrop (`Main.qml` renders a full-window
  `MultiEffect` sampling the embedded video, gated to only run while a panel
  is open) with a slide-open animation. Verified live via the remote's
  "Opna ítarlega fjarstýringu" → Dagskrá button — the EPG panel opens
  correctly over blurred, still-playing video.
- Rewrote the stale `HANDOFF.md` (previously described the retired Chrome
  kiosk / Svelte dashboard era) and added
  `.pi/skills/tv-frame-ui/references/osd-panel.md`.

## Known gaps for the next agent

1. **OSD panel close animation doesn't read as a slide.** `opacity`'s
   `Behavior` (200ms) finishes before `y`'s `Behavior` (320ms), so it's
   already invisible by the time the translate is still running — visually
   it just fades. Fix: match durations, or drop the opacity fade and rely on
   `clip: true` + `y` alone.
2. **`PlayerHud` has no exit animation at all** — plain `visible:` binding,
   instant appear/disappear. Requested UX: when the OSD panel closes, it
   should slide away first, then ~1 second later `PlayerHud` should also
   slide down and away (staggered, not simultaneous). Needs the same
   `Item`-wrapping-animated-`Rectangle` restructuring `OsdPanel` got, plus a
   delay `Timer` in `Main.qml`. Full detail:
   `.pi/skills/tv-frame-ui/references/osd-panel.md` and
   `references/player-hud.md`'s "Known gaps" section.
3. **Subtitle/audio track selection is display-only** (pre-existing, not
   from this session): the remote's `subtitle`/`audio-track` commands update
   `state.media.subtitleTrack`/`audioTrack` but were never wired to actually
   change mpv's active track. RÚV episode subtitles are external files
   (`sub-add`), Deildu/torrent multi-track files need `sid`/`aid` selection —
   neither is implemented.

## Useful checks

```bash
tvctl kit frame health                 # frame service active + connected
tvctl kit playback state               # engine, position, status
tvctl kit playback play                # (re)tune the last/default channel
tvctl screenshot /tmp/tv-verify.png    # physical pixels — the ground truth
tvctl kit frame build && tvctl kit frame test   # Titan-only build + ctest
tvctl kit frame deploy "message"       # sync, build on Titan, push, restart, verify
```

## External sources

- Station API: <https://bakendi.spilarinn.is/api/stations/>
- Solar data: <https://sunrise-sunset.org/>
