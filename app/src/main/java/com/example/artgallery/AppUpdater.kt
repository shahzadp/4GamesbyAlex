package com.example.artgallery

import android.app.AlertDialog
import android.app.ProgressDialog
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.widget.Toast
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.atomic.AtomicBoolean

/**
 * In-app updater for this app's own GitHub releases.
 *
 * Starling's built-in updater is compiled into its prebuilt engine and points at
 * Starling's releases, which belong to a different package and signing key. This
 * one checks [RELEASES_API] instead, downloads the APK asset from the newest
 * release, verifies GitHub's SHA-256 digest and hands it to Android's installer
 * through Starling's UpdateProvider (files/updates/), using the same permission
 * the in-game updater uses.
 *
 * The check is silent: no network means no nag. "Later" remembers that tag so
 * the same release is not offered again.
 */
object AppUpdater {
  private const val RELEASES_API =
    "https://api.github.com/repos/shahzadp/4GamesbyAlex/releases/latest"
  private const val RELEASES_PAGE = "https://github.com/shahzadp/4GamesbyAlex/releases"
  private const val PREFS = "app_updater"
  private const val KEY_DISMISSED = "dismissed_tag"

  private val main = Handler(Looper.getMainLooper())
  private var checkedThisRun = false

  private data class Version(val major: Int, val minor: Int, val patch: Int) : Comparable<Version> {
    override fun compareTo(other: Version): Int =
      compareValuesBy(this, other, { it.major }, { it.minor }, { it.patch })

    companion object {
      fun parse(text: String): Version? {
        val match = Regex("""v?(\d+)\.(\d+)(?:\.(\d+))?""").find(text) ?: return null
        return Version(
          match.groupValues[1].toInt(),
          match.groupValues[2].toInt(),
          match.groupValues[3].ifEmpty { "0" }.toInt(),
        )
      }
    }
  }

  private data class Release(
    val tag: String,
    val version: Version,
    val name: String,
    val downloadUrl: String,
    val sha256: String?,
  )

  /** Call once from the launcher. Everything after this is off the UI thread. */
  fun check(context: Context) {
    if (checkedThisRun) return
    checkedThisRun = true
    val app = context.applicationContext
    val current = Version.parse(currentVersion(app)) ?: return
    Thread(
      {
        try {
          val release = fetchLatest() ?: return@Thread
          if (release.version <= current) return@Thread
          val prefs = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
          if (prefs.getString(KEY_DISMISSED, null) == release.tag) return@Thread
          main.post { ask(app, release) }
        } catch (_: Exception) {
          // Offline, rate-limited or a malformed response: never bother the player.
        }
      },
      "app-update-check",
    ).start()
  }

  private fun currentVersion(context: Context): String =
    try {
      context.packageManager.getPackageInfo(context.packageName, 0).versionName ?: ""
    } catch (_: Exception) {
      ""
    }

  private fun fetchLatest(): Release? {
    val json = JSONObject(get(RELEASES_API))
    val tag = json.optString("tag_name", "")
    val version = Version.parse(tag) ?: return null
    val assets = json.optJSONArray("assets") ?: return null
    for (i in 0 until assets.length()) {
      val asset = assets.getJSONObject(i)
      val name = asset.optString("name", "")
      val url = asset.optString("browser_download_url", "")
      if (!name.endsWith(".apk", ignoreCase = true) || !url.startsWith("https://")) continue
      val digest = asset.optString("digest", "").removePrefix("sha256:")
      return Release(tag, version, name, url, digest.ifEmpty { null })
    }
    return null
  }

  private fun get(url: String): String {
    val connection = URL(url).openConnection() as HttpURLConnection
    connection.requestMethod = "GET"
    connection.setRequestProperty("User-Agent", "4GamesbyAlex-Updater")
    connection.setRequestProperty("Accept", "application/vnd.github+json")
    connection.connectTimeout = 15_000
    connection.readTimeout = 20_000
    try {
      check(connection.responseCode == HttpURLConnection.HTTP_OK) {
        "HTTP ${connection.responseCode}"
      }
      return connection.inputStream.bufferedReader().use { it.readText() }
    } finally {
      connection.disconnect()
    }
  }

