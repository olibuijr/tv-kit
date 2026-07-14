import QtQuick
import QtQuick.Layouts

Item {
    id: view
    required property var state
    required property var content
    required property real now

    readonly property var media: state.media || ({})
    readonly property bool mediaActive: Boolean(media.src) || media.status === "loading" || media.status === "error"
    readonly property var channels: content.channels || []
    readonly property var programs: content.programs || []
    readonly property var news: content.news || []
    readonly property var teeTimes: content.golfTeeTimes || null
    readonly property string golfPerson: content.golfPerson || ""
    readonly property var golfBookings: content.golfBookings || []
    readonly property Item liveVideoContainer: hero

    RowLayout {
        anchors.fill: parent
        spacing: 18

        // Left column: hero + Sarpurinn rail
        ColumnLayout {
            Layout.fillHeight: true
            Layout.fillWidth: true
            Layout.preferredWidth: 2
            spacing: 18

            Rectangle {
                id: hero
                Layout.fillWidth: true
                Layout.fillHeight: true
                Layout.preferredHeight: 3
                radius: Theme.radiusHero
                color: view.media.ambient ? "transparent" : Theme.surface
                border { color: view.media.ambient ? "transparent" : Theme.border; width: Theme.stroke }
                clip: true
                Rectangle {
                    anchors.fill: parent
                    gradient: Gradient {
                        orientation: Gradient.Horizontal
                        GradientStop { position: 0; color: view.media.ambient ? Qt.alpha(Theme.bg, 0.7) : Qt.alpha(Theme.bg, 0.88) }
                        GradientStop { position: 0.8; color: "transparent" }
                    }
                }
                Column {
                    anchors.left: parent.left
                    anchors.bottom: parent.bottom
                    anchors.margins: 30
                    width: parent.width * 0.66
                    spacing: 8
                    Text {
                        text: !view.mediaActive ? "TV KIT" : view.media.status === "error" ? "VILLA" : view.media.status === "loading" ? "HLEÐUR" : view.media.live ? "Í BEINNI" : view.state.playing ? "Í SPILUN" : "VALIÐ EFNI"
                        color: view.media.status === "error" ? Theme.danger
                            : view.media.status === "loading" ? Theme.warning
                            : view.media.live ? Theme.live : Theme.selection
                        font.pixelSize: Theme.fontCallout
                        font.weight: Theme.weightSemibold
                        font.letterSpacing: 2
                    }
                    Text {
                        width: parent.width
                        text: view.mediaActive ? (view.media.title || "Spilun") : "Velkomin heim"
                        color: Theme.ink
                        font.pixelSize: Theme.fontDisplay
                        font.weight: Theme.weightSemibold
                        wrapMode: Text.WordWrap
                        maximumLineCount: 2
                        elide: Text.ElideRight
                    }
                    Text {
                        width: parent.width
                        text: view.mediaActive
                            ? [view.media.subtitle, view.media.source].filter(part => part).join(" · ")
                            : "Veldu efni á fjarstýringunni"
                        color: Theme.muted
                        font.pixelSize: Theme.fontCardTitle
                        elide: Text.ElideRight
                    }
                }
            }

            Rectangle {
                Layout.fillWidth: true
                Layout.fillHeight: true
                Layout.preferredHeight: 2
                radius: Theme.radiusHero
                color: Theme.surface
                border.color: Theme.border
                clip: true
                Column {
                    anchors.fill: parent
                    anchors.margins: 20
                    spacing: 12
                    Text { text: "Nýtt í Sarpinum"; color: Theme.ink; font.pixelSize: Theme.fontSection; font.weight: Theme.weightSemibold }
                    Row {
                        spacing: 14
                        Repeater {
                            model: view.programs.slice(0, 5)
                            delegate: Column {
                                required property var modelData
                                width: 200
                                spacing: 8
                                Rectangle {
                                    width: 200; height: 112
                                    radius: Theme.radiusMedia
                                    color: Theme.raised
                                    clip: true
                                    Image {
                                        anchors.fill: parent
                                        source: modelData.image || (modelData.latestEpisode ? modelData.latestEpisode.image : "") || modelData.portraitImage || ""
                                        fillMode: Image.PreserveAspectCrop
                                        visible: status === Image.Ready
                                    }
                                }
                                Text { text: modelData.title; color: Theme.ink; font.pixelSize: Theme.fontCallout; width: parent.width; elide: Text.ElideRight }
                            }
                        }
                    }
                }
            }
        }

        // Right column: live TV, golf, news
        ColumnLayout {
            Layout.fillHeight: true
            Layout.fillWidth: true
            Layout.preferredWidth: 1
            spacing: 18

            Rectangle {
                Layout.fillWidth: true
                Layout.fillHeight: true
                Layout.preferredHeight: 3
                radius: Theme.radiusHero
                color: Theme.surface
                border.color: Theme.border
                clip: true
                Column {
                    anchors.fill: parent
                    anchors.margins: 20
                    spacing: 12
                    Text { text: "Í beinni á RÚV"; color: Theme.ink; font.pixelSize: Theme.fontSection; font.weight: Theme.weightSemibold }
                    Repeater {
                        model: view.channels
                        delegate: Column {
                            required property var modelData
                            width: parent.width
                            spacing: 6
                            readonly property var futureUpcoming: Theme.futureProgramme(modelData.upcoming, view.now)
                            Row {
                                width: parent.width
                                spacing: 12
                                Text { text: modelData.channel.name; color: Theme.accent; font.pixelSize: Theme.fontBody; font.weight: Theme.weightSemibold; width: 66 }
                                Text {
                                    width: parent.width - 84
                                    text: modelData.current ? modelData.current.title : "Bein útsending"
                                    color: Theme.ink
                                    font.pixelSize: Theme.fontBody
                                    elide: Text.ElideRight
                                }
                            }
                            Rectangle {
                                width: parent.width
                                height: 3
                                radius: Theme.radiusPill
                                color: Theme.raised
                                Rectangle {
                                    height: parent.height
                                    radius: Theme.radiusPill
                                    color: Theme.selection
                                    width: parent.width * Theme.eventProgress(modelData.current, view.now) / 100
                                }
                            }
                            Text {
                                visible: futureUpcoming.length > 0
                                text: futureUpcoming.length
                                    ? "Næst " + Theme.scheduleTime(futureUpcoming[0].startTime) + " · " + futureUpcoming[0].title
                                    : ""
                                color: Theme.faint
                                font.pixelSize: Theme.fontCaption
                                width: parent.width
                                elide: Text.ElideRight
                            }
                        }
                    }
                }
            }

            Rectangle {
                Layout.fillWidth: true
                Layout.fillHeight: true
                Layout.preferredHeight: 2.2
                radius: Theme.radiusHero
                color: Theme.surface
                border.color: Theme.border
                clip: true
                Column {
                    anchors.fill: parent
                    anchors.margins: 20
                    spacing: 10
                    Text {
                        text: view.teeTimes ? "Lausir rástímar · " + view.teeTimes.course : "Lausir rástímar"
                        color: Theme.ink
                        font.pixelSize: Theme.fontSection
                        font.weight: Theme.weightSemibold
                        width: parent.width
                        elide: Text.ElideRight
                    }
                    Row {
                        visible: view.golfPerson.length > 0
                        width: parent.width
                        spacing: 10
                        Text { text: view.golfPerson; color: Theme.accent; font.pixelSize: Theme.fontCallout; font.weight: Theme.weightSemibold; anchors.verticalCenter: parent.verticalCenter }
                        Repeater {
                            model: view.golfBookings
                            delegate: Rectangle {
                                required property var modelData
                                height: 30
                                width: bookingLabel.implicitWidth + 20
                                radius: Theme.radiusPill
                                color: Theme.raised
                                anchors.verticalCenter: parent.verticalCenter
                                Text { id: bookingLabel; anchors.centerIn: parent; text: Theme.golfDate(modelData.date) + " " + modelData.time; color: Theme.ink; font.pixelSize: Theme.fontCaption }
                            }
                        }
                        Text {
                            visible: view.golfBookings.length === 0
                            text: "Enginn skráður rástími næstu daga"
                            color: Theme.faint
                            font.pixelSize: Theme.fontCaption
                            anchors.verticalCenter: parent.verticalCenter
                        }
                    }
                    Flow {
                        width: parent.width
                        spacing: 8
                        Repeater {
                            model: (view.teeTimes ? view.teeTimes.slots : []).slice(0, 8)
                            delegate: Rectangle {
                                required property var modelData
                                width: 92; height: 50
                                radius: Theme.radiusMedia
                                color: Theme.raised
                                Column {
                                    anchors.centerIn: parent
                                    Text { text: modelData.time; color: Theme.ink; font.pixelSize: Theme.fontCallout; font.weight: Theme.weightSemibold; anchors.horizontalCenter: parent.horizontalCenter }
                                    Text { text: modelData.openSeats + " laus"; color: Theme.faint; font.pixelSize: Theme.fontMini; anchors.horizontalCenter: parent.horizontalCenter }
                                }
                            }
                        }
                    }
                    Item { width: 1; height: Theme.cardGap }
                    Text {
                        visible: !view.teeTimes
                        text: "Ekki tiltækt"
                        color: Theme.faint
                        font.pixelSize: Theme.fontCallout
                    }
                }
            }

            Rectangle {
                Layout.fillWidth: true
                Layout.fillHeight: true
                Layout.preferredHeight: 3.8
                radius: Theme.radiusHero
                color: Theme.surface
                border.color: Theme.border
                clip: true
                Column {
                    anchors.fill: parent
                    anchors.margins: 20
                    spacing: 10
                    Text { text: "Fréttir"; color: Theme.ink; font.pixelSize: Theme.fontSection; font.weight: Theme.weightSemibold }
                    Item {
                        width: parent.width
                        height: parent.height - y
                        clip: true

                        ListView {
                            id: newsTicker
                            anchors.fill: parent
                            interactive: false
                            spacing: Theme.cardGap
                            model: view.news.length ? view.news.concat(view.news) : []

                            delegate: Item {
                                required property var modelData
                                width: newsTicker.width
                                height: Theme.newsItemHeight

                                Row {
                                    anchors.fill: parent
                                    spacing: 12

                                    Rectangle {
                                        width: Theme.newsThumbnailSize
                                        height: Theme.newsThumbnailSize
                                        anchors.verticalCenter: parent.verticalCenter
                                        radius: Theme.radiusMedia
                                        color: Theme.mediaBackdrop
                                        clip: true

                                        Image {
                                            anchors.fill: parent
                                            anchors.margins: 2
                                            source: modelData.mainImageUrl || modelData.image || ""
                                            fillMode: Image.PreserveAspectFit
                                            visible: status === Image.Ready
                                        }
                                    }

                                    Column {
                                        width: parent.width - Theme.newsThumbnailSize - 12
                                        anchors.verticalCenter: parent.verticalCenter
                                        spacing: 2
                                        Text { text: modelData.categoryTitle || "RÚV"; color: Theme.accent; font.pixelSize: Theme.fontMini; font.weight: Theme.weightSemibold }
                                        Text {
                                            text: modelData.title
                                            color: Theme.ink
                                            font.pixelSize: Theme.fontCallout
                                            width: parent.width
                                            wrapMode: Text.WordWrap
                                            maximumLineCount: 2
                                            elide: Text.ElideRight
                                        }
                                        Text { text: Theme.relativeTime(modelData.firstPublishedAt, view.now); color: Theme.faint; font.pixelSize: Theme.fontMini }
                                    }
                                }
                            }

                            NumberAnimation on contentY {
                                from: 0
                                to: view.news.length * (Theme.newsItemHeight + Theme.cardGap)
                                duration: Math.max(1, view.news.length) * Theme.motionNewsItem
                                loops: Animation.Infinite
                                running: view.news.length > 1
                                easing.type: Easing.Linear
                            }
                        }
                    }
                }
            }
        }
    }
}
