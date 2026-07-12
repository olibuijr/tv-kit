---
id: TASK-006
title: "Validate Deildu title cleanup output"
status: in-progress
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

- [ ] Validator classifies clean output as accept, review, or reject with reasons.
- [ ] Tests cover valid movie/episode records and representative outliers.
- [ ] TV-local checks pass.

## Subtasks

- [ ] SUB-001 Add the dependency-free validator.
- [ ] SUB-002 Add focused Bun tests and verify them on TV.

## Notes

- Rejected/review records must remain uncleaned for retry or human inspection.
