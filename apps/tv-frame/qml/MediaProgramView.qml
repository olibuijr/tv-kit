import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

Flickable {
    id: view
    required property var mediaProgram

    readonly property var program: mediaProgram.program || ({})
    readonly property var episodes: (program.episodes || []).filter(function(e) { return e.available })

    contentWidth: width
    contentHeight: detail.height
    clip: true

    Column {
        id: detail
        width: parent.width
        spacing: 16
        padding: Theme.marginX

        // Back button
        Button {
            text: "\u2190 Til baka"
            font.pixelSize: Theme.fontBody
            flat: true
        }

        // Program title
        Text {
            text: program.title || ""
            color: Theme.ink
            font.pixelSize: Theme.fontPageTitle
            font.weight: Theme.weightSemibold
            width: parent.width
            elide: Text.ElideRight
        }

        // Foreign title if different
        Text {
            text: program.foreignTitle || ""
            color: Theme.muted
            font.pixelSize: Theme.fontSection
            visible: text !== "" && text !== program.title
        }

        // Metadata row
        Row {
            spacing: 16
            visible: program.firstRun || (program.episodes && program.episodes.length)
            Text {
                text: program.episodes ? program.episodes.filter(function(e) { return e.available }).length + " þættir" : ""
                color: Theme.muted
                font.pixelSize: Theme.fontBody
            }
            Text {
                text: program.year ? String(program.year) : ""
                color: Theme.muted
                font.pixelSize: Theme.fontBody
            }
            Text {
                text: program.categories ? program.categories.map(function(c) { return c.title }).join(" · ") : ""
                color: Theme.muted
                font.pixelSize: Theme.fontBody
            }
        }

        // Description
        Text {
            text: program.description || program.shortDescription || ""
            color: Theme.ink
            font.pixelSize: Theme.fontSection
            wrapMode: Text.WordWrap
            width: parent.width
            visible: text !== ""
        }

        // Play all button
        Button {
            text: "\u25B6 Spila"
            font.pixelSize: Theme.fontSection
            font.weight: Theme.weightSemibold
            visible: episodes.length > 0
        }

        // Episode list
        Text {
            text: "Þættir"
            color: Theme.ink
            font.pixelSize: Theme.fontSection
            font.weight: Theme.weightSemibold
            visible: episodes.length > 0
        }

        Repeater {
            model: episodes.slice(0, 30)
            delegate: Rectangle {
                required property var modelData
                width: parent.width
                height: 72
                color: Theme.raised
                radius: Theme.radiusCard
                RowLayout {
                    anchors.fill: parent
                    anchors.margins: 12
                    spacing: 16

                    // Episode image
                    Rectangle {
                        Layout.preferredWidth: 120
                        Layout.preferredHeight: 48
                        radius: Theme.radiusMedia
                        color: Theme.surface
                        clip: true
                        Image {
                            anchors.fill: parent
                            source: modelData.image || ""
                            fillMode: Image.PreserveAspectCrop
                            visible: status === Image.Ready
                        }
                    }

                    Column {
                        Layout.fillWidth: true
                        spacing: 4
                        Text {
                            text: modelData.title || ""
                            color: Theme.ink
                            font.pixelSize: Theme.fontCardTitle
                            font.weight: Theme.weightSemibold
                            elide: Text.ElideRight
                            width: parent.width
                        }
                        Text {
                            text: (modelData.durationFriendly || "")
                                + (modelData.firstRun ? " · " + Qt.formatDate(new Date(modelData.firstRun), "d.M.yyyy") : "")
                            color: Theme.muted
                            font.pixelSize: Theme.fontCallout
                        }
                    }

                    Button {
                        text: "\u25B6 Spila"
                        font.pixelSize: Theme.fontBody
                        Layout.preferredWidth: 110
                    }
                }
            }
        }
    }
}
