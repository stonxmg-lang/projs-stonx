#include <jni.h>
#include <string>
#include <vector>
#include "node.h"

extern "C" JNIEXPORT jint JNICALL
Java_com_stonx_bot_NodeBridge_startNodeWithArguments(
        JNIEnv *env, jobject /* this */, jobjectArray arguments) {

    int argc = env->GetArrayLength(arguments);

    std::vector<std::string> argStorage;
    std::vector<char *> argv;
    argStorage.reserve(argc);
    argv.reserve(argc + 1);

    for (int i = 0; i < argc; i++) {
        auto jarg = (jstring) env->GetObjectArrayElement(arguments, i);
        const char *raw = env->GetStringUTFChars(jarg, nullptr);
        argStorage.emplace_back(raw);
        env->ReleaseStringUTFChars(jarg, raw);
        env->DeleteLocalRef(jarg);
    }
    for (auto &s : argStorage) argv.push_back(const_cast<char *>(s.c_str()));
    argv.push_back(nullptr);

    return node::Start(argc, argv.data());
}
