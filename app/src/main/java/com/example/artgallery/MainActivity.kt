package com.example.artgallery

import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.core.view.WindowCompat
import com.example.artgallery.ui.home.HomeScreen
import com.example.artgallery.theme.LauncherTheme
import dev.horizon.android.HorizonActivity

/**
 * The launcher.
 *
 * This used to be a WebView pointed at `assets/index.html`, which meant the home
 * screen was HTML and every game was a page inside it. It is Compose now: the
 * three browser games still come from that same bundle, but each one opens in
 * its own [GameWebViewActivity] at its URL hash, and Horizon opens as a native
 * activity instead of being squeezed into a WebView it was never built for.
 *
 * The web bundle's own launcher page is still in the APK. It is not reachable
 * from here on purpose; see [GameWebViewActivity] for how leaving a game comes
 * back to this screen rather than that one.
 *
 * The companion name the player picks in the pet game shows up here on the pet
 * card as soon as they come back: [GameWebViewActivity] mirrors it into plain
 * preferences on every change, and [onResume] re-reads it.
 */
class MainActivity : ComponentActivity() {

  private var companionName by mutableStateOf("")

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    // Edge-to-edge dark shell, matching the launcher's background so there is
    // no white flash between the splash and the first Compose frame.
    WindowCompat.setDecorFitsSystemWindows(window, false)
    window.statusBarColor = Color.TRANSPARENT
    window.navigationBarColor = Color.TRANSPARENT

    val horizonAvailable = HorizonNative.isAvailable(this)
    companionName = LauncherStore.readCompanionName(this)

    setContent {
      LauncherTheme {
        Surface(modifier = Modifier.fillMaxSize()) {
          HomeScreen(
            horizonAvailable = horizonAvailable,
            companionName = companionName,
            onOpen = ::openGame,
          )
        }
      }
    }
  }

  override fun onResume() {
    super.onResume()
    // Coming back from a game: the player may have renamed the companion.
    companionName = LauncherStore.readCompanionName(this)
  }

  private fun openGame(game: GameEntry) {
    when (game.kind) {
      GameKind.Web ->
        startActivity(
          Intent(this, GameWebViewActivity::class.java)
            .putExtra(GameCatalog.EXTRA_GAME_ID, game.id)
        )

      GameKind.NativeHorizon ->
        // HorizonNative being false means the card renders as "Coming soon!"
        // and is not clickable, so this guard is belt and braces.
        if (HorizonNative.isAvailable(this)) {
          startActivity(Intent(this, HorizonActivity::class.java))
        }
    }
  }
}
