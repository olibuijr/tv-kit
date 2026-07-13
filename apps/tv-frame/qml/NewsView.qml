import QtQuick

Item {
    id: view
    required property var state
    required property var content
    required property var article
    required property real now

    readonly property var news: content.news || []
    readonly property bool readerMode: (state.newsArticleId || 0) > 0

    function paragraphs(bodyHtml) {
        if (!bodyHtml) return []
        return bodyHtml.split(/\n+/)
            .map(part => part.replace(/<[^>]+>/g, "").trim())
            .filter(part => part.length > 0)
    }

    // Article reader
    Flickable {
        visible: view.readerMode
        anchors.fill: parent
        contentWidth: width
        contentHeight: reader.height
        clip: true

        Column {
            id: reader
            width: Math.min(parent.width, 1100)
            anchors.horizontalCenter: parent.horizontalCenter
            spacing: 18

            Row {
                spacing: 16
                Text { text: view.article.categoryTitle || view.article.topicName || "RÚV"; color: Theme.accent; font.pixelSize: 18; font.bold: true }
                Text { text: Theme.relativeTime(view.article.firstPublishedAt, view.now); color: Theme.faint; font.pixelSize: 18 }
            }
            Text {
                width: parent.width
                text: view.article.title || "Sæki frétt…"
                color: Theme.ink
                font.pixelSize: 44
                font.bold: true
                wrapMode: Text.WordWrap
            }
            Text {
                visible: Boolean(view.article.subtitle)
                width: parent.width
                text: view.article.subtitle || ""
                color: Theme.muted
                font.pixelSize: 25
                wrapMode: Text.WordWrap
            }
            Rectangle {
                visible: Boolean(view.article.mainImageUrl)
                width: parent.width
                height: width * 9 / 16
                radius: 12
                color: Theme.raised
                clip: true
                Image { anchors.fill: parent; source: view.article.mainImageUrl || ""; fillMode: Image.PreserveAspectCrop }
            }
            Repeater {
                model: view.paragraphs(view.article.bodyHtml)
                delegate: Text {
                    required property var modelData
                    width: reader.width
                    text: modelData
                    color: Theme.muted
                    font.pixelSize: 22
                    lineHeight: 1.35
                    wrapMode: Text.WordWrap
                }
            }
        }
    }

    // Headline grid
    GridView {
        visible: !view.readerMode
        anchors.fill: parent
        clip: true
        interactive: false
        cellWidth: Math.floor(width / 3)
        cellHeight: 200
        model: view.news
        delegate: Item {
            required property var modelData
            width: GridView.view.cellWidth
            height: GridView.view.cellHeight
            Rectangle {
                anchors.fill: parent
                anchors.rightMargin: 18
                anchors.bottomMargin: 18
                radius: 12
                color: Theme.surface
                border.color: Theme.border
                clip: true
                Row {
                    anchors.fill: parent
                    anchors.margins: 16
                    spacing: 16
                    Rectangle {
                        width: 150; height: parent.height
                        radius: 8
                        color: Theme.raised
                        clip: true
                        Image {
                            anchors.fill: parent
                            source: modelData.mainImageUrl || ""
                            fillMode: Image.PreserveAspectCrop
                            visible: status === Image.Ready
                        }
                    }
                    Column {
                        width: parent.width - 180
                        spacing: 6
                        Text { text: modelData.categoryTitle || modelData.topicName || "RÚV"; color: Theme.accent; font.pixelSize: 15; font.bold: true }
                        Text {
                            width: parent.width
                            text: modelData.title
                            color: Theme.ink
                            font.pixelSize: 21
                            font.bold: true
                            wrapMode: Text.WordWrap
                            maximumLineCount: 3
                            elide: Text.ElideRight
                        }
                        Text { text: Theme.relativeTime(modelData.firstPublishedAt, view.now); color: Theme.faint; font.pixelSize: 15 }
                    }
                }
            }
        }
        Text {
            visible: view.news.length === 0
            anchors.centerIn: parent
            text: "Engar fréttir eru tiltækar."
            color: Theme.faint
            font.pixelSize: 26
        }
    }
}
