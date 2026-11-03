package dev.horizon.android;

/**
 * Horizon's Android entry point, vendored unchanged from the Horizon Android
 * project (MIT, Copyright (c) 2026 Ludovic Marie and the Horizon contributors).
 *
 * <p><b>Do not move or rename this class.</b> The Rust library exports its SAF
 * callback as {@code Java_dev_horizon_android_HorizonActivity_nativeDocumentResult},
 * so the package, class and method name are part of the binary ABI. Renaming any
 * of them links cleanly and fails only when the user saves a world.
 *
 * <p>The class stays in Horizon's package on purpose: the app id changes, the JNI
 * name does not. The activity runs in the {@code :horizon} process (see
 * AndroidManifest.xml) because Horizon ends its event loop with
 * {@code std::process::exit(0)}; isolating it keeps that from killing the
 * launcher process.
 */
public final class HorizonActivity extends android.app.NativeActivity {
    static { System.loadLibrary("horizon_android"); }
    private native void nativeDocumentResult(int request, int result, String uri);

    @Override protected void onActivityResult(int request, int result, android.content.Intent data) {
        super.onActivityResult(request, result, data);
        if (request != 4101) return;
        nativeDocumentResult(request, result,
                data == null || data.getData() == null ? null : data.getData().toString());
    }
}
