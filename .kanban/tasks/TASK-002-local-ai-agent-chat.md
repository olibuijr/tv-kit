---
id: TASK-002
title: "Add local AI agent chat to the TV Kit remote"
status: in-progress
priority: high
assignee: "pi"
epic: ""
created: "2026-07-12"
updated: "2026-07-12"
---

# TASK-002: Add local AI agent chat to the TV Kit remote

## Context

Add a Chat entry point to the application, backed by Titan's local Qwythos OpenAI-compatible model through tvserverd, with safe TV Kit context/instructions and basic TV control tools.

## Done

- [ ] Remote has an accessible Chat button and chat page.
- [ ] tvserverd exposes a server-side chat route without exposing the model API key.
- [ ] Chat uses the local model with TV Kit system instructions and safe tool calls.
- [ ] Tool results and errors render clearly in the chat UI.
- [ ] Tests and typechecks pass; deployed behavior is verified.

## Subtasks

- [ ] SUB-001 Trace remote/server navigation and local model configuration.
- [ ] SUB-002 Implement chat API, instructions, and bounded tools.
- [ ] SUB-003 Implement the chat page and navigation entry point.
- [ ] SUB-004 Run checks, deploy, and verify the chat flow.

## Notes

- No dedicated ui-ux-pro skill is installed in this Pi environment; follow the existing TV Kit visual language and keep the first slice minimal.
