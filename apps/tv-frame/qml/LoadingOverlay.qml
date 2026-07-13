import QtQuick

// Stremio-style buffering screen: fullscreen backdrop, the show title pulsing
// and filling up like a progress bar, transfer telemetry underneath.
Rectangle {
    id: overlay
    required property var media

    readonly property var transfer: media.transfer || null
    // Fill fraction: mpv cache buffering once the file is loaded, else torrent
    // download progress while aria2 fetches the first pieces.
    readonly property real fraction: {
        if (typeof media.buffering === "number") return Math.max(0, Math.min(1, media.buffering / 100))
        if (transfer && transfer.totalBytes > 0) return Math.max(0, Math.min(1, transfer.downloadedBytes / transfer.totalBytes))
        return 0
    }

    color: "#0b0908"

    Image {
        anchors.fill: parent
        source: overlay.media.artwork || ""
        fillMode: Image.PreserveAspectCrop
        visible: status === Image.Ready
        opacity: 0.45
    }
    Rectangle {
        anchors.fill: parent
        gradient: Gradient {
            GradientStop { position: 0; color: Qt.alpha("#0b0908", 0.55) }
            GradientStop { position: 0.62; color: Qt.alpha("#0b0908", 0.35) }
            GradientStop { position: 1; color: Qt.alpha("#0b0908", 0.92) }
        }
    }

    Column {
        anchors.centerIn: parent
        width: Math.min(overlay.width - 240, 1360)
        spacing: 34

        // Title as a fill-up progress bar: dim base layer, bright clipped layer.
        Item {
            id: logo
            width: parent.width
            height: title.implicitHeight

            SequentialAnimation on opacity {
                loops: Animation.Infinite
                running: overlay.visible
                NumberAnimation { from: 0.55; to: 1; duration: 900; easing.type: Easing.InOutSine }
                NumberAnimation { from: 1; to: 0.55; duration: 900; easing.type: Easing.InOutSine }
            }

            Text {
                id: title
                width: parent.width
                text: overlay.media.title || ""
                color: Qt.alpha("#f7ece8", 0.28)
                font.pixelSize: 92
                font.bold: true
                font.letterSpacing: 1
                horizontalAlignment: Text.AlignHCenter
                wrapMode: Text.WordWrap
                maximumLineCount: 2
                elide: Text.ElideRight
                style: Text.Raised
                styleColor: "#00000066"
            }
            Item {
                width: parent.width * overlay.fraction
                height: parent.height
                clip: true
                Behavior on width { NumberAnimation { duration: 600; easing.type: Easing.OutCubic } }
                Text {
                    width: logo.width
                    text: title.text
                    color: "#f7ece8"
                    font: title.font
                    horizontalAlignment: Text.AlignHCenter
                    wrapMode: Text.WordWrap
                    maximumLineCount: 2
                    elide: Text.ElideRight
                }
            }
        }

        // Telemetry: peers · speed · percent
        Row {
            anchors.horizontalCenter: parent.horizontalCenter
            spacing: 38

            Text {
                visible: Boolean(overlay.transfer)
                text: overlay.transfer ? overlay.transfer.peers + " tengingar" + (overlay.transfer.seeders ? " · " + overlay.transfer.seeders + " deilendur" : "") : ""
                color: "#cbbab2"
                font.pixelSize: 26
            }
            Text {
                visible: Boolean(overlay.transfer) && overlay.transfer.speedBps > 0
                text: overlay.transfer ? (overlay.transfer.speedBps >= 1048576
                    ? (overlay.transfer.speedBps / 1048576).toFixed(1) + " MB/s"
                    : Math.round(overlay.transfer.speedBps / 1024) + " kB/s") : ""
                color: "#f7ece8"
                font.pixelSize: 26
                font.bold: true
            }
            Text {
                text: Math.round(overlay.fraction * 100) + "%"
                color: "#e9b46a"
                font.pixelSize: 26
                font.bold: true
                font.family: "monospace"
            }
        }

        Text {
            anchors.horizontalCenter: parent.horizontalCenter
            text: overlay.media.source || ""
            color: "#8d7d73"
            font.pixelSize: 20
        }
    }
}
