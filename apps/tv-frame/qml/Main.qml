import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import QtQuick.Effects
import Tv.Frame

ApplicationWindow {
    id: root
    width: 1920
    height: 1080
    visible: true
    visibility: Window.FullScreen
    color: Theme.bg
    title: "TV Kit"

    FrameClient { id: frame; Component.onCompleted: start() }

    readonly property var state: frame.state
    readonly property var content: frame.content
    readonly property var media: state.media || ({})
    readonly property string view: state.view || "home"
    readonly property bool power: state.power !== false
    // mpv is embedded as a normal QML item (video) — no separate window, no
    // window-manager stacking. "Video active" just means the menu chrome
    // (declared below, later = on top) should hide so the video shows.
    readonly property bool videoActive: media.engine === "mpv"
        && media.kind !== "radio" && media.kind !== "music"
        && Boolean(media.src)
    property real now: Date.now()

    // Auto-hide HUD and cursor after 5s of no media changes.
    property int hudAutoToken: 0
    property bool hudAutoVisible: false
    property bool cursorHidden: false
    property string _prevView: ""
    property string _prevMediaId: ""
    property string _prevMediaStatus: ""
    property bool _prevPlaying: false

    function bumpHud() {
        root.hudAutoToken += 1
        root.hudAutoVisible = true
        hudHideTimer.restart()
        root.cursorHidden = false
        cursorHideTimer.restart()
    }

    Timer {
        id: hudHideTimer
        interval: 5000
        onTriggered: root.hudAutoVisible = false
    }

    Timer {
        id: cursorHideTimer
        interval: 5000
        onTriggered: root.cursorHidden = true
    }

    // Playback-sync bookkeeping (mirrors what tvserverd's mpvPlayer.ts used
    // to do server-side; mpv now lives in this process, so this process
    // drives it directly from state and reports progress back over the
    // frame's own WebSocket command channel).
    property string lastLoadedSrc: ""
    property int lastSeekToken: -1
    property real lastProgressSentAt: 0
    property real lastBufferingSentAt: 0

    Timer {
        interval: 1000; running: true; repeat: true
        onTriggered: root.now = Date.now()
    }

    MpvVideo {
        id: video
        anchors.fill: parent
        layer.enabled: Boolean(root.media.panel)

        onPositionChanged: {
            const t = Date.now()
            if (t - root.lastProgressSentAt < 1000) return
            root.lastProgressSentAt = t
            frame.sendCommand("media-progress", position)
        }
        onDurationChanged: if (duration > 0) frame.sendCommand("media-duration", duration)
        onPlaybackRestarted: frame.sendCommand("player-status", "ready")
        onPausedForCacheChanged: {
            if (pausedForCache) frame.sendCommand("player-status", "loading")
        }
        onBufferingPercentChanged: {
            const t = Date.now()
            if (t - root.lastBufferingSentAt < 500) return
            root.lastBufferingSentAt = t
            frame.sendCommand("media-buffering", bufferingPercent)
        }
        onEndOfFile: (reason) => {
            if (reason === "eof") frame.sendCommand("set-playing", false)
        }
    }

    Connections {
        target: frame
        function onStateChanged() {
            // HUD auto-show on view, media identity, status, or playing changes
            const curView = root.state.view || "home"
            const curId = (root.state.media && root.state.media.id) || ""
            const curStatus = (root.state.media && root.state.media.status) || ""
            const curPlaying = root.state.playing === true
            if (curView !== root._prevView || curId !== root._prevMediaId
                || curStatus !== root._prevMediaStatus || curPlaying !== root._prevPlaying) {
                root.bumpHud()
            }
            root._prevView = curView
            root._prevMediaId = curId
            root._prevMediaStatus = curStatus
            root._prevPlaying = curPlaying

            const src = root.media.src || ""
            if (root.videoActive) {
                if (src !== root.lastLoadedSrc) {
                    root.lastLoadedSrc = src
                    video.loadSource(src)
                }
                video.setPaused(root.state.playing !== true)
                const token = root.media.seekToken || 0
                if (root.lastSeekToken === -1) {
                    root.lastSeekToken = token
                } else if (token !== root.lastSeekToken) {
                    root.lastSeekToken = token
                    video.seekAbsolute(root.media.currentTime || 0)
                }
            } else if (root.lastLoadedSrc !== "") {
                root.lastLoadedSrc = ""
                video.stop()
            }
        }
    }

    // Opaque menu background — painted after (on top of) the video, and
    // hides entirely while video is active so the embedded mpv shows through.
    Rectangle {
        anchors.fill: parent
        color: Theme.bg
        visible: root.power && !root.videoActive
    }

    // Liquid-glass backdrop for the OSD panel: a blurred copy of the video,
    // full-window but only ever visible where OsdPanel's translucent tint
    // sits above it — every other opaque sibling (header/menu/video itself)
    // paints over it elsewhere. Only rendered while a panel is open.
    MultiEffect {
        anchors.fill: parent
        source: video
        visible: Boolean(root.media.panel)
        blurEnabled: true
        blur: 1.0
        blurMax: 64
    }

    // Standby
    Column {
        visible: !root.power
        anchors.centerIn: parent
        spacing: 14
        Text {
            anchors.horizontalCenter: parent.horizontalCenter
            text: Qt.formatDateTime(new Date(root.now), "hh:mm")
            color: Theme.ink; font.pixelSize: 120; font.bold: true
        }
        Text {
            anchors.horizontalCenter: parent.horizontalCenter
            text: Qt.formatDateTime(new Date(root.now), "dddd, d. MMMM")
            color: Theme.muted; font.pixelSize: 30
        }
        Text {
            anchors.horizontalCenter: parent.horizontalCenter
            text: "Kveiktu með fjarstýringunni"
            color: Theme.faint; font.pixelSize: 22
        }
    }

    ColumnLayout {
        visible: root.power && !root.videoActive
        anchors.fill: parent
        spacing: 0

        // Header
        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: 88
            color: Theme.header
            Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 1; color: Theme.border }
            RowLayout {
                anchors.fill: parent
                anchors.leftMargin: Theme.marginX
                anchors.rightMargin: Theme.marginX
                spacing: 26
                Text { text: "TV KIT"; color: Theme.primary; font.pixelSize: 26; font.bold: true; font.letterSpacing: 3 }
                Text {
                    text: ({home:"Heim", tv:"Sjónvarp", radio:"Útvarp", media:"Sarpurinn", deildu:"Deildu", news:"Fréttir"})[root.view] || "TV Kit"
                    color: Theme.ink; font.pixelSize: 34; font.bold: true
                    Layout.fillWidth: true
                }
                Text {
                    text: Qt.formatDateTime(new Date(root.now), "dddd, d. MMMM")
                    color: Theme.muted; font.pixelSize: 20
                }
                Rectangle {
                    Layout.preferredHeight: 34
                    Layout.preferredWidth: statusLabel.implicitWidth + 26
                    radius: 17
                    color: Qt.alpha(frame.connected ? Theme.good : Theme.accent, 0.14)
                    Text {
                        id: statusLabel
                        anchors.centerIn: parent
                        text: frame.connected ? "Tengt" : "Tengist"
                        color: frame.connected ? Theme.good : Theme.accent
                        font.pixelSize: 17; font.bold: true
                    }
                }
                Text {
                    text: Qt.formatDateTime(new Date(root.now), "hh:mm:ss")
                    color: Theme.ink; font.pixelSize: 30; font.bold: true; font.family: "monospace"
                }
            }
        }

        // Active view
        StackLayout {
            Layout.fillWidth: true
            Layout.fillHeight: true
            Layout.leftMargin: Theme.marginX
            Layout.rightMargin: Theme.marginX
            Layout.topMargin: 18
            Layout.bottomMargin: 12
            currentIndex: Math.max(0, ["home", "tv", "radio", "media", "deildu", "news"].indexOf(root.view))

            HomeView { state: root.state; content: root.content; now: root.now }
            TvView { state: root.state; content: root.content; now: root.now }
            RadioView { state: root.state; stations: frame.stations }
            MediaView { state: root.state; content: root.content }
            DeilduView { state: root.state; content: root.content }
            NewsView { state: root.state; content: root.content; article: frame.article; now: root.now }
        }
    }

    // OSD panel (Dagskrá/EPG, subtitles, audio track) — opaque, drawn above
    // the video whenever a panel is toggled on, on top of the HUD.
    OsdPanel {
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.bottom: hud.top
        open: root.power && Boolean(root.media.panel) && (root.state.playing || root.videoActive)
        media: root.media
        now: root.now
    }

    PlayerHud {
        id: hud
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.bottom: parent.bottom
        visible: root.power
            && root.hudAutoVisible
            && (root.state.playing || root.media.status === "loading" || root.media.status === "error")
        opacity: root.hudAutoVisible ? 1 : 0
        Behavior on opacity { NumberAnimation { duration: 400 } }
        media: root.media
        playing: root.state.playing === true
    }

    LoadingOverlay {
        anchors.fill: parent
        z: 10
        visible: root.power
            && root.media.status === "loading"
            && (root.media.id || "").match(/^(deildu|torrent)-/) !== null
        media: root.media
    }

    // The frame is display-only; this passive overlay only controls the cursor.
    MouseArea {
        anchors.fill: parent
        z: 100
        acceptedButtons: Qt.NoButton
        hoverEnabled: true
        cursorShape: root.cursorHidden ? Qt.BlankCursor : Qt.ArrowCursor
        onPositionChanged: {
            root.cursorHidden = false
            cursorHideTimer.restart()
        }
    }
}
