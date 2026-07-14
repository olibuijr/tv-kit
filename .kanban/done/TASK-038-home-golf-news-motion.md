---
id: TASK-038
title: "Refine Heim golf and news widgets"
status: done
priority: medium
assignee: "Main"
epic: ""
created: "2026-07-14"
updated: "2026-07-14"
---

# TASK-038: Refine Heim golf and news widgets

## Context

Improve the native Heim widgets without changing their column layout: give golf time badges breathing room, turn the TV news card into a slow looping thumbnail feed, and align the tablet Heim content and graphite styling without automatic remote scrolling.

## Done

- [x] Tee-time badges have visible bottom padding inside their card.
- [x] Home news items scroll slowly upward and loop continuously.
- [x] Each scrolling news item includes its thumbnail without cropping.
- [x] Native frame builds, deploys, and passes live pixel verification.
- [x] Remote Heim uses matching graphite surfaces, blue accents, content order, and non-cropping news thumbnails.
- [x] Remote Heim remains stationary unless the user scrolls it.

## Subtasks

- [x] SUB-001 Adjust golf card spacing.
- [x] SUB-002 Add looping news motion and thumbnails.
- [x] SUB-003 Deploy and inspect the live Heim view.
- [x] SUB-004 Align and restyle the tablet Heim page.

## Notes

- TV screenshot confirmed added tee-time clearance and the looping thumbnail feed.
- Remote full-page screenshot: `/tmp/tv-remote-heim-parity.png`.
- Remote DOM order is live TV, tee times, news, Sarpurinn, then supplemental facts.
- Remote `window.scrollY` remained `0` across a three-second observation.
- Final frame health remained connected on `home`.
