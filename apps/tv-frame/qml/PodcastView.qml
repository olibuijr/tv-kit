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
                radius: Theme.radiusPanel
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
                    font.pixelSize: Theme.fontDisplay
                    font.weight: Theme.weightSemibold
                }
                Text {
                    text: view.podcast ? view.podcast.author : ""
                    color: Theme.accent
                    font.pixelSize: Theme.fontCardTitle
                    font.weight: Theme.weightSemibold
                }
                Text {
                    text: view.podcast ? view.podcast.description : ""
                    color: Theme.muted
                    font.pixelSize: Theme.fontBody
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
            font.pixelSize: Theme.fontSection
            font.weight: Theme.weightSemibold
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
                    radius: Theme.radiusPanel
                    readonly property bool active: view.activeId === "podcast-" + parent.modelData.id
                    color: active ? Qt.alpha(Theme.selection, 0.16) : Theme.surface
                    border.color: active ? Theme.selection : Theme.border
                    border.width: Theme.stroke
                    Row {
                        anchors.fill: parent
                        anchors.margins: 10
                        spacing: 14
                        Rectangle {
                            width: 164
                            height: 96
                            radius: Theme.radiusMedia
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
                                font.pixelSize: Theme.fontCardTitle
                                font.weight: Theme.weightSemibold
                                elide: Text.ElideRight
                            }
                            Text {
                                width: parent.width
                                text: modelData.description
                                color: Theme.muted
                                font.pixelSize: Theme.fontCaption
                                maximumLineCount: 2
                                wrapMode: Text.WordWrap
                                elide: Text.ElideRight
                            }
                            Text {
                                text: view.duration(modelData.duration)
                                color: Theme.faint
                                font.pixelSize: Theme.fontCaption
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
        font.pixelSize: Theme.fontSection
    }
}
