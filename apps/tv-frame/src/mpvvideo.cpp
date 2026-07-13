#include "mpvvideo.h"

#include <MpvController>

MpvVideo::MpvVideo(QQuickItem *parent)
    : MpvAbstractItem(parent)
{
    // Equivalent of the former mpv CLI flags (mpvPlayer.ts) — mpv now
    // renders into this item instead of owning its own top-level window, so
    // every window-management flag (--fullscreen, --ontop, --border,
    // --geometry, --no-osc, --cursor-autohide, --focus-on) is gone; only
    // decode/cache/OSD behavior remains relevant.
    setProperty(QStringLiteral("hwdec"), QStringLiteral("vaapi"));
    setProperty(QStringLiteral("video-sync"), QStringLiteral("audio"));
    setProperty(QStringLiteral("cache"), true);
    setProperty(QStringLiteral("cache-pause"), true);
    setProperty(QStringLiteral("cache-pause-initial"), true);
    setProperty(QStringLiteral("cache-pause-wait"), 8);
    setProperty(QStringLiteral("cache-secs"), 45);
    setProperty(QStringLiteral("demuxer-max-bytes"), qlonglong(67108864));
    setProperty(QStringLiteral("stream-buffer-size"), qlonglong(1048576));
    setProperty(QStringLiteral("keep-open"), QStringLiteral("no"));
    // mpv's own OSD/subtitle-menu rendering is off; the QML OsdPanel is the
    // only overlay. Real subtitle track rendering (burned-in ASS/SRT) stays
    // on so selected subtitle tracks are still visible in the video itself.
    setProperty(QStringLiteral("osd-level"), 0);

    observeProperty(QStringLiteral("time-pos"), MPV_FORMAT_DOUBLE);
    observeProperty(QStringLiteral("duration"), MPV_FORMAT_DOUBLE);
    observeProperty(QStringLiteral("pause"), MPV_FORMAT_FLAG);
    observeProperty(QStringLiteral("paused-for-cache"), MPV_FORMAT_FLAG);
    observeProperty(QStringLiteral("cache-buffering-state"), MPV_FORMAT_DOUBLE);

    connect(mpvController(), &MpvController::propertyChanged, this, &MpvVideo::onPropertyChanged, Qt::QueuedConnection);
    connect(mpvController(), &MpvController::fileLoaded, this, &MpvVideo::onFileLoaded, Qt::QueuedConnection);
    connect(mpvController(), &MpvController::endFile, this, [this](QString reason) { onEndFile(reason); }, Qt::QueuedConnection);
}

void MpvVideo::onPropertyChanged(const QString &property, const QVariant &value)
{
    if (property == QStringLiteral("time-pos")) {
        m_position = value.toDouble();
        emit positionChanged();
        if (!m_restartedSignalled && !m_pausedForCache && m_position > 0) {
            m_restartedSignalled = true;
            emit playbackRestarted();
        }
    } else if (property == QStringLiteral("duration")) {
        m_duration = value.toDouble();
        emit durationChanged();
    } else if (property == QStringLiteral("pause")) {
        m_paused = value.toBool();
        emit pausedChanged();
    } else if (property == QStringLiteral("paused-for-cache")) {
        m_pausedForCache = value.toBool();
        emit pausedForCacheChanged();
    } else if (property == QStringLiteral("cache-buffering-state")) {
        m_bufferingPercent = value.toDouble();
        emit bufferingPercentChanged();
    }
}

void MpvVideo::onFileLoaded()
{
    m_restartedSignalled = false;
}

void MpvVideo::onEndFile(const QString &reason)
{
    emit endOfFile(reason);
}

void MpvVideo::loadSource(const QString &url)
{
    if (url.isEmpty()) {
        stop();
        return;
    }
    if (url == m_currentSource) return;
    m_currentSource = url;
    m_restartedSignalled = false;
    m_position = 0;
    m_bufferingPercent = 0;
    emit currentSourceChanged();
    emit positionChanged();
    emit bufferingPercentChanged();
    command(QStringList() << QStringLiteral("loadfile") << url);
}

void MpvVideo::setPaused(bool value)
{
    if (value == m_paused) return;
    setPropertyAsync(QStringLiteral("pause"), value);
}

void MpvVideo::seekAbsolute(double seconds)
{
    if (m_currentSource.isEmpty()) return;
    command(QStringList() << QStringLiteral("seek") << QString::number(seconds) << QStringLiteral("absolute"));
}

void MpvVideo::setVolumePercent(int value)
{
    setPropertyAsync(QStringLiteral("volume"), qBound(0, value, 100));
}

void MpvVideo::stop()
{
    if (m_currentSource.isEmpty()) return;
    m_currentSource.clear();
    m_restartedSignalled = false;
    emit currentSourceChanged();
    command(QStringList() << QStringLiteral("stop"));
}
