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
    font.family: Theme.fontFamily
    palette.window: Theme.bg
    palette.windowText: Theme.ink
    palette.button: Theme.raised
    palette.buttonText: Theme.ink
    palette.base: Theme.surface
    palette.text: Theme.ink
    palette.highlight: Theme.selection
    palette.highlightedText: Theme.ink

    FrameClient { id: frame; Component.onCompleted: start() }

    readonly property var state: frame.state
    readonly property var content: frame.content
    readonly property var media: state.media || ({})
    readonly property string view: state.view || "home"
    readonly property bool power: state.power !== false
    // mpv is embedded as a normal QML item (video) — no separate window, no
    // window-manager stacking. "Video active" just means the menu chrome
    // (declared below, later = on top) should hide so the video shows.
    readonly property bool mpvActive: media.engine === "mpv" && Boolean(media.src)
    readonly property bool videoActive: mpvActive && media.fullscreen === true
        && media.kind !== "radio" && media.kind !== "music" && media.kind !== "podcast"
    readonly property bool ambientActive: media.ambient === true
    property real now: Date.now()
    property int wallpaperRevision: frameWallpaperStartIndex
    readonly property string wallpaperSource: frameWallpaperUrls.length
        ? frameWallpaperUrls[wallpaperRevision % frameWallpaperUrls.length] : ""
    readonly property real homeVideoWidth: Math.min(
        homeView.liveVideoContainer.width,
        Math.max(1, homeView.liveVideoContainer.height - Theme.videoTopInset) * 16 / 9
            * Theme.videoScale)
    readonly property real homeVideoHeight: homeVideoWidth * 9 / 16

    // Screen element snapshot for frame-health.json — lets non-vision
    // agents verify what the native frame displays without a screenshot.
    function updateScreenElements() {
        const viewLabels = {home:"Heim", tv:"Sjónvarp", radio:"Útvarp", podcasts:"Hlaðvörp", media:"Sarpurinn", deildu:"Deildu", news:"Fréttir"}
        const viewName = viewLabels[root.view] || "TV Kit"
        const dateText = Qt.formatDateTime(new Date(root.now), "dddd, d. MMMM")
        const clockText = Qt.formatDateTime(new Date(root.now), "hh:mm:ss")
        const connText = frame.connected ? "Tengt" : "Tengist"
        const statusText = (root.media.src || root.media.status === "loading" || root.media.status === "error") ? (root.media.title || (root.media.live ? "Í BEINNI" : "")) : ""
        const arr = [
            {role: "heading", text: viewName},
            {role: "date", text: dateText},
            {role: "clock", text: clockText},
            {role: "connection", text: connText},
        ]
        if (statusText) arr.push({role: "now_playing", text: statusText})
        frame.screenElements = arr
    }

    onNowChanged: updateScreenElements()
    onViewChanged: updateScreenElements()
    property int _mediaProgramId: 0
    onStateChanged: {
        const id = (state.mediaProgramId || 0)
        if (id && id !== _mediaProgramId) {
            _mediaProgramId = id
            frame.fetchProgram(id)
        }
    }

    // Auto-hide HUD and cursor after 5s of no media changes.
    property int hudAutoToken: 0
    property bool hudAutoVisible: false
    property bool cursorHidden: false
    property string _prevView: ""
    property string _prevMediaId: ""
    property string _prevMediaStatus: ""
    property bool _prevPlaying: false
    property int _prevVolume: -1
    property bool _prevMuted: false
    property real _prevPlaybackRate: 1
    property string _prevPanel: ""
    property string _prevSubtitleTrack: ""
    property string _prevAudioTrack: ""
    property bool _prevFullscreen: false
    property int _prevSeekToken: -1

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

    Timer {
        interval: frameWallpaperRotationMs
        running: interval > 0 && frameWallpaperUrls.length > 1
        repeat: true
        onTriggered: root.wallpaperRevision += 1
    }

    Image {
        anchors.fill: parent
        source: root.wallpaperSource
        fillMode: Image.PreserveAspectCrop
        asynchronous: true
        cache: false
        opacity: status === Image.Ready ? Theme.wallpaperOpacity : 0
        Behavior on opacity { NumberAnimation { duration: Theme.motionNormal; easing.type: Easing.OutCubic } }
    }

    Rectangle {
        id: homeVideoMask
        width: root.homeVideoWidth
        height: root.homeVideoHeight
        radius: Theme.radiusHero
        color: Theme.ink
        visible: false
        layer.enabled: true
    }

    MpvVideo {
        id: video
        cropToFill: false
        x: root.ambientActive && root.view === "home" ? Theme.marginX : 0
        y: root.ambientActive && root.view === "home"
            ? Theme.headerHeight + Theme.viewTopMargin + Theme.videoTopInset : 0
        width: root.ambientActive && root.view === "home" ? root.homeVideoWidth : root.width
        height: root.ambientActive && root.view === "home" ? root.homeVideoHeight : root.height
        layer.enabled: Boolean(root.media.panel) || (root.ambientActive && root.view === "home")
        layer.effect: MultiEffect {
            maskEnabled: root.ambientActive && root.view === "home"
            maskSource: homeVideoMask
        }

        onPositionChanged: {
            const t = Date.now()
            if (t - root.lastProgressSentAt < 1000) return
            root.lastProgressSentAt = t
            frame.sendCommand("media-progress", position)
        }
        onDurationChanged: if (duration > 0) frame.sendCommand("media-duration", duration)
        onPlaybackRestarted: frame.sendCommand("player-status", "ready")
        onPausedForCacheChanged: {
            // Symmetric status: a cache underrun shows the LoadingOverlay
            // ("loading"); cache recovery MUST clear it ("ready"), otherwise the
            // overlay stays stuck over playing video after any mid-stream
            // rebuffer (audio + advancing time-pos behind a frozen 100% screen).
            frame.sendCommand("player-status", pausedForCache ? "loading" : "ready")
        }
        onBufferingPercentChanged: {
            const t = Date.now()
            if (t - root.lastBufferingSentAt < 500) return
            root.lastBufferingSentAt = t
            frame.sendCommand("media-buffering", bufferingPercent)
        }
        onTrackReportChanged: if (trackReport.source) frame.sendCommand("player-tracks", trackReport)
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
            const curVolume = root.state.volume ?? 100
            const curMuted = root.state.muted === true
            const curRate = root.media.playbackRate || 1
            const curPanel = root.media.panel || ""
            const curSubtitle = root.media.subtitleTrack || ""
            const curAudio = root.media.audioTrack || ""
            const curFullscreen = root.media.fullscreen === true
            const curSeekToken = root.media.seekToken || 0
            if (curView !== root._prevView || curId !== root._prevMediaId
                || curStatus !== root._prevMediaStatus || curPlaying !== root._prevPlaying
                || curVolume !== root._prevVolume || curMuted !== root._prevMuted
                || curRate !== root._prevPlaybackRate || curPanel !== root._prevPanel
                || curSubtitle !== root._prevSubtitleTrack || curAudio !== root._prevAudioTrack
                || curFullscreen !== root._prevFullscreen || curSeekToken !== root._prevSeekToken) {
                root.bumpHud()
            }
            root._prevView = curView
            root._prevMediaId = curId
            root._prevMediaStatus = curStatus
            root._prevPlaying = curPlaying
            root._prevVolume = curVolume
            root._prevMuted = curMuted
            root._prevPlaybackRate = curRate
            root._prevPanel = curPanel
            root._prevSubtitleTrack = curSubtitle
            root._prevAudioTrack = curAudio
            root._prevFullscreen = curFullscreen
            root._prevSeekToken = curSeekToken

            const src = root.media.src || ""
            if (root.mpvActive) {
                if (src !== root.lastLoadedSrc) {
                    root.lastLoadedSrc = src
                    video.loadSource(src)
                }
                video.setPaused(root.state.playing !== true || !root.power)
                video.setVolumePercent(root.state.volume ?? 100)
                video.setMuted(root.state.muted === true)
                video.setPlaybackRate(root.media.playbackRate || 1)
                video.selectSubtitle(root.media.subtitleTrack || "Slökkt")
                video.selectAudio(root.media.audioTrack || "")
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
    Rectangle {
        anchors.fill: parent
        color: root.ambientActive || !root.mpvActive
            ? Qt.alpha(Theme.bg, Theme.wallpaperScrimOpacity) : Theme.bg
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

    Rectangle {
        anchors.fill: parent
        color: Theme.bg
        visible: !root.power
    }
    // Standby
    Column {
        visible: !root.power
        anchors.centerIn: parent
        spacing: 14
        Text {
            anchors.horizontalCenter: parent.horizontalCenter
            text: Qt.formatDateTime(new Date(root.now), "hh:mm")
            color: Theme.ink; font.pixelSize: Theme.fontStandbyClock; font.weight: Theme.weightSemibold
        }
        Text {
            anchors.horizontalCenter: parent.horizontalCenter
            text: Qt.formatDateTime(new Date(root.now), "dddd, d. MMMM")
            color: Theme.muted; font.pixelSize: Theme.fontTitle
        }
        Text {
            anchors.horizontalCenter: parent.horizontalCenter
            text: "Kveiktu með fjarstýringunni"
            color: Theme.faint; font.pixelSize: Theme.fontSection
        }
    }

    ColumnLayout {
        visible: root.power && !root.videoActive
        anchors.fill: parent
        spacing: 0

        // Header
        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: Theme.headerHeight
            color: Theme.glassHeader
            Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: Theme.stroke; color: Theme.glassEdge }
            RowLayout {
                anchors.fill: parent
                anchors.leftMargin: Theme.marginX
                anchors.rightMargin: Theme.marginX
                spacing: 26
                Text {
                    text: ({home:"Heim", tv:"Sjónvarp", radio:"Útvarp", podcasts:"Hlaðvörp", media:"Sarpurinn", deildu:"Deildu", news:"Fréttir"})[root.view] || "TV Kit"
                    color: Theme.ink; font.pixelSize: Theme.fontPageTitle; font.weight: Theme.weightSemibold
                    Layout.fillWidth: true
                }
                Text {
                    text: Qt.formatDateTime(new Date(root.now), "dddd, d. MMMM")
                    color: Theme.muted; font.pixelSize: Theme.fontCardTitle
                }
                Rectangle {
                    Layout.preferredHeight: 34
                    Layout.preferredWidth: statusLabel.implicitWidth + 26
                    radius: Theme.radiusPill
                    color: Qt.alpha(frame.connected ? Theme.good : Theme.warning, 0.12)
                    Text {
                        id: statusLabel
                        anchors.centerIn: parent
                        text: frame.connected ? "Tengt" : "Tengist"
                        color: frame.connected ? Theme.good : Theme.warning
                        font.pixelSize: Theme.fontCallout; font.weight: Theme.weightSemibold
                    }
                }
                Text {
                    text: Qt.formatDateTime(new Date(root.now), "hh:mm:ss")
                    color: Theme.ink; font.pixelSize: Theme.fontClock; font.weight: Theme.weightSemibold; font.family: Theme.monoFontFamily
                }
            }
        }

        // Active view
        StackLayout {
            Layout.fillWidth: true
            Layout.fillHeight: true
            Layout.leftMargin: Theme.marginX
            Layout.rightMargin: Theme.marginX
            Layout.topMargin: Theme.viewTopMargin
            Layout.bottomMargin: Theme.viewBottomMargin
            currentIndex: Math.max(0, ["home", "tv", "radio", "podcasts", "media", "deildu", "news"].indexOf(root.view))

            HomeView { id: homeView; state: root.state; content: root.content; now: root.now }
            TvView { state: root.state; content: root.content; now: root.now }
            RadioView { state: root.state; stations: frame.stations }
            PodcastView { state: root.state; content: root.content }
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
            && !root.ambientActive
            && ((root.mpvActive && !root.videoActive)
                || Boolean(root.media.panel)
                || (root.hudAutoVisible
                    && (root.state.playing || root.media.status === "loading" || root.media.status === "error")))
        opacity: visible ? 1 : 0
        Behavior on opacity { NumberAnimation { duration: Theme.motionProgress } }
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
