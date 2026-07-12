# TV Kit AI agent tool index

This is the shared operational index for external coding agents and TV Kit's internal chat agent. External agents load `.pi/skills/tv-kit-operations/SKILL.md`; the internal agent receives its executable tools from `apps/server/src/agent.ts`.

## Choose the tool

| Need | External agent | Internal TV Kit agent |
| --- | --- | --- |
| Open a TV Kit page | Native `agent_browser` on the tablet remote, then verify dashboard DOM | `set_tv_view` or “Opnaðu Deildu/Sarp/Sjónvarp/Útvarp/Fréttir/Heim” |
| Read TV state | Dashboard DOM or TV Kit API | `get_tv_state` |
| List/tune RÚV channels | Tablet remote; `tvctl kit fullscreen ruv | ruv2` for fullscreen | `list_tv_channels`, `tune_tv_channel` |
| Play/pause | Tablet remote | `toggle_playback` |
| Stream a torrent video | Tablet remote → Deildu list or Sarpur → Kvikmyndir card (streams on demand into the GlobalPlayer HUD via the shared aria2 engine; H.264/AAC only) | Not exposed |
| Set volume | Tablet remote | `set_volume` (0–100) |
| Deploy source | `tvctl kit sync "message"` | Not permitted |
| Tests/typechecks | `tvctl kit check [warnings]` | Not permitted |
| Service/WS health | `tvctl kit status`; `tvctl kit verify` | Not permitted |
| EPG inspect/refresh | `tvctl kit epg status | sync` | Not permitted |
| Logs/restart | `tvctl kit logs [unit] [lines]`; `tvctl kit restart [unit]` | Not permitted |
| Device status | `tvctl doctor | status | now | tablet` | Not permitted |
| Pixel/video proof | `tvctl screenshot /tmp/tv-verify.png` | Not permitted |

Use the explicit CLI path:

```bash
/home/olafurbui/.local/bin/tvctl COMMAND
```

## Common external workflows

### Change a page

1. Open `http://192.168.1.12:3112/` with native `agent_browser`.
2. Take `snapshot -i` and click the current `Deildu`, `Sarpur`, `Sjónvarp`, `Útvarp`, `Fréttir`, or `Heim` control.
3. Open/read `http://192.168.1.12:3111/` in a `tv-dashboard` browser session and confirm the expected heading/content.

Never infer success from the tablet UI alone.

### Deploy code

```bash
/home/olafurbui/.local/bin/tvctl doctor
/home/olafurbui/.local/bin/tvctl kit check
/home/olafurbui/.local/bin/tvctl kit sync "short change summary"
```

Code hot-reloads. Restart only when a service/unit/dependency change requires it.

### Verify runtime changes

```bash
/home/olafurbui/.local/bin/tvctl kit verify
/home/olafurbui/.local/bin/tvctl kit status
```

`kit verify` checks enabled/active units, all HTTP endpoints, and WebSocket ping/pong.

### Diagnose EPG

```bash
/home/olafurbui/.local/bin/tvctl kit epg status
/home/olafurbui/.local/bin/tvctl kit epg sync
```

A real schedule gap is valid; never invent or extend programmes.

### Keep live TV fullscreen

```bash
/home/olafurbui/.local/bin/tvctl kit fullscreen ruv
/home/olafurbui/.local/bin/tvctl kit fullscreen ruv2
/home/olafurbui/.local/bin/tvctl kit fullscreen off
```

Tuning resets fullscreen, so always use this command instead of separate tune/fullscreen actions.

## Internal agent usage

The internal agent may perform only its declared function tools. It must use a tool before claiming an action succeeded and must not expose configuration or secrets.

Examples:

- “Opnaðu Deildu.” → `set_tv_view({"view":"deildu"})`
- “Skiptu yfir á RÚV 2.” → `tune_tv_channel({"slug":"ruv2"})`
- “Stilltu hljóðið á 35.” → `set_volume({"volume":35})`
- “Hvað er í gangi?” → `get_tv_state({})`

Common page values: `home`, `tv`, `radio`, `media` (Sarpur), `deildu`, `news`.

## Safety and authority

- SQLite on TV is authoritative; never mutate it manually.
- Clients use tvserverd APIs/WebSockets, never direct database writes.
- Secrets stay in protected environment/vault files, never source, Markdown, logs, or command arguments.
- Dashboard is display-only; interactive controls belong on the tablet remote.
- Use native `agent_browser`, never ad-hoc Playwright/Puppeteer/browser shell scripts.
- Use `tvctl screenshot` only for visual evidence; DOM text is authoritative for state/navigation.
