---
id: TASK-037
title: "Centralize and apply macOS-style TV Frame theme"
status: in-progress
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

- [ ] `Theme.qml` is the single public UI-style entry point.
- [ ] Focused palette, typography, metrics, and motion files feed `Theme.qml`.
- [ ] Frame views use centralized semantic tokens instead of scattered visual constants.
- [ ] Existing layout geometry and display-only interaction model remain unchanged.
- [ ] Native frame builds and tests on Titan.
- [ ] Frame is deployed and verified through fresh health plus a physical screenshot.

## Subtasks

- [ ] SUB-001 Add focused QML theme singletons.
- [ ] SUB-002 Apply centralized macOS material styling.
- [ ] SUB-003 Build, deploy, and inspect the live frame.

## Notes

- `.refrepos/qt-liquid-glass` is AppKit/QWidget-oriented and no-ops on Linux; the Arch/QML frame must use Qt Quick materials and effects.
- Do not add fake macOS traffic lights or interactive controls to the fullscreen display-only surface.
