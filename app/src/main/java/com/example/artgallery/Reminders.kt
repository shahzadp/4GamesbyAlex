package com.example.artgallery

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import org.json.JSONArray
import org.json.JSONObject
import java.util.Calendar

/**
 * A reminder the player set in the pet game.
 *
 * `triggerAt` is always the *next* absolute wall-clock time in epoch
 * milliseconds. For a reminder that repeats, the alarm receiver moves it
 * forward one day each time it rings, so the stored value is never in the past
 * for a live repeating reminder.
 */
data class Reminder(
    val id: String,
    val title: String,
    val description: String,
    val triggerAt: Long,
    val repeatDaily: Boolean = false,
    val skipSundays: Boolean = false,
)

/**
 * Reminders, and the alarms that make them ring.
 *
 * There is no server and no background service: an [AlarmManager] entry wakes
 * the app's process at the chosen minute, [ReminderAlarmReceiver] posts an
 * ongoing notification and starts a repeating vibration, and the notification's
 * single action stops both.
 *
 * **Exact alarms.** `setAlarmClock` is used because it fires on the minute even
 * when the phone is asleep. It needs the exact-alarm permission on Android 12+;
 * without it the API throws, and `setAndAllowWhileIdle` is used instead, which
 * the OS is free to hold back until the device wakes up - the classic symptom
 * being "the reminder only rings once I open the app". The manifest declares
 * both `SCHEDULE_EXACT_ALARM` (Android 12/12L) and `USE_EXACT_ALARM` (Android
 * 13+, granted automatically), and the settings page offers to grant the
 * permission if a device still has it switched off.
 *
 * Reminders are stored in app preferences as JSON and saved with `commit()` so
 * a receiver whose process is killed the moment it returns cannot lose the
 * rescheduling it just did.
 */
object ReminderStore {

    private const val PREFS = "pet_reminders"
    private const val KEY_REMINDERS = "reminders_json"

    const val EXTRA_ID = "reminder_id"
    const val EXTRA_RING_TITLE = "reminder_ring_title"
    const val EXTRA_RING_DESCRIPTION = "reminder_ring_description"

    const val CHANNEL_ID = "pet_reminders_alarm"

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
                val repeatDaily = item.optBoolean("repeatDaily", false)
                list.add(
                    Reminder(
                        id = id,
                        title = title,
                        description = item.optString("description"),
                        triggerAt = triggerAt,
                        repeatDaily = repeatDaily,
                        // A one-off reminder has no weekdays to skip.
                        skipSundays = repeatDaily && item.optBoolean("skipSundays", false),
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

    /* commit(), not apply(): this runs from broadcast receivers whose process
       may be killed as soon as onReceive returns, and a rescheduling that only
       exists in memory is a reminder that never rings again. */
    private fun save(context: Context, reminders: List<Reminder>) {
        val array = JSONArray()
        reminders.forEach { reminder ->
            array.put(
                JSONObject()
                    .put("id", reminder.id)
                    .put("title", reminder.title)
                    .put("description", reminder.description)
                    .put("triggerAt", reminder.triggerAt)
                    .put("repeatDaily", reminder.repeatDaily)
                    .put("skipSundays", reminder.skipSundays)
            )
        }
        prefs(context).edit().putString(KEY_REMINDERS, array.toString()).commit()
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
                    .put("repeatDaily", reminder.repeatDaily)
                    .put("skipSundays", reminder.skipSundays)
            )
        }
        return array.toString()
    }

    /**
     * Saves a reminder and schedules its alarm. An id that already exists is
     * replaced, so editing from the page needs no separate update call.
     *
     * A repeating reminder that would first ring on a skipped Sunday starts on
     * Monday instead, keeping its time of day.
     */
    fun add(context: Context, reminder: Reminder): Boolean {
        if (reminder.id.isBlank() || reminder.title.isBlank()) return false
        if (reminder.triggerAt <= System.currentTimeMillis()) return false

        var prepared = reminder.copy(
            skipSundays = reminder.repeatDaily && reminder.skipSundays,
        )
        if (prepared.repeatDaily && prepared.skipSundays &&
            dayOfWeek(prepared.triggerAt) == Calendar.SUNDAY
        ) {
            prepared = prepared.copy(triggerAt = addDays(prepared.triggerAt, 1))
        }

        save(context, load(context).filterNot { it.id == prepared.id }.plus(prepared))
        schedule(context, prepared)
        recordArmed(context)
        return true
    }

