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
    color: "#13100f"
    title: "TV Kit"

    FrameClient { id: frame; Component.onCompleted: start() }

    readonly property var state: frame.state
    readonly property var content: frame.content
    readonly property var media: state.media || ({})
    readonly property string view: state.view || "home"

    Timer { interval: 1000; running: true; repeat: true; onTriggered: clock.text = Qt.formatDateTime(new Date(), "hh:mm:ss") }

    Rectangle {
        anchors.fill: parent
        color: "#13100f"
    }

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 42
        spacing: 28

        RowLayout {
            Layout.fillWidth: true
            spacing: 22
            Text { text: "TV KIT"; color: "#f7ece8"; font.pixelSize: 28; font.bold: true; font.letterSpacing: 2 }
            Text { text: ({home:"Heim", tv:"Sjónvarp", radio:"Útvarp", media:"Sarpur", deildu:"Deildu", news:"Fréttir"})[root.view] || "TV Kit"; color: "#f7ece8"; font.pixelSize: 44; font.bold: true; Layout.fillWidth: true }
            Text { id: clock; color: "#cbbab2"; font.pixelSize: 28; font.family: "monospace"; text: Qt.formatDateTime(new Date(), "hh:mm:ss") }
            Text { text: frame.connected ? "Tengt" : "Tengist"; color: frame.connected ? "#79d49b" : "#e9b46a"; font.pixelSize: 22 }
        }

        StackLayout {
            Layout.fillWidth: true
            Layout.fillHeight: true
            currentIndex: ["home", "tv", "radio", "media", "deildu", "news"].indexOf(root.view)

            Item {
                Column {
                    width: parent.width; spacing: 20
                    Text { text: root.media.title || "Velkomin heim"; color: "#f7ece8"; font.pixelSize: 58; font.bold: true }
                    Text { text: root.media.subtitle || root.state.lastAction || "Veldu efni á fjarstýringunni"; color: "#cbbab2"; font.pixelSize: 30; wrapMode: Text.WordWrap; width: parent.width * 0.7 }
                    Text { text: "Áframhaldandi áhorf: " + (root.content.continueWatching ? root.content.continueWatching.length : 0); color: "#b69588"; font.pixelSize: 24 }
                }
            }
            Item {
                Column { width: parent.width; spacing: 18
                    Repeater { model: root.content.channels || []
                        delegate: Text { required property var modelData; text: modelData.channel.name + "  ·  " + (modelData.current ? modelData.current.title : "Bein útsending"); color: "#f7ece8"; font.pixelSize: 34 }
                    }
                }
            }
            Item {
                GridView { anchors.fill: parent; cellWidth: 340; cellHeight: 132; model: root.content.channels || []; delegate: Text { required property var modelData; width: 320; text: modelData.channel.name; color: "#f7ece8"; font.pixelSize: 32; wrapMode: Text.WordWrap } }
            }
            Item {
                GridView { anchors.fill: parent; cellWidth: 340; cellHeight: 210; model: (root.content.movies || []).concat(root.content.programs || []); delegate: Column { required property var modelData; width: 310; spacing: 10; Image { width: 310; height: 150; source: modelData.image; fillMode: Image.PreserveAspectCrop } Text { text: modelData.title; color: "#f7ece8"; font.pixelSize: 24; width: 310; elide: Text.ElideRight } } }
            }
            Item {
                Column { width: parent.width; spacing: 20
                    Text { text: root.content.deilduShow ? root.content.deilduShow.title : "Þættir og kvikmyndir"; color: "#f7ece8"; font.pixelSize: 52; font.bold: true }
                    GridView { width: parent.width; height: parent.height - 100; cellWidth: 360; cellHeight: 248; model: root.content.deilduShow ? root.content.deilduShow.episodes : (root.content.deilduShows || []); delegate: Column { required property var modelData; width: 330; spacing: 10; Image { width: 330; height: 180; source: modelData.artwork; fillMode: Image.PreserveAspectCrop } Text { text: modelData.title; color: "#f7ece8"; font.pixelSize: 25; width: 330; elide: Text.ElideRight } } }
                }
            }
            Item {
                GridView { anchors.fill: parent; cellWidth: 480; cellHeight: 174; model: root.content.news || []; delegate: Column { required property var modelData; width: 450; spacing: 8; Text { text: modelData.categoryTitle; color: "#e9b46a"; font.pixelSize: 20 } Text { text: modelData.title; color: "#f7ece8"; font.pixelSize: 31; font.bold: true; width: 450; wrapMode: Text.WordWrap; maximumLineCount: 2 } } }
            }
        }
    }

    Rectangle {
        visible: root.state.power && (root.state.playing || root.media.status === "loading")
        anchors.left: parent.left; anchors.right: parent.right; anchors.bottom: parent.bottom
        height: 142; color: "#1c1715"
        border.color: "#4c3931"; border.width: 1
        RowLayout { anchors.fill: parent; anchors.margins: 30; spacing: 22
            Text { text: root.media.status === "loading" ? "Hleður" : root.state.playing ? "Spilar" : "Í pásu"; color: "#e9b46a"; font.pixelSize: 24; font.bold: true }
            ColumnLayout { Layout.fillWidth: true; Text { text: root.media.title || ""; color: "#f7ece8"; font.pixelSize: 29; font.bold: true; elide: Text.ElideRight; Layout.fillWidth: true } Text { text: root.media.source || ""; color: "#cbbab2"; font.pixelSize: 21 } }
            Text { text: Math.floor((root.media.currentTime || 0) / 60) + ":" + ("0" + Math.floor((root.media.currentTime || 0) % 60)).slice(-2); color: "#f7ece8"; font.pixelSize: 26; font.family: "monospace" }
        }
    }
}
