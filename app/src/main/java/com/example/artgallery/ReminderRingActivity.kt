package com.example.artgallery

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.view.WindowCompat

/**
 * The screen a reminder opens when it rings: the alarm-clock half of a reminder.
 *
 * A notification alone is easy to miss when the phone is in a pocket or on
 * silent, and on several phones a high-importance notification does not even
 * light the screen. This activity is what the notification's full-screen intent
 * launches: it turns the screen on, shows over the lock screen, and cannot be
 * dismissed by a stray tap. Its single button is Stop, which is the same action
 * as the notification's Stop and also ends the vibration.
 *
 * It is a plain [Activity] on purpose: it has to come up in under a second from
 * a cold process and does not need Compose, a theme, or the WebView.
 */
class ReminderRingActivity : Activity() {

    private lateinit var reminderId: String

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        reminderId = intent.getStringExtra(ReminderStore.EXTRA_ID).orEmpty()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                    WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
            )
        }
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        window.statusBarColor = Color.TRANSPARENT
        window.navigationBarColor = Color.TRANSPARENT
        WindowCompat.setDecorFitsSystemWindows(window, false)

        val isUrdu = petLanguageIsUrdu()
        val title = intent.getStringExtra(ReminderStore.EXTRA_RING_TITLE).orEmpty()
            .ifBlank { if (isUrdu) "یاد دہانی" else "Reminder" }
        val description = intent.getStringExtra(ReminderStore.EXTRA_RING_DESCRIPTION).orEmpty()

        setContentView(buildContent(title, description, isUrdu))
    }

    private fun petLanguageIsUrdu(): Boolean =
        getSharedPreferences("pet_preferences", Context.MODE_PRIVATE)
            .getString("pet_language", "en") == "ur"

    private fun buildContent(title: String, description: String, isUrdu: Boolean): View {
        val density = resources.displayMetrics.density
        fun dp(value: Int) = (value * density).toInt()

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setBackgroundColor(Color.parseColor("#0B0D10"))
            setPadding(dp(26), dp(40), dp(26), dp(28))
            if (isUrdu) layoutDirection = View.LAYOUT_DIRECTION_RTL
        }

        root.addView(TextView(this).apply {
            text = if (isUrdu) "یاد دہانی" else "REMINDER"
            setTextColor(Color.parseColor("#E8B96A"))
            textSize = 12f
            letterSpacing = if (isUrdu) 0f else 0.22f
            gravity = Gravity.CENTER
            setTypeface(typeface, android.graphics.Typeface.BOLD)
        }, matchWidth())

        root.addView(TextView(this).apply {
            text = title
            setTextColor(Color.WHITE)
            textSize = 30f
            gravity = Gravity.CENTER
            setTypeface(typeface, android.graphics.Typeface.BOLD)
            setPadding(0, dp(14), 0, 0)
        }, matchWidth())

        if (description.isNotBlank()) {
            root.addView(TextView(this).apply {
                text = description
                setTextColor(Color.parseColor("#B9BEC4"))
                textSize = 16f
                gravity = Gravity.CENTER
                setLineSpacing(dp(2).toFloat(), 1f)
                setPadding(0, dp(12), 0, 0)
            }, matchWidth())
        }

        root.addView(View(this), LinearLayout.LayoutParams(0, 0, 1f))

        val stop = Button(this).apply {
            text = if (isUrdu) "بند کریں" else "Stop"
            setTextColor(Color.parseColor("#191B1E"))
            textSize = 19f
            isAllCaps = false
            setTypeface(typeface, android.graphics.Typeface.BOLD)
            background = GradientDrawable().apply {
                cornerRadius = dp(18).toFloat()
                setColor(Color.parseColor("#C9CED4"))
            }
            stateListAnimator = null
            setOnClickListener { stopRing() }
        }
        root.addView(stop, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            dp(64),
        ))

        root.addView(TextView(this).apply {
            text = if (isUrdu) "بند کرنے کے لیے نیچے دبائیں" else "Tap Stop to silence this reminder"
            setTextColor(Color.parseColor("#7C838B"))
            textSize = 13f
            gravity = Gravity.CENTER
            setPadding(0, dp(16), 0, 0)
        }, matchWidth())

        return root
    }

    private fun matchWidth(): LinearLayout.LayoutParams =
        LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT,
        )

    private fun stopRing() {
        ReminderStore.acknowledge(this, reminderId)
        finish()
    }

    /** Back is Stop: the screen must not be dismissible while it keeps buzzing. */
    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        stopRing()
    }

    companion object {
        /** Used by [ReminderStore] to launch the screen from a notification. */
        fun intent(context: Context, reminder: Reminder): Intent =
            Intent(context, ReminderRingActivity::class.java).apply {
                putExtra(ReminderStore.EXTRA_ID, reminder.id)
                putExtra(ReminderStore.EXTRA_RING_TITLE, reminder.title)
                putExtra(ReminderStore.EXTRA_RING_DESCRIPTION, reminder.description)
                data = android.net.Uri.parse("reminder://ring/${reminder.id}")
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                    Intent.FLAG_ACTIVITY_CLEAR_TOP or
                    Intent.FLAG_ACTIVITY_SINGLE_TOP
            }
    }
}
