package com.example.artgallery.ui.home

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import kotlinx.coroutines.delay
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import android.view.HapticFeedbackConstants
import com.example.artgallery.GameCatalog
import com.example.artgallery.GameEntry
import com.example.artgallery.GameKind
import com.example.artgallery.theme.LauncherTheme

private val CardShape = RoundedCornerShape(26.dp)
private val TileShape = RoundedCornerShape(19.dp)
private val CardHighlight = Color(0x08FFFFFF)
private val CardEdge = Color(0x14FFFFFF)

// Warm tones for the copy, tuned to sit on the deep-navy backdrop without
// glare; pure cool grey reads sterile next to the glowing game tiles.
private val Eyebrow = Color(0xFFF5C97B)
private val Subtitle = Color(0xFFCBB79E)
private val Tagline = Color(0xFFB7A98F)
/**
 * The app's home screen.
 *
 * @param horizonAvailable false when the native payload has not been staged into
 *   this build; Horizon shows up dimmed as "Coming soon!" rather than as an
 *   error a parent would have to explain.
 * @param companionName the name the player gave the virtual pet companion, or
 *   empty to fall back to "Virtual Pet".
 */
@Composable
fun HomeScreen(
  horizonAvailable: Boolean,
  companionName: String,
  onOpen: (GameEntry) -> Unit,
  modifier: Modifier = Modifier,
) {
  val view = LocalView.current
  Scaffold(modifier = modifier.fillMaxSize(), containerColor = Color.Transparent) { insets ->
    Box(Modifier.fillMaxSize()) {
      LauncherBackdrop()

      LazyColumn(
        modifier = Modifier.fillMaxSize().padding(insets),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(
          start = 20.dp, end = 20.dp, top = 6.dp, bottom = 26.dp,
        ),
        verticalArrangement = Arrangement.spacedBy(14.dp),
      ) {
        item { Header() }
        itemsIndexed(GameCatalog.games, key = { _, game -> game.id }) { index, game ->
          StaggeredRise(index = index) {
            GameCard(
              game = game,
              title = cardTitle(game, companionName),
              tagline = cardTagline(game, companionName),
              enabled = game.kind != GameKind.NativeHorizon || horizonAvailable,
              onClick = {
                view.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP)
                onOpen(game)
              },
            )
          }
        }
      }
    }
  }
}

private fun cardTitle(game: GameEntry, companionName: String): String =
  if (game.id == "pet" && companionName.isNotBlank()) companionName else game.title

private fun cardTagline(game: GameEntry, companionName: String): String = when {
  game.id == "pet" && companionName.isNotBlank() -> "Your little friend"
  game.id == "pet" -> "Name your friend"
  else -> game.tagline
}

/** Deep-navy sky with two soft glows: amber above, violet below. */
@Composable
private fun LauncherBackdrop() {
  Canvas(Modifier.fillMaxSize()) {
    drawRect(
      Brush.verticalGradient(
        listOf(Color(0xFF151D3C), Color(0xFF0D1128), Color(0xFF05070F)),
      ),
    )
    drawCircle(
      brush = Brush.radialGradient(
        listOf(Color(0xFFF5B53C).copy(alpha = 0.20f), Color(0xFFF5B53C).copy(alpha = 0f)),
      ),
      center = Offset(size.width * 0.94f, -size.height * 0.06f),
      radius = size.width * 0.85f,
    )
    drawCircle(
      brush = Brush.radialGradient(
        listOf(Color(0xFF7C5CFC).copy(alpha = 0.20f), Color(0xFF7C5CFC).copy(alpha = 0f)),
      ),
      center = Offset(-size.width * 0.16f, size.height * 0.88f),
      radius = size.width * 0.95f,
    )
  }
}

