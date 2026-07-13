import QtQuick

Item {
    id: view
    required property var state
    required property var content

    readonly property var show: content.deilduShow || null
    readonly property var shows: content.deilduShows || []
    readonly property var items: content.deilduItems || []
    readonly property var categories: content.deilduCategories || []
    readonly property int selectedCategoryId: state.deilduCategoryId || 0
    readonly property string activeMediaId: (state.media || {}).id || ""

    function sizeLabel(bytes) {
        if (!bytes) return ""
        if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(1) + " GB"
        return Math.round(bytes / 1048576) + " MB"
    }

    // Show detail: episode grid
    Column {
        visible: Boolean(view.show)
        anchors.fill: parent
        spacing: 18

        Row {
            width: parent.width
            spacing: 24
            Column {
                width: parent.width - (poster.visible ? poster.width + 24 : 0)
                spacing: 8
                Text {
                    width: parent.width
                    text: view.show ? view.show.title : ""
                    color: Theme.ink
                    font.pixelSize: 44
                    font.bold: true
                    elide: Text.ElideRight
                }
                Text {
                    text: view.show
                        ? [view.show.year, view.show.rating ? "★ " + view.show.rating.toFixed(1) : "", (view.show.seasons || []).length + " seríur", (view.show.episodes || []).length + " þættir"].filter(part => part).join(" · ")
                        : ""
                    color: Theme.muted
                    font.pixelSize: 21
                }
                Text {
                    width: parent.width
                    text: view.show ? (view.show.description || "") : ""
                    color: Theme.faint
                    font.pixelSize: 18
                    wrapMode: Text.WordWrap
                    maximumLineCount: 2
                    elide: Text.ElideRight
                }
            }
            Rectangle {
                id: poster
                visible: Boolean(view.show && view.show.artwork)
                width: 96; height: 140
                radius: 8
                color: Theme.raised
                clip: true
                Image { anchors.fill: parent; source: view.show ? (view.show.artwork || "") : ""; fillMode: Image.PreserveAspectCrop }
            }
        }

        GridView {
            width: parent.width
            height: parent.height - y
            clip: true
            interactive: false
            cellWidth: 350
            cellHeight: 264
            model: view.show ? (view.show.episodes || []) : []
            delegate: Column {
                required property var modelData
                readonly property bool active: view.activeMediaId === "deildu-" + modelData.itemId
                width: 330
                spacing: 8
                Rectangle {
                    width: 330; height: 186
                    radius: 10
                    color: Theme.raised
                    border.color: parent.active ? Theme.primary : "transparent"
                    border.width: 2
                    clip: true
                    Image {
                        anchors.fill: parent
                        source: modelData.artwork || ""
                        fillMode: Image.PreserveAspectCrop
                        visible: status === Image.Ready
                    }
                    Rectangle {
                        visible: parent.parent.active
                        anchors.left: parent.left
                        anchors.top: parent.top
                        anchors.margins: 10
                        width: playingLabel.implicitWidth + 20
                        height: 30
                        radius: 15
                        color: Theme.primary
                        Text { id: playingLabel; anchors.centerIn: parent; text: "Í spilun"; color: "#fff"; font.pixelSize: 16; font.bold: true }
                    }
                }
                Text { text: modelData.title; color: Theme.ink; font.pixelSize: 21; font.bold: true; width: parent.width; elide: Text.ElideRight }
                Text {
                    text: ["S" + modelData.season + (modelData.episode !== null ? " · Þáttur " + modelData.episode : ""), modelData.seeders + " deilendur"].join(" · ")
                    color: Theme.faint
                    font.pixelSize: 16
                    width: parent.width
                    elide: Text.ElideRight
                }
            }
        }
    }

    // Catalog: shows grid, or raw items for flat categories
    Column {
        visible: !view.show
        anchors.fill: parent
        spacing: 18

        Row {
            spacing: 10
            Repeater {
                model: view.categories
                delegate: Rectangle {
                    required property var modelData
                    height: 40
                    width: categoryLabel.implicitWidth + 30
                    radius: 20
                    color: view.selectedCategoryId === modelData.id ? Theme.primary : Theme.surface
                    border.color: Theme.border
                    Text {
                        id: categoryLabel
                        anchors.centerIn: parent
                        text: modelData.name
                        color: view.selectedCategoryId === modelData.id ? "#fff" : Theme.muted
                        font.pixelSize: 18
                        font.bold: view.selectedCategoryId === modelData.id
                    }
                }
            }
        }

        GridView {
            width: parent.width
            height: parent.height - y
            clip: true
            interactive: false
            cellWidth: 320
            cellHeight: 304
            model: view.shows.length ? view.shows : view.items
            delegate: Column {
                required property var modelData
                width: 300
                spacing: 8
                Rectangle {
                    width: 300; height: 200
                    radius: 10
                    color: Theme.raised
                    clip: true
                    Image {
                        anchors.fill: parent
                        source: modelData.artwork || ""
                        fillMode: Image.PreserveAspectCrop
                        visible: status === Image.Ready
                    }
                    Text {
                        visible: !modelData.artwork
                        anchors.centerIn: parent
                        width: parent.width - 30
                        text: modelData.title || ""
                        color: Theme.faint
                        font.pixelSize: 19
                        horizontalAlignment: Text.AlignHCenter
                        wrapMode: Text.WordWrap
                        maximumLineCount: 3
                        elide: Text.ElideRight
                    }
                }
                Text {
                    text: modelData.title || ""
                    color: Theme.ink
                    font.pixelSize: 20
                    font.bold: true
                    width: parent.width
                    elide: Text.ElideRight
                }
                Text {
                    text: modelData.episodes !== undefined
                        ? [(modelData.year || ""), modelData.episodes.length + " þættir"].filter(part => part).join(" · ")
                        : [view.sizeLabel(modelData.sizeBytes), modelData.categoryName].filter(part => part).join(" · ")
                    color: Theme.faint
                    font.pixelSize: 16
                    width: parent.width
                    elide: Text.ElideRight
                }
            }
        }
    }
}
