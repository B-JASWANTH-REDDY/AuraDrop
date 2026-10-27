package com.auradrop.auradrop

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.wifi.WifiManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat
import kotlinx.coroutines.*
import org.json.JSONObject
import java.net.*
import java.util.*

/**
 * AuraBackgroundService runs 24/7 in the background as a sticky foreground service.
 * It listens for UDP beacons and broadcasts device presence so that nearby devices
 * (Windows PC, Mac, Android) are instantly detected even when AuraDrop is minimized,
 * closed, or the screen is locked.
 *
 * When a real device is detected and the user is NOT inside the app, it triggers
 * the floating AirDrop Dynamic Island overlay on the Home Screen, Lock Screen,
 * or over other applications.
 */
class AuraBackgroundService : Service() {

    companion object {
        private const val TAG = "AuraBgService"
        const val CHANNEL_ID = "auradrop_background_247"
        const val CHANNEL_NAME = "AuraDrop 24/7 Service"
        const val NOTIFICATION_ID = 4830

        const val ACTION_START = "ACTION_START_247"
        const val ACTION_STOP = "ACTION_STOP_247"

        private const val DISCOVERY_GROUP = "224.0.0.167"
        private const val DISCOVERY_PORT = 53317
        private const val LEGACY_DISCOVERY_GROUP = "239.255.48.29"
        private const val LEGACY_DISCOVERY_PORT = 48290
        private const val DEFAULT_PORT = 53317

        @Volatile
        var isRunning = false
            private set

        private val lastBackgroundOverlayTimes = java.util.concurrent.ConcurrentHashMap<String, Long>()
    }