@Composable
private fun Header() {
  Row(
    modifier = Modifier.fillMaxWidth().padding(top = 18.dp, bottom = 14.dp, start = 4.dp, end = 4.dp),
    verticalAlignment = Alignment.CenterVertically,
  ) {
    Column(Modifier.weight(1f)) {
      Text(
        text = "4 Games by Alex",
        color = Color(0xFFFDFBF7),
        fontSize = 28.sp,
        fontWeight = FontWeight.Black,
        letterSpacing = (-0.8).sp,
        maxLines = 1,
      )
      Spacer(Modifier.height(5.dp))
      Text(
        text = "Tap a game to play!",
        color = Subtitle,
        fontSize = 13.sp,
        fontWeight = FontWeight.Medium,
      )
      Spacer(Modifier.height(10.dp))
      Box(
        Modifier.width(66.dp).height(3.dp)
          .clip(RoundedCornerShape(2.dp))
          .background(Brush.horizontalGradient(listOf(Eyebrow, Eyebrow.copy(alpha = 0f)))),
      )
    }
    Sparkle()
  }
}

/** A four-pointed sparkle, the sprinkle of delight every kids' app deserves. */
@Composable
private fun Sparkle() {
  Canvas(Modifier.size(52.dp)) {
    val cx = size.width * 0.5f
    val cy = size.height * 0.5f
    fun star(center: Offset, outer: Float, inner: Float): Path =
      Path().apply {
        moveTo(center.x, center.y - outer)
        quadraticTo(center.x, center.y - inner, center.x + inner, center.y)
        quadraticTo(center.x, center.y + inner, center.x, center.y + outer)
        quadraticTo(center.x, center.y + inner, center.x - inner, center.y)
        quadraticTo(center.x, center.y - inner, center.x, center.y - outer)
        close()
      }
    drawPath(star(Offset(cx, cy), outer = size.minDimension * 0.42f, inner = size.minDimension * 0.11f), Color(0xFFFFD54A))
    drawPath(star(Offset(cx - size.minDimension * 0.34f, cy + size.minDimension * 0.33f), outer = size.minDimension * 0.14f, inner = size.minDimension * 0.045f), Color(0xFFFFD54A).copy(alpha = 0.75f))
  }
}

@Composable
private fun StaggeredRise(index: Int, content: @Composable () -> Unit) {
  val reveal = remember { Animatable(0f) }
  val density = LocalDensity.current
  LaunchedEffect(Unit) {
    delay(70L * index + 60L)
    reveal.animateTo(
      1f,
      spring(dampingRatio = 0.62f, stiffness = 260f),
    )
  }
  Box(
    Modifier.graphicsLayer {
      alpha = reveal.value
      translationY = (1f - reveal.value) * with(density) { 34.dp.toPx() }
    },
  ) {
    content()
  }
}

@Composable
private fun GameCard(
  game: GameEntry,
  title: String,
  tagline: String,
  enabled: Boolean,
  onClick: () -> Unit,
) {
  val accent = Color(game.accent)
  val interaction = remember { MutableInteractionSource() }
  val pressed by interaction.collectIsPressedAsState()
  val scale by animateFloatAsState(
    targetValue = if (pressed) 0.965f else 1f,
    animationSpec = spring(dampingRatio = 0.5f, stiffness = 500f),
    label = "press-scale",
  )
  val contentAlpha = if (enabled) 1f else 0.42f

  Row(
    modifier =
      Modifier.fillMaxWidth()
        .scale(scale)
        .clip(CardShape)
        .background(
          Brush.horizontalGradient(
            listOf(accent.copy(alpha = if (enabled) 0.30f else 0.10f), CardHighlight, Color(0xFF10152A)),
          ),
        )
        .border(1.dp, if (enabled) accent.copy(alpha = 0.38f) else CardEdge, CardShape)
        .then(if (enabled) Modifier.clickable(
          interactionSource = interaction,
          indication = null,
          onClick = onClick,
        ) else Modifier)
        .padding(horizontal = 14.dp, vertical = 17.dp),
    verticalAlignment = Alignment.CenterVertically,
  ) {
    GameTile(gameId = game.id, accent = accent, enabled = enabled)

    Spacer(Modifier.width(16.dp))

    Column(Modifier.weight(1f)) {
      Text(
        text = title,
        color = Color(0xFFFDFBF7).copy(alpha = contentAlpha),
        fontSize = 20.sp,
        fontWeight = FontWeight.ExtraBold,
        letterSpacing = (-0.2).sp,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
      )
      Spacer(Modifier.height(3.dp))
      Text(
        text = if (enabled) tagline else "Coming soon!",
        color = (if (enabled) Tagline else Tagline.copy(alpha = 0.6f)).copy(alpha = contentAlpha),
        fontSize = 12.5.sp,
        fontWeight = FontWeight.Medium,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
      )
    }

    if (enabled) {
      Spacer(Modifier.width(10.dp))
      ChevronCircle()
    }
  }
}

