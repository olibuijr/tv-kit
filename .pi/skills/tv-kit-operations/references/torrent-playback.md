# Torrent playback contract

## Architecture

- In normal TV Kit mode, keep exactly one aria2 process and one on-demand mpv process, both owned by `tvserverd`.
- aria2 downloads selected torrent pieces; it is not the player.
- `serveStream` exposes only verified pieces over HTTP 206 byte ranges.
- Native mpv is the default torrent engine; browser torrent playback is feature-gated and off by default.
- Completed, piece-verified torrents are passed to mpv as local files; only incomplete torrents use the progressive HTTP endpoint.
- For multi-file torrents, aria2 writes `<torrent-name>.aria2` beside the top-level download directory. A full apparent media-file size is not complete while that control file exists.
- Never report success until mpv time advances.

## Upstream semantics

- aria2 `--bt-prioritize-piece=head=SIZE,tail=SIZE` raises piece priority for previewing; it does not guarantee availability or readiness: <https://aria2.github.io/manual/en/html/aria2c.html#cmdoption-bt-prioritize-piece>
- aria2 `tellStatus` is the source for status, speed, bitfield, and error state: <https://aria2.github.io/manual/en/html/aria2c.html#aria2.tellStatus>
- RFC 9110 permits a 206 response to satisfy only a subset of the requested range when the rest is temporarily unavailable. `Content-Range` and `Content-Length` must describe the bytes actually returned: <https://www.rfc-editor.org/rfc/rfc9110.html#name-206-partial-content>
- mpv recommends JSON IPC for programmatic control. `file-loaded` means a file loaded and begins playback; cache truth is exposed by `paused-for-cache`, `cache-buffering-state`, `demuxer-cache-duration`, and `core-idle`: <https://mpv.io/manual/stable/#json-ipc>, <https://mpv.io/manual/stable/#property-list>
- mpv network cache behavior is controlled by `cache`, `cache-pause`, `cache-pause-initial`, `cache-pause-wait`, `cache-secs`, `demuxer-max-bytes`, and `stream-buffer-size`: <https://mpv.io/manual/stable/#cache>

## Required workflow

1. Search once and select one item.
2. Start once with `tvctl kit playback deildu ITEM_ID`.
3. Require `engine:"mpv"`, `status:"ready"`, position growth, and real pixels. Treat URL assignment, `playing:true`, black pixels, browser fallback, or position 0 as failure unless an explicit browser-engine experiment is in scope.
4. On no frames within the CLI deadline, send `stop-playback`; unload mpv, stop aria2, clear `src`, exit fullscreen, and persist failure. Never retry automatically.
5. Inspect `tvctl kit playback state`, `tvctl kit logs tvserverd 100`, one physical screenshot, and exact process counts.

## Load and orphan rules

- Do not persist or broadcast progress from HTTP range polling. One bounded monitor owns aria2 progress writes.
- Serve at most the currently available torrent piece per 206 response; do not hold large open-ended ranges in memory.
- Never infer completion from file size or a stale DB status alone; require the correct top-level aria2 control file to be absent.
- Keep hardware decode and audio-master video synchronization enabled through `MPV_HWDEC` and `MPV_VIDEO_SYNC`.
- A server restart clears transient torrent playback because the producer cannot be resumed safely from persisted UI state.
- Never launch an idle fullscreen mpv window at server startup; start it on demand and let its window close when playback stops.
- Restart/deploy cleanup must remove stale Chrome, mpv, aria2, and playback-verifier processes before creating one intended player.

## Direct maintenance mode

- Stop TV Kit media/kiosk services and use exactly one systemd-owned `tv-direct-mpv.service`; do not run a direct player beside the normal stack.
- Use only piece-verified local media. Require VA-API, near-zero `avsync`, zero/stable frame drops, and one PipeWire sink.
- `Invalid NAL unit size`, invalid audio PTS, or widespread decoder errors mean the file contains invalid/missing pieces. Resume aria2 with integrity checking; do not add WebTorrent or keep tuning mpv.
- `tvctl mpv tracks` is read-only. Track changes use `tvctl mpv audio ID|auto|off` and `tvctl mpv subtitle ID|auto|off`.
