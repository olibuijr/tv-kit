#include "frameclient.h"

#include <QGuiApplication>
#include <QQmlApplicationEngine>
#include <QQuickStyle>
#include <QQuickWindow>
#include <QSurfaceFormat>

int main(int argc, char *argv[])
{
    QQuickWindow::setGraphicsApi(QSGRendererInterface::OpenGL);
    // Transparent alpha channel: the shell renders an opaque background for
    // menu views, but drops to transparent while fullscreen video plays so
    // mpv (kept below by a KWin "keep above" rule on this window) shows
    // through everywhere except the HUD/OSD panel drawn on top of it.
    auto format = QSurfaceFormat::defaultFormat();
    format.setAlphaBufferSize(8);
    QSurfaceFormat::setDefaultFormat(format);
    QGuiApplication app(argc, argv);
    app.setDesktopFileName(QStringLiteral("tv-frame"));
    QQuickStyle::setStyle(QStringLiteral("Basic"));
    qmlRegisterType<FrameClient>("Tv.Frame", 1, 0, "FrameClient");
    QQmlApplicationEngine engine;
    engine.loadFromModule("Tv.Frame", "Main");
    if (engine.rootObjects().isEmpty()) return 1;
    return app.exec();
}
