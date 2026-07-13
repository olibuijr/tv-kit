import QtQuick

Item {
    id: view
    required property var state
    required property var content
    required property real now

    readonly property var channels: content.channels || []

    Row {
        anchors.fill: parent
        spacing: 20

        Repeater {
            model: view.channels
            delegate: Rectangle {
                id: card
                required property var modelData
                readonly property bool active: (view.state.media || {}).id === "ruv-channel-" + modelData.channel.slug
                width: (parent.width - 20 * Math.max(0, view.channels.length - 1)) / Math.max(1, view.channels.length)
                height: parent.height
                radius: 14
                color: Theme.surface
                border.color: active ? Theme.primary : Theme.border
                border.width: active ? 2 : 1
                clip: true

                Column {
                    anchors.fill: parent
                    anchors.margins: 24
                    spacing: 14

                    Rectangle {
                        width: parent.width
                        height: Math.min(280, parent.height * 0.4)
                        radius: 10
                        color: Theme.raised
                        clip: true
                        Image {
                            anchors.fill: parent
                            source: (card.modelData.current && card.modelData.current.watchFromStart)
                                ? (card.modelData.current.watchFromStart.image || "") : ""
                            fillMode: Image.PreserveAspectCrop
                            visible: status === Image.Ready
                        }
                        Text {
                            anchors.left: parent.left
                            anchors.top: parent.top
                            anchors.margins: 14
                            text: card.modelData.channel.name
                            color: Theme.ink
                            font.pixelSize: 24
                            font.bold: true
                            style: Text.Outline
                            styleColor: "#13100f"
                        }
                    }

                    Text { text: card.active ? "Í SPILUN" : "Í BEINNI"; color: Theme.primary; font.pixelSize: 15; font.bold: true; font.letterSpacing: 2 }
                    Text {
                        width: parent.width
                        text: card.modelData.current ? card.modelData.current.title : card.modelData.channel.name
                        color: Theme.ink
                        font.pixelSize: 30
                        font.bold: true
                        wrapMode: Text.WordWrap
                        maximumLineCount: 2
                        elide: Text.ElideRight
                    }
                    Text {
                        width: parent.width
                        text: card.modelData.current
                            ? (card.modelData.current.category || card.modelData.current.description || "Bein útsending")
                            : "Bein útsending"
                        color: Theme.muted
                        font.pixelSize: 19
                        wrapMode: Text.WordWrap
                        maximumLineCount: 2
                        elide: Text.ElideRight
                    }

                    Rectangle {
                        width: parent.width
                        height: 5
                        radius: 2.5
                        color: Theme.raised
                        visible: Boolean(card.modelData.current)
                        Rectangle {
                            height: parent.height
                            radius: 2.5
                            color: Theme.primary
                            width: parent.width * Theme.eventProgress(card.modelData.current, view.now) / 100
                        }
                    }

                    Text { text: "Næst"; color: Theme.accent; font.pixelSize: 17; font.bold: true; topPadding: 8 }
                    Repeater {
                        model: (card.modelData.upcoming || []).slice(0, 5)
                        delegate: Row {
                            required property var modelData
                            width: parent.width
                            spacing: 14
                            Text { text: Theme.scheduleTime(modelData.startTime); color: Theme.faint; font.pixelSize: 18; font.family: "monospace"; width: 66 }
                            Text {
                                width: parent.width - 80
                                text: modelData.title
                                color: Theme.ink
                                font.pixelSize: 18
                                elide: Text.ElideRight
                            }
                        }
                    }
                }
            }
        }
    }
}
