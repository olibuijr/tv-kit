import QtQuick

Item {
    id: view
    required property var state
    required property var stations

    readonly property var favorites: (state.radioFavorites || [])
    readonly property var favoriteStations: stations.filter(station => favorites.indexOf(station.id) >= 0)
    readonly property var otherStations: stations.filter(station => favorites.indexOf(station.id) < 0)
    readonly property string activeId: (state.media || {}).id || ""

    component StationGrid: GridView {
        id: grid
        required property var items
        interactive: false
        cellWidth: Math.floor(width / Math.max(3, Math.floor(width / 330)))
        cellHeight: 120
        model: items
        delegate: Item {
            required property var modelData
            width: grid.cellWidth
            height: grid.cellHeight
            Rectangle {
                anchors.fill: parent
                anchors.rightMargin: 16
                anchors.bottomMargin: 16
                radius: Theme.radiusPanel
                readonly property bool active: view.activeId === "radio-" + parent.modelData.id
                color: active ? Qt.alpha(Theme.selection, 0.16) : Theme.surface
                border.color: active ? Theme.selection : Theme.border
                border.width: Theme.stroke
                Row {
                    anchors.fill: parent
                    anchors.margins: 16
                    spacing: 14
                    Rectangle {
                        width: 70; height: 70
                        anchors.verticalCenter: parent.verticalCenter
                        radius: Theme.radiusCard
                        color: Theme.logoBackdrop
                        clip: true
                        Image {
                            anchors.fill: parent
                            anchors.margins: 6
                            source: modelData.logoUrl || ""
                            fillMode: Image.PreserveAspectFit
                            visible: status === Image.Ready
                        }
                    }
                    Column {
                        anchors.verticalCenter: parent.verticalCenter
                        width: parent.width - 100
                        spacing: 4
                        Text { text: modelData.name; color: Theme.ink; font.pixelSize: Theme.fontCardTitle; font.weight: Theme.weightSemibold; width: parent.width; elide: Text.ElideRight }
                        Text {
                            text: modelData.terrestrial ? modelData.frequency.toFixed(1) + " FM" : "Á netinu"
                            color: Theme.muted
                            font.pixelSize: Theme.fontCallout
                        }
                    }
                }
            }
        }
    }

    Column {
        anchors.fill: parent
        spacing: 8

        Text {
            visible: view.favoriteStations.length > 0
            text: "Uppáhaldsstöðvar"
            color: Theme.accent
            font.pixelSize: Theme.fontSection
            font.weight: Theme.weightSemibold
        }
        StationGrid {
            visible: view.favoriteStations.length > 0
            width: parent.width
            height: Math.ceil(view.favoriteStations.length / Math.max(3, Math.floor(width / 330))) * 120
            items: view.favoriteStations
        }

        Text { text: "Allar stöðvar"; color: Theme.ink; font.pixelSize: Theme.fontSection; font.weight: Theme.weightSemibold; topPadding: 10 }
        StationGrid {
            width: parent.width
            height: parent.height - y
            clip: true
            items: view.otherStations
        }
    }

    Text {
        visible: view.stations.length === 0
        anchors.centerIn: parent
        text: "Sæki útvarpsstöðvar…"
        color: Theme.faint
        font.pixelSize: Theme.fontSection
    }
}
