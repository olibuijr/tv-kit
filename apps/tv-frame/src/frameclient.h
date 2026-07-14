#pragma once

#include <QObject>
#include <QJsonObject>
#include <QNetworkAccessManager>
#include <QTimer>
#include <QUrl>
#include <QVariantList>
#include <QVariantMap>
#include <QWebSocket>
#include <qqmlintegration.h>

class FrameClient : public QObject {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(bool connected READ connected NOTIFY connectedChanged)
    Q_PROPERTY(QVariantMap state READ state NOTIFY stateChanged)
    Q_PROPERTY(QVariantMap content READ content NOTIFY contentChanged)
    Q_PROPERTY(QVariantList stations READ stations NOTIFY stationsChanged)
    Q_PROPERTY(QVariantMap article READ article NOTIFY articleChanged)
    Q_PROPERTY(QVariantList screenElements READ screenElements WRITE setScreenElements NOTIFY screenElementsChanged)

public:
    explicit FrameClient(QObject *parent = nullptr);

    bool connected() const;
    QVariantMap state() const;
    QVariantMap content() const;
    QVariantList stations() const;
    QVariantMap article() const;
    QString error() const;
    QVariantList screenElements() const;
    void setScreenElements(const QVariantList &elements);

    Q_INVOKABLE void start();
    Q_INVOKABLE void refreshContent();
    Q_INVOKABLE void refreshStations();
    // Pushes {"type":"command","action":action,"value":value} — the same
    // wire protocol the tablet remote and tvctl use. Lets the frame report
    // playback progress/status back (media-progress, player-status) since
    // mpv now lives here instead of in tvserverd.
    Q_INVOKABLE void sendCommand(const QString &action, const QVariant &value);
signals:
    void connectedChanged();
    void stateChanged();
    void contentChanged();
    void stationsChanged();
    void screenElementsChanged();
    void articleChanged();
    void errorChanged();

private:
    void connectSocket();
    void handleMessage(const QString &message);
    void setConnected(bool value);
    void writeHealth() const;
    void refreshArticle();
    QUrl serverPath(const QString &path) const;
    QVariantList screenElements_;
    QUrl contentUrl() const;

    QWebSocket socket_;
    QNetworkAccessManager network_;
    QTimer heartbeat_;
    QTimer healthTimer_;
    QTimer contentTimer_;
    QUrl serverUrl_;
    QJsonObject state_;
    QJsonObject content_;
    QVariantList stations_;
    QJsonObject article_;
    QString error_;
    qint64 lastMessageAt_ = 0;
    int articleId_ = 0;
    bool connected_ = false;
    bool started_ = false;
};
