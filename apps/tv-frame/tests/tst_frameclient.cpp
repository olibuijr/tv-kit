#include <QtTest>
#include "frameclient.h"

class FrameClientTest final : public QObject {
    Q_OBJECT
private slots:
    void startsDisconnectedWithoutServer()
    {
        FrameClient client;
        QVERIFY(!client.connected());
        QCOMPARE(client.state().value("view").toString(), QString());
    }
};

QTEST_GUILESS_MAIN(FrameClientTest)
#include "tst_frameclient.moc"
