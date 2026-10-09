package com.auradrop.auradrop

import android.util.Log
import org.json.JSONObject

interface AuraQuicProgressCallback {
    fun onProgress(bytesTransferred: Long, totalBytes: Long, speedMbps: Double): Boolean
}

interface AuraQuicIncomingListener {
    fun onIncomingProgress(transferId: String, fileName: String, bytesTransferred: Long, totalBytes: Long, speedMbps: Double): Boolean
    fun onIncomingComplete(transferId: String, fileName: String, filePath: String, totalBytes: Long)
}

object AuraQuicNative {
    private const val TAG = "AuraQuicNative"
    private var isLibraryLoaded = false

    var quicPort: Int = 0
        private set
    var certFingerprint: String? = null
        private set

    init {
        try {
            System.loadLibrary("auradrop_quic")
            isLibraryLoaded = true
            Log.i(TAG, "Successfully loaded libauradrop_quic.so")
        } catch (e: UnsatisfiedLinkError) {
            Log.e(TAG, "Failed to load libauradrop_quic.so: ${e.message}")
            isLibraryLoaded = false
        } catch (e: Throwable) {
            Log.e(TAG, "Unexpected error loading native QUIC library: ${e.message}")
            isLibraryLoaded = false
        }
    }

    fun isAvailable(): Boolean = isLibraryLoaded

    @JvmStatic
    private external fun initQuicServer(deviceId: String, port: Int): String?

    @JvmStatic
    private external fun setIncomingListener(callback: Any?)

    @JvmStatic
    private external fun approveTransfer(
        transferId: String,
        token: String,
        fileName: String,
        fileSize: Long,
        expectedSha256: String,
        destinationPath: String
    ): Boolean

    @JvmStatic
    private external fun sendFileQuic(
        targetIp: String,
        targetPort: Int,
        certFingerprint: String,
        filePath: String,
        transferId: String,
        token: String,
        fileName: String,
        fileSize: Long,
        expectedSha256: String,
        callback: Any?
    ): Boolean

    @JvmStatic
    private external fun cancelTransfer(transferId: String)

    @JvmStatic
    private external fun stopQuicServer()

    fun registerIncomingListener(listener: AuraQuicIncomingListener?) {
        if (!isLibraryLoaded) return
        try {
            setIncomingListener(listener)
        } catch (e: Throwable) {
            Log.e(TAG, "Error registering incoming listener: ${e.message}")
        }
    }

    @Synchronized
    fun startServer(deviceId: String, requestedPort: Int = 53318): Boolean {
        if (!isLibraryLoaded) {
            Log.w(TAG, "QUIC native library not loaded; skipping QUIC server start")
            return false
        }

        return try {
            val jsonResult = initQuicServer(deviceId, requestedPort)
            if (jsonResult != null) {
                val json = JSONObject(jsonResult)
                quicPort = json.getInt("port")
                certFingerprint = json.getString("certFingerprint")
                Log.i(TAG, "QUIC Server initialized on UDP port $quicPort, cert FP: $certFingerprint")
                true
            } else {
                Log.e(TAG, "initQuicServer returned null")
                false
            }
        } catch (e: Throwable) {
            Log.e(TAG, "Error starting QUIC server: ${e.message}", e)
            false
        }
    }

    fun approveIncomingTransfer(
        transferId: String,
        token: String,
        fileName: String,
        fileSize: Long,
        expectedSha256: String,
        destinationPath: String
    ): Boolean {
        if (!isLibraryLoaded || quicPort <= 0) return false
        return try {
            approveTransfer(transferId, token, fileName, fileSize, expectedSha256, destinationPath)
        } catch (e: Throwable) {
            Log.e(TAG, "Error approving QUIC transfer: ${e.message}", e)
            false
        }
    }

    fun sendFile(
        targetIp: String,
        targetPort: Int,
        certFingerprint: String,
        filePath: String,
        transferId: String,
        token: String,
        fileName: String,
        fileSize: Long,
        expectedSha256: String,
        callback: AuraQuicProgressCallback? = null
    ): Boolean {
        if (!isLibraryLoaded) {
            Log.w(TAG, "Native QUIC library not loaded, cannot send via QUIC")
            return false
        }

        return try {
            Log.i(TAG, "Initiating QUIC send to $targetIp:$targetPort for $fileName ($fileSize bytes)")
            sendFileQuic(
                targetIp,
                targetPort,
                certFingerprint,
                filePath,
                transferId,
                token,
                fileName,
                fileSize,
                expectedSha256,
                callback
            )
        } catch (e: Throwable) {
            Log.e(TAG, "QUIC sendFile threw exception: ${e.message}", e)
            false
        }
    }

    fun cancel(transferId: String) {
        if (!isLibraryLoaded) return
        try {
            cancelTransfer(transferId)
        } catch (e: Throwable) {
            Log.e(TAG, "Error cancelling QUIC transfer: ${e.message}")
        }
    }

    fun shutdown() {
        if (!isLibraryLoaded) return
        try {
            stopQuicServer()
            quicPort = 0
            certFingerprint = null
        } catch (e: Throwable) {
            Log.e(TAG, "Error stopping QUIC server: ${e.message}")
        }
    }
}
