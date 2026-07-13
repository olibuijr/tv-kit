# libmpv in the TV Frame

Use the official mpv libmpv Qt examples as the rendering reference. The TV runs Wayland, so do not use X11 `--wid` embedding or separate-window stacking.

- Render mpv through a Qt Quick/OpenGL item in the same QML scene.
- Keep the render item beneath the QML HUD.
- Connect to the existing `MPV_IPC_SOCKET` or make the native frame the only mpv owner; never create a second player process.
- Test progressive torrents with native mpv, advancing `time-pos`, and a physical TV screenshot.
