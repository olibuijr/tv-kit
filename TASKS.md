# TV Kit tasks

## QA follow-up — 2026-07-12

Browser QA used isolated `agent-browser` sessions for the 1920×1080 TV dashboard
and 1280×800 tablet remote. Evidence is in `artifacts/qa/`.

- [ ] Fix tablet sticky-player layout: scrolling any content page lets the global
  player overlap page controls/content; at 1280×800 the Fjarstýring **Lækka**
  control initially sits below/behind the fixed bottom nav.
- [ ] Reset (or deliberately preserve with a visible reason) the scroll position
  when switching remote tabs. Sarpur and Fréttir inherited Deildu's scroll
  position during QA.
- [ ] Restore the Deildu panel heading layout; its icon, heading, and **Uppfæra**
  control stack vertically instead of sharing the intended header row.
- [ ] Fix Deildu scraper text decoding. Titles contain mojibake, e.g.
  `Dungeon Crawler Carl - b�kur` and `[mp3] Yrsa Sigur�ard�ttir`.
- [ ] Add accessible names to the icon-only remote controls reported by the
  accessibility snapshot (the two Fjarstýring center controls and the RÚV/RÚV 2
  play buttons).
- [ ] Localize RÚV news relative timestamps; cards render English strings such
  as `2 hours ago` and `5 hours ago` in an otherwise Icelandic UI.
- [ ] Include a weekday/date for non-today EPG rows. RÚV 2's correctly ordered
  Sun/Mon/Tue schedule appeared as repeated/out-of-order bare times (19:00,
  19:00, 19:40, 18:00) because the day was hidden.
- [ ] Review the 21 non-error Svelte warnings reported by `tvctl kit check` and
  either fix them or record a specific accepted rationale.

## Completed in this QA pass

- [x] Fixed tablet startup compile failure: `class:spinning` was invalid on the
  `RefreshCw` component in `apps/remote/src/DeilduPage.svelte`.
- [x] Fixed radio/video switching: `HlsPlayer` now rebinds after Svelte replaces
  the `<video>` element with `<audio>`. Real-TV radio playback and analyser bars
  were verified (`07-realtv-radio-playing.png`); PipeWire showed active Chrome
  output.
- [x] Corrected `dashboardContent()`'s return annotation so TV-local TypeScript
  checking completes.
- [x] Verified dashboard has zero interactive controls and zero scrollbar width;
  verified remote radio tuning, favourite toggle/persistence, volume sync, and
  the Dagskrá panel.
- [x] Left the TV powered on with Rás 2 paused at 38% volume.
