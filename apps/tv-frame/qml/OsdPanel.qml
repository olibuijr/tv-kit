import QtQuick
import QtQuick.Layouts

// On-screen display panel: Dagskrá (EPG), Skjátextar (subtitles), Hljóðrás
// (audio track). Liquid-glass: a translucent, blurred-backdrop panel that
// slides down into place. Main.qml renders the blur (a full-window MultiEffect
// sampling the video, painted just below this panel in z-order); this
// component only tints + animates. Toggled by the remote's "player-panel"
// command (state.media.panel) via the `open` property; read-only —
// track/subtitle selection stays a remote action, this only displays state.
Item {
    id: panel
    required property var media
    required property real now
    property bool open: false

    height: 320
    clip: true
    visible: opacity > 0.001
    opacity: open ? 1 : 0
    Behavior on opacity { NumberAnimation { duration: Theme.motionPanel; easing.type: Easing.OutCubic } }

    Rectangle {
        id: glass
        width: parent.width
        height: parent.height
        y: panel.open ? 0 : -height
        Behavior on y { NumberAnimation { duration: Theme.motionPanel; easing.type: Easing.OutCubic } }

        color: Theme.glassPanel
        border.color: Theme.glassEdge
        border.width: Theme.stroke

        Rectangle { anchors.top: parent.top; width: parent.width; height: Theme.stroke; color: Theme.glassEdge }

        ColumnLayout {
            anchors.fill: parent
            anchors.margins: 26
            spacing: 14

            Text {
                text: ({epg: "Dagskrá", subtitles: "Skjátextar", audio: "Hljóðrás", queue: "Röð"})[panel.media.panel] || ""
                color: Theme.accent
                font.pixelSize: Theme.fontSection
                font.weight: Theme.weightSemibold
            }

            // EPG: upcoming programme list for the tuned channel.
            ListView {
                visible: panel.media.panel === "epg"
                Layout.fillWidth: true
                Layout.fillHeight: true
                clip: true
                orientation: ListView.Horizontal
                spacing: 16
                model: Theme.futureProgramme(panel.media.epg, panel.now)
                delegate: Rectangle {
                    required property var modelData
                    width: 320
                    height: panel.height - 90
                    radius: Theme.radiusCard
                    color: modelData.current ? Qt.alpha(Theme.selection, 0.16) : Theme.surface
                    border.color: modelData.current ? Theme.selection : Theme.border
                    Column {
                        anchors.fill: parent
                        anchors.margins: 16
                        spacing: 8
                        Text { text: modelData.start; color: Theme.accent; font.pixelSize: Theme.fontBody; font.weight: Theme.weightSemibold; font.family: Theme.monoFontFamily }
                        Text {
                            width: parent.width
                            text: modelData.title
                            color: Theme.ink
                            font.pixelSize: Theme.fontCardTitle
                            font.weight: Theme.weightSemibold
                            wrapMode: Text.WordWrap
                            maximumLineCount: 3
                            elide: Text.ElideRight
                        }
                        Text {
                            width: parent.width
                            text: modelData.detail || ""
                            color: Theme.muted
                            font.pixelSize: Theme.fontCaption
                            wrapMode: Text.WordWrap
                            maximumLineCount: 2
                            elide: Text.ElideRight
                        }
                    }
                }
                Text {
                    visible: (panel.media.epg || []).length === 0
                    anchors.centerIn: parent
                    text: "Engin dagskrá tiltæk."
                    color: Theme.faint
                    font.pixelSize: Theme.fontCardTitle
                }
            }

            // Subtitles / audio track: current selection highlighted (remote-driven).
            Row {
                visible: panel.media.panel === "subtitles" || panel.media.panel === "audio"
                Layout.fillWidth: true
                spacing: 12
                Repeater {
                    model: panel.media.panel === "subtitles" ? (panel.media.subtitles || []) : (panel.media.audioTracks || [])
                    delegate: Rectangle {
                        required property var modelData
                        readonly property bool selected: modelData === (panel.media.panel === "subtitles" ? panel.media.subtitleTrack : panel.media.audioTrack)
                        height: 44
                        width: label.implicitWidth + 32
                        radius: Theme.radiusPill
                        color: selected ? Theme.selection : Theme.raised
                        border.color: selected ? Theme.selection : Theme.border
                        Text { id: label; anchors.centerIn: parent; text: modelData; color: selected ? Theme.ink : Theme.muted; font.pixelSize: Theme.fontBody; font.weight: selected ? Theme.weightSemibold : Theme.weightRegular }
                    }
                }
            }
        }
    }
}
