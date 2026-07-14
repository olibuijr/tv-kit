import QtQuick

QtObject {
    // These families are installed on the TV. Keeping them explicit makes
    // rendering deterministic without shipping Apple-restricted SF fonts.
    readonly property string family: "Noto Sans"
    readonly property string monoFamily: "Noto Sans Mono"

    readonly property int regular: Font.Normal
    readonly property int medium: Font.Medium
    readonly property int semibold: Font.DemiBold
    readonly property int bold: Font.Bold

    readonly property int display: 44
    readonly property int pageTitle: 34
    readonly property int title: 30
    readonly property int section: 24
    readonly property int cardTitle: 21
    readonly property int body: 18
    readonly property int callout: 17
    readonly property int caption: 15
    readonly property int mini: 13
    readonly property int clock: 30
    readonly property int standbyClock: 120
    readonly property int loadingTitle: 92
}