    /** Forgets a reminder: cancels its alarm, its notification and its buzz. */
    fun remove(context: Context, id: String): Boolean {
        cancelAlarm(context, id)
        stopRinging(context, id)
        val reminders = load(context)
        val remaining = reminders.filterNot { it.id == id }
        save(context, remaining)
        if (remaining.isEmpty()) clearDropped(context)
        recordArmed(context)
        return remaining.size != reminders.size
    }

    /**
     * The notification's Stop action. It always silences the buzz and dismisses
     * the notification; a one-off reminder is then forgotten, while a repeating
     * one keeps its next day's alarm.
     */
    fun acknowledge(context: Context, id: String) {
        stopRinging(context, id)
        val reminder = load(context).firstOrNull { it.id == id } ?: return
        if (!reminder.repeatDaily) {
            cancelAlarm(context, id)
            save(context, load(context).filterNot { it.id == id })
            recordArmed(context)
            return
        }
        val now = System.currentTimeMillis()
        val next = if (reminder.triggerAt > now) reminder.triggerAt else nextTrigger(reminder, now)
        val updated = reminder.copy(triggerAt = next)
        save(context, load(context).map { if (it.id == id) updated else it })
        schedule(context, updated)
        recordArmed(context)
    }

    /**
     * Called at boot, after an app update, on a clock change, when the
     * exact-alarm permission is granted, and whenever the app comes to the
     * foreground. Alarms do not survive a reboot, a force-stop or a revoked
     * permission, and re-arming on every launch is the cheapest insurance
     * there is.
     *
     * Repeating reminders whose time passed while the app was away roll
     * forward to their next occurrence. A one-off that was missed is kept (the
     * page labels it "Missed") rather than silently deleted.
     */
    fun rescheduleAll(context: Context) {
        val now = System.currentTimeMillis()
        val kept = mutableListOf<Reminder>()
        load(context).forEach { reminder ->
            when {
                reminder.triggerAt > now -> {
                    kept.add(reminder)
                    schedule(context, reminder)
                }
                reminder.repeatDaily -> {
                    val updated = reminder.copy(triggerAt = nextTrigger(reminder, now))
                    kept.add(updated)
                    schedule(context, updated)
                }
                else -> kept.add(reminder)
            }
        }
        save(context, kept)
        recordArmed(context)
    }

    /** The next time this reminder should ring, strictly after [now]. */
    private fun nextTrigger(reminder: Reminder, now: Long): Long {
        val base = Calendar.getInstance().apply { timeInMillis = reminder.triggerAt }
        val candidate = Calendar.getInstance().apply {
            timeInMillis = now
            set(Calendar.HOUR_OF_DAY, base.get(Calendar.HOUR_OF_DAY))
            set(Calendar.MINUTE, base.get(Calendar.MINUTE))
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }
        if (candidate.timeInMillis <= now) candidate.add(Calendar.DAY_OF_YEAR, 1)
        if (reminder.skipSundays) {
            while (candidate.get(Calendar.DAY_OF_WEEK) == Calendar.SUNDAY) {
                candidate.add(Calendar.DAY_OF_YEAR, 1)
            }
        }
        return candidate.timeInMillis
    }

    private fun dayOfWeek(millis: Long): Int =
        Calendar.getInstance().apply { timeInMillis = millis }.get(Calendar.DAY_OF_WEEK)

    private fun addDays(millis: Long, days: Int): Long =
        Calendar.getInstance().apply {
            timeInMillis = millis
            add(Calendar.DAY_OF_YEAR, days)
        }.timeInMillis

