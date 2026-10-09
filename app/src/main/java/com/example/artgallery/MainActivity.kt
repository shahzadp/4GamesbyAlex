package com.example.artgallery

import android.Manifest
import android.app.Activity
import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.ClipboardManager
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.MediaStore
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.speech.RecognizerIntent
import android.speech.tts.TextToSpeech
import android.util.Base64
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewClientCompat
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.KeyStore
import java.util.Locale
import java.util.concurrent.Executors
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class MainActivity : ComponentActivity() {

    private lateinit var webView: WebView
    private lateinit var insetsController: WindowInsetsControllerCompat
    private val petApiExecutor = Executors.newSingleThreadExecutor()
    private var textToSpeech: TextToSpeech? = null
    private val petSpeechLauncher = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val spokenText = if (result.resultCode == Activity.RESULT_OK) {
            result.data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)?.firstOrNull().orEmpty()
        } else {
            ""
        }
        deliverPetSpeechResult(spokenText)
    }
    private val petMicPermissionLauncher = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) launchPetSpeechRecognition() else deliverPetSpeechResult("")
    }

    /** JavaScript bridge — exposes Android fullscreen control to the WebView */
    inner class AndroidBridge {
        @JavascriptInterface
        fun enterFullscreen() {
            runOnUiThread {
                insetsController.hide(WindowInsetsCompat.Type.systemBars())
                insetsController.systemBarsBehavior =
                    WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
        }

        @JavascriptInterface
        fun exitFullscreen() {
            runOnUiThread {
                insetsController.show(WindowInsetsCompat.Type.systemBars())
            }
        }

        @JavascriptInterface
        fun speak(text: String) {
            runOnUiThread {
                textToSpeech?.speak(text.take(1200), TextToSpeech.QUEUE_FLUSH, null, "virtual-pet")
            }
        }

        @JavascriptInterface
        fun listenForPet() {
            runOnUiThread {
                if (ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                    launchPetSpeechRecognition()
                } else {
                    petMicPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
                }
            }
        }

        @JavascriptInterface
        fun savePetApiKey(apiKey: String): Boolean = saveEncryptedPetApiKey(apiKey)

        @JavascriptInterface
        fun hasPetApiKey(): Boolean = loadEncryptedPetApiKey() != null

        @JavascriptInterface
        fun removePetApiKey(): Boolean = getSharedPreferences(PET_KEY_PREFERENCES, MODE_PRIVATE)
            .edit()
            .clear()
            .commit()

        /* --- PGN export (2x Stockfish match) --------------------------
         *
         * A WebView has no filesystem, and an <a download> against a blob URL
         * silently does nothing here: there is no DownloadListener on this
         * WebView and nothing would handle the download intent. Writing the
         * file has to happen natively, which is what these two calls are for.
         *
         * @JavascriptInterface methods are invoked on the WebView's private
         * JavaBridge thread, not the main thread, so the blocking file IO here
         * does not stall rendering. Nothing in these methods touches the UI.
         */

        /**
         * Writes a PGN to the device's Downloads folder.
         *
         * Returns a human readable location on success and an empty string on
         * failure, so the page can report the outcome in one call without a
         * second round trip.
         */
        @JavascriptInterface
        fun savePgn(fileName: String, content: String): String {
            if (content.isEmpty() || content.length > MAX_PGN_CHARS) return ""
            val safeName = sanitizePgnFileName(fileName)
            return runCatching { writePgn(safeName, content) }.getOrDefault("")
        }

        /** Copies text to the system clipboard. Returns false if it could not. */
        @JavascriptInterface
        fun copyToClipboard(text: String): Boolean {
            if (text.isEmpty() || text.length > MAX_PGN_CHARS) return false
            return runCatching {
                val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                clipboard.setPrimaryClip(ClipData.newPlainText("PGN", text))
                true
            }.getOrDefault(false)
        }

        @JavascriptInterface
        fun askPet(requestId: String, model: String, messagesJson: String) {
            val apiKey = loadEncryptedPetApiKey()
            if (apiKey.isNullOrBlank() || model.isBlank() || messagesJson.length > 20000) {
                deliverPetReply(requestId, "Check the saved API key and model, then try again.", true)
                return
            }

            petApiExecutor.execute {
                var connection: HttpURLConnection? = null
                try {
                    val requestBody = JSONObject()
                        .put("model", model)
                        .put("messages", JSONArray(messagesJson))
                        .put("max_tokens", 180)

                    connection = URL("https://openrouter.ai/api/v1/chat/completions").openConnection() as HttpURLConnection
                    connection.requestMethod = "POST"
                    connection.connectTimeout = 15000
                    connection.readTimeout = 60000
                    connection.doOutput = true
                    connection.setRequestProperty("Authorization", "Bearer $apiKey")
                    connection.setRequestProperty("Content-Type", "application/json")
                    connection.outputStream.use { output ->
                        output.write(requestBody.toString().toByteArray(Charsets.UTF_8))
                    }

                    val responseCode = connection.responseCode
                    val responseStream = if (responseCode in 200..299) connection.inputStream else connection.errorStream
                    val responseBody = responseStream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()
                    if (responseCode !in 200..299) {
                        val apiMessage = runCatching {
                            JSONObject(responseBody).optJSONObject("error")?.optString("message")
                        }.getOrNull()?.takeIf { it.isNotBlank() }
                        deliverPetReply(requestId, apiMessage?.take(240) ?: "OpenRouter returned HTTP $responseCode.", true)
                        return@execute
                    }

                    val reply = JSONObject(responseBody)
                        .optJSONArray("choices")
                        ?.optJSONObject(0)
                        ?.optJSONObject("message")
                        ?.optString("content")
                        ?.trim()
                        .orEmpty()
                    deliverPetReply(requestId, reply.ifBlank { "I am here with you. What else would you like to know?" }, false)
                } catch (_: Exception) {
                    deliverPetReply(requestId, "Could not reach OpenRouter. Check your connection, key, and model.", true)
                } finally {
                    connection?.disconnect()
                }
            }
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Edge-to-edge dark theme
        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.statusBarColor = Color.TRANSPARENT
        window.navigationBarColor = Color.TRANSPARENT

        insetsController = WindowCompat.getInsetsController(window, window.decorView)
        insetsController.isAppearanceLightStatusBars = false
        textToSpeech = TextToSpeech(this) { result ->
            if (result == TextToSpeech.SUCCESS) {
                textToSpeech?.language = Locale.forLanguageTag("ur-PK")
            }
        }

        webView = WebView(this).apply {
            setBackgroundColor(Color.parseColor("#0a0c13"))
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                allowFileAccess = true
                allowContentAccess = true
                cacheMode = WebSettings.LOAD_DEFAULT
                useWideViewPort = true
                loadWithOverviewMode = true
                mediaPlaybackRequiresUserGesture = false
            }
            // Attach the native fullscreen bridge
            addJavascriptInterface(AndroidBridge(), "AndroidBridge")

            // Serve the assets over a real https origin rather than file://.
            //
            // This is not cosmetic. A file:// page has an opaque "null" origin,
            // and the WebView refuses to construct a Worker whose script is
            // not same-origin with the page:
            //
            //   Failed to construct 'Worker': Script at
            //   'file:///android_asset/engine/...' cannot be accessed from
            //   origin 'null'.
            //
            // Stockfish runs inside a Worker, so on file:// the bot could never
            // load at all. appassets.androidplatform.net is the reserved domain
            // Google documents for exactly this: it is intercepted locally by
            // the asset loader and never touches the network.
            //
            // The path handler and the load URL must agree. A mismatch here is
            // silent and catastrophic: the handler returns null, the WebView
            // falls through to a real DNS lookup, and the app dies with
            // ERR_NAME_NOT_RESOLVED before any of it renders.
            val assetLoader = WebViewAssetLoader.Builder()
                .addPathHandler(ASSET_PATH, WebViewAssetLoader.AssetsPathHandler(this@MainActivity))
                .build()

            webViewClient = object : WebViewClientCompat() {
                override fun shouldInterceptRequest(
                    view: WebView,
                    request: WebResourceRequest
                ): WebResourceResponse? {
                    val url = request.url
                    // Only ever claim our own asset host. Anything else,
                    // including a genuine network request, passes through.
                    if (url.host != ASSET_HOST) return null

                    val response = assetLoader.shouldInterceptRequest(request.url)
                    if (response != null) return response

                    // A miss means the URL and the registered path handler
                    // disagree, or the asset is genuinely absent. Serving the
                    // raw file keeps the app usable instead of returning
                    // null and letting the request reach the network as a DNS
                    // failure.
                    val relative = url.path?.removePrefix(ASSET_PATH)
                    if (!relative.isNullOrEmpty()) {
                        try {
                            val stream = assets.open(relative)
                            val mime = when {
                                relative.endsWith(".html") -> "text/html"
                                relative.endsWith(".js") -> "text/javascript"
                                relative.endsWith(".css") -> "text/css"
                                relative.endsWith(".wasm") -> "application/wasm"
                                relative.endsWith(".svg") -> "image/svg+xml"
                                relative.endsWith(".png") -> "image/png"
                                relative.endsWith(".jpg") -> "image/jpeg"
                                else -> "application/octet-stream"
                            }
                            return WebResourceResponse(mime, "utf-8", stream)
                        } catch (e: java.io.IOException) {
                            // Fall through to the error page below.
                        }
                    }

                    // Nothing could serve this: show a real message rather than
                    // a blank screen or a DNS error.
                    return WebResourceResponse(
                        "text/html", "utf-8", 404, "Not Found",
                        mapOf("Cache-Control" to "no-store"),
                        java.io.ByteArrayInputStream(
                            ("<h1>Asset not found</h1><p>" +
                                (url.toString()) + "</p>").toByteArray()
                        )
                    )
                }

                // onReceivedError is final in WebViewClientCompat, so the
                // network-level fallback cannot live here. It is not needed:
                // shouldInterceptRequest above already serves every asset
                // request itself and returns a real 404 page for anything it
                // cannot find, so a request never escapes to DNS.
            }
            webChromeClient = WebChromeClient()

            loadUrl("$ASSET_ORIGIN$ASSET_PATH/index.html")
        }

        setContentView(webView)

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                // If in fullscreen, exit it first
                webView.evaluateJavascript("typeof _androidFsActive !== 'undefined' && _androidFsActive") { fsResult ->
                    if (fsResult == "true") {
                        webView.evaluateJavascript("exitAndroidFullscreen();", null)
                        return@evaluateJavascript
                    }
                    webView.evaluateJavascript("typeof state !== 'undefined' && state.currentPage !== 'main'") { result ->
                        if (result == "true") {
                            webView.evaluateJavascript("switchPage('main');", null)
                        } else if (webView.canGoBack()) {
                            webView.goBack()
                        } else {
                            isEnabled = false
                            onBackPressedDispatcher.onBackPressed()
                        }
                    }
                }
            }
        })
    }

    /**
     * Strips anything that could escape the Downloads folder or that a file
     * system would reject, and guarantees the .pgn extension. The name comes
     * from JavaScript, so it is untrusted input.
     */
    private fun sanitizePgnFileName(raw: String): String {
        val cleaned = raw
            .replace(Regex("[\\\\/:*?\"<>|\\p{Cntrl}]"), "_")
            .trim()
            .take(120)
            .ifBlank { "chess-game" }
        return if (cleaned.endsWith(".pgn", ignoreCase = true)) cleaned else "$cleaned.pgn"
    }

    /**
     * Two paths, because there is one on modern Android and a different one
     * below it.
     *
     * API 29+ writes through MediaStore into the shared Downloads collection,
     * which needs no runtime permission at all - scoped storage made that
     * write legal without asking. The two-step IS_PENDING dance is what stops
     * a half-written file from ever appearing in the user's Downloads view.
     *
     * Below API 29 there is no MediaStore Downloads collection to write to,
     * and asking for WRITE_EXTERNAL_STORAGE just to save a game would put a
     * scary permission prompt in front of a child for no good reason, so the
     * file goes to the app's own external Downloads directory. That is
     * writable with no permission on every version, and the returned path
     * tells the page exactly where it went.
     */
    private fun writePgn(fileName: String, content: String): String {
        val bytes = content.toByteArray(Charsets.UTF_8)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val values = ContentValues().apply {
                put(MediaStore.Downloads.DISPLAY_NAME, fileName)
                put(MediaStore.Downloads.MIME_TYPE, PGN_MIME_TYPE)
                put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
                put(MediaStore.Downloads.IS_PENDING, 1)
            }
            val uri = contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                ?: return ""
            try {
                contentResolver.openOutputStream(uri)?.use { it.write(bytes) } ?: return ""
            } finally {
                // Always clear IS_PENDING, including when the write throws.
                // A row left pending is invisible in the user's Downloads view
                // but is still a row in MediaStore, and a run of failed saves
                // would quietly fill the table with them.
                values.clear()
                values.put(MediaStore.Downloads.IS_PENDING, 0)
                contentResolver.update(uri, values, null, null)
            }
            return Environment.DIRECTORY_DOWNLOADS
        }

        val dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS) ?: filesDir
        if (!dir.exists() && !dir.mkdirs()) return ""
        val file = File(dir, fileName)
        file.writeBytes(bytes)
        return file.absolutePath
    }

    private fun deliverPetSpeechResult(text: String) {
        runOnUiThread {
            if (!::webView.isInitialized || isDestroyed) return@runOnUiThread
            webView.evaluateJavascript("window.onPetSpeechResult(${JSONObject.quote(text)});", null)
        }
    }

    private fun launchPetSpeechRecognition() {
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.forLanguageTag("ur-PK").toLanguageTag())
            putExtra(RecognizerIntent.EXTRA_PROMPT, "اپنے پالتو دوست سے اردو میں بات کریں")
        }
        try {
            petSpeechLauncher.launch(intent)
        } catch (_: ActivityNotFoundException) {
            deliverPetSpeechResult("")
        }
    }

    private fun saveEncryptedPetApiKey(apiKey: String): Boolean {
        if (apiKey.isBlank() || apiKey.length > 512) return false
        return runCatching {
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.ENCRYPT_MODE, getOrCreatePetEncryptionKey())
            val encrypted = cipher.doFinal(apiKey.toByteArray(Charsets.UTF_8))
            getSharedPreferences(PET_KEY_PREFERENCES, MODE_PRIVATE).edit()
                .putString(PET_KEY_IV, Base64.encodeToString(cipher.iv, Base64.NO_WRAP))
                .putString(PET_KEY_VALUE, Base64.encodeToString(encrypted, Base64.NO_WRAP))
                .commit()
        }.getOrDefault(false)
    }

    private fun loadEncryptedPetApiKey(): String? = runCatching {
        val preferences = getSharedPreferences(PET_KEY_PREFERENCES, MODE_PRIVATE)
        val iv = preferences.getString(PET_KEY_IV, null) ?: return null
        val encrypted = preferences.getString(PET_KEY_VALUE, null) ?: return null
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(
            Cipher.DECRYPT_MODE,
            getOrCreatePetEncryptionKey(),
            GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP))
        )
        String(cipher.doFinal(Base64.decode(encrypted, Base64.NO_WRAP)), Charsets.UTF_8)
    }.getOrNull()

    private fun getOrCreatePetEncryptionKey(): SecretKey {
        val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (keyStore.getKey(PET_KEY_ALIAS, null) as? SecretKey)?.let { return it }

        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        generator.init(
            KeyGenParameterSpec.Builder(
                PET_KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .build()
        )
        return generator.generateKey()
    }

    private fun deliverPetReply(requestId: String, text: String, isError: Boolean) {
        runOnUiThread {
            if (!::webView.isInitialized || isDestroyed) return@runOnUiThread
            val errorLiteral = if (isError) "true" else "false"
            webView.evaluateJavascript(
                "window.onPetReply(${JSONObject.quote(requestId)}, ${JSONObject.quote(text)}, $errorLiteral);",
                null
            )
        }
    }

    override fun onDestroy() {
        petApiExecutor.shutdownNow()
        textToSpeech?.stop()
        textToSpeech?.shutdown()
        if (::webView.isInitialized) {
            webView.destroy()
        }
        super.onDestroy()
    }

    private companion object {
        // Reserved domain Google documents for locally served app assets. The
        // asset loader intercepts it entirely, so nothing leaves the device,
        // but it gives the page a genuine https origin instead of file://'s
        // opaque null origin - which is what allows the Stockfish Worker.
        const val ASSET_HOST = "appassets.androidplatform.net"
        const val ASSET_ORIGIN = "https://$ASSET_HOST"
        // The handler path and the load URL must use this same prefix. If they
        // disagree the loader returns null, the request escapes to the real
        // network, and the app fails to load at all.
        const val ASSET_PATH = "/assets/"

        const val PET_KEY_ALIAS = "virtual_pet_openrouter_key"
        const val PET_KEY_PREFERENCES = "pet_secure_store"
        const val PET_KEY_IV = "openrouter_key_iv"
        const val PET_KEY_VALUE = "openrouter_key_encrypted"

        // The registered MIME type for PGN. Chess sites and desktop GUIs use
        // this to offer "open with", which is why it is set rather than
        // falling back to application/octet-stream.
        const val PGN_MIME_TYPE = "application/x-chess-pgn"
        // A guard rail on data crossing the bridge. A PGN is kilobytes; a
        // megabyte means something is wrong upstream, not that the game
        // genuinely produced that much.
        const val MAX_PGN_CHARS = 1_000_000
    }
}
