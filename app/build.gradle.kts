import java.util.Properties

plugins {
  alias(libs.plugins.android.application)
  alias(libs.plugins.compose.compiler)
  alias(libs.plugins.kotlin.serialization)
}

// Release signing credentials live in keystore.properties at the repo root,
// which is gitignored. The file is optional on purpose: a machine that only
// ever builds debug, or a CI checkout without secrets, must still configure
// successfully. Run tools/make-release-key.ps1 to generate both files.
//
// The type is imported rather than written as java.util.Properties because the
// "java" extension in scope in a Kotlin DSL script shadows the java package,
// which leaves the fully qualified name unresolved.
val keystoreProperties = Properties()
val keystorePropertiesFile = rootProject.file("keystore.properties")
if (keystorePropertiesFile.exists()) {
    keystorePropertiesFile.inputStream().use { input ->
        keystoreProperties.load(input)
    }
}
val hasReleaseSigning = keystoreProperties.getProperty("storeFile") != null &&
    keystoreProperties.getProperty("storePassword") != null &&
    keystoreProperties.getProperty("keyAlias") != null &&
    keystoreProperties.getProperty("keyPassword") != null

android {
    namespace = "com.example.artgallery"
    compileSdk = 36
    defaultConfig {
        applicationId = "com.example.artgallery"
        minSdk = 24
        targetSdk = 36
        // Bumped for every release build: an installer treats a package with
        // the same version code as "already installed" and refuses to replace
        // it, so the fix builds would never reach the device.
        versionCode = 9
        versionName = "1.4"
    }

    signingConfigs {
        if (hasReleaseSigning) {
            create("release") {
                // storeFile is relative to the repo root, so resolve it there
                // rather than against the app module.
                storeFile = rootProject.file(keystoreProperties.getProperty("storeFile"))
                storePassword = keystoreProperties.getProperty("storePassword")
                keyAlias = keystoreProperties.getProperty("keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            // Without a signing config Gradle emits app-release-unsigned.apk,
            // and Android refuses to install an unsigned APK at all. The build
            // still succeeds, so the failure only shows up on the phone, which
            // makes it easy to misattribute to the code. Attach the signing
            // config whenever the credentials are present.
            if (hasReleaseSigning) {
                signingConfig = signingConfigs.getByName("release")
            }

            // R8 shrinking and obfuscation. Both are required for the release
            // build to actually obfuscate: isMinifyEnabled is what runs R8 at
            // all, and isShrinkResources removes the unused assets that would
            // otherwise ship in the APK.
            //
            // The obfuscation is only safe because proguard-rules.pro keeps the
            // WebView bridge and the serialization surface, both of which are
            // reached by reflection. See that file before changing anything
            // about the bridge.
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            // Keep a mapping file so release stack traces can still be read.
            // It is written into the build directory and is gitignored.
            isDebuggable = false
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    buildFeatures {
      compose = true
      aidl = false
      buildConfig = false
      shaders = false
    }

    packaging {
      resources {
        excludes += "/META-INF/{AL2.0,LGPL2.1}"
      }
    }
}

kotlin {
    jvmToolchain(17)
}

dependencies {
  val composeBom = platform(libs.androidx.compose.bom)
  implementation(composeBom)
  androidTestImplementation(composeBom)

  // Core Android dependencies
  implementation(libs.androidx.core.ktx)
  implementation(libs.androidx.lifecycle.runtime.ktx)
  implementation(libs.androidx.activity.compose)
    // Serves the web assets over an https origin so the Stockfish Web Worker
    // can be constructed. See the asset loader setup in MainActivity.
    implementation(libs.androidx.webkit)

  // Compose
  implementation(libs.androidx.compose.ui)
  implementation(libs.androidx.compose.ui.tooling.preview)
  implementation(libs.androidx.compose.material3)
  // Tooling
  debugImplementation(libs.androidx.compose.ui.tooling)
  // Instrumented tests
  androidTestImplementation(libs.androidx.compose.ui.test.junit4)
  debugImplementation(libs.androidx.compose.ui.test.manifest)

  // Local tests: jUnit, coroutines, Android runner
  testImplementation(libs.junit)
  testImplementation(libs.kotlinx.coroutines.test)

  // Instrumented tests: jUnit rules and runners
  androidTestImplementation(libs.androidx.test.core)
  androidTestImplementation(libs.androidx.test.ext.junit)
  androidTestImplementation(libs.androidx.test.runner)
  androidTestImplementation(libs.androidx.test.espresso.core)

  // Navigation
  implementation(libs.androidx.navigation3.ui)
  implementation(libs.androidx.navigation3.runtime)
  implementation(libs.androidx.lifecycle.viewmodel.navigation3)
}
