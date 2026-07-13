pragma Singleton
import QtQuick

QtObject {
    readonly property color bg: "#13100f"
    readonly property color header: "#191413"
    readonly property color surface: "#1e1917"
    readonly property color raised: "#272019"
    readonly property color border: "#3a2f28"
    readonly property color ink: "#f7ece8"
    readonly property color muted: "#cbbab2"
    readonly property color faint: "#8d7d73"
    readonly property color primary: "#e9704a"
    readonly property color accent: "#e9b46a"
    readonly property color good: "#79d49b"

    readonly property int marginX: 28

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
