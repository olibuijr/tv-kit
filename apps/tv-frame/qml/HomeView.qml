import QtQuick
import QtQuick.Layouts

Item {
    id: view
    required property var state
    required property var content
    required property real now

    readonly property var media: state.media || ({})
    readonly property var channels: content.channels || []
    readonly property var programs: content.programs || []
    readonly property var news: content.news || []
    readonly property var teeTimes: content.golfTeeTimes || null

    GridLayout {
        anchors.fill: parent
        columns: 3
        rowSpacing: 18
        columnSpacing: 18

        // Hero: whatever is playing (or last played)
        Rectangle {
            Layout.columnSpan: 2
            Layout.fillWidth: true
            Layout.fillHeight: true
            Layout.rowSpan: 2
            radius: 14
            color: Theme.surface
            border.color: Theme.border
            clip: true
            Image {
                anchors.fill: parent
                source: view.media.artwork || ""
                fillMode: Image.PreserveAspectCrop
                visible: status === Image.Ready
            }
            Rectangle {
                anchors.fill: parent
                gradient: Gradient {
                    orientation: Gradient.Horizontal
                    GradientStop { position: 0; color: Qt.alpha("#13100f", 0.88) }
                    GradientStop { position: 0.8; color: "transparent" }
                }
            }
            Column {
                anchors.left: parent.left
                anchors.bottom: parent.bottom
                anchors.margins: 30
                width: parent.width * 0.62
                spacing: 8
                Text {
                    text: view.media.live ? "Í BEINNI" : view.media.title ? "Í SPILUN" : "TV KIT"
                    color: Theme.primary
                    font.pixelSize: 17
                    font.bold: true
                    font.letterSpacing: 2
                }
                Text {
                    width: parent.width
                    text: view.media.title || "Velkomin heim"
                    color: Theme.ink
                    font.pixelSize: 46
                    font.bold: true
                    wrapMode: Text.WordWrap
                    maximumLineCount: 2
                    elide: Text.ElideRight
                }
                Text {
                    width: parent.width
                    text: view.media.title
                        ? [view.media.subtitle, view.media.source].filter(part => part).join(" · ")
                        : (view.state.lastAction || "Veldu efni á fjarstýringunni")
                    color: Theme.muted
                    font.pixelSize: 21
                    elide: Text.ElideRight
                }
            }
        }

        // Live TV panel
        Rectangle {
            Layout.fillWidth: true
            Layout.fillHeight: true
            Layout.preferredWidth: 460
            radius: 14
            color: Theme.surface
            border.color: Theme.border
            Column {
                anchors.fill: parent
                anchors.margins: 20
                spacing: 14
                Text { text: "Í beinni á RÚV"; color: Theme.ink; font.pixelSize: 22; font.bold: true }
                Repeater {
                    model: view.channels
                    delegate: Column {
                        required property var modelData
                        width: parent.width
                        spacing: 6
                        Row {
                            width: parent.width
                            spacing: 12
                            Text { text: modelData.channel.name; color: Theme.accent; font.pixelSize: 19; font.bold: true; width: 72 }
                            Text {
                                width: parent.width - 90
                                text: modelData.current ? modelData.current.title : "Bein útsending"
                                color: Theme.ink
                                font.pixelSize: 19
                                elide: Text.ElideRight
                            }
                        }
                        Rectangle {
                            width: parent.width
                            height: 3
                            radius: 1.5
                            color: Theme.raised
                            Rectangle {
                                height: parent.height
                                radius: 1.5
                                color: Theme.primary
                                width: parent.width * Theme.eventProgress(modelData.current, view.now) / 100
                            }
                        }
                        Text {
                            visible: (modelData.upcoming || []).length > 0
                            text: modelData.upcoming.length
                                ? "Næst " + Theme.scheduleTime(modelData.upcoming[0].startTime) + " · " + modelData.upcoming[0].title
                                : ""
                            color: Theme.faint
                            font.pixelSize: 15
                            width: parent.width
                            elide: Text.ElideRight
                        }
                    }
                }
            }
        }

        // Golf tee times
        Rectangle {
            Layout.fillWidth: true
            Layout.fillHeight: true
            radius: 14
            color: Theme.surface
            border.color: Theme.border
            Column {
                anchors.fill: parent
                anchors.margins: 20
                spacing: 12
                Text {
                    text: view.teeTimes ? "Lausir rástímar · " + view.teeTimes.course : "Lausir rástímar"
                    color: Theme.ink
                    font.pixelSize: 22
                    font.bold: true
                    width: parent.width
                    elide: Text.ElideRight
                }
                Flow {
                    width: parent.width
                    spacing: 8
                    Repeater {
                        model: (view.teeTimes ? view.teeTimes.slots : []).slice(0, 12)
                        delegate: Rectangle {
                            required property var modelData
                            width: 96; height: 52
                            radius: 8
                            color: Theme.raised
                            Column {
                                anchors.centerIn: parent
                                Text { text: modelData.time; color: Theme.ink; font.pixelSize: 17; font.bold: true; anchors.horizontalCenter: parent.horizontalCenter }
                                Text { text: modelData.openSeats + " laus"; color: Theme.faint; font.pixelSize: 13; anchors.horizontalCenter: parent.horizontalCenter }
                            }
                        }
                    }
                }
                Text {
                    visible: !view.teeTimes
                    text: "Ekki tiltækt"
                    color: Theme.faint
                    font.pixelSize: 17
                }
            }
        }

        // Sarpurinn rail
        Rectangle {
            Layout.columnSpan: 2
            Layout.fillWidth: true
            Layout.fillHeight: true
            radius: 14
            color: Theme.surface
            border.color: Theme.border
            clip: true
            Column {
                anchors.fill: parent
                anchors.margins: 20
                spacing: 12
                Text { text: "Nýtt í Sarpinum"; color: Theme.ink; font.pixelSize: 22; font.bold: true }
                Row {
                    spacing: 14
                    Repeater {
                        model: view.programs.slice(0, 6)
                        delegate: Column {
                            required property var modelData
                            width: 208
                            spacing: 8
                            Rectangle {
                                width: 208; height: 117
                                radius: 8
                                color: Theme.raised
                                clip: true
                                Image {
                                    anchors.fill: parent
                                    source: modelData.image || (modelData.latestEpisode ? modelData.latestEpisode.image : "") || modelData.portraitImage || ""
                                    fillMode: Image.PreserveAspectCrop
                                    visible: status === Image.Ready
                                }
                            }
                            Text { text: modelData.title; color: Theme.ink; font.pixelSize: 17; width: parent.width; elide: Text.ElideRight }
                        }
                    }
                }
            }
        }

        // News panel
        Rectangle {
            Layout.fillWidth: true
            Layout.fillHeight: true
            radius: 14
            color: Theme.surface
            border.color: Theme.border
            clip: true
            Column {
                anchors.fill: parent
                anchors.margins: 20
                spacing: 12
                Text { text: "Fréttir"; color: Theme.ink; font.pixelSize: 22; font.bold: true }
                Repeater {
                    model: view.news.slice(0, 4)
                    delegate: Column {
                        required property var modelData
                        width: parent.width
                        spacing: 2
                        Text { text: modelData.categoryTitle || "RÚV"; color: Theme.accent; font.pixelSize: 14; font.bold: true }
                        Text {
                            text: modelData.title
                            color: Theme.ink
                            font.pixelSize: 18
                            width: parent.width
                            wrapMode: Text.WordWrap
                            maximumLineCount: 2
                            elide: Text.ElideRight
                        }
                        Text { text: Theme.relativeTime(modelData.firstPublishedAt, view.now); color: Theme.faint; font.pixelSize: 14 }
                    }
                }
            }
        }
    }
}
