package com.stonx.bot;

/**
 * Loads libnode.so (downloaded from the nodejs-mobile project by the CI
 * workflow) and libnodebridge.so (our tiny JNI bridge, compiled by the NDK
 * via CMake — see app/src/main/cpp/). Both are packaged by Gradle's own
 * native-library pipeline, so no manual permission/path workarounds are
 * needed the way they were with the hand-built Termux route.
 */
public final class NodeBridge {

    static {
        System.loadLibrary("node");
        System.loadLibrary("nodebridge");
    }

    private NodeBridge() {}

    public static native int startNodeWithArguments(String[] arguments);
}
