# TV Kit cast ingress

TV Kit accepts a received video stream through `POST /cast/session`. The receiver must be a native Arch Linux adapter that converts the device session to a browser-readable HTTP(S) stream (HLS or a regular progressive video URL), then calls the API.

The API intentionally does not claim to implement AirPlay, Google Cast, or Miracast itself. Those protocols require native receivers; a browser cannot receive an AirPlay/Android mirror session. The endpoint is the hand-off point so the dashboard can own playback state.

## Contract

Send `POST /cast/session` to `tvserverd` with `x-tv-kit-cast-token: $CAST_INGRESS_TOKEN`:

```json
{
  "source": "airplay",
  "mode": "stream",
  "url": "http://127.0.0.1:8090/cast/index.m3u8",
  "title": "Myndband úr síma",
  "subtitle": "",
  "deviceName": "Ólafur iPhone",
  "duration": 0
}
```

`source` is `airplay`, `android-cast`, or `miracast`; `mode` is `stream` or `mirror`. A mirror session should provide an HLS URL produced by the native receiver/transcoder. When the session starts, TV Kit pauses the previous player, switches to the cast video, and sets fullscreen. Stop it with `DELETE /cast/session` or the `cast-stop` WebSocket command; the previous media and play state are restored.

## Arch constraint

Do not install GNOME components on the TV. Use only Arch packages and a native receiver adapter. The official repositories currently provide useful building blocks such as `ffmpeg`, `gst-rtsp-server`, `scrcpy`, and `wl-mirror`, but they are not AirPlay/Miracast receiver implementations. An actual wireless receiver still needs an Arch/AUR adapter or a separately maintained native service that posts this contract.
