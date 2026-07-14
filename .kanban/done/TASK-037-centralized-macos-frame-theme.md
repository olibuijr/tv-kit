---
id: TASK-037
title: "Centralize and apply macOS-style TV Frame theme"
status: done
priority: high
assignee: "Main"
epic: ""
created: "2026-07-14"
updated: "2026-07-14"
---

# TASK-037: Centralize and apply macOS-style TV Frame theme

## Context

Make the native TV Frame visually macOS-like without changing its layout. Keep one public theme entry point backed by small focused QML style files so visual edits stay fast and consistent.

## Done

- [x] `Theme.qml` is the single public UI-style entry point.
- [x] Focused palette, typography, metrics, motion, and wallpaper files feed `Theme.qml`.
- [x] Frame views use centralized semantic tokens instead of scattered visual constants.
- [x] Primary page layout and display-only interaction model remain unchanged; the home video geometry follows the user's explicit alignment request.
- [x] Curated Iceland SourceSplash wallpapers rotate every ten minutes behind translucent materials.
- [x] Native frame builds and tests on Titan.
- [x] Frame is deployed and verified through fresh health plus a physical screenshot.

## Subtasks

- [x] SUB-001 Add focused QML theme singletons.
- [x] SUB-002 Apply centralized macOS material styling.
- [x] SUB-003 Build, deploy, and inspect the live frame.

## Notes

- `.refrepos/qt-liquid-glass` is AppKit/QWidget-oriented and no-ops on Linux; the Arch/QML frame must use Qt Quick materials and effects.
- Do not add fake macOS traffic lights or interactive controls to the fullscreen display-only surface.
- SourceSplash CLI verified four Iceland images before their stable URLs were configured.
- `tvctl kit frame test`: build succeeded; `frameclient` passed.
- `tvctl kit verify`: server, remote, WebSocket ping/pong, and persistent services passed.
- Final frame health: connected on `home`, with `Tengt` and RÚV now-playing state.
- Physical proof: `/tmp/tv-frame-rounded-video.png`; video is 16:9, left/top/bottom aligned to the content grid, 10% enlarged, and rounded to `Theme.radiusHero`.