  private fun ask(context: Context, release: Release) {
    AlertDialog.Builder(context)
      .setTitle("Update available")
      .setMessage("4 Games by Alex ${release.tag.removePrefix("v")} is available. Download and install it?")
      .setPositiveButton("Update") { _, _ -> downloadAndInstall(context, release) }
      .setNeutralButton("Release page") { _, _ ->
        val page = Intent(Intent.ACTION_VIEW, Uri.parse("$RELEASES_PAGE/tag/${release.tag}"))
        page.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try {
          context.startActivity(page)
        } catch (_: Exception) {
          // No browser.
        }
      }
      .setNegativeButton("Later") { _, _ ->
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
          .putString(KEY_DISMISSED, release.tag).apply()
      }
      .show()
  }

  private fun downloadAndInstall(context: Context, release: Release) {
    val progress = ProgressDialog(context).apply {
      setTitle("Downloading ${release.tag}")
      setMessage("Getting the update…")
      setProgressStyle(ProgressDialog.STYLE_HORIZONTAL)
      max = 100
      setCancelable(true)
      show()
    }
    val cancelled = AtomicBoolean(false)
    progress.setOnCancelListener { cancelled.set(true) }

    Thread(
      {
        try {
          val dir = File(context.filesDir, "updates").apply { mkdirs() }
          val part = File(dir, "${release.name}.part")
          val digest = MessageDigest.getInstance("SHA-256")
          val connection = URL(release.downloadUrl).openConnection() as HttpURLConnection
          connection.setRequestProperty("User-Agent", "4GamesbyAlex-Updater")
          connection.connectTimeout = 15_000
          connection.readTimeout = 30_000
          try {
            check(connection.responseCode == HttpURLConnection.HTTP_OK) {
              "HTTP ${connection.responseCode}"
            }
            val total = connection.contentLength
            val buffer = ByteArray(64 * 1024)
            var done = 0L
            connection.inputStream.use { input ->
              FileOutputStream(part).use { out ->
                while (true) {
                  if (cancelled.get()) throw InterruptedException()
                  val read = input.read(buffer)
                  if (read < 0) break
                  out.write(buffer, 0, read)
                  digest.update(buffer, 0, read)
                  done += read
                  if (total > 0) {
                    val percent = (done * 100 / total).toInt().coerceIn(0, 100)
                    main.post { progress.progress = percent }
                  }
                }
              }
            }
          } finally {
            connection.disconnect()
          }
          if (release.sha256 != null) {
            val got = digest.digest().joinToString("") { "%02x".format(it) }
            check(got.equals(release.sha256, ignoreCase = true)) { "Checksum mismatch" }
          }
          val downloaded = File(dir, release.name)
          check(part.renameTo(downloaded)) { "Could not finish the download" }
          main.post {
            progress.dismiss()
            install(context, release.name)
          }
        } catch (e: Exception) {
          main.post {
            progress.dismiss()
            if (e !is InterruptedException) {
              Toast.makeText(context, "Update failed: ${e.message}", Toast.LENGTH_LONG).show()
            }
          }
        }
      },
      "app-update-download",
    ).start()
  }

  private fun install(context: Context, name: String) {
    // Starling's provider already serves files/updates/*.apk to the installer.
    val uri = Uri.parse("content://${context.packageName}.updates/${Uri.encode(name)}")
    val intent = Intent(Intent.ACTION_VIEW).apply {
      setDataAndType(uri, "application/vnd.android.package-archive")
      addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    try {
      context.startActivity(intent)
    } catch (e: Exception) {
      Toast.makeText(context, "No installer available: ${e.message}", Toast.LENGTH_LONG).show()
    }
  }
}
