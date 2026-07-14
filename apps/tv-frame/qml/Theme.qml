pragma Singleton
import QtQuick

QtObject {
    // Public style facade. Edit the focused Theme*.qml files to restyle the
    // entire frame; views import only this singleton.
    readonly property QtObject colors: ThemeColors {}
    readonly property QtObject typography: ThemeTypography {}
    readonly property QtObject metrics: ThemeMetrics {}
    readonly property QtObject motion: ThemeMotion {}
    readonly property QtObject wallpaper: ThemeWallpaper {}

    readonly property color bg: colors.bg
    readonly property color header: colors.header
    readonly property color surface: colors.surface
    readonly property color raised: colors.raised
    readonly property color border: colors.border
    readonly property color borderStrong: colors.borderStrong
    readonly property color glassEdge: colors.glassEdge
    readonly property color glassHeader: colors.glassHeader
    readonly property color glassPanel: colors.glassPanel
    readonly property color ink: colors.ink
    readonly property color muted: colors.muted
    readonly property color faint: colors.faint
    readonly property color selection: colors.selection
    readonly property color accent: colors.accent
    readonly property color good: colors.good
    readonly property color warning: colors.warning
    readonly property color danger: colors.danger
    readonly property color live: colors.live
    readonly property color logoBackdrop: colors.logoBackdrop
    readonly property color mediaBackdrop: colors.mediaBackdrop

    readonly property string fontFamily: typography.family
    readonly property string monoFontFamily: typography.monoFamily
    readonly property int weightRegular: typography.regular
    readonly property int weightMedium: typography.medium
    readonly property int weightSemibold: typography.semibold
    readonly property int weightBold: typography.bold
    readonly property int fontDisplay: typography.display
    readonly property int fontPageTitle: typography.pageTitle
    readonly property int fontTitle: typography.title
    readonly property int fontSection: typography.section
    readonly property int fontCardTitle: typography.cardTitle
    readonly property int fontBody: typography.body
    readonly property int fontCallout: typography.callout
    readonly property int fontCaption: typography.caption
    readonly property int fontMini: typography.mini
    readonly property int fontClock: typography.clock
    readonly property int fontStandbyClock: typography.standbyClock
    readonly property int fontLoadingTitle: typography.loadingTitle

    readonly property int marginX: metrics.marginX
    readonly property int headerHeight: metrics.headerHeight
    readonly property int viewTopMargin: metrics.viewTopMargin
    readonly property int viewBottomMargin: metrics.viewBottomMargin
    readonly property int radiusHero: metrics.radiusHero
    readonly property int radiusPanel: metrics.radiusPanel
    readonly property int radiusCard: metrics.radiusCard
    readonly property int radiusMedia: metrics.radiusMedia
    readonly property int radiusPill: metrics.radiusPill
    readonly property int stroke: metrics.stroke
    readonly property int contentGap: metrics.contentGap
    readonly property int cardGap: metrics.cardGap
    readonly property int panelPadding: metrics.panelPadding
    readonly property int heroPadding: metrics.heroPadding
    readonly property int newsItemHeight: metrics.newsItemHeight
    readonly property int newsThumbnailSize: metrics.newsThumbnailSize

    readonly property int motionFast: motion.fast
    readonly property int motionNormal: motion.normal
    readonly property int motionPanel: motion.panel
    readonly property int motionProgress: motion.progress
    readonly property int motionLoading: motion.loading
    readonly property int motionPulse: motion.pulse
    readonly property int motionNewsItem: motion.newsItemDuration
    readonly property real wallpaperOpacity: wallpaper.opacity
    readonly property real wallpaperScrimOpacity: wallpaper.scrimOpacity
    readonly property int videoTopInset: wallpaper.videoTopInset
    readonly property real videoScale: wallpaper.videoScale

    function clock(seconds) {
        const total = Math.max(0, Math.floor(seconds || 0))
        const h = Math.floor(total / 3600)
        const m = Math.floor((total % 3600) / 60)
        const s = total % 60
        const mm = (h > 0 && m < 10 ? "0" : "") + m
        const ss = (s < 10 ? "0" : "") + s
        return (h > 0 ? h + ":" : "") + mm + ":" + ss
    }

    function relativeTime(timestamp, now) {
        if (!timestamp) return ""
        const minutes = Math.round((now - timestamp) / 60000)
        if (minutes < 1) return "Rétt í þessu"
        if (minutes < 60) return "Fyrir " + minutes + " mín"
        const hours = Math.round(minutes / 60)
        if (hours < 24) return "Fyrir " + hours + " klst"
        return "Fyrir " + Math.round(hours / 24) + " dögum"
    }

    function scheduleTime(timestamp) {
        const date = new Date(timestamp)
        return ("0" + date.getHours()).slice(-2) + ":" + ("0" + date.getMinutes()).slice(-2)
    }

    function eventProgress(event, now) {
        if (!event || !event.startTime || !event.endTime) return 0
        const span = event.endTime - event.startTime
        if (span <= 0) return 0
        return Math.max(0, Math.min(100, ((now - event.startTime) / span) * 100))
    }

    // True only when a real endTime has passed; missing endTime (live/synthetic
    // placeholder entries) is never treated as ended.
    function eventEnded(event, now) {
        return Boolean(event && event.endTime && event.endTime <= now)
    }

    // EPG APIs frequently leave endTime null on near-term entries. Standard
    // schedule semantics: an entry ends when the next one starts, so fall
    // back to the following item's startTime before giving up. Filters a
    // whole ordered list down to entries that are still current or future.
    function futureProgramme(events, now) {
        if (!events) return []
        return events.filter((event, index) => {
            const end = (event.endTime !== null && event.endTime !== undefined)
                ? event.endTime
                : (events[index + 1] ? events[index + 1].startTime : null)
            return !(end && end <= now)
        })
    }

    function golfDate(value) {
        const date = new Date(value + "T12:00:00")
        return date.toLocaleDateString("is-IS", { weekday: "short", day: "numeric", month: "short" })
    }
}
