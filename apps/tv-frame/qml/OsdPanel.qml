import QtQuick
import QtQuick.Layouts

// On-screen display panel: Dagskrá (EPG), Skjátextar (subtitles), Hljóðrás
// (audio track). Opaque so it stays legible when composited above fullscreen
// mpv video. Toggled by the remote's "player-panel" command
// (state.media.panel); read-only — track/subtitle selection stays a remote
// action, this only displays current state.
Rectangle {
    id: panel
    required property var media
    required property real now

    height: 320
    color: Theme.header
    border.color: Theme.border
    border.width: 1

    Rectangle { anchors.top: parent.top; width: parent.width; height: 1; color: Theme.border }

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 26
        spacing: 14

        Text {
            text: ({epg: "Dagskrá", subtitles: "Skjátextar", audio: "Hljóðrás", queue: "Röð"})[panel.media.panel] || ""
            color: Theme.accent
            font.pixelSize: 24
            font.bold: true
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
                radius: 10
                color: modelData.current ? Qt.alpha(Theme.primary, 0.16) : Theme.surface
                border.color: modelData.current ? Theme.primary : Theme.border
                Column {
                    anchors.fill: parent
                    anchors.margins: 16
                    spacing: 8
                    Text { text: modelData.start; color: Theme.accent; font.pixelSize: 18; font.bold: true; font.family: "monospace" }
                    Text {
                        width: parent.width
                        text: modelData.title
                        color: Theme.ink
                        font.pixelSize: 20
                        font.bold: true
                        wrapMode: Text.WordWrap
                        maximumLineCount: 3
                        elide: Text.ElideRight
                    }
                    Text {
                        width: parent.width
                        text: modelData.detail || ""
                        color: Theme.muted
                        font.pixelSize: 15
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
                font.pixelSize: 20
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
                    radius: 22
                    color: selected ? Theme.primary : Theme.raised
                    border.color: Theme.border
                    Text { id: label; anchors.centerIn: parent; text: modelData; color: selected ? "#fff" : Theme.muted; font.pixelSize: 18; font.bold: selected }
                }
            }
        }
    }
}
