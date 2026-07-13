#pragma once

#include <MpvAbstractItem>
#include <qqmlintegration.h>

// Embeds libmpv directly in the QML scene graph via mpvqt's render-API
// wrapper. Video is a normal QQuickItem, so the HUD/OSD panel composite over
// it as ordinary QML children — no separate mpv window, no window-manager
// stacking tricks. Replaces the old server-spawned-mpv-process + IPC-socket
// + KWin-keep-above-rule architecture.
class MpvVideo : public MpvAbstractItem {
    Q_OBJECT
    QML_ELEMENT

    Q_PROPERTY(double position READ position NOTIFY positionChanged)
    Q_PROPERTY(double duration READ duration NOTIFY durationChanged)
    Q_PROPERTY(bool paused READ paused NOTIFY pausedChanged)
    Q_PROPERTY(bool pausedForCache READ pausedForCache NOTIFY pausedForCacheChanged)
    Q_PROPERTY(double bufferingPercent READ bufferingPercent NOTIFY bufferingPercentChanged)
    Q_PROPERTY(QString currentSource READ currentSource NOTIFY currentSourceChanged)

public:
    explicit MpvVideo(QQuickItem *parent = nullptr);

    double position() const { return m_position; }
    double duration() const { return m_duration; }
    bool paused() const { return m_paused; }
    bool pausedForCache() const { return m_pausedForCache; }
    double bufferingPercent() const { return m_bufferingPercent; }
    QString currentSource() const { return m_currentSource; }

    // Loads a new source, or a no-op if already loaded (idempotent — safe to
    // call on every state broadcast). Empty url stops playback.
    Q_INVOKABLE void loadSource(const QString &url);
    Q_INVOKABLE void setPaused(bool value);
    Q_INVOKABLE void seekAbsolute(double seconds);
    Q_INVOKABLE void setVolumePercent(int value);
    Q_INVOKABLE void stop();

signals:
    void positionChanged();
    void durationChanged();
    void pausedChanged();
    void pausedForCacheChanged();
    void bufferingPercentChanged();
    void currentSourceChanged();
    // Real frames confirmed rendering (paused-for-cache cleared with a
    // positive time-pos) — distinct from "file-loaded" which fires before
    // enough is buffered to actually show anything.
    void playbackRestarted();
    void endOfFile(const QString &reason);

private:
    void onPropertyChanged(const QString &property, const QVariant &value);
    void onFileLoaded();
    void onEndFile(const QString &reason);

    double m_position = 0;
    double m_duration = 0;
    bool m_paused = false;
    bool m_pausedForCache = false;
    double m_bufferingPercent = 0;
    QString m_currentSource;
    QString m_pendingLoad;
    bool m_restartedSignalled = false;
};
