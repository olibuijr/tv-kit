#include "frameclient.h"

#include <QDateTime>
#include <QDir>
#include <QFileInfo>
#include <QJsonDocument>
#include <QJsonParseError>
#include <QNetworkReply>
#include <QNetworkRequest>
#include <QSaveFile>
#include <QScopeGuard>
#include <QStandardPaths>
#include <QUrlQuery>

namespace {
QUrl configuredServerUrl()
{
    const auto raw = qEnvironmentVariable("TV_FRAME_SERVER_URL", "http://127.0.0.1:3110");
    auto url = QUrl(raw);
    url.setPath({});
    return url;
}

QString healthPath()
{
    const auto configured = qEnvironmentVariable("TV_FRAME_HEALTH_FILE");
    if (!configured.isEmpty()) return configured;
    return QDir::homePath() + QStringLiteral("/.tv-kit/frame-health.json");
}
}

FrameClient::FrameClient(QObject *parent)
    : QObject(parent), serverUrl_(configuredServerUrl())
{
    heartbeat_.setInterval(10'000);
    healthTimer_.setInterval(5'000);
    connect(&heartbeat_, &QTimer::timeout, this, [this] {
        if (!connected()) return;
        if (QDateTime::currentMSecsSinceEpoch() - lastMessageAt_ > 30'000) {
            socket_.close();
            return;
        }
        socket_.sendTextMessage(QStringLiteral(R"({"type":"ping"})"));
    });
    connect(&healthTimer_, &QTimer::timeout, this, &FrameClient::writeHealth);
    connect(&socket_, &QWebSocket::connected, this, [this] {
        setConnected(true);
        lastMessageAt_ = QDateTime::currentMSecsSinceEpoch();
        error_.clear();
        emit errorChanged();
        refreshContent();
        writeHealth();
    });
    connect(&socket_, &QWebSocket::disconnected, this, [this] {
        setConnected(false);
        writeHealth();
        if (started_) QTimer::singleShot(1'500, this, &FrameClient::connectSocket);
    });
    connect(&socket_, &QWebSocket::textMessageReceived, this, &FrameClient::handleMessage);
    connect(&socket_, &QWebSocket::errorOccurred, this, [this](QAbstractSocket::SocketError) {
        const auto next = socket_.errorString();
        if (error_ == next) return;
        error_ = next;
        emit errorChanged();
    });
}

bool FrameClient::connected() const { return connected_; }
QVariantMap FrameClient::state() const { return state_.toVariantMap(); }
QVariantMap FrameClient::content() const { return content_.toVariantMap(); }
QString FrameClient::error() const { return error_; }

void FrameClient::start()
{
    if (started_) return;
    started_ = true;
    heartbeat_.start();
    healthTimer_.start();
    connectSocket();
}

void FrameClient::connectSocket()
{
    if (!started_ || socket_.state() != QAbstractSocket::UnconnectedState) return;
    auto url = serverUrl_;
    url.setScheme(url.scheme() == QStringLiteral("https") ? QStringLiteral("wss") : QStringLiteral("ws"));
    url.setPath(QStringLiteral("/ws"));
    QUrlQuery query;
    query.addQueryItem(QStringLiteral("client"), QStringLiteral("native-frame-") + QSysInfo::machineUniqueId().toHex());
    url.setQuery(query);
    QNetworkRequest request(url);
    request.setRawHeader("Origin", "http://127.0.0.1:3111");
    socket_.open(request);
}

void FrameClient::handleMessage(const QString &raw)
{
    QJsonParseError parseError;
    const auto message = QJsonDocument::fromJson(raw.toUtf8(), &parseError).object();
    if (parseError.error != QJsonParseError::NoError) return;
    lastMessageAt_ = QDateTime::currentMSecsSinceEpoch();
    const auto type = message.value(QStringLiteral("type")).toString();
    if (type == QStringLiteral("state")) {
        state_ = message.value(QStringLiteral("state")).toObject();
        emit stateChanged();
        refreshContent();
    } else if (type == QStringLiteral("content-refresh") && message.value(QStringLiteral("resource")).toString() == QStringLiteral("deildu")) {
        refreshContent();
    }
    writeHealth();
}

QUrl FrameClient::contentUrl() const
{
    auto url = serverUrl_;
    url.setPath(QStringLiteral("/dashboard/content"));
    QUrlQuery query;
    query.addQueryItem(QStringLiteral("deilduCategory"), QString::number(state_.value(QStringLiteral("deilduCategoryId")).toInt()));
    query.addQueryItem(QStringLiteral("deilduPage"), QStringLiteral("1"));
    query.addQueryItem(QStringLiteral("deilduPageSize"), QStringLiteral("40"));
    query.addQueryItem(QStringLiteral("deilduShow"), state_.value(QStringLiteral("deilduShowId")).toString());
    url.setQuery(query);
    return url;
}

void FrameClient::refreshContent()
{
    QNetworkRequest request(contentUrl());
    const auto reply = network_.get(request);
    connect(reply, &QNetworkReply::finished, this, [this, reply] {
        const auto guard = qScopeGuard([reply] { reply->deleteLater(); });
        if (reply->error() != QNetworkReply::NoError) return;
        QJsonParseError parseError;
        const auto next = QJsonDocument::fromJson(reply->readAll(), &parseError).object();
        if (parseError.error != QJsonParseError::NoError) return;
        content_ = next;
        emit contentChanged();
    });
}

void FrameClient::setConnected(bool value)
{
    if (value == connected_) return;
    connected_ = value;
    emit connectedChanged();
}

void FrameClient::writeHealth() const
{
    const QFileInfo info(healthPath());
    QDir().mkpath(info.dir().absolutePath());
    QSaveFile file(info.filePath());
    if (!file.open(QIODevice::WriteOnly)) return;
    QJsonObject health{
        {QStringLiteral("connected"), connected()},
        {QStringLiteral("updatedAt"), QDateTime::currentMSecsSinceEpoch()},
        {QStringLiteral("lastMessageAt"), lastMessageAt_},
        {QStringLiteral("view"), state_.value(QStringLiteral("view")).toString()},
    };
    file.write(QJsonDocument(health).toJson(QJsonDocument::Compact));
    file.commit();
}
