import QtQuick

Flickable {
    id: view
    required property var state
    required property var content

    readonly property var movies: content.movies || []
    readonly property var programs: content.programs || []
    readonly property var torrentMovies: content.torrentMovies || []
    readonly property var continueWatching: (content.continueWatching || []).map(item => ({
        title: item.episode.programTitle,
        image: item.episode.image,
        latestEpisode: { title: item.episode.title, image: item.episode.image },
    }))

    contentWidth: width
    contentHeight: rails.height
    clip: true

    component Rail: Column {
        id: rail
        required property string title
        required property var items
        width: parent.width
        spacing: 12
        visible: rail.items.length > 0
        Text { text: rail.title; color: Theme.ink; font.pixelSize: 26; font.bold: true }
        Row {
            spacing: 16
            Repeater {
                model: rail.items.slice(0, 7)
                delegate: Column {
                    required property var modelData
                    width: 244
                    spacing: 8
                    Rectangle {
                        width: 244; height: 137
                        radius: 10
                        color: Theme.raised
                        clip: true
                        Image {
                            anchors.fill: parent
                            source: modelData.image
                                || (modelData.latestEpisode ? modelData.latestEpisode.image : "")
                                || modelData.portraitImage
                                || modelData.artwork
                                || ""
                            fillMode: Image.PreserveAspectCrop
                            visible: status === Image.Ready
                        }
                    }
                    Text {
                        text: modelData.title
                        color: Theme.ink
                        font.pixelSize: 19
                        width: parent.width
                        elide: Text.ElideRight
                    }
                    Text {
                        text: (modelData.latestEpisode ? modelData.latestEpisode.title : "")
                            || modelData.foreignTitle
                            || modelData.source
                            || ""
                        color: Theme.faint
                        font.pixelSize: 15
                        width: parent.width
                        elide: Text.ElideRight
                    }
                }
            }
        }
    }

    Column {
        id: rails
        width: parent.width
        spacing: 26

        Rail { title: "Áframhaldandi áhorf"; items: view.continueWatching }
        Rail { title: "Kvikmyndir í Sarpinum"; items: view.movies }
        Rail { title: "Þættir í Sarpinum"; items: view.programs }
        Rail { title: "Sótt efni"; items: view.torrentMovies }

        Text {
            visible: !view.movies.length && !view.programs.length && !view.torrentMovies.length
            text: "Ekkert myndefni er tiltækt."
            color: Theme.faint
            font.pixelSize: 26
        }
    }
}
