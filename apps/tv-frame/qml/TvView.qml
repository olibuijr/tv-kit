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
                radius: Theme.radiusHero
                color: active ? Qt.alpha(Theme.selection, 0.16) : Theme.surface
                border.color: active ? Theme.selection : Theme.border
                border.width: Theme.stroke
                clip: true

                Column {
                    anchors.fill: parent
                    anchors.margins: 24
                    spacing: 14

                    Rectangle {
                        width: parent.width
                        height: Math.min(280, parent.height * 0.4)
                        radius: Theme.radiusCard
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
                            font.pixelSize: Theme.fontSection
                            font.weight: Theme.weightSemibold
                            style: Text.Outline
                            styleColor: Theme.bg
                        }
                    }

                    Text { text: card.active ? "Í SPILUN" : "Í BEINNI"; color: card.active ? Theme.selection : Theme.live; font.pixelSize: Theme.fontCaption; font.weight: Theme.weightSemibold; font.letterSpacing: 2 }
                    Text {
                        width: parent.width
                        text: card.modelData.current ? card.modelData.current.title : card.modelData.channel.name
                        color: Theme.ink
                        font.pixelSize: Theme.fontTitle
                        font.weight: Theme.weightSemibold
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
                        font.pixelSize: Theme.fontBody
                        wrapMode: Text.WordWrap
                        maximumLineCount: 2
                        elide: Text.ElideRight
                    }

                    Rectangle {
                        width: parent.width
                        height: 5
                        radius: Theme.radiusPill
                        color: Theme.raised
                        visible: Boolean(card.modelData.current)
                        Rectangle {
                            height: parent.height
                            radius: Theme.radiusPill
                            color: Theme.selection
                            width: parent.width * Theme.eventProgress(card.modelData.current, view.now) / 100
                        }
                    }

                    Text { text: "Næst"; color: Theme.accent; font.pixelSize: Theme.fontCallout; font.weight: Theme.weightSemibold; topPadding: 8 }
                    Repeater {
                        model: Theme.futureProgramme(card.modelData.upcoming, view.now).slice(0, 5)
                        delegate: Row {
                            required property var modelData
                            width: parent.width
                            spacing: 14
                            Text { text: Theme.scheduleTime(modelData.startTime); color: Theme.faint; font.pixelSize: Theme.fontBody; font.family: Theme.monoFontFamily; width: 66 }
                            Text {
                                width: parent.width - 80
                                text: modelData.title
                                color: Theme.ink
                                font.pixelSize: Theme.fontBody
                                elide: Text.ElideRight
                            }
                        }
                    }
                }
            }
        }
    }
}
