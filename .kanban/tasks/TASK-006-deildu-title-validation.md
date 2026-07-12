---
id: TASK-006
title: "Validate Deildu title cleanup output"
status: review
priority: high
assignee: "pi"
epic: ""
created: "2026-07-12"
updated: "2026-07-12"
---

# TASK-006: Validate Deildu title cleanup output

## Context

Guard the planned Titan LLM batch cleanup against malformed, hallucinated, or unusually lossy title transformations.

## Done

- [x] Validator classifies clean output as accept, review, or reject with reasons.
- [x] Tests cover valid movie/episode records and representative outliers.
- [x] TV-local checks pass.

## Subtasks

- [x] SUB-001 Add the dependency-free validator.
- [x] SUB-002 Add focused Bun tests and verify them on TV.

## Notes

- Rejected/review records must remain uncleaned for retry or human inspection.
- `tvctl kit check`: 25 tests, 0 failures, 0 Svelte errors/warnings.
