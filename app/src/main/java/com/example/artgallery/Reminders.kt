package com.example.artgallery

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import org.json.JSONArray
import org.json.JSONObject

/**
 * A reminder the player set in the pet game.
 *
 * `triggerAt` is an absolute wall-clock time in epoch milliseconds, so it does
 * not care about time zones changing between being set and firing.
 */
data class Reminder(
    val id: String,
    val title: String,
    val description: String,
    val triggerAt: Long,
)

/**
 * Reminders, and the alarm that makes them ring.
 *
 * There is no server and no background service: an [AlarmManager] entry wakes
 * the app's process at the chosen minute, [ReminderAlarmReceiver] posts an
 * ongoing notification and starts a repeating vibration, and the notification's
 * single action stops both. [setAlarmClock] is used rather than
 * `setExactAndAllowWhileIdle` because it is allowed to fire exactly without the
 * `SCHEDULE_EXACT_ALARM` permission, and a reminder that arrives a few minutes
 * late is worthless.
 *
 * Reminders are stored in plain app preferences as JSON. They are the only
 * record of themselves: stopping one deletes it, so nothing lingers as a ghost
 * alarm after its notification is gone.
 */
object ReminderStore {

    private const val PREFS = "pet_reminders"
    private const val KEY_REMINDERS = "reminders_json"

    const val EXTRA_ID = "reminder_id"
    const val EXTRA_TITLE = "reminder_title"
    const val EXTRA_DESCRIPTION = "reminder_description"
    const val EXTRA_TRIGGER_AT = "reminder_trigger_at"

    const val CHANNEL_ID = "pet_reminders_alarm"

    private const val STOP_ACTION = "com.example.artgallery.REMINDER_STOP"

    /* Must match GameWebViewActivity's own preferences: the pet language is
       written there when the player switches it, and the notification's Stop
       button is labelled in that language. */
    private const val PET_PREFERENCES = "pet_preferences"
    private const val PET_LANGUAGE_KEY = "pet_language"

    /* 0 ms wait, then 900 ms of buzzing and 800 ms of quiet, looping from the
     * start until something cancels it. Deliberately no sound: the notification
     * channel is created silent and the vibration is the only alert. */
    private val VIBRATION_PATTERN = longArrayOf(0L, 900L, 800L)

    private fun prefs(context: Context) =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun load(context: Context): MutableList<Reminder> {
        val raw = prefs(context).getString(KEY_REMINDERS, null) ?: return mutableListOf()
        val list = mutableListOf<Reminder>()
        try {
            val array = JSONArray(raw)
            for (index in 0 until array.length()) {
                val item = array.optJSONObject(index) ?: continue
                val id = item.optString("id")
                val title = item.optString("title")
                val triggerAt = item.optLong("triggerAt")
                if (id.isBlank() || title.isBlank() || triggerAt <= 0L) continue
                list.add(
                    Reminder(
                        id = id,
                        title = title,
                        description = item.optString("description"),
                        triggerAt = triggerAt,
                    )
                )
            }
        } catch (error: Exception) {
            // A corrupt blob must not take the app down; an empty list means
            // the player simply has no reminders.
            return mutableListOf()
        }
        return list
    }

    private fun save(context: Context, reminders: List<Reminder>) {
        val array = JSONArray()
        reminders.forEach { reminder ->
            array.put(
                JSONObject()
                    .put("id", reminder.id)
                    .put("title", reminder.title)
                    .put("description", reminder.description)
                    .put("triggerAt", reminder.triggerAt)
            )
        }
        prefs(context).edit().putString(KEY_REMINDERS, array.toString()).apply()
    }

    /** The format the settings page reads through the JavaScript bridge. */
    fun toJson(context: Context): String {
        val array = JSONArray()
        load(context).sortedBy { it.triggerAt }.forEach { reminder ->
            array.put(
                JSONObject()
                    .put("id", reminder.id)
                    .put("title", reminder.title)
                    .put("description", reminder.description)
                    .put("triggerAt", reminder.triggerAt)
            )
        }
        return array.toString()
    }

    /**
     * Saves a reminder and schedules its alarm. An id that already exists is
     * replaced, so editing from the page needs no separate update call.
     */
    fun add(context: Context, reminder: Reminder): Boolean {
        if (reminder.id.isBlank() || reminder.title.isBlank() || reminder.triggerAt <= System.currentTimeMillis()) {
            return false
        }
        val reminders = load(context)
            .filterNot { it.id == reminder.id }
            .plus(reminder)
        save(context, reminders)
        schedule(context, reminder)
        return true
    }

    /** Forgets a reminder: cancels its alarm, its notification and its buzz. */
    fun remove(context: Context, id: String): Boolean {
        cancelAlarm(context, id)
        stopRinging(context, id)
        val reminders = load(context)
        val remaining = reminders.filterNot { it.id == id }
        save(context, remaining)
        return remaining.size != reminders.size
    }

    /** Called after a reboot or an app update: alarms do not survive either. */
    fun rescheduleAll(context: Context) {
        val now = System.currentTimeMillis()
        load(context).filter { it.triggerAt > now }.forEach { schedule(context, it) }
    }

