package com.example.artgallery

/**
 * The four games the launcher offers and how each one is hosted.
 *
 * Three of them are the bundled web build: they load from `assets/index.html`
 * and are handed to [GameWebViewActivity]. The fourth is the forked Starling
 * client: its engine and Java bridge ship inside this APK and run in their own
 * process, started from the fourth card.
 */
enum class GameKind {
  /** Runs inside [GameWebViewActivity] from the bundled web build. */
  Web,

  /** Starts the forked Starling client in its own process. */
  NativeStarling,
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
        id = "starling",
        title = "Starling",
        tagline = "Tap to play",
        accent = 0xFF8B5CF6,
        kind = GameKind.NativeStarling,
      ),
    )

  fun byId(id: String?): GameEntry? = games.firstOrNull { it.id == id }
}
