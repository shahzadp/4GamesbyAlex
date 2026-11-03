# R8 / ProGuard rules for the release build.
#
# Obfuscation is only safe here because of the rules below. Without them the
# release build compiles cleanly and then fails at runtime, which is the worst
# possible failure mode: the app installs, the launcher looks fine, and the
# WebView bridge is simply dead.

# --- WebView JavaScript bridge -------------------------------------------
# GameWebViewActivity.AndroidBridge is reached from JavaScript as
# window.AndroidBridge. The WebView looks the class up by reflection at
# addJavascriptInterface time and then calls each @JavascriptInterface method by
# name. R8 renames both the class and its methods unless they are kept, and a
# renamed class fails the reflection lookup outright, so nothing on the bridge
# would be reachable.
#
# Android's own guidance is that @JavascriptInterface members are found via
# reflection; these keeps make that lookup deterministic.
-keepclassmembers class com.example.artgallery.GameWebViewActivity$AndroidBridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keep class com.example.artgallery.GameWebViewActivity$AndroidBridge { *; }

# The bridge is an inner class, so the outer class must survive too.
-keep class com.example.artgallery.GameWebViewActivity { *; }

# --- Horizon native client -------------------------------------------------
# The Rust library exports its entry points under fixed JNI names:
#   Java_dev_horizon_android_HorizonActivity_nativeDocumentResult
#   Java_dev_horizon_android_HorizonDocumentsProvider_nativeCall
#   Java_dev_horizon_android_HorizonDocumentsProvider_nativeOpen
# JNI resolves those by package + class + method name, so R8 must not rename the
# package, the classes or the native methods. A rename links cleanly and fails
# only at the moment a world is saved.
-keep class dev.horizon.android.** { *; }
-keepclasseswithmembernames,includedescriptorclasses class * {
    native <methods>;
}

# The platform instantiates the NativeActivity and the DocumentsProvider from
# the manifest by name.
-keep class * extends android.app.NativeActivity { *; }
-keep class * extends android.content.ContentProvider { *; }

# Safety net for any bridge added later: keeps the name the JavaScript side
# looks up, and every annotated member regardless of the owning class.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
-keepclasseswithmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# --- kotlinx.serialization -----------------------------------------------
# NavigationKeys.Main is a @Serializable NavKey. The plugin generates a
# companion .serializer() and looks it up by reflection, and it serializes by
# property name, so both the class and its members must keep their names.
-keepattributes *Annotation*, InnerClasses, Signature, RuntimeVisible*Annotations

-if @kotlinx.serialization.Serializable class **
-keepclassmembers class <1> {
    static <1>$Companion Companion;
}
-if @kotlinx.serialization.Serializable class ** {
    static **$* *;
}
-keepclassmembers class <2>$<3> {
    kotlinx.serialization.KSerializer serializer(...);
}
-keepclasseswithmembers class ** {
    kotlinx.serialization.KSerializer serializer(...);
}
-if @kotlinx.serialization.Serializable class ** {
    public static ** INSTANCE;
}
-keepclassmembers class <1> {
    public static <1> INSTANCE;
    kotlinx.serialization.KSerializer serializer(...);
}
-keep,includedescriptorclasses class com.example.artgallery.**$$serializer { *; }
-keepclassmembers class com.example.artgallery.** {
    *** Companion;
}
-keepclasseswithmembers class com.example.artgallery.** {
    kotlinx.serialization.KSerializer serializer(...);
}

# --- Kotlin coroutines ----------------------------------------------------
# Coroutine machinery is reflection-friendly in places and the Compose runtime
# relies on names for debugging. Obfuscating it has caused obscure crashes in
# the past, so the whole package is kept.
-keepnames class kotlinx.coroutines.** { *; }
-dontwarn kotlinx.coroutines.**

# --- Compose ---------------------------------------------------------------
# Compose is compiled with its own assumptions and ships consumer rules, but
# the runtime still resolves names for the tooling and debug metadata paths.
-keep class androidx.compose.runtime.** { *; }
-dontwarn androidx.compose.**

# --- Kotlin metadata -------------------------------------------------------
# Needed for reflection over Kotlin declarations and for readable stack traces.
-keepattributes RuntimeVisibleAnnotations,RuntimeVisibleParameterAnnotations,AnnotationDefault,EnclosingMethod,InnerClasses,Signature,SourceFile,LineNumberTable

# Keep the line numbers so release crash reports stay readable, but hide the
# original source file name.
-renamesourcefileattribute SourceFile

# --- Diagnostics -----------------------------------------------------------
# Never let R8 fail the release build over a warning it can safely ignore.
-dontwarn javax.annotation.**
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**