    /* Every reminder is armed twice, with different request codes and data
       URIs: once with `setAlarmClock` (the strong one - it fires on the minute
       with the phone asleep and puts the alarm icon in the status bar) and once
       with `setExactAndAllowWhileIdle` as an independent second delivery.

       Vendor battery managers do not all agree on what to clear when an app
       leaves the foreground: MIUI is known to drop third-party "alarm clock"
       alarms, others drop exact wakeups but keep the alarm clock. Two alarms of
       different kinds mean one surviving is enough. Both deliver to the same
       receiver, and `fire()` is idempotent, so a double delivery rings once. */
    private const val BACKUP_REQUEST_CODE = 0x5A5A5A

    private fun alarmIntent(context: Context, id: String, backup: Boolean): Intent =
        Intent(context, ReminderAlarmReceiver::class.java).apply {
            putExtra(EXTRA_ID, id)
            // A distinct data URI keeps two reminders - and the two alarms of
            // one reminder - from ever sharing a PendingIntent.
            data = Uri.parse(
                if (backup) "reminder://backup/$id" else "reminder://$id"
            )
        }

    private fun pendingIntent(context: Context, id: String, backup: Boolean): PendingIntent =
        PendingIntent.getBroadcast(
            context,
            id.hashCode() xor if (backup) BACKUP_REQUEST_CODE else 0,
            alarmIntent(context, id, backup),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

    private fun schedule(context: Context, reminder: Reminder) {
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
        val primary = pendingIntent(context, reminder.id, backup = false)
        val backup = pendingIntent(context, reminder.id, backup = true)

        var clockArmed = false
        if (exactAlarmsAllowed(context)) {
            val showIntent = PendingIntent.getActivity(
                context,
                reminder.id.hashCode(),
                Intent(context, MainActivity::class.java),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            try {
                alarmManager.setAlarmClock(
                    AlarmManager.AlarmClockInfo(reminder.triggerAt, showIntent),
                    primary,
                )
                clockArmed = true
            } catch (error: SecurityException) {
                // Permission revoked between the check and the call.
            }
        }

        // Inexact, but still a wakeup alarm, so the reminder is late rather
        // than lost. The settings page asks for the exact-alarm permission.
        if (!clockArmed) {
            try {
                alarmManager.setAndAllowWhileIdle(
                    AlarmManager.RTC_WAKEUP,
                    reminder.triggerAt,
                    primary,
                )
            } catch (error: SecurityException) {
                // Nothing else AlarmManager may do for us.
            }
        }

        // The independent second delivery. It costs one more AlarmManager row
        // and cannot ring the reminder twice (see `fire`).
        try {
            alarmManager.setExactAndAllowWhileIdle(
                AlarmManager.RTC_WAKEUP,
                reminder.triggerAt,
                backup,
            )
        } catch (error: SecurityException) {
            try {
                alarmManager.setAndAllowWhileIdle(
                    AlarmManager.RTC_WAKEUP,
                    reminder.triggerAt,
                    backup,
                )
            } catch (error: SecurityException) {
                // The primary alarm is still the best this device allows.
            }
        }
    }

    private fun cancelAlarm(context: Context, id: String) {
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
        for (backup in booleanArrayOf(false, true)) {
            val operation = pendingIntent(context, id, backup)
            alarmManager.cancel(operation)
            operation.cancel()
        }
    }

    /* ---- "Why didn't it ring?" bookkeeping --------------------------------
       Scheduling an alarm is a promise the app cannot keep on its own: the
       phone may clear it the moment the app leaves the foreground. The two
       fields below turn that from a guess into a fact the settings page can
       show. `armed` is what we last handed to AlarmManager; `dropped` is only
       written when a reminder is still waiting and the system no longer lists
       its alarm at the next foreground return. */

    private const val KEY_ARMED = "alarm_armed_json"
    private const val KEY_DROPPED = "alarm_dropped_json"

    /** The next alarm the system itself knows about, in epoch millis (0 = none). */
    fun systemNextAlarm(context: Context): Long {
        val manager = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return 0L
        return manager.nextAlarmClock?.triggerTime ?: 0L
    }

    /** Remembers which reminder the alarms currently in the system belong to. */
    private fun recordArmed(context: Context) {
        val now = System.currentTimeMillis()
        val next = load(context).filter { it.triggerAt > now }.minByOrNull { it.triggerAt }
        if (next == null) {
            prefs(context).edit().remove(KEY_ARMED).commit()
            return
        }
        val armed = JSONObject()
            .put("at", now)
            .put("for", next.triggerAt)
            .put("id", next.id)
        prefs(context).edit().putString(KEY_ARMED, armed.toString()).commit()
    }

    /**
     * Called on every foreground return, *before* the alarms are re-armed.
     *
     * A reminder that is still waiting while the system no longer lists its
     * alarm was cleared by the phone, not forgotten by the app. That is worth
     * telling the player: no app can re-arm an alarm while it is not running,
     * but the player can stop the phone from clearing it.
     */
    fun auditArmed(context: Context) {
        val raw = prefs(context).getString(KEY_ARMED, null) ?: return
        val armed = try { JSONObject(raw) } catch (error: Exception) { null } ?: run {
            prefs(context).edit().remove(KEY_ARMED).commit()
            return
        }
        val armedFor = armed.optLong("for")
        val armedId = armed.optString("id")
        val reminder = load(context).firstOrNull { it.id == armedId }
        if (reminder == null || reminder.triggerAt != armedFor) {
            // It rang, was deleted or was moved on: nothing to explain.
            prefs(context).edit().remove(KEY_ARMED).commit()
            return
        }
        // Without the exact-alarm permission the status-bar alarm clock is
        // never ours, so this check would misfire. The settings panel already
        // has a row asking for that permission.
        if (!exactAlarmsAllowed(context)) return

        val next = systemNextAlarm(context)
        if (next != 0L && Math.abs(next - armedFor) < 60_000L) return
        // Another app's alarm may simply be the next one. Only a missing alarm
        // clock, or one scheduled after ours, proves ours is gone.
        if (next != 0L && next < armedFor - 60_000L) return

        val dropped = JSONObject()
            .put("at", System.currentTimeMillis())
            .put("for", armedFor)
            .put("armedAt", armed.optLong("at"))
        prefs(context).edit().putString(KEY_DROPPED, dropped.toString()).commit()
        prefs(context).edit().remove(KEY_ARMED).commit()
    }

    /** What the settings page needs to show, or explain, a dropped alarm. */
    fun healthJson(context: Context): String {
        val raw = prefs(context).getString(KEY_DROPPED, null)
        var droppedAt = 0L
        var droppedFor = 0L
        if (raw != null) {
            try {
                val dropped = JSONObject(raw)
                droppedAt = dropped.optLong("at")
                droppedFor = dropped.optLong("for")
            } catch (error: Exception) {
                // A corrupt blob simply means there is nothing to report.
            }
        }
        return JSONObject()
            .put("now", System.currentTimeMillis())
            .put("nextAlarmClock", systemNextAlarm(context))
            .put("droppedAt", droppedAt)
            .put("droppedFor", droppedFor)
            .toString()
    }

    private fun clearDropped(context: Context) {
        prefs(context).edit().remove(KEY_DROPPED).commit()
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
    private fun ring(context: Context, reminder: Reminder, firedAt: Long) {
        ensureChannel(context)

        val stopIntent = Intent(context, ReminderStopReceiver::class.java).apply {
            data = Uri.parse("reminder://stop/${reminder.id}")
            putExtra(EXTRA_ID, reminder.id)
        }
        val stopPendingIntent = PendingIntent.getBroadcast(
            context,
            notificationId(reminder.id),
            stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        /* The ringing screen, not just the app. A silent, vibrating notification
           is invisible on a locked phone; a full-screen intent is the one
           background launch Android still allows, and it wakes the screen the
           way an alarm should. Where the permission is off it degrades to a
           heads-up notification, so the reminder is never lost. */
        val ringIntent = PendingIntent.getActivity(
            context,
            notificationId(reminder.id) + 1,
            ReminderRingActivity.intent(context, reminder),
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
            .setWhen(firedAt)
            .setShowWhen(true)
            .setOngoing(true)
            .setAutoCancel(false)
            .setOnlyAlertOnce(true)
            .setSound(null)
            .setDefaults(0)
            .setVibrate(VIBRATION_PATTERN)
            .addAction(0, stopLabel, stopPendingIntent)
            .setFullScreenIntent(ringIntent, true)
            .setContentIntent(ringIntent)
            .build()

        try {
            NotificationManagerCompat.from(context).notify(notificationId(reminder.id), notification)
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

    /**
     * The alarm went off. `id` is the only thing the alarm carries, so the
     * reminder is looked up here; a record that has already been handled makes
     * this a no-op, which is what keeps a duplicate delivery from ringing twice.
     */
    fun fire(context: Context, id: String) {
        val reminder = load(context).firstOrNull { it.id == id } ?: return
        val now = System.currentTimeMillis()

        // A repeating reminder whose stored time is already in the future has
        // been advanced by an earlier delivery of this same alarm.
        if (reminder.repeatDaily && reminder.triggerAt > now + 60_000L) return

        ring(context, reminder, now)

        if (reminder.repeatDaily) {
            val updated = reminder.copy(triggerAt = nextTrigger(reminder, now))
            save(context, load(context).map { if (it.id == id) updated else it })
            schedule(context, updated)
        } else {
            // Delivered once: the record is no longer needed. The Stop action
            // still works, because it cancels by notification id rather than
            // by record.
            save(context, load(context).filterNot { it.id == id })
        }
        // It rang, so any "the phone dropped this alarm" note is stale.
        clearDropped(context)
        recordArmed(context)
    }

    fun notificationsEnabled(context: Context): Boolean {
        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return false
        // The app can be allowed notifications while this one channel is muted
        // by a long-press; the reminder would then buzz with no Stop button.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
            val channel = manager?.getNotificationChannel(CHANNEL_ID)
            if (channel != null && channel.importance == NotificationManager.IMPORTANCE_NONE) return false
        }
        return true
    }

    /**
     * Android 13+ can place an app in the "restricted" App Standby bucket. That
     * is separate from the battery-optimisation exemption and it is a common
     * reason for an alarm to be held back until the app is opened by hand.
     */
    fun standbyRestricted(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) return false
        val usageStats = context.getSystemService(Context.USAGE_STATS_SERVICE)
            as? android.app.usage.UsageStatsManager ?: return false
        return try {
            usageStats.appStandbyBucket ==
                android.app.usage.UsageStatsManager.STANDBY_BUCKET_RESTRICTED
        } catch (error: Exception) {
            false
        }
    }

    /** Android 12+ gates `setAlarmClock` behind a user-controlled permission. */
    fun exactAlarmsAllowed(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true
        val manager = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return false
        return manager.canScheduleExactAlarms()
    }

    /**
     * Android 14+ lets the user switch off full-screen notifications. When that
     * is off the ringing screen still appears as a heads-up notification, but
     * it will not turn the screen on.
     */
    fun fullScreenIntentAllowed(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) return true
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
            ?: return false
        return manager.canUseFullScreenIntent()
    }

    /**
     * Some phones (and Android's own battery saver) put an unused app to sleep
     * and hold every alarm it schedules. Being exempt is not required, but it
     * is the difference between a reminder that rings and one that waits for
     * the player to open the app.
     */
    fun batteryOptimisationIgnored(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true
        val power = context.getSystemService(Context.POWER_SERVICE) as? PowerManager ?: return true
        return power.isIgnoringBatteryOptimizations(context.packageName)
    }
}

/** Wakes up when a reminder's time arrives. */
class ReminderAlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val id = intent.getStringExtra(ReminderStore.EXTRA_ID) ?: return
        ReminderStore.fire(context, id)
    }
}

/** The notification's single action: silence it and move on. */
class ReminderStopReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val id = intent.getStringExtra(ReminderStore.EXTRA_ID) ?: return
        ReminderStore.acknowledge(context, id)
    }
}

/**
 * Alarms do not survive a reboot, an app update, a clock change or a revoked
 * exact-alarm permission; each of those events puts them back.
 */
class ReminderBootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        ReminderStore.rescheduleAll(context)
    }
}
