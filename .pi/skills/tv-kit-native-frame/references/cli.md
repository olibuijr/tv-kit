# TV Frame CLI contract

`tools/tvctl` is the only implementation. Do not add a second frame CLI.

| Command | Purpose | Gate |
| --- | --- | --- |
| `tvctl kit frame build` | Configure and compile the TV-local CMake tree | CMake + Ninja available |
| `tvctl kit frame test` | Build, then run CTest | Build succeeds |
| `tvctl kit frame health` | Require active service and fresh connected health record | 30-second freshness |
| `tvctl kit frame verify [path]` | Health gate plus one physical screenshot | Screenshot must be nonempty |

`frame-health.json` is a transient liveness record only. It is never a source of UI or playback state.

Builds default to two jobs. Set `TV_FRAME_BUILD_JOBS` only to a value from 1 through 4 when the TV has confirmed spare capacity.
