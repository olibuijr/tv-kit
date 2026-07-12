# TV Kit tasks

## QA follow-up — 2026-07-12

Browser QA used isolated `agent-browser` sessions for the 1920×1080 TV dashboard
and 1280×800 tablet remote. Evidence is in `artifacts/qa/`.

- [x] Removed remote player overlap and added bottom safe space for the fixed nav.
- [x] Reset document scroll to the top on every remote tab change (verified).
- [x] Restored Deildu's horizontal panel heading.
- [x] Fixed Deildu named entities and legacy Windows-1252 response decoding;
  forced a refresh successfully (14 categories, 1,142 items).
- [x] Named every remote icon-only action, including playback, mute, TV channel,
  and radio favourite controls (0 unnamed buttons in the browser audit).
- [x] Replaced browser-dependent English relative times with Icelandic strings.
- [x] Labelled non-today dashboard EPG rows with their Icelandic weekday.
- [x] Cleared all Svelte diagnostics; `tvctl kit check warnings` now reports
  0 errors and 0 warnings.
- [x] Confirmed the dashboard header is one global header outside every page
  branch, preserving its TV Kit, date/location, connection, and clock widgets
  on Home, Deildu, Sarpur, Fréttir, TV, and radio views.

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
- [x] Made the remote Deildu category selection SQLite-backed shared state; the
  dashboard now filters the existing page (verified for Sjónvarpsefni in
  `artifacts/qa/20-dashboard-sjonvarpsefni-filtered.png`).
- [x] Made the dashboard GlobalPlayer fly down/out while playback is paused or
  idle, then remount when playback resumes.
