package com.example.artgallery

import android.content.Context
import java.io.File

/**
 * The four games the launcher offers and how each one is hosted.
 *
 * Three of them are still the bundled web build: they load from
 * `assets/index.html` and are handed to [GameWebViewActivity]. The fourth,
 * Horizon, is a native Rust client that runs in its own process, so it is
 * started as a plain activity instead of being loaded into a WebView.
 */
enum class GameKind {
  /** Runs inside [GameWebViewActivity] from the bundled web build. */
  Web,

  /** Native Rust client, started as its own activity in the `:horizon` process. */
  NativeHorizon,
}

/**
 * @param id matches the web build's URL hash (`#flappy`, `#chess`, `#pet`) so the
 *   WebView can open straight onto the right page instead of the old launcher.
 * @param accent the card's accent colour, taken from the same palette as the
 *   web launcher's `--accent-*` variables.
 */
data class GameEntry(
  val id: String,
  val title: String,
  val tagline: String,
  val accent: Long,
  val kind: GameKind,
)

object GameCatalog {
  const val EXTRA_GAME_ID = "com.example.artgallery.extra.GAME_ID"

  val games: List<GameEntry> =
    listOf(
      GameEntry(
        id = "flappy",
        title = "Flappy Bird",
        tagline = "Tap to fly",
        accent = 0xFF38ADFF,
        kind = GameKind.Web,
      ),
      GameEntry(
        id = "chess",
        title = "Chess",
        tagline = "Make your move",
        accent = 0xFF6366F1,
        kind = GameKind.Web,
      ),
      GameEntry(
        id = "pet",
        title = "Virtual Pet",
        tagline = "Your little friend",
        accent = 0xFF10B981,
        kind = GameKind.Web,
      ),
      GameEntry(
        id = "horizon",
        title = "Horizon",
        tagline = "Build your world",
        accent = 0xFFEF4444,
        kind = GameKind.NativeHorizon,
      ),
    )

  fun byId(id: String?): GameEntry? = games.firstOrNull { it.id == id }
}

/**
 * Whether the Horizon payload is present in this build.
 *
 * `libhorizon_android.so` is not committed: `tools/fetch-horizon.ps1` stages it
 * from a verified Horizon release (or `tools/build-horizon.ps1` compiles it from
 * source). A checkout without that step still builds and runs; the card just
 * says the game is missing instead of starting an activity that would crash on
 * `System.loadLibrary`.
 *
 * The check reads `nativeLibraryDir` rather than calling `System.loadLibrary`,
 * because loading the library in the launcher process has side effects — it is
 * built to be loaded by the `:horizon` process only.
 */
object HorizonNative {
  private const val LIBRARY = "libhorizon_android.so"

  fun isAvailable(context: Context): Boolean {
    val directory = context.applicationInfo.nativeLibraryDir ?: return false
    return File(directory, LIBRARY).isFile
  }
}