    private fun pendingIntent(context: Context, reminder: Reminder): PendingIntent {
        val intent = Intent(context, ReminderAlarmReceiver::class.java).apply {
            putExtra(EXTRA_ID, reminder.id)
            // A distinct data URI keeps two reminders from sharing one
            // PendingIntent even if their request codes ever collide.
            data = android.net.Uri.parse("reminder://${reminder.id}")
        }
        return PendingIntent.getBroadcast(
            context,
            reminder.id.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    private fun schedule(context: Context, reminder: Reminder) {
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
        val operation = pendingIntent(context, reminder)
        val showIntent = PendingIntent.getActivity(
            context,
            reminder.id.hashCode(),
            Intent(context, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        try {
            alarmManager.setAlarmClock(
                AlarmManager.AlarmClockInfo(reminder.triggerAt, showIntent),
                operation,
            )
        } catch (error: SecurityException) {
            // Should not happen with setAlarmClock, but a device with a custom
            // alarm policy must not lose the reminder entirely.
            alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, reminder.triggerAt, operation)
        }
    }

    private fun cancelAlarm(context: Context, id: String) {
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
        val intent = Intent(context, ReminderAlarmReceiver::class.java).apply {
            data = android.net.Uri.parse("reminder://$id")
        }
        val operation = PendingIntent.getBroadcast(
            context,
            id.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        alarmManager.cancel(operation)
        operation.cancel()
    }

    private fun ensureChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return
        if (manager.getNotificationChannel(CHANNEL_ID) != null) return
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Pet reminders",
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = "Reminders set in the virtual pet game"
            // Silent by design: the vibration is the alarm.
            setSound(null, null)
            enableVibration(true)
            vibrationPattern = VIBRATION_PATTERN
            lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
        }
        manager.createNotificationChannel(channel)
    }

    private fun notificationId(id: String) = id.hashCode()

    private fun vibrator(context: Context): Vibrator? {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            (context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager)?.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
        }
    }

    private fun startVibration(context: Context, repeating: Boolean) {
        val device = vibrator(context) ?: return
        if (!device.hasVibrator()) return
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                // repeat = 0 loops the pattern forever; repeat = -1 plays it
                // once. Only a reminder that has a visible Stop button is
                // allowed to loop: with notifications denied there would be no
                // way to silence an endless buzz except force-stopping the app.
                val repeat = if (repeating) 0 else -1
                device.vibrate(VibrationEffect.createWaveform(VIBRATION_PATTERN, repeat))
            } else {
                @Suppress("DEPRECATION")
                device.vibrate(VIBRATION_PATTERN, if (repeating) 0 else -1)
            }
        } catch (error: Exception) {
            // A device that refuses the pattern can still show the notification.
        }
    }

    private fun stopVibration(context: Context) {
        try {
            vibrator(context)?.cancel()
        } catch (error: Exception) {
            // Nothing to cancel.
        }
    }

    /**
     * Posts the ongoing notification and starts the buzz. Called from the alarm
     * receiver while the app may be completely cold, so everything it needs is
     * read from preferences.
     */
    fun fire(context: Context, id: String) {
        val reminder = load(context).firstOrNull { it.id == id } ?: return
        ensureChannel(context)

        val stopIntent = Intent(context, ReminderStopReceiver::class.java).apply {
            data = android.net.Uri.parse("reminder://stop/$id")
            putExtra(EXTRA_ID, id)
        }
        val stopPendingIntent = PendingIntent.getBroadcast(
            context,
            notificationId(id),
            stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val openIntent = PendingIntent.getActivity(
            context,
            notificationId(id),
            Intent(context, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val isUrdu = context.getSharedPreferences(PET_PREFERENCES, Context.MODE_PRIVATE)
            .getString(PET_LANGUAGE_KEY, "en") == "ur"
        val stopLabel = if (isUrdu) "بند کریں" else "Stop"
        val bodyText = reminder.description.ifBlank { if (isUrdu) "وقت ہو گیا ہے۔" else "It is time." }

        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_popup_reminder)
            // The title is the reminder's own title, as asked: the notification
            // says what it is about before anything else.
            .setContentTitle(reminder.title)
            .setContentText(bodyText)
            .setStyle(NotificationCompat.BigTextStyle().bigText(bodyText))
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setWhen(reminder.triggerAt)
            .setShowWhen(true)
            .setOngoing(true)
            .setAutoCancel(false)
            .setOnlyAlertOnce(true)
            .setSound(null)
            .setDefaults(0)
            .setVibrate(VIBRATION_PATTERN)
            .addAction(0, stopLabel, stopPendingIntent)
            .setContentIntent(openIntent)
            .build()

        try {
            NotificationManagerCompat.from(context).notify(notificationId(id), notification)
        } catch (error: SecurityException) {
            // No notification permission: the vibration below still rings, and
            // the settings page tells the player to allow notifications.
        }
        startVibration(context, repeating = NotificationManagerCompat.from(context).areNotificationsEnabled())
    }

    /** Stops the notification and the buzz without forgetting the reminder. */
    fun stopRinging(context: Context, id: String) {
        stopVibration(context)
        try {
            NotificationManagerCompat.from(context).cancel(notificationId(id))
        } catch (error: SecurityException) {
            // Nothing to cancel.
        }
    }

    fun notificationsEnabled(context: Context): Boolean =
        NotificationManagerCompat.from(context).areNotificationsEnabled()
}

/** Wakes up when a reminder's time arrives. */
class ReminderAlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val id = intent.getStringExtra(ReminderStore.EXTRA_ID) ?: return
        ReminderStore.fire(context, id)
    }
}

/** The notification's single action: silence it and forget the reminder. */
class ReminderStopReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val id = intent.getStringExtra(ReminderStore.EXTRA_ID) ?: return
        ReminderStore.remove(context, id)
    }
}

/** Alarms do not survive a reboot; put them back. */
class ReminderBootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        ReminderStore.rescheduleAll(context)
    }
}
