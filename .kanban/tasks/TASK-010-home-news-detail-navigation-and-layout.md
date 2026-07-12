---
id: TASK-010
title: "Link Heim news cards to polished full articles"
status: review
priority: medium
assignee: "pi"
epic: ""
created: "2026-07-12"
updated: "2026-07-12"
---

# TASK-010: Link Heim news cards to polished full articles

## Context

News articles shown on the main Heim page should open the matching full article in the detailed Fréttir view. The full view needs complete, correctly rendered imagery and consistent spacing.

## Done

- [x] Selecting a news article on Heim navigates to the detailed Fréttir page for that exact article.
- [ ] Navigation works through the existing shared TV/tablet command and state flow, including back navigation, without duplicating article state in either client.
- [x] The full article view displays every available article image in source order with the correct aspect ratio and no unintended cropping, stretching, or overflow.
- [ ] Missing or failed images leave an intentional layout rather than broken-image chrome or empty excess space.
- [ ] Article heading, metadata, body, captions, and images use consistent padding, spacing, and readable line lengths on the TV and tablet layouts.
- [ ] The work coordinates with `TASK-001` so its existing image and typography fixes are reused rather than reimplemented.
- [ ] Automated checks cover article selection, exact-detail routing, back navigation, and articles with multiple or missing images; `tvctl kit check` passes.
- [ ] Browser verification confirms the Heim-to-Fréttir flow and polished layout at both TV and tablet viewport sizes.

## Subtasks

- [ ] SUB-001 Connect Heim news-card selection to the existing detailed Fréttir route/state.
- [ ] SUB-002 Reuse and finish the article image handling tracked in `TASK-001`.
- [ ] SUB-003 Polish responsive article spacing and verify both clients.

## Notes

Implemented with the existing news route/state and shared HTML image extraction. Heim news cards open the matching Fréttir article; body images render uncropped in source order. Runtime visual verification remains pending.
