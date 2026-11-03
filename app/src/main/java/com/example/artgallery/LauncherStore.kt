package com.example.artgallery

import android.content.Context

/**
 * A tiny two-way bridge between the browser games and the Compose launcher.
 *
 * The games live in a WebView and keep their state in the WebView's own
 * leveldb, which the launcher must not reach into. So [GameWebViewActivity]
 * copies the one value the home screen cares about into plain app-private
 * preferences; [MainActivity] reads it when it comes back on screen.
 */
object LauncherStore {
  private const val PREFS = "launcher"
  private const val KEY_COMPANION_NAME = "companion_name"

  /**
   * Called from the WebView bridge on every sync. The name comes from a child's
   * keyboard, so all it gets is a trim and a length cap.
   */
  fun saveCompanionName(context: Context, name: String) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      .edit()
      .putString(KEY_COMPANION_NAME, name.trim().take(MAX_NAME_CHARS))
      .apply()
  }

  /** Empty string when the player has never named the companion. */
  fun readCompanionName(context: Context): String =
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      .getString(KEY_COMPANION_NAME, "")
      .orEmpty()
      .trim()

  private const val MAX_NAME_CHARS = 24
}
