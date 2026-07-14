import QtQuick

Item {
    id: view
    required property var state
    required property var content

    readonly property var podcasts: content.podcasts || []
    readonly property var podcast: podcasts.length ? podcasts[0] : null
    readonly property var episodes: podcast ? podcast.episodes || [] : []
    readonly property string activeId: (state.media || {}).id || ""

    function duration(seconds) {
        const minutes = Math.floor((seconds || 0) / 60)
        const rest = Math.floor((seconds || 0) % 60)
        return minutes + ":" + String(rest).padStart(2, "0")
    }

    Column {
        anchors.fill: parent
        spacing: 20

        Row {
            visible: view.podcast !== null
            width: parent.width
            height: 210
            spacing: 24

            Rectangle {
                width: 210; height: 210
                radius: 18
                color: Theme.surface
                border.color: Theme.border
                clip: true
                Image {
                    anchors.fill: parent
                    source: view.podcast ? view.podcast.imageUrl : ""
                    fillMode: Image.PreserveAspectFit
                    visible: status === Image.Ready
                }
            }

            Column {
                width: parent.width - 234
                anchors.verticalCenter: parent.verticalCenter
                spacing: 10
                Text {
                    text: view.podcast ? view.podcast.title : ""
                    color: Theme.ink
                    font.pixelSize: 42
                    font.bold: true
                }
                Text {
                    text: view.podcast ? view.podcast.author : ""
                    color: Theme.primary
                    font.pixelSize: 20
                    font.bold: true
                }
                Text {
                    text: view.podcast ? view.podcast.description : ""
                    color: Theme.muted
                    font.pixelSize: 19
                    width: parent.width
                    wrapMode: Text.WordWrap
                    maximumLineCount: 3
                    elide: Text.ElideRight
                }
            }
        }

        Text {
            visible: view.podcast !== null
            text: "Nýjustu þættir"
            color: Theme.ink
            font.pixelSize: 25
            font.bold: true
        }

        GridView {
            id: grid
            width: parent.width
            height: parent.height - y
            clip: true
            interactive: false
            model: view.episodes.slice(0, 8)
            cellWidth: width / 2
            cellHeight: 126
            delegate: Item {
                required property var modelData
                width: grid.cellWidth
                height: grid.cellHeight
                Rectangle {
                    anchors.fill: parent
                    anchors.rightMargin: 16
                    anchors.bottomMargin: 16
                    radius: 12
                    readonly property bool active: view.activeId === "podcast-" + parent.modelData.id
                    color: active ? Theme.raised : Theme.surface
                    border.color: active ? Theme.primary : Theme.border
                    border.width: active ? 2 : 1
                    Row {
                        anchors.fill: parent
                        anchors.margins: 10
                        spacing: 14
                        Rectangle {
                            width: 164
                            height: 96
                            radius: 8
                            color: Theme.raised
                            clip: true
                            Image {
                                anchors.fill: parent
                                source: modelData.artworkUrl || ""
                                fillMode: Image.PreserveAspectCrop
                                visible: status === Image.Ready
                            }
                        }
                        Column {
                            width: parent.width - 178
                            anchors.verticalCenter: parent.verticalCenter
                            spacing: 6
                            Text {
                                width: parent.width
                                text: modelData.title
                                color: Theme.ink
                                font.pixelSize: 20
                                font.bold: true
                                elide: Text.ElideRight
                            }
                            Text {
                                width: parent.width
                                text: modelData.description
                                color: Theme.muted
                                font.pixelSize: 15
                                maximumLineCount: 2
                                wrapMode: Text.WordWrap
                                elide: Text.ElideRight
                            }
                            Text {
                                text: view.duration(modelData.duration)
                                color: Theme.faint
                                font.pixelSize: 14
                            }
                        }
                    }
                }
            }
        }
    }

    Text {
        visible: view.podcast === null
        anchors.centerIn: parent
        text: "Sæki hlaðvörp…"
        color: Theme.faint
        font.pixelSize: 26
    }
}
