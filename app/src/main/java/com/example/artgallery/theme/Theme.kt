package com.example.artgallery.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

/**
 * The launcher's palette, taken from the web build's `--bg-*` and `--text-*`
 * custom properties so the Compose home screen and the pages it opens do not
 * look like two different apps.
 *
 * It is deliberately fixed rather than derived from the wallpaper: the games
 * themselves are dark and drawn with their own colours, and a Material You
 * pastel surface behind a dark card grid reads as a bug.
 */
object LauncherPalette {
  val Background = Color(0xFF090B10)
  val Surface = Color(0xFF131722)
  val TextMain = Color(0xFFF8FAFC)
  val TextMuted = Color(0xFF94A3B8)
  val TextDim = Color(0xFF64748B)

  /** The 10% white hairline the web cards use for their border. */
  val Hairline = Color(0x1AFFFFFF)

  /** The `--accent-gold` cue colour, used for the "PICK A GAME" eyebrow. */
  val Accent = Color(0xFFF59E0B)
}

private val LauncherColorScheme =
  darkColorScheme(
    primary = LauncherPalette.Accent,
    onPrimary = Color(0xFF1A1200),
    background = LauncherPalette.Background,
    onBackground = LauncherPalette.TextMain,
    surface = LauncherPalette.Surface,
    onSurface = LauncherPalette.TextMain,
  )

@Composable
fun LauncherTheme(content: @Composable () -> Unit) {
  MaterialTheme(colorScheme = LauncherColorScheme, content = content)
}
