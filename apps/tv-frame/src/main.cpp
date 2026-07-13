#include "frameclient.h"

#include <QGuiApplication>
#include <QQmlApplicationEngine>
#include <QQuickStyle>
#include <QQuickWindow>

int main(int argc, char *argv[])
{
    QQuickWindow::setGraphicsApi(QSGRendererInterface::OpenGL);
    QGuiApplication app(argc, argv);
    QQuickStyle::setStyle(QStringLiteral("Basic"));
    qmlRegisterType<FrameClient>("Tv.Frame", 1, 0, "FrameClient");
    QQmlApplicationEngine engine;
    engine.loadFromModule("Tv.Frame", "Main");
    if (engine.rootObjects().isEmpty()) return 1;
    return app.exec();
}
