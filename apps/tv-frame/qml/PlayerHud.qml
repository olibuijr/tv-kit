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
    color: Theme.glassHeader
    border.color: Theme.glassEdge
    border.width: Theme.stroke

    Rectangle {
        anchors.top: parent.top
        anchors.left: parent.left
        height: 3
        color: media.live ? Theme.live : Theme.selection
        width: media.live ? parent.width : parent.width * hud.progress
        opacity: media.live ? 0.35 : 1
        Behavior on width { NumberAnimation { duration: Theme.motionProgress } }
    }

    RowLayout {
        anchors.fill: parent
        anchors.leftMargin: 30
        anchors.rightMargin: 30
        spacing: 24

        Rectangle {
            Layout.preferredWidth: 84
            Layout.preferredHeight: 84
            radius: Theme.radiusCard
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
            radius: Theme.radiusPill
            color: Qt.alpha(Theme.accent, 0.14)
            Text {
                id: statusText
                anchors.centerIn: parent
                text: hud.media.status === "loading" ? "Hleður"
                    : hud.media.status === "error" ? "Villa"
                    : hud.playing ? (hud.media.live ? "Í beinni" : "Spilar")
                    : "Í pásu"
                color: hud.media.status === "error" ? Theme.danger
                    : hud.media.status === "loading" ? Theme.warning : Theme.accent
                font.pixelSize: Theme.fontCardTitle
                font.weight: Theme.weightSemibold
            }
        }

        ColumnLayout {
            Layout.fillWidth: true
            spacing: 5
            Text {
                Layout.fillWidth: true
                text: hud.media.title || ""
                color: Theme.ink
                font.pixelSize: Theme.fontTitle
                font.weight: Theme.weightSemibold
                elide: Text.ElideRight
            }
            Text {
                Layout.fillWidth: true
                text: [hud.media.subtitle, hud.media.source].filter(part => part).filter((part, index, list) => list.indexOf(part) === index).join(" · ")
                color: Theme.muted
                font.pixelSize: Theme.fontBody
                elide: Text.ElideRight
            }
        }

        Text {
            text: hud.media.live
                ? "BEIN ÚTSENDING"
                : Theme.clock(hud.media.currentTime) + (hud.media.duration > 0 ? " / " + Theme.clock(hud.media.duration) : "")
            color: hud.media.live ? Theme.live : Theme.ink
            font.pixelSize: hud.media.live ? 19 : Theme.fontSection
            font.family: Theme.monoFontFamily
            font.weight: hud.media.live ? Theme.weightSemibold : Theme.weightRegular
        }
    }
}