    private val serviceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var multicastLock: WifiManager.MulticastLock? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private var listenerSocket: MulticastSocket? = null
    private var broadcastSocket: DatagramSocket? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        acquireLocks()
        isRunning = true
        safeStartForeground(NOTIFICATION_ID, buildOngoingNotification())
        Log.d(TAG, "AuraBackgroundService created - 24/7 discovery active")
    }

    private fun safeStartForeground(id: Int, notification: Notification) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                var fgsType = ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                    fgsType = fgsType or ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE
                }
                startForeground(id, notification, fgsType)
            } else {
                startForeground(id, notification)
            }
        } catch (e: Exception) {
            Log.e(TAG, "safeStartForeground failed, falling back: ${e.message}")
            try {
                startForeground(id, notification)
            } catch (ignored: Exception) {
                Log.e(TAG, "Fatal fallback startForeground failed: ${ignored.message}")
            }
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                Log.d(TAG, "Stopping AuraBackgroundService")
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
                return START_NOT_STICKY
            }
            else -> {
                val notification = buildOngoingNotification()
                safeStartForeground(NOTIFICATION_ID, notification)
                startBackgroundDiscoveryLoops()
            }
        }
        return START_STICKY
    }

    private fun acquireLocks() {
        try {
            val wifi = applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
            multicastLock = wifi?.createMulticastLock("AuraDropBackgroundMulticast")?.apply {
                setReferenceCounted(true)
                acquire()
            }
        } catch (e: Exception) {
            Log.w(TAG, "Could not acquire multicast lock: ${e.message}")
        }

        try {
            val power = applicationContext.getSystemService(Context.POWER_SERVICE) as? PowerManager
            wakeLock = power?.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "auradrop:bg_wakelock")?.apply {
                acquire(10 * 60 * 1000L) // 10 minutes sliding lock
            }
        } catch (e: Exception) {
            Log.w(TAG, "Could not acquire wake lock: ${e.message}")
        }
    }

    private fun startBackgroundDiscoveryLoops() {
        serviceScope.launch {
            launch { runUdpListenerLoop() }
            launch { runUdpBroadcasterLoop() }
            launch { runPeerPrunerLoop() }
        }
    }

    private suspend fun runUdpListenerLoop() = withContext(Dispatchers.IO) {
        var socket: MulticastSocket? = null
        try {
            socket = MulticastSocket(DISCOVERY_PORT).apply {
                reuseAddress = true
                try { joinGroup(InetAddress.getByName(DISCOVERY_GROUP)) } catch (_: Exception) {}
                try { joinGroup(InetAddress.getByName(LEGACY_DISCOVERY_GROUP)) } catch (_: Exception) {}
            }
            listenerSocket = socket
            val buffer = ByteArray(4096)

            val prefs = getSharedPreferences("auradrop_identity", Context.MODE_PRIVATE)
            val myDeviceId = prefs.getString("device_id", "") ?: ""

            while (isActive) {
                val packet = DatagramPacket(buffer, buffer.size)
                socket.receive(packet)
                val raw = String(packet.data, 0, packet.length, Charsets.UTF_8)
                try {
                    val json = JSONObject(raw)
                    val proto = json.optString("protocol")
                    if (proto != "AURADROP/1" && proto != "P2PFS/1" && proto != "AURADROP_LOCAL_V1") continue

                    val remoteDeviceId = json.optString("deviceId")
                    val remoteIp = packet.address.hostAddress ?: ""
                    val localIp = getLocalIpAddress()

                    if (remoteDeviceId.isNotEmpty() && remoteDeviceId != myDeviceId && remoteIp != localIp && !packet.address.isLoopbackAddress) {
                        val peerName = json.optString("name", "Unknown Device")
                        val peerDevName = json.optString("deviceName", peerName)
                        val resolvedName = if (peerName.isNotBlank() && peerName != "AuraDrop User") peerName else peerDevName
                        val transferPort = json.optInt("transferPort", json.optInt("port", DEFAULT_PORT))

                        val peer = PeerInfo(
                            deviceId = remoteDeviceId,
                            displayName = resolvedName,
                            deviceName = peerDevName,
                            platform = json.optString("platform", "android"),
                            ip = remoteIp,
                            port = transferPort,
                            avatarIndex = json.optInt("avatarIndex", 0),
                            avatarPath = json.optString("avatarPath", ""),
                            status = json.optString("status", ""),
                            transport = "LAN",
                            connectionState = "DISCOVERED",
                            lastSeen = System.currentTimeMillis()
                        )

                        val isNew = PeerRegistry.updateOrAdd(peer)

                        // Notify active Flutter activity if foregrounded
                        MainActivity.activeInstance?.runOnUiThread {
                            MainActivity.activeInstance?.sendEventFromBackground("peerDiscovered", mapOf("peer" to peer.toMap()))
                        }

                        // STRICT RULE: Overlay appears ONLY when user is OUTSIDE the AuraDrop app (Home Screen, Lock Screen, other apps)
                        val overlayMgr = AuraOverlayManager.getInstance(applicationContext)
                        val nowMs = System.currentTimeMillis()
                        val lastShown = lastBackgroundOverlayTimes[peer.deviceId] ?: 0L
                        val shouldShowOverlay = !overlayMgr.isAppInForeground && (isNew || (nowMs - lastShown > 25000L))

                        if (shouldShowOverlay) {
                            lastBackgroundOverlayTimes[peer.deviceId] = nowMs
                            Log.d(TAG, "Real nearby device detected outside app: ${peer.displayName} (${peer.ip}). Launching floating island!")
                            overlayMgr.showNameDropOverlay(
                                peerId = peer.deviceId,
                                peerName = peer.displayName,
                                deviceName = peer.deviceName,
                                platform = peer.platform,
                                ip = peer.ip,
                                avatarPath = peer.avatarPath,
                                onShare = {
                                    MainActivity.activeInstance?.sendEventFromBackground("peerSelected", mapOf("peerId" to peer.deviceId))
                                },
                                onChat = {
                                    MainActivity.activeInstance?.sendEventFromBackground("openChatWithPeer", mapOf("peerId" to peer.deviceId))
                                }
                            )
                        }
                    }
                } catch (_: Exception) {}
            }
        } catch (e: Exception) {
            Log.w(TAG, "Background UDP listener error: ${e.message}")
        } finally {
            socket?.close()
        }
    }

    private suspend fun runUdpBroadcasterLoop() = withContext(Dispatchers.IO) {
        val group = InetAddress.getByName(DISCOVERY_GROUP)
        val legacyGroup = InetAddress.getByName(LEGACY_DISCOVERY_GROUP)
        val broadcastAddr = InetAddress.getByName("255.255.255.255")
        var socket: DatagramSocket? = null

        val prefs = getSharedPreferences("auradrop_identity", Context.MODE_PRIVATE)
        var storedId = prefs.getString("device_id", null)
        if (storedId.isNullOrBlank()) {
            storedId = "android_" + UUID.randomUUID().toString().replace("-", "").substring(0, 10)
            prefs.edit().putString("device_id", storedId).apply()
        }
        val myDeviceId = storedId

        val dbHelper = AuraDropDatabaseHelper(this@AuraBackgroundService)

        try {
            socket = DatagramSocket()
            broadcastSocket = socket
            while (isActive) {
                try {
                    val prof = dbHelper.getProfile()
                    val savedName = prof["display_name"]
                    val sysDev = "${Build.MANUFACTURER.replaceFirstChar { it.uppercase() }} ${Build.MODEL}"
                    val resolvedDisplayName = if (!savedName.isNullOrBlank() && savedName != "AuraDrop User") savedName else sysDev

                    val beacon = JSONObject().apply {
                        put("type", "AURADROP_BEACON")
                        put("protocol", "AURADROP/1")
                        put("deviceId", myDeviceId)
                        put("name", resolvedDisplayName)
                        put("deviceName", sysDev)
                        put("platform", "android")
                        put("port", DEFAULT_PORT)
                        put("transferPort", DEFAULT_PORT)
                        put("avatarIndex", prof["avatar_index"]?.toIntOrNull() ?: 0)
                        put("avatarPath", prof["avatar_path"] ?: "")
                        put("status", prof["bio"] ?: "24/7 Instant AirDrop ready")
                        put("timestamp", System.currentTimeMillis())
                    }
                    val bytes = beacon.toString().toByteArray(Charsets.UTF_8)

                    // Multicast & global broadcast
                    socket.send(DatagramPacket(bytes, bytes.size, group, DISCOVERY_PORT))
                    socket.send(DatagramPacket(bytes, bytes.size, broadcastAddr, DISCOVERY_PORT))

                    val directed = getDirectedBroadcastAddress()
                    if (directed != null) {
                        socket.send(DatagramPacket(bytes, bytes.size, directed, DISCOVERY_PORT))
                    }

                    socket.send(DatagramPacket(bytes, bytes.size, legacyGroup, LEGACY_DISCOVERY_PORT))
                    socket.send(DatagramPacket(bytes, bytes.size, broadcastAddr, LEGACY_DISCOVERY_PORT))
                } catch (_: Exception) {}

                // Broadcast every 3 seconds in background to maintain active visibility across all devices
                delay(3000)
            }
        } catch (e: Exception) {
            Log.w(TAG, "Background UDP broadcaster error: ${e.message}")
        } finally {
            socket?.close()
        }
    }

    private suspend fun runPeerPrunerLoop() = withContext(Dispatchers.IO) {
        while (isActive) {
            delay(5000)
            val expired = PeerRegistry.pruneExpired(12000L)
            if (expired.isNotEmpty()) {
                MainActivity.activeInstance?.runOnUiThread {
                    expired.forEach { p ->
                        MainActivity.activeInstance?.sendEventFromBackground("peerLost", mapOf("peerId" to p.deviceId))
                    }
                }
            }
        }
    }

    private fun getLocalIpAddress(): String {
        try {
            val interfaces = NetworkInterface.getNetworkInterfaces()
            while (interfaces.hasMoreElements()) {
                val iface = interfaces.nextElement()
                if (iface.isLoopback || !iface.isUp) continue
                val addresses = iface.inetAddresses
                while (addresses.hasMoreElements()) {
                    val addr = addresses.nextElement()
                    if (addr is Inet4Address && !addr.isLoopbackAddress) {
                        return addr.hostAddress ?: ""
                    }
                }
            }
        } catch (_: Exception) {}
        return ""
    }

    private fun getDirectedBroadcastAddress(): InetAddress? {
        try {
            val interfaces = NetworkInterface.getNetworkInterfaces()
            while (interfaces.hasMoreElements()) {
                val iface = interfaces.nextElement()
                if (iface.isLoopback || !iface.isUp) continue
                for (addr in iface.interfaceAddresses) {
                    val bcast = addr.broadcast
                    if (bcast != null && bcast is Inet4Address) {
                        return bcast
                    }
                }
            }
        } catch (_: Exception) {}
        return null
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Keeps AuraDrop ready 24/7 for instant proximity detection and background sharing"
                setShowBadge(false)
            }
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.createNotificationChannel(channel)
        }
    }

    private fun buildOngoingNotification(): Notification {
        val appIntent = packageManager.getLaunchIntentForPackage(packageName)
        val pendingIntent = if (appIntent != null) {
            PendingIntent.getActivity(this, 0, appIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        } else null

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("AuraDrop 24/7 Active")
            .setContentText("Listening for nearby devices • Instant AirDrop ready")
            .setSmallIcon(R.drawable.ic_auradrop_badge)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .setContentIntent(pendingIntent)
            .build()
    }

    override fun onDestroy() {
        isRunning = false
        serviceScope.cancel()
        try { listenerSocket?.close() } catch (_: Exception) {}
        try { broadcastSocket?.close() } catch (_: Exception) {}
        try {
            if (multicastLock?.isHeld == true) multicastLock?.release()
        } catch (_: Exception) {}
        try {
            if (wakeLock?.isHeld == true) wakeLock?.release()
        } catch (_: Exception) {}
        Log.d(TAG, "AuraBackgroundService destroyed")
        super.onDestroy()
    }
}