@Composable
private fun GameTile(gameId: String, accent: Color, enabled: Boolean) {
  val shape = TileShape
  val (light, dark) = tileGradient(gameId, accent, enabled)
  Box(
    Modifier.size(68.dp)
      .clip(shape)
      .background(Brush.verticalGradient(listOf(light, dark)))
      .border(1.dp, Color(0x33FFFFFF), shape),
    contentAlignment = Alignment.Center,
  ) {
    Canvas(Modifier.size(40.dp)) { drawGameGlyph(gameId, size.minDimension, enabled) }
  }
}

private fun tileGradient(gameId: String, accent: Color, enabled: Boolean): Pair<Color, Color> =
  if (!enabled) {
    Color(0xFF3B4152) to Color(0xFF232733)
  } else when (gameId) {
    "flappy" -> Color(0xFF7FD1FF) to Color(0xFF2B83D6)
    "chess" -> Color(0xFFA6A8FF) to Color(0xFF494AC2)
    "pet" -> Color(0xFF5BF0B5) to Color(0xFF0EA25F)
    "horizon" -> Color(0xFF8DEF6E) to Color(0xFF3E9C34)
    else -> accent to accent.copy(alpha = 0.7f)
  }

private val GlyphDim = Color(0x66FFFFFF)

private fun DrawScope.drawGameGlyph(gameId: String, s: Float, enabled: Boolean) {
  val w = if (enabled) Color.White else GlyphDim
  val detail = if (enabled) Color(0xFF202430) else GlyphDim
  when (gameId) {
    "flappy" -> {
      // body
      drawCircle(w, radius = s * 0.244f, center = Offset(s * 0.50f, s * 0.483f))
      // wing as a soft curved stroke, not a blob
      drawPath(
        Path().apply {
          moveTo(s * 0.394f, s * 0.383f)
          quadraticTo(s * 0.305f, s * 0.511f, s * 0.422f, s * 0.633f)
        },
        w.copy(alpha = 0.8f),
        style = Stroke(width = s * 0.064f, cap = StrokeCap.Round),
      )
      // beak
      drawPath(
        path = Path().apply {
          moveTo(s * 0.706f, s * 0.433f)
          lineTo(s * 0.911f, s * 0.511f)
          lineTo(s * 0.706f, s * 0.589f)
          close()
        },
        color = if (enabled) Color(0xFFFF5A36) else GlyphDim,
      )
      drawCircle(detail, radius = s * 0.047f, center = Offset(s * 0.594f, s * 0.411f))
    }

    "chess" -> {
      // a rook: three battlement prongs, collar, widening body, base
      val bodyLight = w
      val bandRadius = androidx.compose.ui.geometry.CornerRadius(s * 0.028f, s * 0.028f)
      val prongWidth = s * 0.15f
      val prongHeight = s * 0.20f
      val prongTop = s * 0.178f
      for (prongX in listOf(0.233f, 0.425f, 0.617f)) {
        drawRoundRect(
          color = bodyLight,
          topLeft = Offset(s * prongX, prongTop),
          size = Size(prongWidth, prongHeight),
          cornerRadius = bandRadius,
        )
      }
      drawRoundRect(
        color = bodyLight,
        topLeft = Offset(s * 0.233f, s * 0.358f),
        size = Size(s * 0.533f, s * 0.103f),
        cornerRadius = bandRadius,
      )
      drawPath(
        path = Path().apply {
          moveTo(s * 0.294f, s * 0.461f)
          lineTo(s * 0.706f, s * 0.461f)
          lineTo(s * 0.806f, s * 0.75f)
          lineTo(s * 0.194f, s * 0.75f)
          close()
        },
        color = bodyLight,
      )
      drawRoundRect(
        color = bodyLight,
        topLeft = Offset(s * 0.172f, s * 0.75f),
        size = Size(s * 0.656f, s * 0.128f),
        cornerRadius = androidx.compose.ui.geometry.CornerRadius(s * 0.05f, s * 0.05f),
      )
    }

    "pet" -> {
      drawCircle(w, radius = s * 0.085f, center = Offset(s * 0.26f, s * 0.36f))
      drawCircle(w, radius = s * 0.09f, center = Offset(s * 0.42f, s * 0.27f))
      drawCircle(w, radius = s * 0.09f, center = Offset(s * 0.59f, s * 0.27f))
      drawCircle(w, radius = s * 0.085f, center = Offset(s * 0.75f, s * 0.36f))
      drawOval(
        color = w,
        topLeft = Offset(s * 0.22f, s * 0.44f),
        size = Size(s * 0.56f, s * 0.38f),
      )
    }

    "horizon" -> {
      val cx = s * 0.5f
      val top = Path().apply {
        moveTo(cx, s * 0.06f)
        lineTo(s * 0.88f, s * 0.26f)
        lineTo(cx, s * 0.44f)
        lineTo(s * 0.12f, s * 0.26f)
        close()
      }
      val left = Path().apply {
        moveTo(s * 0.12f, s * 0.26f)
        lineTo(cx, s * 0.44f)
        lineTo(cx, s * 0.88f)
        lineTo(s * 0.12f, s * 0.66f)
        close()
      }
      val right = Path().apply {
        moveTo(cx, s * 0.44f)
        lineTo(s * 0.88f, s * 0.26f)
        lineTo(s * 0.88f, s * 0.66f)
        lineTo(cx, s * 0.88f)
        close()
      }
      val edge = Stroke(width = 2.4f, join = StrokeJoin.Round)
      drawPath(top, Color(0xFFFAFAF5))
      drawPath(left, Color(0xFFE0E0D8))
      drawPath(right, Color(0xFFB4B4AB))
      listOf(top, left, right).forEach { drawPath(it, Color(0xFF1C2415).copy(alpha = 0.35f), style = edge) }
    }
  }
}

