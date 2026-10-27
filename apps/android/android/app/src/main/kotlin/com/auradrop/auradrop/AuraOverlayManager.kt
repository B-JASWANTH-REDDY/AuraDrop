package com.auradrop.auradrop

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.AnimatorSet
import android.animation.ObjectAnimator
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.graphics.BitmapFactory
import android.graphics.PixelFormat
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.provider.Settings
import android.util.Log
import android.view.Gravity
import android.view.LayoutInflater
import android.view.View
import android.view.WindowManager
import android.view.animation.OvershootInterpolator
import android.widget.ImageView
import android.widget.ProgressBar
import android.widget.TextView
import java.io.File

class AuraOverlayManager private constructor(private val context: Context) {
    companion object {
        private const val TAG = "AuraOverlay"

        @Volatile
        private var instance: AuraOverlayManager? = null

        fun getInstance(context: Context): AuraOverlayManager {
            return instance ?: synchronized(this) {
                instance ?: AuraOverlayManager(context.applicationContext).also { instance = it }
            }
        }
    }

    private val windowManager = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
    private val mainHandler = Handler(Looper.getMainLooper())
    private var currentOverlayView: View? = null
    private var autoDismissRunnable: Runnable? = null
    private var activeTransferId: String? = null

    @Volatile
    var isAppInForeground: Boolean = false

