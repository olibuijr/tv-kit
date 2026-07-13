import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
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
    property real now: Date.now()

    Timer {
        interval: 1000; running: true; repeat: true
        onTriggered: root.now = Date.now()
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
        visible: root.power
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
            Layout.topMargin: 24
            Layout.bottomMargin: 14
            currentIndex: Math.max(0, ["home", "tv", "radio", "media", "deildu", "news"].indexOf(root.view))

            HomeView { state: root.state; content: root.content; now: root.now }
            TvView { state: root.state; content: root.content; now: root.now }
            RadioView { state: root.state; stations: frame.stations }
            MediaView { state: root.state; content: root.content }
            DeilduView { state: root.state; content: root.content }
            NewsView { state: root.state; content: root.content; article: frame.article; now: root.now }
        }

        PlayerHud {
            Layout.fillWidth: true
            visible: root.power && (root.state.playing || root.media.status === "loading" || root.media.status === "error")
            media: root.media
            playing: root.state.playing === true
        }
    }

    LoadingOverlay {
        anchors.fill: parent
        z: 10
        visible: root.power
            && root.media.status === "loading"
            && (root.media.id || "").match(/^(deildu|torrent)-/) !== null
        media: root.media
    }
}