@Composable
private fun ChevronCircle() {
  Box(
    Modifier.size(34.dp).clip(CircleShape)
      .background(Color(0x14FFFFFF))
      .border(1.dp, Color(0x10FFFFFF), CircleShape),
    contentAlignment = Alignment.Center,
  ) {
    Canvas(Modifier.size(16.dp)) {
      val s = size.minDimension
      drawPath(
        path = Path().apply {
          moveTo(s * 0.36f, s * 0.16f)
          lineTo(s * 0.68f, s * 0.50f)
          lineTo(s * 0.36f, s * 0.84f)
        },
        color = Color(0xBFFFFFFF),
        style = Stroke(width = 2.6f, cap = StrokeCap.Round, join = StrokeJoin.Round),
      )
    }
  }
}

@Preview(showBackground = true, backgroundColor = 0xFF05070F, widthDp = 380)
@Composable
private fun HomeScreenPreview() {
  LauncherTheme { HomeScreen(horizonAvailable = true, companionName = "Nora", onOpen = {}) }
}

@Preview(showBackground = true, backgroundColor = 0xFF05070F, widthDp = 380)
@Composable
private fun HomeScreenMissingHorizonPreview() {
  LauncherTheme { HomeScreen(horizonAvailable = false, companionName = "", onOpen = {}) }
}
