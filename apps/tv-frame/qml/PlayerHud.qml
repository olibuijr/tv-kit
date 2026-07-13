import QtQuick
import QtQuick.Layouts

// Passive playback HUD docked to the bottom edge. All control lives on the
// tablet remote; this only mirrors tvserverd state.
Rectangle {
    id: hud
    required property var media
    required property bool playing

    readonly property real progress: media.duration > 0
        ? Math.max(0, Math.min(1, (media.currentTime || 0) / media.duration))
        : 0

    height: 132
    color: Theme.header
    border.color: Theme.border
    border.width: 1

    Rectangle {
        anchors.top: parent.top
        anchors.left: parent.left
        height: 3
        color: Theme.primary
        width: media.live ? parent.width : parent.width * hud.progress
        opacity: media.live ? 0.35 : 1
        Behavior on width { NumberAnimation { duration: 400 } }
    }

    RowLayout {
        anchors.fill: parent
        anchors.leftMargin: 30
        anchors.rightMargin: 30
        spacing: 24

        Rectangle {
            Layout.preferredWidth: 84
            Layout.preferredHeight: 84
            radius: 10
            color: Theme.raised
            clip: true
            Image {
                anchors.fill: parent
                source: hud.media.artwork || ""
                fillMode: hud.media.kind === "radio" ? Image.PreserveAspectFit : Image.PreserveAspectCrop
                visible: status === Image.Ready
            }
        }

        Rectangle {
            Layout.preferredHeight: 34
            Layout.preferredWidth: statusText.implicitWidth + 28
            radius: 17
            color: Qt.alpha(Theme.accent, 0.14)
            Text {
                id: statusText
                anchors.centerIn: parent
                text: hud.media.status === "loading" ? "Hleður"
                    : hud.media.status === "error" ? "Villa"
                    : hud.playing ? (hud.media.live ? "Í beinni" : "Spilar")
                    : "Í pásu"
                color: hud.media.status === "error" ? Theme.primary : Theme.accent
                font.pixelSize: 20
                font.bold: true
            }
        }

        ColumnLayout {
            Layout.fillWidth: true
            spacing: 5
            Text {
                Layout.fillWidth: true
                text: hud.media.title || ""
                color: Theme.ink
                font.pixelSize: 27
                font.bold: true
                elide: Text.ElideRight
            }
            Text {
                Layout.fillWidth: true
                text: [hud.media.subtitle, hud.media.source].filter(part => part).filter((part, index, list) => list.indexOf(part) === index).join(" · ")
                color: Theme.muted
                font.pixelSize: 19
                elide: Text.ElideRight
            }
        }

        Text {
            text: hud.media.live
                ? "BEIN ÚTSENDING"
                : Theme.clock(hud.media.currentTime) + (hud.media.duration > 0 ? " / " + Theme.clock(hud.media.duration) : "")
            color: hud.media.live ? Theme.primary : Theme.ink
            font.pixelSize: hud.media.live ? 19 : 24
            font.family: "monospace"
            font.bold: hud.media.live
        }
    }
}
