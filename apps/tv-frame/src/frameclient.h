#pragma once

#include <QObject>
#include <QJsonObject>
#include <QNetworkAccessManager>
#include <QTimer>
#include <QUrl>
#include <QVariantList>
#include <QVariantMap>
#include <QWebSocket>

class FrameClient : public QObject {
    Q_OBJECT
    Q_PROPERTY(bool connected READ connected NOTIFY connectedChanged)
    Q_PROPERTY(QVariantMap state READ state NOTIFY stateChanged)
    Q_PROPERTY(QVariantMap content READ content NOTIFY contentChanged)
    Q_PROPERTY(QVariantList stations READ stations NOTIFY stationsChanged)
    Q_PROPERTY(QVariantMap article READ article NOTIFY articleChanged)
    Q_PROPERTY(QString error READ error NOTIFY errorChanged)

public:
    explicit FrameClient(QObject *parent = nullptr);

    bool connected() const;
    QVariantMap state() const;
    QVariantMap content() const;
    QVariantList stations() const;
    QVariantMap article() const;
    QString error() const;

    Q_INVOKABLE void start();
    Q_INVOKABLE void refreshContent();
    Q_INVOKABLE void refreshStations();

signals:
    void connectedChanged();
    void stateChanged();
    void contentChanged();
    void stationsChanged();
    void articleChanged();
    void errorChanged();

private:
    void connectSocket();
    void handleMessage(const QString &message);
    void setConnected(bool value);
    void writeHealth() const;
    void refreshArticle();
    QUrl serverPath(const QString &path) const;
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
