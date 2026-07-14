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
            font.pixelSize: 18
            flat: true
        }

        // Program title
        Text {
            text: program.title || ""
            color: Theme.ink
            font.pixelSize: 36
            font.bold: true
            width: parent.width
            elide: Text.ElideRight
        }

        // Foreign title if different
        Text {
            text: program.foreignTitle || ""
            color: Theme.muted
            font.pixelSize: 22
            visible: text !== "" && text !== program.title
        }

        // Metadata row
        Row {
            spacing: 16
            visible: program.firstRun || (program.episodes && program.episodes.length)
            Text {
                text: program.episodes ? program.episodes.filter(function(e) { return e.available }).length + " þættir" : ""
                color: Theme.muted
                font.pixelSize: 18
            }
            Text {
                text: program.year ? String(program.year) : ""
                color: Theme.muted
                font.pixelSize: 18
            }
            Text {
                text: program.categories ? program.categories.map(function(c) { return c.title }).join(" · ") : ""
                color: Theme.muted
                font.pixelSize: 18
            }
        }

        // Description
        Text {
            text: program.description || program.shortDescription || ""
            color: Theme.ink
            font.pixelSize: 22
            wrapMode: Text.WordWrap
            width: parent.width
            visible: text !== ""
        }

        // Play all button
        Button {
            text: "\u25B6 Spila"
            font.pixelSize: 22
            font.bold: true
            visible: episodes.length > 0
        }

        // Episode list
        Text {
            text: "Þættir"
            color: Theme.ink
            font.pixelSize: 24
            font.bold: true
            visible: episodes.length > 0
        }

        Repeater {
            model: episodes.slice(0, 30)
            delegate: Rectangle {
                required property var modelData
                width: parent.width
                height: 72
                color: Theme.raised
                radius: 10
                RowLayout {
                    anchors.fill: parent
                    anchors.margins: 12
                    spacing: 16

                    // Episode image
                    Rectangle {
                        Layout.preferredWidth: 120
                        Layout.preferredHeight: 48
                        radius: 6
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
                            font.pixelSize: 20
                            font.bold: true
                            elide: Text.ElideRight
                            width: parent.width
                        }
                        Text {
                            text: (modelData.durationFriendly || "")
                                + (modelData.firstRun ? " · " + Qt.formatDate(new Date(modelData.firstRun), "d.M.yyyy") : "")
                            color: Theme.muted
                            font.pixelSize: 16
                        }
                    }

                    Button {
                        text: "\u25B6 Spila"
                        font.pixelSize: 18
                        Layout.preferredWidth: 110
                    }
                }
            }
        }
    }
}
