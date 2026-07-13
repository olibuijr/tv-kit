#pragma once

#include <QObject>
#include <QJsonObject>
#include <QNetworkAccessManager>
#include <QTimer>
#include <QUrl>
#include <QVariantMap>
#include <QWebSocket>

class FrameClient : public QObject {
    Q_OBJECT
    Q_PROPERTY(bool connected READ connected NOTIFY connectedChanged)
    Q_PROPERTY(QVariantMap state READ state NOTIFY stateChanged)
    Q_PROPERTY(QVariantMap content READ content NOTIFY contentChanged)
    Q_PROPERTY(QString error READ error NOTIFY errorChanged)

public:
    explicit FrameClient(QObject *parent = nullptr);

    bool connected() const;
    QVariantMap state() const;
    QVariantMap content() const;
    QString error() const;

    Q_INVOKABLE void start();
    Q_INVOKABLE void refreshContent();

signals:
    void connectedChanged();
    void stateChanged();
    void contentChanged();
    void errorChanged();

private:
    void connectSocket();
    void handleMessage(const QString &message);
    void setConnected(bool value);
    void writeHealth() const;
    QUrl contentUrl() const;

    QWebSocket socket_;
    QNetworkAccessManager network_;
    QTimer heartbeat_;
    QTimer healthTimer_;
    QUrl serverUrl_;
    QJsonObject state_;
    QJsonObject content_;
    QString error_;
    qint64 lastMessageAt_ = 0;
    bool connected_ = false;
    bool started_ = false;
};
