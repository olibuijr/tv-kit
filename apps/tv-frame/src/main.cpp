#include <QGuiApplication>
#include <QQmlApplicationEngine>
#include <QQmlContext>
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
    engine.rootContext()->setContextProperty(
        QStringLiteral("frameWallpaperUrl"),
        qEnvironmentVariable("TV_FRAME_WALLPAPER_URL"));
    engine.rootContext()->setContextProperty(
        QStringLiteral("frameWallpaperRotationMs"),
        wallpaperRotationOk ? wallpaperRotationMs : 0);
    engine.loadFromModule("Tv.Frame", "Main");
    if (engine.rootObjects().isEmpty()) return 1;
    return app.exec();
}
