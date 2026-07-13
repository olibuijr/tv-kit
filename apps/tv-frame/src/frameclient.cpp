#include "frameclient.h"

#include <QDateTime>
#include <QDir>
#include <QFileInfo>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonParseError>
#include <QNetworkReply>
#include <QNetworkRequest>
#include <QSaveFile>
#include <QScopeGuard>
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
    contentTimer_.setInterval(60'000);
    connect(&heartbeat_, &QTimer::timeout, this, [this] {
        if (!connected()) return;
        if (QDateTime::currentMSecsSinceEpoch() - lastMessageAt_ > 30'000) {
            socket_.close();
            return;
        }
        socket_.sendTextMessage(QStringLiteral(R"({"type":"ping"})"));
    });
    connect(&healthTimer_, &QTimer::timeout, this, &FrameClient::writeHealth);
    connect(&contentTimer_, &QTimer::timeout, this, [this] {
        refreshContent();
        refreshStations();
    });
    connect(&socket_, &QWebSocket::connected, this, [this] {
        setConnected(true);
        lastMessageAt_ = QDateTime::currentMSecsSinceEpoch();
        error_.clear();
        emit errorChanged();
        refreshContent();
        refreshStations();
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
QVariantList FrameClient::stations() const { return stations_; }
QVariantMap FrameClient::article() const { return article_.toVariantMap(); }
QString FrameClient::error() const { return error_; }

void FrameClient::start()
{
    if (started_) return;
    started_ = true;
    heartbeat_.start();
    healthTimer_.start();
    contentTimer_.start();
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
    request.setRawHeader("Origin", "http://127.0.0.1:3110");
    socket_.open(request);
}

void FrameClient::sendCommand(const QString &action, const QVariant &value)
{
    if (!connected_) return;
    QJsonObject message{
        {QStringLiteral("type"), QStringLiteral("command")},
        {QStringLiteral("action"), action},
    };
    if (value.isValid()) message.insert(QStringLiteral("value"), QJsonValue::fromVariant(value));
    socket_.sendTextMessage(QString::fromUtf8(QJsonDocument(message).toJson(QJsonDocument::Compact)));
}

void FrameClient::handleMessage(const QString &raw)
{
    QJsonParseError parseError;
    const auto message = QJsonDocument::fromJson(raw.toUtf8(), &parseError).object();
    if (parseError.error != QJsonParseError::NoError) return;
    lastMessageAt_ = QDateTime::currentMSecsSinceEpoch();
    const auto type = message.value(QStringLiteral("type")).toString();
    if (type == QStringLiteral("state")) {
        const auto previous = state_;
        state_ = message.value(QStringLiteral("state")).toObject();
        emit stateChanged();
        const auto changed = [&](const char *key) {
            return previous.value(QLatin1String(key)) != state_.value(QLatin1String(key));
        };
        if (changed("view") || changed("deilduCategoryId") || changed("deilduShowId"))
            refreshContent();
        const auto articleId = state_.value(QStringLiteral("newsArticleId")).toInt();
        if (articleId != articleId_) {
            articleId_ = articleId;
            refreshArticle();
        }
    } else if (type == QStringLiteral("content-refresh")) {
        refreshContent();
    }
}

QUrl FrameClient::serverPath(const QString &path) const
{
    auto url = serverUrl_;
    url.setPath(path);
    return url;
}

QUrl FrameClient::contentUrl() const
{
    auto url = serverPath(QStringLiteral("/dashboard/content"));
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
    const auto reply = network_.get(QNetworkRequest(contentUrl()));
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

void FrameClient::refreshStations()
{
    const auto reply = network_.get(QNetworkRequest(serverPath(QStringLiteral("/radio/stations"))));
    connect(reply, &QNetworkReply::finished, this, [this, reply] {
        const auto guard = qScopeGuard([reply] { reply->deleteLater(); });
        if (reply->error() != QNetworkReply::NoError) return;
        QJsonParseError parseError;
        const auto next = QJsonDocument::fromJson(reply->readAll(), &parseError).object();
        if (parseError.error != QJsonParseError::NoError) return;
        stations_ = next.value(QStringLiteral("stations")).toArray().toVariantList();
        emit stationsChanged();
    });
}

void FrameClient::refreshArticle()
{
    if (articleId_ <= 0) {
        if (!article_.isEmpty()) {
            article_ = {};
            emit articleChanged();
        }
        return;
    }
    const auto requested = articleId_;
    const auto reply = network_.get(QNetworkRequest(serverPath(QStringLiteral("/ruv/news/%1").arg(requested))));
    connect(reply, &QNetworkReply::finished, this, [this, reply, requested] {
        const auto guard = qScopeGuard([reply] { reply->deleteLater(); });
        if (requested != articleId_) return;
        if (reply->error() != QNetworkReply::NoError) return;
        QJsonParseError parseError;
        const auto next = QJsonDocument::fromJson(reply->readAll(), &parseError).object();
        if (parseError.error != QJsonParseError::NoError) return;
        article_ = next.value(QStringLiteral("article")).toObject();
        emit articleChanged();
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
