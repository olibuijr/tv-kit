cmake_minimum_required(VERSION 3.24)
project(tv_frame VERSION 0.1.0 LANGUAGES CXX)

include(CTest)

find_package(Qt6 6.8 REQUIRED COMPONENTS Core Gui Network Qml Quick QuickControls2 WebSockets Test)
qt_standard_project_setup(REQUIRES 6.8)

qt_add_executable(tv-frame
    src/main.cpp
    src/frameclient.cpp
    src/frameclient.h
)

qt_add_qml_module(tv-frame
    URI Tv.Frame
    VERSION 1.0
    QML_FILES qml/Main.qml
)

target_link_libraries(tv-frame PRIVATE
    Qt6::Core Qt6::Gui Qt6::Network Qt6::Qml Qt6::Quick Qt6::QuickControls2 Qt6::WebSockets
)
target_include_directories(tv-frame PRIVATE src)

if(BUILD_TESTING)
    qt_add_executable(tst_frameclient tests/tst_frameclient.cpp src/frameclient.cpp src/frameclient.h)
    target_link_libraries(tst_frameclient PRIVATE Qt6::Core Qt6::Network Qt6::Test Qt6::WebSockets)
    target_include_directories(tst_frameclient PRIVATE src)
    add_test(NAME frameclient COMMAND tst_frameclient)
endif()
