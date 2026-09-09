plugins {
    id("com.android.application")
}

android {
    namespace = "com.stonx.bot"
    compileSdk = 35
    ndkVersion = "25.2.9519653"

    defaultConfig {
        applicationId = "com.stonx.bot"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"

        externalNativeBuild {
            cmake {
                abiFilters += listOf("arm64-v8a")
            }
        }

        ndk {
            debugSymbolLevel = "NONE"
        }
    }

    externalNativeBuild {
        cmake {
            path = file("src/main/cpp/CMakeLists.txt")
            version = "3.22.1"
        }
    }

    sourceSets {
        getByName("main") {
            jniLibs.srcDirs("libnode/bin")
        }
    }

    signingConfigs {
        create("release") {
            storeFile = file("${System.getenv("HOME")}/stonx-release.keystore")
            storePassword = "stonxbot"
            keyAlias = "stonxbot"
            keyPassword = "stonxbot"
        }
    }

    buildTypes {
        getByName("release") {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("release")
        }
    }

    packaging {
        jniLibs {
            useLegacyPackaging = true
        }
    }
}

dependencies {}
