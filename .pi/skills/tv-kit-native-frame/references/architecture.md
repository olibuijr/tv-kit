# Native frame architecture

The native frame is a display-only Qt/QML replacement for the Chrome dashboard client.

```text
tablet remote -- WebSocket commands --> tvserverd --> SQLite + aria2 + one mpv
                                      |                 |
                                      +--> Qt/QML TV Frame
                                             WebSocket state + HTTP dashboard content
```

The frame reconnects with the stable identity `native-frame-<machine-id>`, sends application ping every 10 seconds, and marks health stale at 30 seconds. Content is fetched from the same dashboard endpoints and refreshed after a `content-refresh` event.

Do not persist `HomeState` or catalog data in the frame. The only file written by the client is the bounded liveness record consumed by `tvctl kit frame health`.

For playback, libmpv must be rendered in the Qt Quick scene beneath the QML HUD. It replaces the standalone mpv window only once the native player has equivalent readiness, cache, stream, stop, and remote-command behavior. Until then the frame is the dashboard port and the existing single mpv process remains the player authority.
