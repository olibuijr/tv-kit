---
id: TASK-002
title: "Add local AI agent chat to the TV Kit remote"
status: review
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

- [x] Remote has an accessible Chat button and chat page.
- [x] tvserverd exposes a server-side chat route without exposing the model API key.
- [x] Chat uses the local model with TV Kit system instructions and safe tool calls.
- [x] Tool results and errors render clearly in the chat UI.
- [x] Tests and typechecks pass; deployed behavior is verified.

## Subtasks

- [ ] SUB-001 Trace remote/server navigation and local model configuration.
- [ ] SUB-002 Implement chat API, instructions, and bounded tools.
- [ ] SUB-003 Implement the chat page and navigation entry point.
- [ ] SUB-004 Run checks, deploy, and verify the chat flow.

## Notes

- No dedicated ui-ux-pro skill is installed in this Pi environment; followed the existing TV Kit visual language and kept the first slice minimal.
- Added `apps/remote/src/AgentChatPage.svelte`, a `POST/GET /agent/chat` route, migration 12 for chat history, and bounded tools: state, channel listing/tuning, playback toggle, and volume.
- Configured the protected TV env to use Titan's local Qwythos endpoint without exposing the key in source or logs.
- Verified `tvctl kit check` (18 tests, 0 failures; no new Svelte warnings), `tvctl kit verify`, browser chat, `get_tv_state`, `list_tv_channels`, `tune_tv_channel`, and `set_volume`.
- Follow-up UI fix: Chat view now hides the global media player/tools so the chat composer is not rendered underneath it; browser DOM confirms only the chat heading, input, and send control are present.
