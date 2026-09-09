cmake_minimum_required(VERSION 3.22.1)
project(stonxnodebridge)

set(LIBNODE_DIR ${CMAKE_SOURCE_DIR}/../../../libnode)

include_directories(${LIBNODE_DIR}/include/node)

add_library(node SHARED IMPORTED)
set_target_properties(node PROPERTIES IMPORTED_LOCATION
    ${LIBNODE_DIR}/bin/${ANDROID_ABI}/libnode.so)

add_library(nodebridge SHARED nodebridge.cpp)

find_library(log-lib log)

target_link_libraries(nodebridge node ${log-lib})