    fun canDrawOverlays(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            Settings.canDrawOverlays(context)
        } else {
            true
        }
    }

    fun requestOverlayPermission(activity: Activity) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(context)) {
            try {
                val intent = Intent(
                    Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:${context.packageName}")
                )
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                activity.startActivity(intent)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to launch overlay permission settings: ${e.message}")
            }
        }
    }

    private fun wakeScreenBriefly() {
        try {
            val pm = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
            val wakeLock = pm?.newWakeLock(
                PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP,
                "auradrop:proximity_wakelock"
            )
            wakeLock?.acquire(4000L)
        } catch (e: Exception) {
            Log.w(TAG, "WakeLock error: ${e.message}")
        }
    }

    fun playNotificationTone() {
        try {
            val notificationUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
                ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
            val ringtone = RingtoneManager.getRingtone(context, notificationUri)
            ringtone?.play()
        } catch (e: Exception) {
            Log.w(TAG, "Failed to play notification tone: ${e.message}")
        }
    }

    fun showNameDropOverlay(
        peerId: String = "",
        peerName: String,
        deviceName: String = "",
        platform: String = "device",
        ip: String = "",
        avatarPath: String = "",
        onShare: (() -> Unit)? = null,
        onChat: (() -> Unit)? = null
    ) {
        mainHandler.post {
            dismissCurrentOverlay()
            if (!canDrawOverlays() || isAppInForeground) {
                return@post
            }

            wakeScreenBriefly()

            try {
                val inflater = LayoutInflater.from(context)
                val view = inflater.inflate(R.layout.view_floating_dynamic_island, null)

                val tvTitle = view.findViewById<TextView>(R.id.tv_title)
                val tvSubtitle = view.findViewById<TextView>(R.id.tv_sender_subtitle)
                val tvStatusBadge = view.findViewById<TextView>(R.id.tv_status_badge)
                val ivDeviceIcon = view.findViewById<ImageView>(R.id.iv_device_icon)
                val ivDeviceAvatar = view.findViewById<ImageView>(R.id.iv_device_avatar)
                val btnDecline = view.findViewById<View>(R.id.btn_decline_container)
                val btnChat = view.findViewById<View>(R.id.btn_chat_container)
                val btnAccept = view.findViewById<View>(R.id.btn_accept_container)
                val tvBtnDecline = view.findViewById<TextView>(R.id.tv_btn_decline)
                val tvBtnChat = view.findViewById<TextView>(R.id.tv_btn_chat)
                val tvBtnAccept = view.findViewById<TextView>(R.id.tv_btn_accept)
                val pillCard = view.findViewById<View>(R.id.pill_card_container)
                val progressContainer = view.findViewById<View>(R.id.transfer_progress_container)

                progressContainer.visibility = View.GONE
                btnChat.visibility = View.VISIBLE

                val isWindows = platform.contains("win", ignoreCase = true) || platform.contains("desktop", ignoreCase = true)
                val platformDisplay = if (isWindows) "Windows PC" else if (platform.contains("android", ignoreCase = true)) "Android Device" else platform.replaceFirstChar { it.uppercase() }

                tvTitle.text = "AuraDrop Nearby"
                tvSubtitle.text = "$peerName • $platformDisplay"
                tvStatusBadge.text = if (ip.isNotBlank()) "$ip • 24/7 LAN Proximity" else "Direct Wi-Fi • Ready"
                
                // AuraDrop Official Badge Icon
                ivDeviceIcon.setImageResource(R.drawable.ic_auradrop_badge)

                // Load custom profile avatar if available
                if (avatarPath.isNotBlank()) {
                    try {
                        val file = File(avatarPath)
                        if (file.exists()) {
                            val bmp = BitmapFactory.decodeFile(file.absolutePath)
                            if (bmp != null) {
                                ivDeviceAvatar.setImageBitmap(bmp)
                                ivDeviceAvatar.visibility = View.VISIBLE
                                ivDeviceIcon.visibility = View.GONE
                            }
                        }
                    } catch (e: Exception) {}
                }

                tvBtnDecline.text = "Dismiss"
                tvBtnChat.text = "Chat"
                tvBtnAccept.text = "Share Files"

                btnDecline.setOnClickListener {
                    dismissCurrentOverlay()
                }

                btnChat.setOnClickListener {
                    onChat?.invoke()
                    launchApp()
                    dismissCurrentOverlay()
                }

                btnAccept.setOnClickListener {
                    onShare?.invoke()
                    launchApp()
                    dismissCurrentOverlay()
                }

                pillCard.setOnClickListener {
                    onShare?.invoke()
                    launchApp()
                    dismissCurrentOverlay()
                }

                addAndAnimateView(view, pillCard, autoDismissDelay = 10000L)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to show NameDrop overlay: ${e.message}")
            }
        }
    }

    fun showTransferRequestOverlay(
        transferId: String,
        senderName: String,
        fileName: String,
        totalBytes: Long,
        previewImagePath: String? = null,
        onAccept: () -> Unit,
        onDecline: () -> Unit
    ) {
        mainHandler.post {
            dismissCurrentOverlay()
            if (!canDrawOverlays() || isAppInForeground) {
                return@post
            }

            wakeScreenBriefly()
            playNotificationTone()

            try {
                val inflater = LayoutInflater.from(context)
                val view = inflater.inflate(R.layout.view_floating_dynamic_island, null)

                val tvTitle = view.findViewById<TextView>(R.id.tv_title)
                val tvSubtitle = view.findViewById<TextView>(R.id.tv_sender_subtitle)
                val tvStatusBadge = view.findViewById<TextView>(R.id.tv_status_badge)
                val ivDeviceIcon = view.findViewById<ImageView>(R.id.iv_device_icon)
                val btnDecline = view.findViewById<View>(R.id.btn_decline_container)
                val btnChat = view.findViewById<View>(R.id.btn_chat_container)
                val btnAccept = view.findViewById<View>(R.id.btn_accept_container)
                val tvBtnDecline = view.findViewById<TextView>(R.id.tv_btn_decline)
                val tvBtnAccept = view.findViewById<TextView>(R.id.tv_btn_accept)
                val ivPreview = view.findViewById<ImageView>(R.id.iv_preview_thumbnail)
                val previewContainer = view.findViewById<View>(R.id.preview_thumbnail_container)
                val pillCard = view.findViewById<View>(R.id.pill_card_container)
                val progressContainer = view.findViewById<View>(R.id.transfer_progress_container)

                progressContainer.visibility = View.GONE
                btnChat.visibility = View.GONE // For transfer request, only Decline / Accept

                // Use official AuraDrop badge icon instead of generic arcs
                ivDeviceIcon.setImageResource(R.drawable.ic_auradrop_badge)

                tvTitle.text = "AirDrop"
                tvSubtitle.text = "$senderName would like to share \"$fileName\""
                tvStatusBadge.text = "${formatBytes(totalBytes)} • Direct Wi-Fi"
                tvBtnDecline.text = "Decline"
                tvBtnAccept.text = "Accept"

                if (!previewImagePath.isNullOrBlank()) {
                    try {
                        val file = File(previewImagePath)
                        if (file.exists()) {
                            val bmp = BitmapFactory.decodeFile(file.absolutePath)
                            if (bmp != null) {
                                ivPreview.setImageBitmap(bmp)
                                previewContainer.visibility = View.VISIBLE
                            }
                        }
                    } catch (e: Exception) {
                        Log.e(TAG, "Error loading preview image: ${e.message}")
                    }
                }

                btnDecline.setOnClickListener {
                    onDecline()
                    dismissCurrentOverlay()
                }

                btnAccept.setOnClickListener {
                    onAccept()
                    launchApp()
                }

                pillCard.setOnClickListener {
                    launchApp()
                }

                // autoDismissDelay = 0L: Persistent on lock screen and over other apps until user touches Accept or Decline
                addAndAnimateView(view, pillCard, autoDismissDelay = 0L)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to show transfer request overlay: ${e.message}")
            }
        }
    }

    fun showChatMessageOverlay(
        peerId: String,
        senderName: String,
        messageText: String,
        onOpenChat: (() -> Unit)? = null
    ) {
        mainHandler.post {
            dismissCurrentOverlay()
            if (!canDrawOverlays() || isAppInForeground) {
                return@post
            }

            wakeScreenBriefly()
            playNotificationTone()

            try {
                val inflater = LayoutInflater.from(context)
                val view = inflater.inflate(R.layout.view_floating_dynamic_island, null)

                val tvTitle = view.findViewById<TextView>(R.id.tv_title)
                val tvSubtitle = view.findViewById<TextView>(R.id.tv_sender_subtitle)
                val tvStatusBadge = view.findViewById<TextView>(R.id.tv_status_badge)
                val ivDeviceIcon = view.findViewById<ImageView>(R.id.iv_device_icon)
                val btnDecline = view.findViewById<View>(R.id.btn_decline_container)
                val btnChat = view.findViewById<View>(R.id.btn_chat_container)
                val btnAccept = view.findViewById<View>(R.id.btn_accept_container)
                val tvBtnDecline = view.findViewById<TextView>(R.id.tv_btn_decline)
                val tvBtnChat = view.findViewById<TextView>(R.id.tv_btn_chat)
                val tvBtnAccept = view.findViewById<TextView>(R.id.tv_btn_accept)
                val pillCard = view.findViewById<View>(R.id.pill_card_container)
                val progressContainer = view.findViewById<View>(R.id.transfer_progress_container)

                progressContainer.visibility = View.GONE
                btnChat.visibility = View.GONE
                btnAccept.visibility = View.VISIBLE

                ivDeviceIcon.setImageResource(R.drawable.ic_auradrop_badge)
                tvTitle.text = "AuraDrop Message"
                val displayText = if (messageText.startsWith("data:image/") || messageText.startsWith("[FILE_IMAGE]")) "Sent a photo" else messageText
                tvSubtitle.text = "$senderName: $displayText"
                tvStatusBadge.text = "Direct LAN • Chat"

                tvBtnDecline.text = "Dismiss"
                tvBtnAccept.text = "Open Chat"

                btnDecline.setOnClickListener {
                    dismissCurrentOverlay()
                }

                btnAccept.setOnClickListener {
                    onOpenChat?.invoke()
                    launchApp()
                    dismissCurrentOverlay()
                }

                pillCard.setOnClickListener {
                    onOpenChat?.invoke()
                    launchApp()
                    dismissCurrentOverlay()
                }

                addAndAnimateView(view, pillCard, autoDismissDelay = 8000L)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to show chat message overlay: ${e.message}")
            }
        }
    }

    fun showOrUpdateTransferProgress(
        transferId: String,
        fileName: String,
        progressPercent: Int,
        transferredBytes: Long,
        totalBytes: Long,
        speedBytesPerSec: Long,
        isSending: Boolean = false,
        onCancel: (() -> Unit)? = null
    ) {
        mainHandler.post {
            if (!canDrawOverlays() || isAppInForeground) {
                if (isAppInForeground && currentOverlayView != null) {
                    dismissCurrentOverlay()
                }
                return@post
            }

            val view = currentOverlayView
            if (view != null && activeTransferId == transferId) {
                // In-place update of ongoing transfer
                try {
                    val tvTitle = view.findViewById<TextView>(R.id.tv_title)
                    val tvSubtitle = view.findViewById<TextView>(R.id.tv_sender_subtitle)
                    val tvStatusBadge = view.findViewById<TextView>(R.id.tv_status_badge)
                    val pbTransfer = view.findViewById<ProgressBar>(R.id.pb_transfer)
                    val tvStats = view.findViewById<TextView>(R.id.tv_transfer_stats)
                    val tvSpeed = view.findViewById<TextView>(R.id.tv_transfer_speed)
                    val progressContainer = view.findViewById<View>(R.id.transfer_progress_container)
                    val btnChat = view.findViewById<View>(R.id.btn_chat_container)
                    val tvBtnDecline = view.findViewById<TextView>(R.id.tv_btn_decline)
                    val btnAccept = view.findViewById<View>(R.id.btn_accept_container)

                    progressContainer.visibility = View.VISIBLE
                    btnChat.visibility = View.GONE
                    btnAccept.visibility = View.GONE

                    tvTitle.text = if (isSending) "AirDrop Sending..." else "AirDrop Receiving..."
                    tvSubtitle.text = fileName
                    tvStatusBadge.text = "Direct Wi-Fi"

                    pbTransfer.progress = progressPercent.coerceIn(0, 100)
                    tvStats.text = "${formatBytes(transferredBytes)} / ${formatBytes(totalBytes)} • $progressPercent%"
                    val speedMb = speedBytesPerSec / (1024.0 * 1024.0)
                    tvSpeed.text = if (speedMb > 0.05) String.format("⚡ %.1f MB/s", speedMb) else "⚡ Streaming"
                    tvBtnDecline.text = "Cancel"

                    val btnDecline = view.findViewById<View>(R.id.btn_decline_container)
                    btnDecline.setOnClickListener {
                        onCancel?.invoke()
                        dismissCurrentOverlay()
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Error updating overlay progress: ${e.message}")
                }
            } else {
                // New transfer progress overlay
                activeTransferId = transferId
                dismissCurrentOverlay()

                try {
                    val inflater = LayoutInflater.from(context)
                    val newView = inflater.inflate(R.layout.view_floating_dynamic_island, null)

                    val tvTitle = newView.findViewById<TextView>(R.id.tv_title)
                    val tvSubtitle = newView.findViewById<TextView>(R.id.tv_sender_subtitle)
                    val tvStatusBadge = newView.findViewById<TextView>(R.id.tv_status_badge)
                    val ivDeviceIcon = newView.findViewById<ImageView>(R.id.iv_device_icon)
                    val pbTransfer = newView.findViewById<ProgressBar>(R.id.pb_transfer)
                    val tvStats = newView.findViewById<TextView>(R.id.tv_transfer_stats)
                    val tvSpeed = newView.findViewById<TextView>(R.id.tv_transfer_speed)
                    val progressContainer = newView.findViewById<View>(R.id.transfer_progress_container)
                    val btnChat = newView.findViewById<View>(R.id.btn_chat_container)
                    val btnDecline = newView.findViewById<View>(R.id.btn_decline_container)
                    val btnAccept = newView.findViewById<View>(R.id.btn_accept_container)
                    val tvBtnDecline = newView.findViewById<TextView>(R.id.tv_btn_decline)
                    val pillCard = newView.findViewById<View>(R.id.pill_card_container)

                    ivDeviceIcon.setImageResource(R.drawable.ic_auradrop_badge)
                    progressContainer.visibility = View.VISIBLE
                    btnChat.visibility = View.GONE
                    btnAccept.visibility = View.GONE

                    tvTitle.text = if (isSending) "AirDrop Sending..." else "AirDrop Receiving..."
                    tvSubtitle.text = fileName
                    tvStatusBadge.text = "Direct Wi-Fi"

                    pbTransfer.progress = progressPercent.coerceIn(0, 100)
                    tvStats.text = "${formatBytes(transferredBytes)} / ${formatBytes(totalBytes)} • $progressPercent%"
                    val speedMb = speedBytesPerSec / (1024.0 * 1024.0)
                    tvSpeed.text = if (speedMb > 0.05) String.format("⚡ %.1f MB/s", speedMb) else "⚡ Streaming"
                    tvBtnDecline.text = "Cancel"

                    btnDecline.setOnClickListener {
                        onCancel?.invoke()
                        dismissCurrentOverlay()
                    }

                    pillCard.setOnClickListener {
                        launchApp()
                    }

                    addAndAnimateView(newView, pillCard, autoDismissDelay = 120000L)
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to launch transfer progress overlay: ${e.message}")
                }
            }
        }
    }

    fun showVerifyingState(fileName: String, totalBytes: Long) {
        mainHandler.post {
            val view = currentOverlayView ?: return@post
            try {
                val tvTitle = view.findViewById<TextView>(R.id.tv_title)
                val tvSubtitle = view.findViewById<TextView>(R.id.tv_sender_subtitle)
                val tvStatusBadge = view.findViewById<TextView>(R.id.tv_status_badge)
                val pbTransfer = view.findViewById<ProgressBar>(R.id.pb_transfer)
                val tvStats = view.findViewById<TextView>(R.id.tv_transfer_stats)
                val tvSpeed = view.findViewById<TextView>(R.id.tv_transfer_speed)

                tvTitle.text = "Verifying Integrity..."
                tvSubtitle.text = fileName
                tvStatusBadge.text = "SHA-256 Checksum"
                pbTransfer.progress = 99
                tvStats.text = "${formatBytes(totalBytes)} • Validating"
                tvSpeed.text = "⏳ Verifying"
            } catch (e: Exception) {
                Log.e(TAG, "Error updating verifying state in overlay: ${e.message}")
            }
        }
    }

    fun markTransferComplete(fileName: String, totalBytes: Long) {
        mainHandler.post {
            val view = currentOverlayView ?: return@post
            try {
                val tvTitle = view.findViewById<TextView>(R.id.tv_title)
                val tvSubtitle = view.findViewById<TextView>(R.id.tv_sender_subtitle)
                val tvStatusBadge = view.findViewById<TextView>(R.id.tv_status_badge)
                val pbTransfer = view.findViewById<ProgressBar>(R.id.pb_transfer)
                val tvStats = view.findViewById<TextView>(R.id.tv_transfer_stats)
                val tvSpeed = view.findViewById<TextView>(R.id.tv_transfer_speed)
                val btnDecline = view.findViewById<View>(R.id.btn_decline_container)
                val tvBtnDecline = view.findViewById<TextView>(R.id.tv_btn_decline)

                tvTitle.text = "Transfer Complete ✓"
                tvSubtitle.text = fileName
                tvStatusBadge.text = "${formatBytes(totalBytes)} • SHA-256 Verified"
                pbTransfer.progress = 100
                tvStats.text = "100% Completed"
                tvSpeed.text = "✓ Saved"
                tvBtnDecline.text = "Done"

                btnDecline.setOnClickListener {
                    dismissCurrentOverlay()
                }

                mainHandler.postDelayed({
                    dismissCurrentOverlay()
                }, 3500L)
            } catch (e: Exception) {}
        }
    }

    private fun addAndAnimateView(
        rootView: View,
        pillCard: View,
        autoDismissDelay: Long
    ) {
        val layoutType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        } else {
            @Suppress("DEPRECATION")
            WindowManager.LayoutParams.TYPE_PHONE
        }

        // Full 24/7 overlay visibility flags: Home screen, over any app, and on Lock Screen
        var windowFlags = WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
            WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
            WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS

        // Enable display on Lock Screen and turn display on
        @Suppress("DEPRECATION")
        run {
            windowFlags = windowFlags or
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
                WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
        }

        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            layoutType,
            windowFlags,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL
            y = 0
        }

        try {
            windowManager.addView(rootView, params)
            currentOverlayView = rootView
        } catch (e: Exception) {
            Log.e(TAG, "windowManager.addView failed: ${e.message}")
            return
        }

        // Clean drop-down spring entrance: zero background circles or ripples
        pillCard.translationY = -280f
        pillCard.scaleX = 0.90f
        pillCard.scaleY = 0.90f
        pillCard.alpha = 0f

        val pillTransY = ObjectAnimator.ofFloat(pillCard, "translationY", -280f, 0f).apply {
            duration = 550
            interpolator = OvershootInterpolator(1.15f)
        }
        val pillScaleX = ObjectAnimator.ofFloat(pillCard, "scaleX", 0.90f, 1f).apply {
            duration = 550
            interpolator = OvershootInterpolator(1.05f)
        }
        val pillScaleY = ObjectAnimator.ofFloat(pillCard, "scaleY", 0.90f, 1f).apply {
            duration = 550
            interpolator = OvershootInterpolator(1.05f)
        }
        val pillAlpha = ObjectAnimator.ofFloat(pillCard, "alpha", 0f, 1f).apply {
            duration = 350
        }

        AnimatorSet().apply {
            playTogether(pillTransY, pillScaleX, pillScaleY, pillAlpha)
            start()
        }

        // Auto dismiss timer (0L means persistent on screen until touched)
        if (autoDismissDelay > 0L) {
            autoDismissRunnable = Runnable {
                dismissCurrentOverlay()
            }
            mainHandler.postDelayed(autoDismissRunnable!!, autoDismissDelay)
        }
    }

    fun dismissCurrentOverlay() {
        activeTransferId = null
        autoDismissRunnable?.let { mainHandler.removeCallbacks(it) }
        autoDismissRunnable = null

        val v = currentOverlayView ?: return
        currentOverlayView = null

        val pillCard = v.findViewById<View>(R.id.pill_card_container)
        if (pillCard != null) {
            val transY = ObjectAnimator.ofFloat(pillCard, "translationY", 0f, -280f).setDuration(280)
            val alpha = ObjectAnimator.ofFloat(pillCard, "alpha", 1f, 0f).setDuration(220)
            AnimatorSet().apply {
                playTogether(transY, alpha)
                addListener(object : AnimatorListenerAdapter() {
                    override fun onAnimationEnd(animation: Animator) {
                        try {
                            windowManager.removeView(v)
                        } catch (e: Exception) {}
                    }
                })
                start()
            }
        } else {
            try {
                windowManager.removeView(v)
            } catch (e: Exception) {}
        }
    }

    private fun formatBytes(bytes: Long): String {
        if (bytes <= 0) return "0 B"
        val kb = bytes / 1024.0
        val mb = kb / 1024.0
        val gb = mb / 1024.0
        return when {
            gb >= 1.0 -> String.format("%.2f GB", gb)
            mb >= 1.0 -> String.format("%.1f MB", mb)
            kb >= 1.0 -> String.format("%.0f KB", kb)
            else -> "$bytes B"
        }
    }

    private fun launchApp() {
        val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)
        if (launchIntent != null) {
            launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            context.startActivity(launchIntent)
        }
    }
}
