cmake_minimum_required(VERSION 3.24)
project(tv_frame VERSION 0.1.0 LANGUAGES CXX)

include(CTest)

find_package(Qt6 6.8 REQUIRED COMPONENTS Core Gui Network Qml Quick QuickControls2 WebSockets Test)
find_package(MpvQt REQUIRED)
qt_standard_project_setup(REQUIRES 6.8)

qt_add_executable(tv-frame
    src/main.cpp
    src/frameclient.cpp
    src/frameclient.h
    src/mpvvideo.cpp
    src/mpvvideo.h
)

set_source_files_properties(qml/Theme.qml PROPERTIES QT_QML_SINGLETON_TYPE TRUE)

# NO_CACHEGEN: Titan's GCC 16 dev snapshot segfaults (internal compiler error)
# compiling some QML-AOT-generated C++ at -O2. QML is still bytecode-compiled
# and runs correctly via the runtime JIT; only the ahead-of-time C++ codegen
# step is skipped. Revert once a stable GCC is available.
qt_add_qml_module(tv-frame
    URI Tv.Frame
    VERSION 1.0
    NO_CACHEGEN
    QML_FILES
        qml/Main.qml
        qml/Theme.qml
        qml/PlayerHud.qml
        qml/OsdPanel.qml
        qml/LoadingOverlay.qml
        qml/HomeView.qml
        qml/TvView.qml
        qml/RadioView.qml
        qml/MediaView.qml
        qml/DeilduView.qml
        qml/NewsView.qml
)

target_link_libraries(tv-frame PRIVATE
    Qt6::Core Qt6::Gui Qt6::Network Qt6::Qml Qt6::Quick Qt6::QuickControls2 Qt6::WebSockets
    MpvQt::MpvQt
)
target_include_directories(tv-frame PRIVATE src)

if(BUILD_TESTING)
    qt_add_executable(tst_frameclient tests/tst_frameclient.cpp src/frameclient.cpp src/frameclient.h)
    target_link_libraries(tst_frameclient PRIVATE Qt6::Core Qt6::Network Qt6::Qml Qt6::Test Qt6::WebSockets)
    target_include_directories(tst_frameclient PRIVATE src)
    add_test(NAME frameclient COMMAND tst_frameclient)
endif()
