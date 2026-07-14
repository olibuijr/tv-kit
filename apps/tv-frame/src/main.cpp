#include <QGuiApplication>
#include <QQmlApplicationEngine>
#include <QQmlContext>
#include <QRandomGenerator>
#include <QQuickStyle>
#include <QQuickWindow>

int main(int argc, char *argv[])
{
    QQuickWindow::setGraphicsApi(QSGRendererInterface::OpenGL);
    QGuiApplication app(argc, argv);
    QQuickStyle::setStyle(QStringLiteral("Basic"));
    QQmlApplicationEngine engine;
    bool wallpaperRotationOk = false;
    const int wallpaperRotationMs =
        qEnvironmentVariableIntValue("TV_FRAME_WALLPAPER_ROTATION_MS", &wallpaperRotationOk);
    const QStringList wallpaperUrls =
        qEnvironmentVariable("TV_FRAME_WALLPAPER_URLS").split(',', Qt::SkipEmptyParts);
    engine.rootContext()->setContextProperty(
        QStringLiteral("frameWallpaperUrls"),
        wallpaperUrls);
    engine.rootContext()->setContextProperty(
        QStringLiteral("frameWallpaperStartIndex"),
        wallpaperUrls.isEmpty() ? 0 : QRandomGenerator::global()->bounded(wallpaperUrls.size()));
    engine.rootContext()->setContextProperty(
        QStringLiteral("frameWallpaperRotationMs"),
        wallpaperRotationOk ? wallpaperRotationMs : 0);
    engine.loadFromModule("Tv.Frame", "Main");
    if (engine.rootObjects().isEmpty()) return 1;
    return app.exec();
}
