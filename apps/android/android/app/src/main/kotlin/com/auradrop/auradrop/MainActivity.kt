package com.auradrop.auradrop

import android.Manifest
import android.app.Activity
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.ActivityNotFoundException
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.MediaScannerConnection
import android.provider.MediaStore
import android.net.Uri
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.provider.OpenableColumns
import android.provider.Settings
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Log
import android.webkit.MimeTypeMap
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import android.view.WindowManager
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.EventChannel
import io.flutter.plugin.common.MethodChannel
import kotlinx.coroutines.*
import org.json.JSONArray
import org.json.JSONObject
import java.io.*
import java.math.BigInteger
import java.net.*
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.security.*
import java.security.interfaces.ECPublicKey
import java.security.spec.*
import java.util.*
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean
import javax.crypto.Cipher
import javax.crypto.KeyAgreement
import javax.crypto.KeyGenerator
import javax.crypto.Mac
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

fun String.decodeHex(): ByteArray {
    check(length % 2 == 0) { "Must have an even length" }
    val bytes = ByteArray(length / 2)
    for (i in 0 until length step 2) {
        bytes[i / 2] = substring(i, i + 2).toInt(16).toByte()
    }
    return bytes
}

fun ByteArray.toHex(): String {
    val result = StringBuilder(size * 2)
    for (b in this) {
        result.append(String.format("%02x", b))
    }
    return result.toString()
}

object AuraAeadCrypto {
    fun generateEphemeralKeyPair(): KeyPair {
        val kpg = KeyPairGenerator.getInstance("EC")
        kpg.initialize(ECGenParameterSpec("secp256r1"))
        return kpg.generateKeyPair()
    }

    fun exportSec1PublicKey(pubKey: ECPublicKey): ByteArray {
        val x = pubKey.w.affineX.toByteArray()
        val y = pubKey.w.affineY.toByteArray()
        val sec1 = ByteArray(65)
        sec1[0] = 0x04.toByte()

        val xLen = Math.min(32, x.size)
        val xSrc = Math.max(0, x.size - 32)
        System.arraycopy(x, xSrc, sec1, 1 + (32 - xLen), xLen)

        val yLen = Math.min(32, y.size)
        val ySrc = Math.max(0, y.size - 32)
        System.arraycopy(y, ySrc, sec1, 33 + (32 - yLen), yLen)
        return sec1
    }

    fun importSec1PublicKey(sec1: ByteArray): PublicKey {
        require(sec1.size == 65 && sec1[0] == 0x04.toByte()) { "Invalid SEC1 P-256 public key" }
        val xBytes = sec1.copyOfRange(1, 33)
        val yBytes = sec1.copyOfRange(33, 65)
        val point = ECPoint(BigInteger(1, xBytes), BigInteger(1, yBytes))

        val kpg = KeyPairGenerator.getInstance("EC")
        kpg.initialize(ECGenParameterSpec("secp256r1"))
        val ecSpec = (kpg.generateKeyPair().public as ECPublicKey).params

        val pubSpec = ECPublicKeySpec(point, ecSpec)
        return KeyFactory.getInstance("EC").generatePublic(pubSpec)
    }

    fun agreeEphemeral(privateKey: PrivateKey, peerPublicKey: PublicKey): ByteArray {
        val ka = KeyAgreement.getInstance("ECDH")
        ka.init(privateKey)
        ka.doPhase(peerPublicKey, true)
        return ka.generateSecret()
    }

    fun deriveDirectionalSessionKeys(
        sharedSecret: ByteArray,
        transferId: String,
        token: String,
        senderId: String,
        receiverId: String,
        senderIdentityPubHex: String = "",
        receiverIdentityPubHex: String = ""
    ): ByteArray {
        val normalizedSecret = if (sharedSecret.size == 32) {
            sharedSecret
        } else if (sharedSecret.size > 32) {
            sharedSecret.copyOfRange(sharedSecret.size - 32, sharedSecret.size)
        } else {
            val padded = ByteArray(32)
            System.arraycopy(sharedSecret, 0, padded, 32 - sharedSecret.size, sharedSecret.size)
            padded
        }

        val mac = Mac.getInstance("HmacSHA256")
        val saltBytes = "$transferId:$token".toByteArray(Charsets.UTF_8)
        mac.init(SecretKeySpec(saltBytes, "HmacSHA256"))
        val prk = mac.doFinal(normalizedSecret)

        val prkKey = SecretKeySpec(prk, "HmacSHA256")
        mac.init(prkKey)
        val s2rInfo = "auradrop/tcp/aead/v3/sender-to-receiver:$senderId:$receiverId:$senderIdentityPubHex:$receiverIdentityPubHex".toByteArray(Charsets.UTF_8)
        mac.update(s2rInfo)
        mac.update(0x01.toByte())
        val okm = mac.doFinal()
        return okm.copyOf(32)
    }

    fun deriveSessionKey(token: String, transferId: String, senderId: String, receiverId: String): ByteArray {
        val mac = Mac.getInstance("HmacSHA256")
        val saltKey = SecretKeySpec(transferId.toByteArray(Charsets.UTF_8), "HmacSHA256")
        mac.init(saltKey)
        val prk = mac.doFinal(token.toByteArray(Charsets.UTF_8))

        val prkKey = SecretKeySpec(prk, "HmacSHA256")
        mac.init(prkKey)
        val infoStr = "auradrop/tcp/aead/v1:$senderId:$receiverId"
        mac.update(infoStr.toByteArray(Charsets.UTF_8))
        mac.update(0x01.toByte())
        val okm = mac.doFinal()
        return okm.copyOf(32)
    }

    fun createChunkNonce(saltPrefix: Int, chunkIndex: Long): ByteArray {
        val nonce = ByteArray(12)
        val bb = ByteBuffer.wrap(nonce)
        bb.putInt(saltPrefix)
        bb.putLong(chunkIndex)
        return nonce
    }

    fun encryptChunk(keyBytes: ByteArray, nonce: ByteArray, aad: ByteArray, plaintext: ByteArray, offset: Int, length: Int): ByteArray {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        val spec = GCMParameterSpec(128, nonce)
        val key = SecretKeySpec(keyBytes, "AES")
        cipher.init(Cipher.ENCRYPT_MODE, key, spec)
        cipher.updateAAD(aad)
        return cipher.doFinal(plaintext, offset, length)
    }

    fun decryptChunk(keyBytes: ByteArray, nonce: ByteArray, aad: ByteArray, ciphertextAndTag: ByteArray): ByteArray {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        val spec = GCMParameterSpec(128, nonce)
        val key = SecretKeySpec(keyBytes, "AES")
        cipher.init(Cipher.DECRYPT_MODE, key, spec)
        cipher.updateAAD(aad)
        return cipher.doFinal(ciphertextAndTag)
    }

    const val SAS_PROTOCOL_VERSION = "auradrop/tcp/2"
    const val SAS_SECURITY_PARAMS = "cipher=aead-aes256-gcm:kdf=hkdf-sha256:framing=v2"

    fun computeCanonicalSasTranscript(
        protocolVersion: String,
        transferId: String,
        senderId: String,
        receiverId: String,
        senderIdentityPubHex: String,
        receiverIdentityPubHex: String,
        senderEphPubHex: String,
        receiverEphPubHex: String,
        securityParams: String
    ): ByteArray {
        val transcript = ByteArrayOutputStream(512)
        transcript.write("auradrop/sas/v2\u0000".toByteArray(Charsets.UTF_8))

        val fields = listOf(
            protocolVersion,
            transferId,
            senderId,
            receiverId,
            senderIdentityPubHex.lowercase(),
            receiverIdentityPubHex.lowercase(),
            senderEphPubHex.lowercase(),
            receiverEphPubHex.lowercase(),
            securityParams
        )

        for (field in fields) {
            val bytes = field.toByteArray(Charsets.UTF_8)
            val lenBuf = ByteBuffer.allocate(4).order(ByteOrder.BIG_ENDIAN).putInt(bytes.size)
            transcript.write(lenBuf.array())
            transcript.write(bytes)
        }
        return transcript.toByteArray()
    }

    fun computeSasCodeFull(
        sharedSecret: ByteArray,
        protocolVersion: String,
        transferId: String,
        senderId: String,
        receiverId: String,
        senderIdentityPubHex: String,
        receiverIdentityPubHex: String,
        senderEphPubHex: String,
        receiverEphPubHex: String,
        securityParams: String
    ): String {
        val normalizedSecret = if (sharedSecret.size == 32) {
            sharedSecret
        } else if (sharedSecret.size > 32) {
            sharedSecret.copyOfRange(sharedSecret.size - 32, sharedSecret.size)
        } else {
            val padded = ByteArray(32)
            System.arraycopy(sharedSecret, 0, padded, 32 - sharedSecret.size, sharedSecret.size)
            padded
        }

        val transcript = computeCanonicalSasTranscript(
            protocolVersion,
            transferId,
            senderId,
            receiverId,
            senderIdentityPubHex,
            receiverIdentityPubHex,
            senderEphPubHex,
            receiverEphPubHex,
            securityParams
        )
        val transcriptHash = MessageDigest.getInstance("SHA-256").digest(transcript)

        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(transcriptHash, "HmacSHA256"))
        val prk = mac.doFinal(normalizedSecret)

        val prkKey = SecretKeySpec(prk, "HmacSHA256")
        mac.init(prkKey)
        mac.update("auradrop/sas/v2:numeric-sas".toByteArray(Charsets.UTF_8))
        mac.update(0x01.toByte())
        val okm = mac.doFinal()

        val bb = ByteBuffer.wrap(okm).order(ByteOrder.BIG_ENDIAN)
        val numRaw = bb.getInt().toLong() and 0xFFFFFFFFL
        val num = (numRaw % 1_000_000L).toInt()
        return String.format("%03d %03d", num / 1000, num % 1000)
    }

    fun computeSasCode(
        sharedSecret: ByteArray,
        transferId: String,
        senderId: String,
        receiverId: String,
        senderIdentityPubHex: String,
        receiverIdentityPubHex: String,
        senderEphPubHex: String,
        receiverEphPubHex: String
    ): String {
        return computeSasCodeFull(
            sharedSecret,
            SAS_PROTOCOL_VERSION,
            transferId,
            senderId,
            receiverId,
            senderIdentityPubHex,
            receiverIdentityPubHex,
            senderEphPubHex,
            receiverEphPubHex,
            SAS_SECURITY_PARAMS
        )
    }

    fun verifyDeterministicTestVector(): Boolean {
        val sharedSecret = ByteArray(32) { 0x42.toByte() }
        val protocolVersion = "auradrop/tcp/2"
        val transferId = "test-transfer-id-12345"
        val senderId = "alice-device-id"
        val receiverId = "bob-device-id"
        val senderIdentity = "0411111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111"
        val receiverIdentity = "0422222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222"
        val senderEph = "0433333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333"
        val receiverEph = "0444444444444444444444444444444444444444444444444444444444444444444444444444444444444444444444444444444444444444444444444444444444"
        val securityParams = "cipher=aead-aes256-gcm:kdf=hkdf-sha256:framing=v2"

        val sas = computeSasCodeFull(
            sharedSecret,
            protocolVersion,
            transferId,
            senderId,
            receiverId,
            senderIdentity,
            receiverIdentity,
            senderEph,
            receiverEph,
            securityParams
        )
        val expected = "365 027"
        val matches = sas == expected
        Log.i("AuraAeadCrypto", "[TEST VECTOR] Derived SAS: $sas (Expected: $expected, Matches: $matches)")
        return matches
    }
}

object AuraIdentityManager {
    private var keyPair: KeyPair? = null
    private var publicSec1Hex: String = ""

    fun initialize(context: Context) {
        if (keyPair != null) return

        // 1. Attempt hardware-backed / OS-backed Android Keystore
        try {
            val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
            val alias = "auradrop_device_identity_p256"
            if (keyStore.containsAlias(alias)) {
                val entry = keyStore.getEntry(alias, null) as? KeyStore.PrivateKeyEntry
                if (entry != null && entry.certificate?.publicKey is ECPublicKey) {
                    val pub = entry.certificate.publicKey as ECPublicKey
                    keyPair = KeyPair(pub, entry.privateKey)
                    publicSec1Hex = AuraAeadCrypto.exportSec1PublicKey(pub).toHex()
                    Log.i("AuraIdentity", "Loaded persistent identity from Android KeyStore: $publicSec1Hex")
                    return
                }
            } else {
                val kpg = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, "AndroidKeyStore")
                val spec = KeyGenParameterSpec.Builder(
                    alias,
                    KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY
                )
                    .setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1"))
                    .setDigests(KeyProperties.DIGEST_SHA256)
                    .build()
                kpg.initialize(spec)
                val kp = kpg.generateKeyPair()
                keyPair = kp
                publicSec1Hex = AuraAeadCrypto.exportSec1PublicKey(kp.public as ECPublicKey).toHex()
                Log.i("AuraIdentity", "Generated fresh persistent identity in Android KeyStore: $publicSec1Hex")
                return
            }
        } catch (e: Exception) {
            Log.w("AuraIdentity", "Android KeyStore EC unavailable: ${e.message}, attempting secure MasterKey fallback")
        }

        // 2. Hardware/OS-backed encrypted fallback using AndroidKeyStore AES master key
        // Guarantees that NO fallback ever stores an unprotected identity secret on disk!
        try {
            val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
            val masterAlias = "auradrop_identity_master_key"
            if (!keyStore.containsAlias(masterAlias)) {
                val kg = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
                val spec = KeyGenParameterSpec.Builder(
                    masterAlias,
                    KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
                )
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setKeySize(256)
                    .build()
                kg.init(spec)
                kg.generateKey()
            }
            val masterKey = keyStore.getKey(masterAlias, null) as SecretKey
            val prefs = context.getSharedPreferences("auradrop_crypto_identity", Context.MODE_PRIVATE)

            val legacyPlainHex = prefs.getString("identity_private_key_pkcs8", null)
            val encPrivHex = prefs.getString("identity_private_key_encrypted_hex", null)
            val ivHex = prefs.getString("identity_private_key_iv_hex", null)
            val pubHex = prefs.getString("identity_public_key_sec1", null)

            if (!encPrivHex.isNullOrEmpty() && !ivHex.isNullOrEmpty() && !pubHex.isNullOrEmpty()) {
                val cipher = Cipher.getInstance("AES/GCM/NoPadding")
                cipher.init(Cipher.DECRYPT_MODE, masterKey, GCMParameterSpec(128, ivHex.decodeHex()))
                val privBytes = cipher.doFinal(encPrivHex.decodeHex())
                val kf = KeyFactory.getInstance("EC")
                val privKey = kf.generatePrivate(java.security.spec.PKCS8EncodedKeySpec(privBytes))
                val pubKey = AuraAeadCrypto.importSec1PublicKey(pubHex.decodeHex())
                keyPair = KeyPair(pubKey, privKey)
                publicSec1Hex = pubHex
                if (legacyPlainHex != null) {
                    prefs.edit().remove("identity_private_key_pkcs8").apply()
                }
                return
            } else if (!legacyPlainHex.isNullOrEmpty() && !pubHex.isNullOrEmpty()) {
                // Migrate legacy plaintext to OS-encrypted storage and delete plaintext
                val privBytes = legacyPlainHex.decodeHex()
                val cipher = Cipher.getInstance("AES/GCM/NoPadding")
                cipher.init(Cipher.ENCRYPT_MODE, masterKey)
                val iv = cipher.iv
                val encryptedBytes = cipher.doFinal(privBytes)
                prefs.edit()
                    .putString("identity_private_key_encrypted_hex", encryptedBytes.toHex())
                    .putString("identity_private_key_iv_hex", iv.toHex())
                    .remove("identity_private_key_pkcs8") // Scrub plaintext!
                    .apply()
                val kf = KeyFactory.getInstance("EC")
                val privKey = kf.generatePrivate(java.security.spec.PKCS8EncodedKeySpec(privBytes))
                val pubKey = AuraAeadCrypto.importSec1PublicKey(pubHex.decodeHex())
                keyPair = KeyPair(pubKey, privKey)
                publicSec1Hex = pubHex
                return
            } else {
                // Generate fresh key and store ONLY encrypted with Android KeyStore master key
                val kpg = KeyPairGenerator.getInstance("EC")
                kpg.initialize(ECGenParameterSpec("secp256r1"))
                val kp = kpg.generateKeyPair()
                val sec1Hex = AuraAeadCrypto.exportSec1PublicKey(kp.public as ECPublicKey).toHex()
                val privBytes = kp.private.encoded

                val cipher = Cipher.getInstance("AES/GCM/NoPadding")
                cipher.init(Cipher.ENCRYPT_MODE, masterKey)
                val iv = cipher.iv
                val encryptedBytes = cipher.doFinal(privBytes)

                prefs.edit()
                    .putString("identity_private_key_encrypted_hex", encryptedBytes.toHex())
                    .putString("identity_private_key_iv_hex", iv.toHex())
                    .putString("identity_public_key_sec1", sec1Hex)
                    .remove("identity_private_key_pkcs8") // Scrub plaintext!
                    .apply()

                keyPair = kp
                publicSec1Hex = sec1Hex
                return
            }
        } catch (e: Exception) {
            Log.e("AuraIdentity", "Android KeyStore encrypted identity setup failed: ${e.message}")
        }
    }

    fun getPublicKeyHex(): String = publicSec1Hex

    fun sign(data: ByteArray): String {
        val kp = checkNotNull(keyPair) { "IdentityManager not initialized" }
        val sig = Signature.getInstance("SHA256withECDSA")
        sig.initSign(kp.private)
        sig.update(data)
        return sig.sign().toHex()
    }

    fun checkPeerTrustStatus(
        context: Context,
        peerId: String,
        peerPubHex: String
    ): Boolean? {
        if (peerId.isBlank() || peerPubHex.isBlank()) return null
        val prefs = context.getSharedPreferences("auradrop_trusted_peers", Context.MODE_PRIVATE)
        val trustedPub = prefs.getString(peerId, null)
        if (trustedPub != null) {
            if (trustedPub != peerPubHex) {
                Log.e("AuraIdentity", "Cryptographic identity mismatch! Peer $peerId presented $peerPubHex but previously trusted as $trustedPub")
                return null // Mismatch / Attack
            }
            return false // Already trusted, frictionless
        }
        return true // First contact, SAS display required
    }

    fun markPeerTrusted(
        context: Context,
        peerId: String,
        peerPubHex: String
    ) {
        val prefs = context.getSharedPreferences("auradrop_trusted_peers", Context.MODE_PRIVATE)
        prefs.edit().putString(peerId, peerPubHex).apply()
        Log.i("AuraIdentity", "Marked peer $peerId trusted with public key $peerPubHex")
    }

    fun isPeerTrusted(context: Context, peerId: String): Boolean {
        if (peerId.isBlank()) return false
        val prefs = context.getSharedPreferences("auradrop_trusted_peers", Context.MODE_PRIVATE)
        return prefs.contains(peerId)
    }

    fun verifyPeerHandshake(
        context: Context,
        peerId: String,
        peerPubHex: String,
        data: ByteArray,
        sigHex: String
    ): Boolean? {
        val trustStatus = checkPeerTrustStatus(context, peerId, peerPubHex) ?: return null
        return try {
            val peerPub = AuraAeadCrypto.importSec1PublicKey(peerPubHex.decodeHex())
            val sig = Signature.getInstance("SHA256withECDSA")
            sig.initVerify(peerPub)
            sig.update(data)
            if (sig.verify(sigHex.decodeHex())) {
                trustStatus
            } else {
                null
            }
        } catch (e: Exception) {
            Log.e("AuraIdentity", "Signature verification failed: ${e.message}")
            null
        }
    }

    fun verifyAndTrustPeer(
        context: Context,
        peerId: String,
        peerPubHex: String,
        data: ByteArray,
        sigHex: String
    ): Boolean {
        val isFirst = verifyPeerHandshake(context, peerId, peerPubHex, data, sigHex) ?: return false
        if (isFirst) {
            markPeerTrusted(context, peerId, peerPubHex)
        }
        return true
    }
}

data class PeerInfo(
    val deviceId: String,
    val displayName: String,
    val deviceName: String,
    val platform: String = "android",
    val ip: String,
    val port: Int,
    val avatarIndex: Int = 0,
    val avatarPath: String = "",
    val status: String = "",
    val transport: String = "LAN",
    var connectionState: String = "DISCOVERED",
    var lastSeen: Long = System.currentTimeMillis()
) {
    fun toMap(): Map<String, Any> = mapOf(
        "id" to deviceId,
        "name" to displayName,
        "deviceName" to deviceName,
        "platform" to platform,
        "ip" to ip,
        "port" to port,
        "avatarIndex" to avatarIndex,
        "avatarPath" to avatarPath,
        "status" to status,
        "transport" to transport,
        "connectionState" to connectionState,
        "lastSeen" to lastSeen
    )
}

data class HttpUploadSession(
    val transferId: String,
    val token: String,
    val fileName: String,
    val fileSize: Long,
    val sha256: String,
    val senderName: String,
    val senderUserId: String,
    val expiresAt: Long,
    val isConsumed: java.util.concurrent.atomic.AtomicBoolean = java.util.concurrent.atomic.AtomicBoolean(false),
    val sessionKey: ByteArray? = null,
    val sasCode: String = "",
    val isFirstContact: Boolean = false,
    val senderIdentityPubHex: String = ""
)

object PeerRegistry {
    private val peers = ConcurrentHashMap<String, PeerInfo>()

    fun updateOrAdd(peer: PeerInfo): Boolean {
        val existing = peers[peer.deviceId]
        peers[peer.deviceId] = peer
        return existing == null
    }

    fun get(deviceId: String): PeerInfo? = peers[deviceId]

    fun remove(deviceId: String): PeerInfo? = peers.remove(deviceId)

    fun pruneExpired(timeoutMs: Long = 8000L): List<PeerInfo> {
        val now = System.currentTimeMillis()
        val expired = mutableListOf<PeerInfo>()
        val it = peers.entries.iterator()
        while (it.hasNext()) {
            val entry = it.next()
            if (now - entry.value.lastSeen > timeoutMs) {
                expired.add(entry.value)
                it.remove()
            }
        }
        return expired
    }

    fun getActivePeers(): List<PeerInfo> = peers.values.toList()

    fun updateConnectionState(deviceId: String, state: String) {
        peers[deviceId]?.connectionState = state
    }
}

class MainActivity : FlutterActivity() {
    companion object {
        private const val TAG = "AuraDropNative"
        private const val METHOD_CHANNEL = "com.auradrop.app/native"
        private const val EVENT_CHANNEL = "com.auradrop.app/events"
        private const val FILE_PICK_CODE = 48291
        private const val AVATAR_PICK_CODE = 48292
        private const val DEFAULT_PORT = 53317
        private const val DISCOVERY_GROUP = "224.0.0.167"
        private const val DISCOVERY_PORT = 53317
        private const val LEGACY_DISCOVERY_GROUP = "239.255.48.29"
        private const val LEGACY_DISCOVERY_PORT = 48290
        private const val LEGACY_TRANSFER_PORT = 48291
        private const val SOCKET_BUFFER_SIZE = 4 * 1024 * 1024 // 4 MB buffer for 100MB/s wire throughput
        private const val PROGRESS_EVENT_INTERVAL_MS = 90L // ~11 UI updates/sec to avoid IPC bottleneck
        const val INCOMING_REQUEST_CHANNEL_ID = "auradrop_incoming_requests"
        const val CHAT_NOTIFICATION_CHANNEL_ID = "auradrop_chat_messages"

        @Volatile
        var activeInstance: MainActivity? = null
            private set

        fun handleSystemNotificationAction(context: Context, transferId: String, accept: Boolean) {
            val inst = activeInstance
            if (inst != null) {
                if (accept) {
                    inst.acceptIncomingTransfer(transferId)
                    inst.sendEvent("notificationAccept", mapOf("transferId" to transferId))
                } else {
                    inst.declineIncomingTransfer(transferId)
                    inst.sendEvent("notificationDecline", mapOf("transferId" to transferId))
                }
            } else {
                val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                nm.cancel(transferId.hashCode())
            }
        }
    }

    private var eventSink: EventChannel.EventSink? = null
    private var pendingFilePickResult: MethodChannel.Result? = null
    private var pendingAvatarPickResult: MethodChannel.Result? = null
    private var isAppInForeground = true

    private var multicastLock: WifiManager.MulticastLock? = null
    private var wakeLock: android.os.PowerManager.WakeLock? = null
    private var isDiscovering = false
    private var discoveryJob: Job? = null
    private var serverJob: Job? = null
    private var transferServer: ServerSocket? = null

    // Sockets and Transfer Sessions
    private val activeClientSockets = ConcurrentHashMap<String, Socket>()
    private val activeTransfersState = ConcurrentHashMap<String, TransferSession>()
    private val activeHttpConnections = ConcurrentHashMap<String, HttpURLConnection>()
    private val activePeerChatSockets = ConcurrentHashMap<String, Socket>()
    private val httpUploadSessions = ConcurrentHashMap<String, HttpUploadSession>()
    private val pendingHttpDecisions = ConcurrentHashMap<String, CompletableDeferred<Boolean>>()
    private val pendingOutboundVerifications = ConcurrentHashMap<String, CompletableDeferred<Boolean>>()
    private val recentlyApprovedSenders = ConcurrentHashMap<String, Long>()

    private val mainHandler = Handler(Looper.getMainLooper())
    private val coroutineExceptionHandler = CoroutineExceptionHandler { _, throwable ->
        Log.e(TAG, "Uncaught coroutine exception: ${throwable.message}", throwable)
    }
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob() + coroutineExceptionHandler)

    // Database
    private lateinit var dbHelper: AuraDropDatabaseHelper

    private var deviceId: String = ""
    private var deviceName: String = ""

    // Initial files received from Android System Share intent
    private val sharedFilesList = Collections.synchronizedList(mutableListOf<Map<String, Any>>())

    data class TransferSession(
        val transferId: String,
        val socket: Socket,
        var senderName: String = "Unknown Device",
        var senderDeviceName: String = "Unknown Device",
        val expiresAt: Long = System.currentTimeMillis() + 60000L,
        var isCancelled: AtomicBoolean = AtomicBoolean(false),
        var isPaused: AtomicBoolean = AtomicBoolean(false),
        var isAccepted: AtomicBoolean = AtomicBoolean(false),
        var isDeclined: AtomicBoolean = AtomicBoolean(false)
    )

    private fun getSystemDeviceName(): String {
        try {
            val name = android.provider.Settings.Global.getString(contentResolver, "device_name")
            if (!name.isNullOrBlank()) return name
        } catch (e: Exception) {}
        try {
            val bluetoothName = android.bluetooth.BluetoothAdapter.getDefaultAdapter()?.name
            if (!bluetoothName.isNullOrBlank()) return bluetoothName
        } catch (e: Exception) {}
        return "${Build.MANUFACTURER.replaceFirstChar { it.uppercase() }} ${Build.MODEL}"
    }

    override fun onCreate(savedInstanceState: android.os.Bundle?) {
        super.onCreate(savedInstanceState)
        activeInstance = this

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

        createSystemNotificationChannels()
        AuraIdentityManager.initialize(applicationContext)
        AuraAeadCrypto.verifyDeterministicTestVector()
        dbHelper = AuraDropDatabaseHelper(this)

        val prefs = getSharedPreferences("auradrop_identity", Context.MODE_PRIVATE)
        var storedId = prefs.getString("device_id", null)
        if (storedId.isNullOrBlank()) {
            storedId = "android_" + UUID.randomUUID().toString().replace("-", "").substring(0, 10)
            prefs.edit().putString("device_id", storedId).apply()
        }
        deviceId = storedId

        val sysDev = getSystemDeviceName()
        dbHelper.cleanupLegacyAuraDropUser(sysDev)
        val profile = dbHelper.getProfile()
        val savedName = profile["display_name"]
        if (!savedName.isNullOrBlank() && savedName != "AuraDrop User") {
            deviceName = savedName
        } else {
            deviceName = sysDev
        }

        // Start 24/7 background listener & broadcaster service
        try {
            val bgIntent = Intent(this, AuraBackgroundService::class.java).apply {
                action = AuraBackgroundService.ACTION_START
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(bgIntent)
            } else {
                startService(bgIntent)
            }
            Log.d(TAG, "Launched 24/7 AuraBackgroundService from MainActivity")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start AuraBackgroundService: ${e.message}")
        }

        handleSendIntent(intent)
    }

    override fun onResume() {
        super.onResume()
        isAppInForeground = true
        AuraOverlayManager.getInstance(this).isAppInForeground = true
        if (!AuraOverlayManager.getInstance(this).canDrawOverlays()) {
            mainHandler.postDelayed({
                AuraOverlayManager.getInstance(this).requestOverlayPermission(this)
            }, 1200)
        }
    }

    override fun onPause() {
        super.onPause()
        isAppInForeground = false
        AuraOverlayManager.getInstance(this).isAppInForeground = false
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleSendIntent(intent)
    }

    private fun handleSendIntent(intent: Intent?) {
        if (intent == null) return
        val action = intent.action
        val type = intent.type

        if ((Intent.ACTION_SEND == action || Intent.ACTION_SEND_MULTIPLE == action) && type != null) {
            val collectedUris = mutableListOf<Uri>()

            // 1. Extract from clipData (standard for modern Android shares from Gallery/Files/Photos)
            intent.clipData?.let { cd ->
                for (i in 0 until cd.itemCount) {
                    val u = cd.getItemAt(i).uri
                    if (u != null && !collectedUris.contains(u)) {
                        collectedUris.add(u)
                    }
                }
            }

            // 2. Extract from EXTRA_STREAM
            if (Intent.ACTION_SEND_MULTIPLE == action) {
                val streamUris = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java)
                } else {
                    @Suppress("DEPRECATION")
                    intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM)
                }
                streamUris?.forEach { u ->
                    if (u != null && !collectedUris.contains(u)) collectedUris.add(u)
                }
            } else if (Intent.ACTION_SEND == action) {
                val singleUri = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
                } else {
                    @Suppress("DEPRECATION")
                    intent.getParcelableExtra(Intent.EXTRA_STREAM)
                }
                if (singleUri != null && !collectedUris.contains(singleUri)) {
                    collectedUris.add(singleUri)
                }
            }

            // 3. Fallback to data URI
            intent.data?.let { du ->
                if (!collectedUris.contains(du)) collectedUris.add(du)
            }

            if (collectedUris.isNotEmpty()) {
                val files = mutableListOf<Map<String, Any>>()
                for (u in collectedUris) {
                    getFileMeta(u)?.let { files.add(it) }
                }
                if (files.isNotEmpty()) {
                    sharedFilesList.addAll(files)
                    sendEvent("systemShareReceived", mapOf("files" to files))
                }
            }
        }
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, METHOD_CHANNEL).setMethodCallHandler { call, result ->
            try {
                when (call.method) {
                "getDeviceInfo" -> {
                    result.success(mapOf(
                        "deviceId" to deviceId,
                        "deviceName" to deviceName,
                        "platform" to "android",
                        "ipAddress" to getLocalIpAddress(),
                        "port" to DEFAULT_PORT
                    ))
                }
                "getDiscoveredPeers" -> {
                    result.success(PeerRegistry.getActivePeers().map { it.toMap() })
                }
                "requestPermissions" -> {
                    checkAndRequestPermissions()
                    result.success(true)
                }
                "getInitialShareFiles" -> {
                    val currentList = ArrayList(sharedFilesList)
                    sharedFilesList.clear()
                    result.success(currentList)
                }
                "startDiscovery" -> {
                    startDiscoveryEngine()
                    result.success(true)
                }
                "stopDiscovery" -> {
                    stopDiscoveryEngine()
                    result.success(true)
                }
                "pickFiles" -> {
                    pendingFilePickResult = result
                    launchNativeFilePicker()
                }
                "startTransferServer" -> {
                    startTransferServerSocket()
                    result.success(true)
                }
                "sendFiles" -> {
                    val targetIp = call.argument<String>("targetIp") ?: ""
                    val targetPort = (call.argument<Number>("targetPort"))?.toInt() ?: DEFAULT_PORT
                    val filesList = call.argument<List<Map<String, Any>>>("files") ?: emptyList()
                    startSendFilesTask(targetIp, targetPort, filesList)
                    result.success(true)
                }
                "acceptTransfer" -> {
                    val transferId = call.argument<String>("transferId") ?: ""
                    acceptIncomingTransfer(transferId)
                    result.success(true)
                }
                "declineTransfer" -> {
                    val transferId = call.argument<String>("transferId") ?: ""
                    declineIncomingTransfer(transferId)
                    result.success(true)
                }
                "confirmTransferVerification" -> {
                    val transferId = call.argument<String>("transferId") ?: ""
                    val confirmed = call.argument<Boolean>("confirmed") ?: false
                    val outboundDeferred = pendingOutboundVerifications.remove(transferId)
                    if (outboundDeferred != null) {
                        outboundDeferred.complete(confirmed)
                    } else {
                        if (confirmed) {
                            acceptIncomingTransfer(transferId)
                        } else {
                            declineIncomingTransfer(transferId)
                        }
                    }
                    result.success(true)
                }
                "cancelTransfer" -> {
                    val transferId = call.argument<String>("transferId") ?: ""
                    cancelTransferSession(transferId)
                    result.success(true)
                }
                "openFile" -> {
                    val filePath = call.argument<String>("filePath") ?: ""
                    val opened = openFileWithSystemViewer(filePath)
                    result.success(opened)
                }
                "openUrl" -> {
                    val urlStr = call.argument<String>("url") ?: ""
                    try {
                        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(urlStr))
                        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        startActivity(intent)
                        result.success(true)
                    } catch (e: Exception) {
                        Log.e(TAG, "Failed to open URL: ${e.message}")
                        result.success(false)
                    }
                }
                "copyUriToCache" -> {
                    val uriStr = call.argument<String>("uri") ?: ""
                    val name = call.argument<String>("name") ?: "temp_file"
                    val cacheFile = File(cacheDir, name)
                    try {
                        contentResolver.openInputStream(Uri.parse(uriStr))?.use { input ->
                            FileOutputStream(cacheFile).use { output ->
                                input.copyTo(output)
                            }
                        }
                        result.success(cacheFile.absolutePath)
                    } catch (e: Exception) {
                        result.error("CACHE_ERROR", e.message, null)
                    }
                }
                // Database & History handlers
                "getTransferHistory" -> {
                    val history = dbHelper.getAllTransfers()
                    result.success(history)
                }
                "deleteTransferHistory" -> {
                    val id = call.argument<String>("id") ?: ""
                    val ok = dbHelper.deleteTransfer(id)
                    result.success(ok)
                }
                "clearTransferHistory" -> {
                    val ok = dbHelper.clearAllTransfers()
                    result.success(ok)
                }
                "getReceivedFiles" -> {
                    val files = listReceivedFiles()
                    result.success(files)
                }
                "deleteReceivedFile" -> {
                    val path = call.argument<String>("path") ?: ""
                    val deleted = File(path).delete()
                    result.success(deleted)
                }
                "recordTransferHistory" -> {
                    try {
                        val id = call.argument<String>("id") ?: UUID.randomUUID().toString()
                        val senderName = call.argument<String>("senderName") ?: "Nearby Device"
                        val receiverName = call.argument<String>("receiverName") ?: deviceName
                        val fileName = call.argument<String>("fileName") ?: "file"
                        val fileSize = (call.argument<Number>("fileSize"))?.toLong() ?: 0L
                        val direction = call.argument<String>("direction") ?: "received"
                        val status = call.argument<String>("status") ?: "completed"
                        val sha256 = call.argument<String>("sha256") ?: ""
                        val localPath = call.argument<String>("localPath") ?: ""
                        val transportType = call.argument<String>("transportType") ?: "LAN_DIRECT"
                        val avgSpeed = (call.argument<Number>("avgSpeed"))?.toLong() ?: 0L

                        dbHelper.insertTransfer(mapOf(
                            "id" to id,
                            "timestamp" to System.currentTimeMillis(),
                            "senderName" to senderName,
                            "receiverName" to receiverName,
                            "fileName" to fileName,
                            "fileType" to "",
                            "fileSize" to fileSize,
                            "direction" to direction,
                            "status" to status,
                            "durationMs" to 1000L,
                            "avgSpeed" to avgSpeed,
                            "sha256" to sha256,
                            "localPath" to localPath,
                            "transportType" to transportType
                        ))

                        if (localPath.isNotEmpty()) {
                            try {
                                MediaScannerConnection.scanFile(applicationContext, arrayOf(localPath), null, null)
                            } catch (_: Exception) {}
                        }
                        result.success(true)
                    } catch (e: Exception) {
                        result.error("DB_ERROR", e.message, null)
                    }
                }
                "recordChatMessage" -> {
                    try {
                        val msgId = call.argument<String>("id") ?: ("msg_" + UUID.randomUUID().toString().replace("-", "").substring(0, 8))
                        val peerId = call.argument<String>("peerId") ?: ""
                        val peerName = call.argument<String>("peerName") ?: "Nearby Device"
                        val senderId = call.argument<String>("senderId") ?: ""
                        val text = call.argument<String>("text") ?: ""
                        val timestamp = (call.argument<Number>("timestamp"))?.toLong() ?: System.currentTimeMillis()
                        val status = call.argument<String>("status") ?: "received"

                        val msgMap = mapOf(
                            "id" to msgId,
                            "peerId" to peerId,
                            "peerName" to peerName,
                            "senderId" to senderId,
                            "text" to text,
                            "timestamp" to timestamp,
                            "status" to status
                        )
                        dbHelper.insertChatMessage(msgMap)
                        sendEvent("chatMessageReceived", msgMap)
                        result.success(true)
                    } catch (e: Exception) {
                        result.error("CHAT_ERROR", e.message, null)
                    }
                }
                // Offline P2P Chat Handlers
                "getChatMessages" -> {
                    val peerId = call.argument<String>("peerId") ?: ""
                    val msgs = dbHelper.getChatMessages(peerId)
                    result.success(msgs)
                }
                "sendChatMessage" -> {
                    val targetIp = call.argument<String>("targetIp") ?: ""
                    val targetPort = (call.argument<Number>("targetPort"))?.toInt() ?: DEFAULT_PORT
                    val peerId = call.argument<String>("peerId") ?: ""
                    val peerName = call.argument<String>("peerName") ?: "Nearby Peer"
                    val text = call.argument<String>("text") ?: ""
                    sendOfflineChatMessage(targetIp, targetPort, peerId, peerName, text)
                    result.success(true)
                }
                "sendChatTyping" -> {
                    val targetIp = call.argument<String>("targetIp") ?: ""
                    val isTyping = call.argument<Boolean>("isTyping") ?: false
                    sendChatTypingStatus(targetIp, isTyping)
                    result.success(true)
                }
                // Profile & Trusted Peers
                "getUserProfile" -> {
                    result.success(dbHelper.getProfile())
                }
                "saveUserProfile" -> {
                    val key = call.argument<String>("key") ?: ""
                    val value = call.argument<String>("value") ?: ""
                    if (key == "display_name" && value.isNotBlank()) deviceName = value
                    val ok = dbHelper.setProfileValue(key, value)
                    result.success(ok)
                }
                "getTrustedPeers" -> {
                    result.success(dbHelper.getTrustedPeers())
                }
                "setPeerTrusted" -> {
                    val peerId = call.argument<String>("peerId") ?: ""
                    val peerName = call.argument<String>("peerName") ?: "Device"
                    val trusted = call.argument<Boolean>("trusted") ?: false
                    val ok = dbHelper.setPeerTrusted(peerId, peerName, trusted)
                    result.success(ok)
                }
                "getBlockedPeers" -> {
                    result.success(dbHelper.getBlockedPeers())
                }
                "setPeerBlocked" -> {
                    val peerId = call.argument<String>("peerId") ?: ""
                    val peerName = call.argument<String>("peerName") ?: "Device"
                    val blocked = call.argument<Boolean>("blocked") ?: false
                    val ok = dbHelper.setPeerBlocked(peerId, peerName, blocked)
                    result.success(ok)
                }
                "updateVisibilityMode" -> {
                    val mode = call.argument<String>("mode") ?: "everyone"
                    val ok = dbHelper.setProfileValue("visibility", mode)
                    result.success(ok)
                }
                "pickAvatarImage" -> {
                    pendingAvatarPickResult = result
                    launchAvatarPicker()
                }
                "removeAvatarImage" -> {
                    val avatarFile = File(filesDir, "avatar_${deviceId}.jpg")
                    if (avatarFile.exists()) avatarFile.delete()
                    dbHelper.setProfileValue("avatar_path", "")
                    result.success(true)
                }
                "checkStorageSpace" -> {
                    val downloadsDir = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "AuraDrop")
                    if (!downloadsDir.exists()) downloadsDir.mkdirs()
                    val map = HashMap<String, Long>()
                    map["usable"] = downloadsDir.usableSpace
                    map["total"] = downloadsDir.totalSpace
                    result.success(map)
                }
                "checkOverlayPermission" -> {
                    result.success(AuraOverlayManager.getInstance(this).canDrawOverlays())
                }
                "requestOverlayPermission" -> {
                    AuraOverlayManager.getInstance(this).requestOverlayPermission(this)
                    result.success(true)
                }
                "checkBatteryOptimizationExempt" -> {
                    val pm = getSystemService(Context.POWER_SERVICE) as? PowerManager
                    val isExempt = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                        pm?.isIgnoringBatteryOptimizations(packageName) ?: false
                    } else {
                        true
                    }
                    result.success(isExempt)
                }
                "requestBatteryOptimizationExempt" -> {
                    requestBatteryOptimizationExemption()
                    result.success(true)
                }
                "requestBackgroundPermissions" -> {
                    requestAllBackgroundPermissions()
                    result.success(true)
                }
                "showSystemIncomingShareNotification" -> {
                    val transferId = call.argument<String>("transferId") ?: UUID.randomUUID().toString()
                    val senderName = call.argument<String>("senderName") ?: "Nearby Peer"
                    val senderDeviceName = call.argument<String>("senderDeviceName") ?: senderName
                    val totalFiles = (call.argument<Number>("totalFiles"))?.toInt() ?: 1
                    val totalBytes = (call.argument<Number>("totalBytes"))?.toLong() ?: 0L
                    val fileName = call.argument<String>("fileName") ?: "Incoming File"

                    showSystemIncomingShareNotification(
                        transferId = transferId,
                        senderName = senderName,
                        senderDeviceName = senderDeviceName,
                        totalFiles = totalFiles,
                        totalBytes = totalBytes,
                        firstFileName = fileName,
                        sasCode = "4829 1049"
                    )
                    result.success(true)
                }
                "showNameDropProximityAlert" -> {
                    val peerId = call.argument<String>("peerId") ?: ""
                    val peerName = call.argument<String>("peerName") ?: "Nearby Peer"
                    val deviceName = call.argument<String>("deviceName") ?: peerName
                    val platform = call.argument<String>("platform") ?: "device"
                    val ip = call.argument<String>("ip") ?: ""
                    val avatarPath = call.argument<String>("avatarPath") ?: ""
                    showSystemNameDropProximityNotification(peerId, peerName, deviceName, platform, ip, avatarPath)
                    result.success(true)
                }
                else -> result.notImplemented()
                }
            } catch (t: Throwable) {
                Log.e(TAG, "Unhandled exception in MethodChannel '${call.method}': ${t.message}", t)
                try {
                    result.error("INTERNAL_ERROR", t.message ?: "Unknown error", null)
                } catch (_: Exception) {}
            }
        }

        EventChannel(flutterEngine.dartExecutor.binaryMessenger, EVENT_CHANNEL).setStreamHandler(object : EventChannel.StreamHandler {
            override fun onListen(arguments: Any?, sink: EventChannel.EventSink?) {
                eventSink = sink
            }
            override fun onCancel(arguments: Any?) {
                eventSink = null
            }
        })
    }

    private fun sendEvent(type: String, data: Map<String, Any>) {
        mainHandler.post {
            val event = HashMap(data)
            event["type"] = type
            eventSink?.success(event)
        }
    }

    fun sendEventFromBackground(type: String, data: Map<String, Any>) {
        sendEvent(type, data)
    }

    // ----------------------------------------------------
    // Android Permissions Management
    // ----------------------------------------------------
    private fun checkAndRequestPermissions() {
        val permissions = mutableListOf(
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.ACCESS_COARSE_LOCATION
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            permissions.add(Manifest.permission.NEARBY_WIFI_DEVICES)
            permissions.add(Manifest.permission.POST_NOTIFICATIONS)
            permissions.add(Manifest.permission.READ_MEDIA_IMAGES)
            permissions.add(Manifest.permission.READ_MEDIA_VIDEO)
            permissions.add(Manifest.permission.READ_MEDIA_AUDIO)
        } else {
            permissions.add(Manifest.permission.READ_EXTERNAL_STORAGE)
            permissions.add(Manifest.permission.WRITE_EXTERNAL_STORAGE)
        }

        val needed = permissions.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }
        if (needed.isNotEmpty()) {
            ActivityCompat.requestPermissions(this, needed.toTypedArray(), 1001)
        }
    }

    private fun requestBatteryOptimizationExemption() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            try {
                val pm = getSystemService(Context.POWER_SERVICE) as? PowerManager
                if (pm != null && !pm.isIgnoringBatteryOptimizations(packageName)) {
                    val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                        data = Uri.parse("package:$packageName")
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    startActivity(intent)
                    Log.d(TAG, "Requested ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS")
                }
            } catch (e: Exception) {
                try {
                    val fallback = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).apply {
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    startActivity(fallback)
                    Log.d(TAG, "Opened ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS")
                } catch (e2: Exception) {
                    Log.e(TAG, "Failed to launch battery optimization settings: ${e2.message}")
                }
            }
        }
    }

    private fun requestAllBackgroundPermissions() {
        checkAndRequestPermissions()
        mainHandler.postDelayed({
            if (!AuraOverlayManager.getInstance(this).canDrawOverlays()) {
                AuraOverlayManager.getInstance(this).requestOverlayPermission(this)
            }
            requestBatteryOptimizationExemption()
        }, 800)
    }

    // ----------------------------------------------------
    // Native File Picker
    // ----------------------------------------------------
    private fun launchNativeFilePicker() {
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "*/*"
            putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
        }
        startActivityForResult(intent, FILE_PICK_CODE)
    }

    private fun launchAvatarPicker() {
        val intent = Intent(Intent.ACTION_GET_CONTENT).apply {
            type = "image/*"
        }
        startActivityForResult(intent, AVATAR_PICK_CODE)
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == FILE_PICK_CODE) {
            val selectedFiles = mutableListOf<Map<String, Any>>()
            if (resultCode == Activity.RESULT_OK && data != null) {
                val clipData = data.clipData
                if (clipData != null) {
                    for (i in 0 until clipData.itemCount) {
                        val uri = clipData.getItemAt(i).uri
                        getFileMeta(uri)?.let { selectedFiles.add(it) }
                    }
                } else if (data.data != null) {
                    val uri = data.data!!
                    getFileMeta(uri)?.let { selectedFiles.add(it) }
                }
            }
            pendingFilePickResult?.success(selectedFiles)
            pendingFilePickResult = null
        } else if (requestCode == AVATAR_PICK_CODE) {
            if (resultCode == Activity.RESULT_OK && data?.data != null) {
                try {
                    val uri = data.data!!
                    val avatarFile = File(filesDir, "avatar_${deviceId}.jpg")
                    contentResolver.openInputStream(uri)?.use { input ->
                        FileOutputStream(avatarFile).use { output ->
                            input.copyTo(output)
                        }
                    }
                    dbHelper.setProfileValue("avatar_path", avatarFile.absolutePath)
                    pendingAvatarPickResult?.success(avatarFile.absolutePath)
                } catch (e: Exception) {
                    Log.e(TAG, "Error saving avatar: ${e.message}")
                    pendingAvatarPickResult?.success(null)
                }
            } else {
                pendingAvatarPickResult?.success(null)
            }
            pendingAvatarPickResult = null
        }
    }

    private fun getFileMeta(uri: Uri): Map<String, Any>? {
        return try {
            var rawName: String? = null
            var size = 0L
            var mimeType: String? = null

            try {
                contentResolver.query(uri, null, null, null, null)?.use { cursor ->
                    if (cursor.moveToFirst()) {
                        val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                        val sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE)
                        if (nameIndex != -1) rawName = cursor.getString(nameIndex)
                        if (sizeIndex != -1) size = cursor.getLong(sizeIndex)
                    }
                }
            } catch (e: Exception) {
                Log.w(TAG, "ContentResolver query failed for $uri: ${e.message}")
            }

            if (rawName.isNullOrBlank()) {
                val seg = uri.lastPathSegment
                rawName = if (!seg.isNullOrBlank() && seg.contains("/")) seg.substringAfterLast("/") else seg
            }
            val sanitizedName = sanitizeFilename(if (!rawName.isNullOrBlank()) rawName else "shared_file_${System.currentTimeMillis()}")

            try {
                mimeType = contentResolver.getType(uri)
            } catch (e: Exception) {}
            if (mimeType.isNullOrBlank()) {
                mimeType = "application/octet-stream"
            }

            if (size <= 0L) {
                try {
                    contentResolver.openAssetFileDescriptor(uri, "r")?.use { afd ->
                        size = afd.length
                    }
                } catch (e: Exception) {}
            }

            mapOf(
                "id" to UUID.randomUUID().toString(),
                "name" to sanitizedName,
                "size" to if (size > 0L) size else 0L,
                "mimeType" to (mimeType ?: "application/octet-stream"),
                "uri" to uri.toString()
            )
        } catch (e: Exception) {
            Log.e(TAG, "getFileMeta fatal error for $uri: ${e.message}")
            null
        }
    }

    // ----------------------------------------------------
    // UDP Multicast Discovery Engine (P2PFS/1)
    // ----------------------------------------------------
    private fun startDiscoveryEngine() {
        if (isDiscovering) return
        isDiscovering = true

        val wifi = applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
        multicastLock = wifi.createMulticastLock("AuraDropMulticastLock").apply {
            setReferenceCounted(true)
            acquire()
        }

        try {
            val pm = getSystemService(Context.POWER_SERVICE) as android.os.PowerManager
            wakeLock = pm.newWakeLock(android.os.PowerManager.PARTIAL_WAKE_LOCK, "AuraDrop::DiscoveryWakeLock").apply {
                setReferenceCounted(false)
                acquire(60 * 60 * 1000L) // 1 hour standby wake lock
            }
        } catch (e: Exception) {}

        discoveryJob = scope.launch {
            launch { runUdpListener() }
            launch { runUdpBroadcaster() }
            launch { runPeerPruner() }
        }
    }

    private fun stopDiscoveryEngine() {
        isDiscovering = false
        discoveryJob?.cancel()
        discoveryJob = null
        multicastLock?.let {
            if (it.isHeld) it.release()
        }
        multicastLock = null
        wakeLock?.let {
            if (it.isHeld) {
                try { it.release() } catch (e: Exception) {}
            }
        }
        wakeLock = null
    }

    private suspend fun runPeerPruner() = withContext(Dispatchers.IO) {
        while (isDiscovering && isActive) {
            delay(2500)
            val expired = PeerRegistry.pruneExpired(8000L)
            for (p in expired) {
                sendEvent("peerExpired", mapOf("peerId" to p.deviceId))
            }
        }
    }

    private fun getDirectedBroadcastAddress(): InetAddress? {
        try {
            val interfaces = NetworkInterface.getNetworkInterfaces()
            while (interfaces.hasMoreElements()) {
                val iface = interfaces.nextElement()
                if (iface.isLoopback || !iface.isUp) continue
                for (ia in iface.interfaceAddresses) {
                    val bcast = ia.broadcast
                    if (bcast != null && bcast is Inet4Address) {
                        return bcast
                    }
                }
            }
        } catch (e: Exception) {}
        return null
    }

    private suspend fun runUdpBroadcaster() = withContext(Dispatchers.IO) {
        val group = InetAddress.getByName(DISCOVERY_GROUP)
        val legacyGroup = InetAddress.getByName(LEGACY_DISCOVERY_GROUP)
        val broadcastAddr = InetAddress.getByName("255.255.255.255")
        var socket: DatagramSocket? = null
        try {
            socket = DatagramSocket()
            while (isDiscovering && isActive) {
                try {
                    val prof = dbHelper.getProfile()
                    val savedName = prof["display_name"]
                    val resolvedDisplayName = if (!savedName.isNullOrBlank() && savedName != "AuraDrop User") {
                        savedName
                    } else {
                        deviceName
                    }
                    val beacon = JSONObject().apply {
                        put("type", "AURADROP_BEACON")
                        put("protocol", "AURADROP/1")
                        put("deviceId", deviceId)
                        put("name", resolvedDisplayName)
                        put("deviceName", deviceName)
                        put("platform", "android")
                        put("port", DEFAULT_PORT)
                        put("transferPort", DEFAULT_PORT)
                        put("avatarIndex", prof["avatar_index"]?.toIntOrNull() ?: 0)
                        put("avatarPath", prof["avatar_path"] ?: "")
                        put("status", prof["bio"] ?: "Nearby sharing made effortless")
                        put("timestamp", System.currentTimeMillis())
                        put("identityPubKey", AuraIdentityManager.getPublicKeyHex())
                    }
                    val bytes = beacon.toString().toByteArray(Charsets.UTF_8)

                    // 1. Multicast to standard group 224.0.0.167
                    socket.send(DatagramPacket(bytes, bytes.size, group, DISCOVERY_PORT))

                    // 2. Global broadcast
                    socket.send(DatagramPacket(bytes, bytes.size, broadcastAddr, DISCOVERY_PORT))

                    // 3. Directed subnet broadcast (e.g. 192.168.0.255)
                    val directedBcast = getDirectedBroadcastAddress()
                    if (directedBcast != null) {
                        socket.send(DatagramPacket(bytes, bytes.size, directedBcast, DISCOVERY_PORT))
                    }

                    // 4. Legacy multicast & port for older nodes
                    socket.send(DatagramPacket(bytes, bytes.size, legacyGroup, LEGACY_DISCOVERY_PORT))
                    socket.send(DatagramPacket(bytes, bytes.size, broadcastAddr, LEGACY_DISCOVERY_PORT))
                } catch (e: Exception) {
                    // Transient network jitter
                }
                delay(2000)
            }
        } finally {
            socket?.close()
        }
    }

    private suspend fun runUdpListener() = withContext(Dispatchers.IO) {
        var socket: MulticastSocket? = null
        try {
            socket = MulticastSocket(DISCOVERY_PORT).apply {
                reuseAddress = true
                try { joinGroup(InetAddress.getByName(DISCOVERY_GROUP)) } catch (_: Exception) {}
                try { joinGroup(InetAddress.getByName(LEGACY_DISCOVERY_GROUP)) } catch (_: Exception) {}
            }
            val buffer = ByteArray(4096)

            while (isDiscovering && isActive) {
                val packet = DatagramPacket(buffer, buffer.size)
                socket.receive(packet)
                val raw = String(packet.data, 0, packet.length, Charsets.UTF_8)
                try {
                    val json = JSONObject(raw)
                    val proto = json.optString("protocol")
                    if (proto != "AURADROP/1" && proto != "P2PFS/1" && proto != "AURADROP_LOCAL_V1") {
                        continue
                    }

                    val remoteDeviceId = json.optString("deviceId")
                    val remoteIp = packet.address.hostAddress ?: ""
                    val localIp = getLocalIpAddress()
                    if (remoteDeviceId.isNotEmpty() && remoteDeviceId != deviceId && remoteIp != localIp && !packet.address.isLoopbackAddress) {
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
                        sendEvent("peerDiscovered", mapOf("peer" to peer.toMap()))

                        // If user is outside the app, immediately show floating AirDrop Dynamic Island overlay
                        if (isNew && !isAppInForeground) {
                            mainHandler.post {
                                showSystemNameDropProximityNotification(
                                    peerId = peer.deviceId,
                                    peerName = peer.displayName,
                                    deviceName = peer.deviceName,
                                    platform = peer.platform,
                                    ip = peer.ip,
                                    avatarPath = peer.avatarPath
                                )
                            }
                        }
                    }
                } catch (e: Exception) {
                    // Ignore malformed beacon
                }
            }
        } catch (e: Exception) {
            // Socket bind error or stopped
        } finally {
            socket?.close()
        }
    }

    // ----------------------------------------------------
    // TCP Streaming Server (High-Speed Receiver & Chat)
    // ----------------------------------------------------
    private fun startTransferServerSocket() {
        if (transferServer != null) return
        serverJob = scope.launch(Dispatchers.IO) {
            try {
                transferServer = try {
                    ServerSocket().apply {
                        reuseAddress = true
                        receiveBufferSize = SOCKET_BUFFER_SIZE
                        bind(InetSocketAddress(DEFAULT_PORT), 100)
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "Port $DEFAULT_PORT bind failed, using $LEGACY_TRANSFER_PORT: ${e.message}")
                    ServerSocket().apply {
                        reuseAddress = true
                        receiveBufferSize = SOCKET_BUFFER_SIZE
                        bind(InetSocketAddress(LEGACY_TRANSFER_PORT), 100)
                    }
                }
                while (isActive) {
                    val clientSocket = transferServer?.accept() ?: break
                    clientSocket.tcpNoDelay = true
                    clientSocket.trafficClass = 0x10 // IPTOS_THROUGHPUT
                    clientSocket.sendBufferSize = SOCKET_BUFFER_SIZE
                    clientSocket.receiveBufferSize = SOCKET_BUFFER_SIZE
                    launch { handleInboundClient(clientSocket) }
                }
            } catch (e: Exception) {
                // Server stopped
            }
        }
    }

    private suspend fun handleInboundClient(socket: Socket) = withContext(Dispatchers.IO) {
        val transferId = "xfer_" + UUID.randomUUID().toString().replace("-", "").substring(0, 10)
        val session = TransferSession(transferId, socket)
        activeTransfersState[transferId] = session
        activeClientSockets[transferId] = socket

        val input = BufferedInputStream(socket.getInputStream(), SOCKET_BUFFER_SIZE)
        val output = BufferedOutputStream(socket.getOutputStream(), SOCKET_BUFFER_SIZE)

        try {
            val header = ByteArray(20)

            while (socket.isConnected && !socket.isClosed) {
                val read = input.read(header, 0, 20)
                if (read == -1) break
                if (read < 20) input.readFullyRemaining(header, read, 20 - read)

                // Multiplex check: Check if connection is HTTP or binary framing (P2PF)
                if (header[0] != 0x50.toByte() || header[1] != 0x32.toByte() || header[2] != 0x50.toByte() || header[3] != 0x46.toByte()) {
                    handleHttpInboundClient(socket, input, output, header, 20)
                    break
                }

                val frameType = header[5].toInt()
                val payloadLen = header.readUInt32BE(8)

                when (frameType) {
                    0x01 -> { // HANDSHAKE_INIT
                        val payloadBytes = ByteArray(payloadLen)
                        input.readFully(payloadBytes)
                        val handshakeJson = JSONObject(String(payloadBytes, Charsets.UTF_8))
                        val clientNonce = handshakeJson.optString("nonce")

                        sendEvent("dataChannelState", mapOf(
                            "transferId" to transferId,
                            "state" to "DATA_CHANNEL_CONNECTING"
                        ))

                        val respJson = JSONObject().apply {
                            put("protocolVersion", "P2PFS/1")
                            put("deviceId", deviceId)
                            put("deviceName", deviceName)
                            put("platform", "android")
                            put("nonceEcho", clientNonce)
                            put("timestamp", System.currentTimeMillis())
                        }
                        output.write(buildFrame(0x02, respJson.toString().toByteArray()))
                        output.flush()
                    }

                    0x03 -> { // HEALTH_PING
                        val pingBytes = ByteArray(payloadLen)
                        input.readFully(pingBytes)
                        output.write(buildFrame(0x04, pingBytes))
                        output.flush()

                        sendEvent("dataChannelState", mapOf(
                            "transferId" to transferId,
                            "state" to "READY_TO_TRANSFER"
                        ))
                    }

                    0x10 -> { // NEGOTIATION_REQ
                        val negBytes = ByteArray(payloadLen)
                        input.readFully(negBytes)
                        val negJson = JSONObject(String(negBytes, Charsets.UTF_8))

                        val senderName = negJson.optString("senderName", "Unknown Device")
                        val senderDeviceName = negJson.optString("senderDeviceName", senderName)
                        val senderDeviceId = negJson.optString("deviceId", "peer")
                        val totalFiles = negJson.optInt("totalFiles", 1)
                        val totalBytes = negJson.optLong("totalBytes", 0L)
                        val filesArray = negJson.optJSONArray("files") ?: JSONArray()
                        val createdAt = negJson.optLong("createdAt", System.currentTimeMillis())
                        val expiresAt = negJson.optLong("expiresAt", System.currentTimeMillis() + 60000L)
                        val filesList = mutableListOf<Map<String, Any>>()

                        session.senderName = senderName
                        session.senderDeviceName = senderDeviceName

                        // Persist IncomingShareRequest (Section 16)
                        dbHelper.insertIncomingRequest(mapOf(
                            "requestId" to transferId,
                            "transferSessionId" to transferId,
                            "senderDeviceId" to senderDeviceId,
                            "senderDisplayName" to senderName,
                            "senderDeviceName" to senderDeviceName,
                            "fileCount" to totalFiles,
                            "fileManifest" to filesArray.toString(),
                            "totalBytes" to totalBytes,
                            "createdAt" to createdAt,
                            "expiresAt" to expiresAt,
                            "status" to "PENDING"
                        ))

                        // Enforce Blocked Peers
                        if (dbHelper.isPeerBlocked(senderDeviceId)) {
                            dbHelper.updateIncomingRequestStatus(transferId, "DECLINED")
                            val declineJson = JSONObject().apply {
                                put("transferId", transferId)
                                put("accepted", false)
                                put("reason", "blocked")
                            }
                            output.write(buildFrame(0x11, declineJson.toString().toByteArray()))
                            output.flush()
                            break
                        }

                        // Enforce Authoritative Visibility Mode
                        val prof = dbHelper.getProfile()
                        val vis = prof["visibility"] ?: "everyone"
                        if (vis == "receivingOff" || vis == "noOne") {
                            dbHelper.updateIncomingRequestStatus(transferId, "DECLINED")
                            val declineJson = JSONObject().apply {
                                put("transferId", transferId)
                                put("accepted", false)
                                put("reason", "visibility_off")
                            }
                            output.write(buildFrame(0x11, declineJson.toString().toByteArray()))
                            output.flush()
                            break
                        }
                        if (vis == "contactsOnly") {
                            val trusted = dbHelper.getTrustedPeers().any { it["peerId"] == senderDeviceId }
                            if (!trusted) {
                                dbHelper.updateIncomingRequestStatus(transferId, "DECLINED")
                                val declineJson = JSONObject().apply {
                                    put("transferId", transferId)
                                    put("accepted", false)
                                    put("reason", "not_trusted")
                                }
                                output.write(buildFrame(0x11, declineJson.toString().toByteArray()))
                                output.flush()
                                break
                            }
                        }

                        // Check for existing partial files for RESUME support
                        val downloadsDir = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "AuraDrop")
                        val resumeOffsets = JSONObject()

                        for (i in 0 until filesArray.length()) {
                            val f = filesArray.getJSONObject(i)
                            val fId = f.getString("id")
                            val fName = sanitizeFilename(f.getString("name"))
                            val fSize = f.getLong("size")
                            val partFile = File(downloadsDir, "$fName.part")
                            var resumeOffset = 0L
                            if (partFile.exists() && partFile.length() < fSize) {
                                resumeOffset = partFile.length()
                            }
                            resumeOffsets.put(fId, resumeOffset)

                            filesList.add(mapOf(
                                "id" to fId,
                                "name" to fName,
                                "size" to fSize,
                                "mimeType" to f.optString("mimeType", "application/octet-stream"),
                                "expectedChecksum" to f.optString("checksum", ""),
                                "resumeOffset" to resumeOffset
                            ))
                        }

                        val sasCode = generateSasCode(deviceId, senderDeviceId)

                        // Store negotiation response data on session
                        val firstFileName = if (filesList.isNotEmpty()) filesList[0]["name"]?.toString() ?: "" else ""
                        sendEvent("transferRequest", mapOf(
                            "transferId" to transferId,
                            "senderName" to senderName,
                            "senderDeviceId" to senderDeviceId,
                            "totalFiles" to totalFiles,
                            "totalBytes" to totalBytes,
                            "fileName" to firstFileName,
                            "sas" to sasCode,
                            "files" to filesList,
                            "resumeOffsets" to resumeOffsets.toString(),
                            "connectionState" to "WAITING_FOR_ACCEPTANCE"
                        ))

                        // System-Level Nearby Sharing Notification (Works in background per V8/V10)
                        showSystemIncomingShareNotification(
                            transferId = transferId,
                            senderName = senderName,
                            senderDeviceName = senderDeviceName,
                            totalFiles = totalFiles,
                            totalBytes = totalBytes,
                            firstFileName = firstFileName,
                            sasCode = sasCode
                        )
                    }

                    // ---------------------------------------------------------
                    // OFFLINE P2P CHAT MESSAGES
                    // ---------------------------------------------------------
                    0x30 -> { // CHAT_MESSAGE
                        val chatBytes = ByteArray(payloadLen)
                        input.readFully(chatBytes)
                        val chatJson = JSONObject(String(chatBytes, Charsets.UTF_8))

                        val msgId = chatJson.getString("id")
                        val peerId = chatJson.getString("senderId")
                        val peerName = chatJson.getString("senderName")
                        val text = chatJson.getString("text")
                        val timestamp = chatJson.optLong("timestamp", System.currentTimeMillis())

                        val msgMap = mapOf(
                            "id" to msgId,
                            "peerId" to peerId,
                            "peerName" to peerName,
                            "senderId" to peerId,
                            "text" to text,
                            "timestamp" to timestamp,
                            "status" to "delivered"
                        )
                        dbHelper.insertChatMessage(msgMap)
                        sendEvent("chatMessageReceived", msgMap)

                        if (!isAppInForeground) {
                            showSystemChatMessageNotification(peerName, text)
                            AuraOverlayManager.getInstance(applicationContext).showChatMessageOverlay(
                                peerId = peerId,
                                senderName = peerName,
                                messageText = text,
                                onOpenChat = {
                                    sendEvent("openChatForPeer", mapOf("peerId" to peerId, "peerName" to peerName))
                                }
                            )
                        }

                        // Send CHAT_ACK
                        val ackJson = JSONObject().apply {
                            put("id", msgId)
                            put("status", "delivered")
                        }
                        output.write(buildFrame(0x31, ackJson.toString().toByteArray()))
                        output.flush()
                    }

                    0x31 -> { // CHAT_ACK
                        val ackBytes = ByteArray(payloadLen)
                        input.readFully(ackBytes)
                        val ackJson = JSONObject(String(ackBytes, Charsets.UTF_8))
                        val msgId = ackJson.getString("id")
                        val status = ackJson.optString("status", "delivered")
                        dbHelper.updateChatMessageStatus(msgId, status)
                        sendEvent("chatMessageStatusUpdated", mapOf("id" to msgId, "status" to status))
                    }

                    0x32 -> { // CHAT_TYPING
                        val typBytes = ByteArray(payloadLen)
                        input.readFully(typBytes)
                        val typJson = JSONObject(String(typBytes, Charsets.UTF_8))
                        sendEvent("chatTypingReceived", mapOf(
                            "senderId" to typJson.getString("senderId"),
                            "isTyping" to typJson.getBoolean("isTyping")
                        ))
                    }

                    // ---------------------------------------------------------
                    // HIGH-SPEED FILE TRANSFER FRAMES
                    // ---------------------------------------------------------
                    0x20 -> { // FILE_START
                        handleInboundFileStream(input, output, payloadLen, transferId, session)
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Inbound client error: ${e.message}")
        } finally {
            socket.close()
            activeClientSockets.remove(transferId)
            activeTransfersState.remove(transferId)
        }
    }

    private suspend fun handleHttpInboundClient(
        socket: Socket,
        input: BufferedInputStream,
        output: BufferedOutputStream,
        initialBytes: ByteArray,
        initialLen: Int
    ) = withContext(Dispatchers.IO) {
        try {
            val headerBuffer = ByteArrayOutputStream()
            headerBuffer.write(initialBytes, 0, initialLen)

            var lastFour = 0
            while (true) {
                val b = input.read()
                if (b == -1) break
                headerBuffer.write(b)
                lastFour = (lastFour shl 8) or (b and 0xFF)
                if (lastFour == 0x0D0A0D0A) break
            }

            val headerStr = headerBuffer.toString("UTF-8")
            val lines = headerStr.split("\r\n")
            if (lines.isEmpty()) return@withContext

            val requestLine = lines[0]
            val parts = requestLine.split(" ")
            if (parts.size < 2) return@withContext

            val method = parts[0].uppercase()
            val uri = parts[1]
            val path = if (uri.contains("?")) uri.substring(0, uri.indexOf("?")) else uri

            val headers = mutableMapOf<String, String>()
            for (i in 1 until lines.size) {
                val l = lines[i]
                val colon = l.indexOf(':')
                if (colon != -1) {
                    val k = l.substring(0, colon).trim().lowercase()
                    val v = l.substring(colon + 1).trim()
                    headers[k] = v
                }
            }

            val queryParams = mutableMapOf<String, String>()
            if (uri.contains("?")) {
                val qs = uri.substring(uri.indexOf("?") + 1)
                for (param in qs.split("&")) {
                    val eq = param.indexOf('=')
                    if (eq != -1) {
                        try {
                            val pk = URLDecoder.decode(param.substring(0, eq), "UTF-8")
                            val pv = URLDecoder.decode(param.substring(eq + 1), "UTF-8")
                            queryParams[pk] = pv
                        } catch (_: Exception) {}
                    }
                }
            }

            val contentLength = headers["content-length"]?.toLongOrNull() ?: 0L

            // Handle HTTP Expect: 100-continue handshake immediately so clients streaming bodies never stall
            if (headers["expect"]?.contains("100-continue", ignoreCase = true) == true) {
                val continueResp = "HTTP/1.1 100 Continue\r\n\r\n"
                output.write(continueResp.toByteArray(Charsets.UTF_8))
                output.flush()
            }

            fun sendJsonResponse(statusCode: Int, statusText: String, json: JSONObject) {
                val body = json.toString().toByteArray(Charsets.UTF_8)
                val resp = "HTTP/1.1 $statusCode $statusText\r\n" +
                        "Content-Type: application/json; charset=utf-8\r\n" +
                        "Content-Length: ${body.size}\r\n" +
                        "Access-Control-Allow-Origin: *\r\n" +
                        "Connection: close\r\n\r\n"
                output.write(resp.toByteArray(Charsets.UTF_8))
                output.write(body)
                output.flush()
                try {
                    socket.shutdownOutput()
                } catch (_: Exception) {}
            }

            if (method == "OPTIONS") {
                val cors = "HTTP/1.1 204 No Content\r\n" +
                        "Access-Control-Allow-Origin: *\r\n" +
                        "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n" +
                        "Access-Control-Allow-Headers: *\r\n" +
                        "Connection: close\r\n\r\n"
                output.write(cors.toByteArray(Charsets.UTF_8))
                output.flush()
                return@withContext
            }

            when (path) {
                "/api/auradrop/v1/ping" -> {
                    val prof = dbHelper.getProfile()
                    val savedName = prof["display_name"]
                    val nameToShow = if (!savedName.isNullOrBlank() && savedName != "AuraDrop User") savedName else deviceName
                    val json = JSONObject().apply {
                        put("status", "ok")
                        put("pong", true)
                        put("deviceId", deviceId)
                        put("deviceName", nameToShow)
                        put("name", nameToShow)
                        put("platform", "android")
                        put("port", DEFAULT_PORT)
                        put("transferPort", DEFAULT_PORT)
                        put("protocol", "AURADROP/1")
                        put("identityPubKey", AuraIdentityManager.getPublicKeyHex())
                    }
                    sendJsonResponse(200, "OK", json)
                }

                "/api/auradrop/v1/info" -> {
                    val prof = dbHelper.getProfile()
                    val savedName = prof["display_name"]
                    val nameToShow = if (!savedName.isNullOrBlank() && savedName != "AuraDrop User") savedName else deviceName
                    val json = JSONObject().apply {
                        put("deviceId", deviceId)
                        put("deviceName", nameToShow)
                        put("platform", "android")
                    }
                    sendJsonResponse(200, "OK", json)
                }

                "/api/auradrop/v1/chat" -> {
                    val bodyBytes = ByteArray(contentLength.toInt().coerceAtLeast(0))
                    var readSoFar = 0
                    while (readSoFar < bodyBytes.size) {
                        val r = input.read(bodyBytes, readSoFar, bodyBytes.size - readSoFar)
                        if (r == -1) break
                        readSoFar += r
                    }
                    val bodyStr = String(bodyBytes, 0, readSoFar, Charsets.UTF_8)
                    val chatJson = JSONObject(bodyStr)

                    val msgId = chatJson.optString("id", "msg_" + UUID.randomUUID().toString().replace("-", "").substring(0, 8))
                    val senderId = chatJson.optString("senderId", "peer")
                    val senderName = chatJson.optString("senderName", "Nearby Peer")
                    val text = chatJson.optString("text", "")
                    val timestamp = chatJson.optLong("timestamp", System.currentTimeMillis())

                    val msgMap = mapOf(
                        "id" to msgId,
                        "peerId" to senderId,
                        "peerName" to senderName,
                        "senderId" to senderId,
                        "text" to text,
                        "timestamp" to timestamp,
                        "status" to "delivered"
                    )
                    dbHelper.insertChatMessage(msgMap)
                    sendEvent("chatMessageReceived", msgMap)

                    if (!isAppInForeground) {
                        showSystemChatMessageNotification(senderName, text)
                        AuraOverlayManager.getInstance(applicationContext).showChatMessageOverlay(
                            peerId = senderId,
                            senderName = senderName,
                            messageText = text,
                            onOpenChat = {
                                sendEvent("openChatForPeer", mapOf("peerId" to senderId, "peerName" to senderName))
                            }
                        )
                    }

                    sendJsonResponse(200, "OK", JSONObject().apply { put("status", "ok") })
                }

                "/api/auradrop/v1/prepare-upload" -> {
                    val bodyBytes = ByteArray(contentLength.toInt().coerceAtLeast(0))
                    var readSoFar = 0
                    while (readSoFar < bodyBytes.size) {
                        val r = input.read(bodyBytes, readSoFar, bodyBytes.size - readSoFar)
                        if (r == -1) break
                        readSoFar += r
                    }
                    val bodyStr = String(bodyBytes, 0, readSoFar, Charsets.UTF_8)
                    val prepJson = JSONObject(bodyStr)

                    val xferId = prepJson.optString("transferId", "xfer_" + UUID.randomUUID().toString().replace("-", "").substring(0, 10))
                    val fileName = sanitizeFilename(prepJson.optString("fileName", "file"))
                    val fileSize = prepJson.optLong("fileSize", 0L)
                    val sha256 = prepJson.optString("sha256", "")
                    val senderName = prepJson.optString("senderName", prepJson.optString("senderUserId", "Nearby Device"))
                    val senderUserId = prepJson.optString("senderUserId", "peer")
                    val senderEphHex = prepJson.optString("senderEphPubKey", "")
                    val senderIdentityPubKey = prepJson.optString("senderIdentityPubKey", "")
                    val senderSignature = prepJson.optString("senderSignature", "")

                    if (senderEphHex.isEmpty() || senderIdentityPubKey.isEmpty() || senderSignature.isEmpty()) {
                        sendJsonResponse(400, "Bad Request", JSONObject().apply {
                            put("error", "Missing ephemeral key, identity public key, or cryptographic signature. Authenticated key exchange required.")
                        })
                        return@withContext
                    }

                    // Verify sender signature over sender transcript and validate against Trust Store
                    val senderTranscript = "auradrop/auth/v1/sender:auradrop/tcp/2:$xferId:$senderUserId:$senderEphHex".toByteArray(Charsets.UTF_8)
                    val isFirstContact = AuraIdentityManager.verifyPeerHandshake(
                        applicationContext,
                        senderUserId,
                        senderIdentityPubKey,
                        senderTranscript,
                        senderSignature
                    )
                    if (isFirstContact == null) {
                        Log.e(TAG, "Sender cryptographic authentication failed for peer: $senderUserId")
                        sendJsonResponse(403, "Forbidden", JSONObject().apply {
                            put("error", "Sender cryptographic authentication failed: invalid signature or identity key mismatch")
                        })
                        return@withContext
                    }

                    val token = UUID.randomUUID().toString()
                    val expiresAt = System.currentTimeMillis() + 60000L

                    var receiverEphHex: String? = null
                    var receiverSig: String? = null
                    var sasCodeStr: String = ""
                    val sessionKey: ByteArray? = try {
                        val receiverEph = AuraAeadCrypto.generateEphemeralKeyPair()
                        val receiverSec1 = AuraAeadCrypto.exportSec1PublicKey(receiverEph.public as ECPublicKey)
                        receiverEphHex = receiverSec1.toHex()
                        val senderPub = AuraAeadCrypto.importSec1PublicKey(senderEphHex.decodeHex())
                        val sharedSecret = AuraAeadCrypto.agreeEphemeral(receiverEph.private, senderPub)
                        sasCodeStr = AuraAeadCrypto.computeSasCode(
                            sharedSecret,
                            xferId,
                            senderUserId,
                            deviceId,
                            senderIdentityPubKey,
                            AuraIdentityManager.getPublicKeyHex(),
                            senderEphHex,
                            receiverEphHex
                        )
                        if (isFirstContact) {
                            Log.i(TAG, "[AuraTransfer] Inbound first contact from sender $senderUserId - Verification SAS: [$sasCodeStr]")
                        }
                        val sKey = AuraAeadCrypto.deriveDirectionalSessionKeys(
                            sharedSecret,
                            xferId,
                            token,
                            senderUserId,
                            deviceId,
                            senderIdentityPubKey,
                            AuraIdentityManager.getPublicKeyHex()
                        )

                        // Sign receiver transcript
                        val receiverTranscript = "auradrop/auth/v1/receiver:auradrop/tcp/2:$xferId:$token:$senderUserId:$deviceId:$senderEphHex:$receiverEphHex".toByteArray(Charsets.UTF_8)
                        receiverSig = AuraIdentityManager.sign(receiverTranscript)
                        sKey
                    } catch (e: Exception) {
                        Log.e(TAG, "ECDH agreement / signature failed in prepare-upload: ${e.message}")
                        null
                    }

                    if (sessionKey == null || receiverEphHex == null || receiverSig == null) {
                        sendJsonResponse(500, "Internal Server Error", JSONObject().apply {
                            put("error", "Failed to negotiate cryptographic session keys")
                        })
                        return@withContext
                    }

                    val sessionMeta = HttpUploadSession(
                        transferId = xferId,
                        token = token,
                        fileName = fileName,
                        fileSize = fileSize,
                        sha256 = sha256,
                        senderName = senderName,
                        senderUserId = senderUserId,
                        expiresAt = expiresAt,
                        sessionKey = sessionKey,
                        sasCode = sasCodeStr,
                        isFirstContact = isFirstContact,
                        senderIdentityPubHex = senderIdentityPubKey
                    )
                    httpUploadSessions[xferId] = sessionMeta

                    dbHelper.insertIncomingRequest(mapOf(
                        "requestId" to xferId,
                        "transferSessionId" to xferId,
                        "senderDeviceId" to senderUserId,
                        "senderDisplayName" to senderName,
                        "senderDeviceName" to senderName,
                        "fileCount" to 1,
                        "totalBytes" to fileSize,
                        "firstFileName" to fileName,
                        "createdAt" to System.currentTimeMillis(),
                        "expiresAt" to expiresAt
                    ))

                    val isRecentlyApproved = (recentlyApprovedSenders[senderUserId]?.let { System.currentTimeMillis() - it < 300_000L } == true)
                    val isPeerTrusted = !isFirstContact || AuraIdentityManager.isPeerTrusted(applicationContext, senderUserId) || dbHelper.getTrustedPeers().any { it["peerId"] == senderUserId }
                    val shouldAutoAccept = isRecentlyApproved || isPeerTrusted

                    val accepted = if (shouldAutoAccept) {
                        Log.i(TAG, "Auto-accepting incoming transfer from trusted/recent peer: $senderUserId ($senderName)")
                        recentlyApprovedSenders[senderUserId] = System.currentTimeMillis()
                        true
                    } else {
                        showSystemIncomingShareNotification(
                            transferId = xferId,
                            senderName = senderName,
                            senderDeviceName = senderName,
                            totalFiles = 1,
                            totalBytes = fileSize,
                            firstFileName = fileName,
                            sasCode = sasCodeStr
                        )

                        val decisionDeferred = CompletableDeferred<Boolean>()
                        pendingHttpDecisions[xferId] = decisionDeferred

                        // Show AirDrop floating island overlay (lock screen / home screen / other apps)
                        AuraOverlayManager.getInstance(applicationContext).showTransferRequestOverlay(
                            transferId = xferId,
                            senderName = senderName,
                            fileName = fileName,
                            totalBytes = fileSize,
                            onAccept = {
                                Log.i(TAG, "AirDrop share request accepted from floating island: $xferId")
                                acceptIncomingTransfer(xferId)
                            },
                            onDecline = {
                                Log.i(TAG, "AirDrop share request declined from floating island: $xferId")
                                declineIncomingTransfer(xferId)
                            }
                        )

                        // Also dispatch Flutter event so in-app receive dialog displays if user is in app
                        val shareEventMap = mapOf(
                            "requestId" to xferId,
                            "transferId" to xferId,
                            "senderName" to senderName,
                            "senderDeviceId" to senderUserId,
                            "firstFileName" to fileName,
                            "fileName" to fileName,
                            "totalBytes" to fileSize,
                            "totalFiles" to 1,
                            "fileCount" to 1
                        )
                        sendEvent("incomingShareRequest", shareEventMap)
                        sendEvent("transferRequest", shareEventMap)

                        // Await user's explicit Accept or Decline decision (up to 60 seconds)
                        val userDecision = withTimeoutOrNull(60000L) {
                            decisionDeferred.await()
                        } ?: false
                        pendingHttpDecisions.remove(xferId)
                        if (userDecision) {
                            recentlyApprovedSenders[senderUserId] = System.currentTimeMillis()
                        }
                        userDecision
                    }

                    if (accepted) {
                        sendJsonResponse(200, "OK", JSONObject().apply {
                            put("accepted", true)
                            put("transferId", xferId)
                            put("fileId", xferId)
                            put("oneTimeToken", token)
                            put("expiresAt", expiresAt)
                            put("protocol", "auradrop/tcp/2")
                            put("encryption", "aead-aes256-gcm")
                            put("receiverId", deviceId)
                            put("receiverUserId", deviceId)
                            if (receiverEphHex != null) {
                                put("receiverEphPubKey", receiverEphHex)
                            }
                            put("receiverIdentityPubKey", AuraIdentityManager.getPublicKeyHex())
                            if (receiverSig != null) {
                                put("receiverSignature", receiverSig)
                            }
                            put("sasCode", sasCodeStr)
                            put("isFirstContact", isFirstContact)
                        })
                    } else {
                        cancelSystemIncomingShareNotification(xferId)
                        AuraOverlayManager.getInstance(applicationContext).dismissCurrentOverlay()
                        httpUploadSessions.remove(xferId)
                        sendJsonResponse(403, "Forbidden", JSONObject().apply {
                            put("accepted", false)
                            put("error", "Transfer declined or timed out by recipient")
                        })
                    }
                }

                "/api/auradrop/v1/upload" -> {
                    val xferId = headers["x-transfer-id"] ?: queryParams["transferId"] ?: ""
                    val presentedToken = (headers["authorization"]?.removePrefix("Bearer ")?.removePrefix("bearer ")?.trim())
                        ?: headers["x-token"]
                        ?: headers["x-one-time-token"]
                        ?: ""
                    val sessionMeta = httpUploadSessions[xferId]

                    if (sessionMeta == null) {
                        sendJsonResponse(401, "Unauthorized", JSONObject().apply {
                            put("error", "Unknown or expired transfer session")
                        })
                        return@withContext
                    }

                    if (System.currentTimeMillis() > sessionMeta.expiresAt) {
                        httpUploadSessions.remove(xferId)
                        sendJsonResponse(401, "Unauthorized", JSONObject().apply {
                            put("error", "Transfer authorization token has expired")
                        })
                        return@withContext
                    }

                    if (!sessionMeta.isConsumed.compareAndSet(false, true)) {
                        sendJsonResponse(403, "Forbidden", JSONObject().apply {
                            put("error", "Transfer token already consumed (replay rejected)")
                        })
                        return@withContext
                    }

                    if (presentedToken != sessionMeta.token) {
                        sendJsonResponse(403, "Forbidden", JSONObject().apply {
                            put("error", "Invalid authorization token for this transfer")
                        })
                        return@withContext
                    }

                    // Peer identity binding verification
                    val presentedSenderId = headers["x-sender-id"] ?: ""
                    if (sessionMeta.senderUserId.isNotEmpty() && presentedSenderId.isNotEmpty() && presentedSenderId != sessionMeta.senderUserId) {
                        sendJsonResponse(403, "Forbidden", JSONObject().apply {
                            put("error", "Sender identity mismatch: transfer token bound to different device")
                        })
                        return@withContext
                    }

                    // Sanitized logging: mask secret token
                    val maskedToken = if (presentedToken.length >= 6) "${presentedToken.substring(0, 6)}...***" else "***"
                    Log.i(TAG, "[AuraTransfer] Inbound TCP upload authenticated: ${sessionMeta.fileName} (${sessionMeta.fileSize} bytes) [Token: $maskedToken]")

                    val fileName = sessionMeta.fileName
                    val fileSize = sessionMeta.fileSize
                    val expectedSha256 = sessionMeta.sha256
                    val senderName = sessionMeta.senderName

                    val headerDeclaredSize = headers["x-file-size"]?.toLongOrNull()
                    if (headerDeclaredSize != null && headerDeclaredSize != fileSize) {
                        sendJsonResponse(400, "Bad Request", JSONObject().apply {
                            put("error", "Declared x-file-size does not match approved transfer metadata")
                        })
                        return@withContext
                    }

                    if (xferId.isNotEmpty()) {
                        activeClientSockets[xferId] = socket
                        if (!activeTransfersState.containsKey(xferId)) {
                            activeTransfersState[xferId] = TransferSession(
                                transferId = xferId,
                                socket = socket,
                                senderName = senderName
                            )
                        }
                    }

                    var downloadsDir = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "AuraDrop")
                    if (!downloadsDir.exists() && !downloadsDir.mkdirs()) {
                        downloadsDir = File(applicationContext.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS) ?: applicationContext.filesDir, "AuraDrop")
                        if (!downloadsDir.exists()) downloadsDir.mkdirs()
                    }

                    val finalFile = resolveUniqueFile(downloadsDir, fileName)
                    val tempPartFile = File(downloadsDir, ".${fileName}.${xferId}.part")
                    val digest = MessageDigest.getInstance("SHA-256")

                    if (headers["x-encryption"] != "aead-aes256-gcm") {
                        sendJsonResponse(400, "Bad Request", JSONObject().apply {
                            put("error", "Authenticated encryption (aead-aes256-gcm) is required. Plaintext transfer is forbidden.")
                        })
                        return@withContext
                    }

                    val sessionKey = sessionMeta.sessionKey
                    if (sessionKey == null) {
                        sendJsonResponse(400, "Bad Request", JSONObject().apply {
                            put("error", "Session key unavailable or cryptographic agreement failed")
                        })
                        return@withContext
                    }

                    var totalWritten = 0L
                    val startTime = System.currentTimeMillis()
                    var lastProgressTime = 0L
                    var lastSpeedTime = startTime
                    var lastSpeedBytes = 0L
                    var smoothedSpeed = 0.0

                    startForegroundTransferService("Receiving $fileName...", 0)
                    AuraOverlayManager.getInstance(applicationContext).showOrUpdateTransferProgress(
                        transferId = xferId,
                        fileName = fileName,
                        progressPercent = 0,
                        transferredBytes = 0L,
                        totalBytes = fileSize,
                        speedBytesPerSec = 0L,
                        isSending = false
                    )

                    var writeError = false
                    val fos = FileOutputStream(tempPartFile)
                    try {
                        val bos = BufferedOutputStream(fos, 512 * 1024)
                        val dis = DataInputStream(input)
                        var chunkIndex = 0L
                        while (totalWritten < fileSize) {
                            if (activeTransfersState[xferId]?.isCancelled?.get() == true || socket.isClosed) {
                                Log.i(TAG, "Inbound HTTP upload cancelled: $xferId")
                                break
                            }
                            val payloadLen = dis.readInt()
                            if (payloadLen < 16 || payloadLen > 1024 * 1024 + 16) {
                                throw IOException("Invalid chunk payload length: $payloadLen")
                            }
                            val nonce = ByteArray(12)
                            dis.readFully(nonce)
                            val bbNonce = ByteBuffer.wrap(nonce)
                            val nonceChunkSeq = bbNonce.getLong(4)
                            if (nonceChunkSeq != chunkIndex) {
                                throw SecurityException("Chunk sequence counter mismatch: expected $chunkIndex, got $nonceChunkSeq")
                            }
                            val ciphertextAndTag = ByteArray(payloadLen)
                            dis.readFully(ciphertextAndTag)

                            val aad = "$xferId:$chunkIndex".toByteArray(Charsets.UTF_8)
                            val plaintext = AuraAeadCrypto.decryptChunk(sessionKey, nonce, aad, ciphertextAndTag)

                            bos.write(plaintext)
                            digest.update(plaintext)
                            totalWritten += plaintext.size
                            chunkIndex++

                            val now = System.currentTimeMillis()
                            if (now - lastProgressTime >= PROGRESS_EVENT_INTERVAL_MS || totalWritten == fileSize) {
                                lastProgressTime = now
                                val timeDeltaSec = Math.max(0.001, (now - lastSpeedTime) / 1000.0)
                                if (timeDeltaSec >= 0.15 || totalWritten == fileSize) {
                                    val bytesDelta = totalWritten - lastSpeedBytes
                                    val currentSampleSpeed = bytesDelta / timeDeltaSec
                                    smoothedSpeed = if (smoothedSpeed == 0.0) {
                                        currentSampleSpeed
                                    } else {
                                        0.35 * currentSampleSpeed + 0.65 * smoothedSpeed
                                    }
                                    lastSpeedTime = now
                                    lastSpeedBytes = totalWritten
                                }
                                val speed = smoothedSpeed.toLong().coerceAtLeast(0L)
                                val pct = if (fileSize > 0) ((totalWritten.toDouble() / fileSize.toDouble()) * 100.0).toInt().coerceAtMost(99) else 100
                                val eta = if (speed > 0) ((fileSize - totalWritten) / speed).toInt() else 0

                                sendEvent("transferProgress", mapOf(
                                    "transferId" to xferId,
                                    "state" to "TRANSFERRING",
                                    "fileName" to fileName,
                                    "totalBytes" to fileSize,
                                    "transferredBytes" to totalWritten,
                                    "speedBytesPerSec" to speed,
                                    "etaSeconds" to eta,
                                    "percentage" to pct
                                ))

                                updateForegroundTransferProgress(pct, formatSpeed(speed), fileName, totalWritten, fileSize, speed, false)
                                AuraOverlayManager.getInstance(applicationContext).showOrUpdateTransferProgress(
                                    transferId = xferId,
                                    fileName = fileName,
                                    progressPercent = pct,
                                    transferredBytes = totalWritten,
                                    totalBytes = fileSize,
                                    speedBytesPerSec = speed,
                                    isSending = false
                                )
                            }
                        }
                        bos.flush()
                    } catch (e: Exception) {
                        writeError = true
                        Log.e(TAG, "Disk write error during inbound transfer: ${e.message}")
                    } finally {
                        try { fos.close() } catch (_: Exception) {}
                        activeClientSockets.remove(xferId)
                        activeTransfersState.remove(xferId)
                    }

                    if (activeTransfersState[xferId]?.isCancelled?.get() == true || writeError) {
                        stopForegroundTransferService()
                        AuraOverlayManager.getInstance(applicationContext).dismissCurrentOverlay()
                        try { tempPartFile.delete() } catch (_: Exception) {}
                        httpUploadSessions.remove(xferId)
                        sendJsonResponse(if (writeError) 500 else 499, if (writeError) "Internal Server Error" else "Client Closed Request", JSONObject().apply {
                            put("status", if (writeError) "error" else "cancelled")
                        })
                        return@withContext
                    }

                    if (totalWritten != fileSize) {
                        try { tempPartFile.delete() } catch (_: Exception) {}
                        httpUploadSessions.remove(xferId)
                        stopForegroundTransferService()
                        AuraOverlayManager.getInstance(applicationContext).dismissCurrentOverlay()
                        sendJsonResponse(400, "Bad Request", JSONObject().apply {
                            put("error", "Byte count mismatch: received $totalWritten bytes, expected $fileSize")
                        })
                        return@withContext
                    }

                    val calculatedSha256 = digest.digest().toHex()
                    if (expectedSha256.isNotEmpty() && !expectedSha256.startsWith("stream_")) {
                        if (!calculatedSha256.equals(expectedSha256, ignoreCase = true)) {
                            try { tempPartFile.delete() } catch (_: Exception) {}
                            httpUploadSessions.remove(xferId)
                            stopForegroundTransferService()
                            AuraOverlayManager.getInstance(applicationContext).dismissCurrentOverlay()
                            sendJsonResponse(422, "Unprocessable Entity", JSONObject().apply {
                                put("error", "SHA-256 integrity mismatch")
                                put("expected", expectedSha256)
                                put("actual", calculatedSha256)
                            })
                            return@withContext
                        }
                    }

                    // Atomic rename from temp file to final destination with fallback copy
                    var committed = tempPartFile.renameTo(finalFile)
                    if (!committed) {
                        try {
                            tempPartFile.copyTo(finalFile, overwrite = true)
                            tempPartFile.delete()
                            committed = true
                        } catch (e: Exception) {
                            Log.e(TAG, "Fallback copy of part file failed: ${e.message}")
                        }
                    }

                    if (!finalFile.exists() || finalFile.length() != fileSize) {
                        try { tempPartFile.delete() } catch (_: Exception) {}
                        httpUploadSessions.remove(xferId)
                        stopForegroundTransferService()
                        AuraOverlayManager.getInstance(applicationContext).dismissCurrentOverlay()
                        sendJsonResponse(500, "Internal Server Error", JSONObject().apply {
                            put("error", "Failed to commit destination file to storage")
                        })
                        return@withContext
                    }

                    // Register with MediaStore (so photos/videos show in Gallery immediately and downloads in system Downloads)
                    registerAndExportToMediaStore(finalFile)

                    if (sessionMeta.isFirstContact) {
                        AuraIdentityManager.markPeerTrusted(applicationContext, sessionMeta.senderUserId, sessionMeta.senderIdentityPubHex)
                    }
                    httpUploadSessions.remove(xferId)

                    stopForegroundTransferService()
                    AuraOverlayManager.getInstance(applicationContext).markTransferComplete(fileName, fileSize)

                    val elapsedTotalSec = Math.max(0.001, (System.currentTimeMillis() - startTime) / 1000.0)
                    val avgSpeed = (totalWritten / elapsedTotalSec).toLong()

                    dbHelper.insertTransfer(mapOf(
                        "id" to xferId,
                        "direction" to "received",
                        "senderName" to senderName,
                        "receiverName" to deviceName,
                        "fileName" to finalFile.name,
                        "fileSize" to totalWritten,
                        "status" to "completed",
                        "sha256" to calculatedSha256,
                        "localPath" to finalFile.absolutePath,
                        "transportType" to "LAN_TCP_STREAM",
                        "avgSpeed" to avgSpeed,
                        "createdAt" to System.currentTimeMillis()
                    ))

                    val completeMap = mapOf(
                        "transferId" to xferId,
                        "fileName" to finalFile.name,
                        "fileSize" to totalWritten,
                        "localPath" to finalFile.absolutePath,
                        "savedPath" to finalFile.absolutePath,
                        "sha256" to calculatedSha256,
                        "verified" to true
                    )
                    sendEvent("transferComplete", completeMap)
                    sendEvent("transferCompleted", completeMap)

                    cancelSystemIncomingShareNotification(xferId)

                    sendJsonResponse(200, "OK", JSONObject().apply {
                        put("success", true)
                        put("transferId", xferId)
                        put("verified", true)
                        put("sha256", calculatedSha256)
                        put("savedPath", finalFile.absolutePath)
                    })
                }

                else -> {
                    sendJsonResponse(404, "Not Found", JSONObject().apply {
                        put("error", "Not Found")
                    })
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "HTTP Inbound processing error: ${e.message}")
        }
    }

    private fun acceptIncomingTransfer(transferId: String) {
        val sessionMeta = httpUploadSessions[transferId]
        if (sessionMeta != null) {
            recentlyApprovedSenders[sessionMeta.senderUserId] = System.currentTimeMillis()
        }
        val httpDeferred = pendingHttpDecisions.remove(transferId)
        if (httpDeferred != null) {
            dbHelper.updateIncomingRequestStatus(transferId, "ACCEPTED")
            cancelSystemIncomingShareNotification(transferId)
            httpDeferred.complete(true)
            return
        }

        val session = activeTransfersState[transferId] ?: return
        if (session.isDeclined.get() || session.isAccepted.getAndSet(true)) return

        if (System.currentTimeMillis() > session.expiresAt) {
            dbHelper.updateIncomingRequestStatus(transferId, "EXPIRED")
            cancelSystemIncomingShareNotification(transferId)
            sendEvent("transferError", mapOf(
                "transferId" to transferId,
                "error" to "Incoming share request expired."
            ))
            return
        }

        dbHelper.updateIncomingRequestStatus(transferId, "ACCEPTED")
        cancelSystemIncomingShareNotification(transferId)
        val socket = session.socket

        scope.launch(Dispatchers.IO) {
            try {
                val output = BufferedOutputStream(socket.getOutputStream(), SOCKET_BUFFER_SIZE)
                val acceptJson = JSONObject().apply {
                    put("transferId", transferId)
                    put("accepted", true)
                }
                output.write(buildFrame(0x11, acceptJson.toString().toByteArray()))
                output.flush()

                startForegroundTransferService("Receiving files...", 0)
            } catch (e: Exception) {
                Log.e(TAG, "Error accepting transfer: ${e.message}")
            }
        }
    }

    private suspend fun handleInboundFileStream(
        input: BufferedInputStream,
        output: BufferedOutputStream,
        initPayloadLen: Int,
        transferId: String,
        session: TransferSession
    ) = withContext(Dispatchers.IO) {
        val downloadsDir = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "AuraDrop").apply {
            if (!exists()) mkdirs()
        }

        var currentFileOut: OutputStream? = null
        var currentPartFile: File? = null
        var currentFinalFile: File? = null

        val pBytes = ByteArray(initPayloadLen)
        input.readFully(pBytes)
        val fInfo = JSONObject(String(pBytes, Charsets.UTF_8))

        val rawFileName = fInfo.getString("filename")
        val safeName = sanitizeFilename(rawFileName)
        val currentFileExpectedBytes = fInfo.getLong("size")
        val currentExpectedChecksum = fInfo.optString("checksum", "")
        val currentMimeType = fInfo.optString("mimeType", "application/octet-stream")
        val totalExpectedTransferBytes = fInfo.optLong("totalTransferBytes", currentFileExpectedBytes)
        val resumeOffset = fInfo.optLong("offset", 0L)

        // Storage Check (Prompt Section 58)
        val usableSpace = downloadsDir.usableSpace
        val bytesNeeded = totalExpectedTransferBytes - resumeOffset
        if (bytesNeeded > usableSpace) {
            val reqStr = formatBytes(bytesNeeded)
            val availStr = formatBytes(usableSpace)
            val errMsg = "Not enough storage. Required: $reqStr, Available: $availStr"
            sendEvent("transferError", mapOf(
                "transferId" to transferId,
                "error" to errMsg
            ))
            output.write(buildFrame(0x26, JSONObject().apply {
                put("status", "INSUFFICIENT_STORAGE")
                put("message", errMsg)
            }.toString().toByteArray()))
            output.flush()
            throw IOException(errMsg)
        }

        currentFinalFile = resolveUniqueFile(downloadsDir, safeName)
        currentPartFile = File(downloadsDir, "${currentFinalFile.name}.part")

        // Resume mode or fresh file
        val appendMode = resumeOffset > 0 && currentPartFile.exists()
        currentFileOut = BufferedOutputStream(FileOutputStream(currentPartFile, appendMode), 2 * 1024 * 1024)

        var overallReceived = resumeOffset
        val startTime = System.currentTimeMillis()
        var lastEventTime = 0L
        
        var lastSpeedUpdateTime = startTime
        var lastSpeedUpdateBytes = overallReceived
        var movingAvgSpeed = 0L

        val currentDigest = MessageDigest.getInstance("SHA-256")
        // If resuming, read existing bytes into digest
        if (appendMode) {
            FileInputStream(currentPartFile).use { fis ->
                val buf = ByteArray(64 * 1024)
                var readBytes = 0
                while (fis.read(buf).also { readBytes = it } > 0) {
                    currentDigest.update(buf, 0, readBytes)
                }
            }
        }

        val header = ByteArray(20)
        var receiverBuffer = ByteArray(512 * 1024)

        while (session.socket.isConnected && !session.socket.isClosed && !session.isCancelled.get()) {
            val read = input.read(header, 0, 20)
            if (read == -1) break
            if (read < 20) input.readFullyRemaining(header, read, 20 - read)

            val frameType = header[5].toInt()
            val payloadLen = header.readUInt32BE(8)

            when (frameType) {
                0x21 -> { // CHUNK_DATA (Pure binary payload)
                    val chunkIdx = header.readUInt32BE(12)
                    if (receiverBuffer.size < payloadLen) {
                        receiverBuffer = ByteArray(payloadLen)
                    }
                    input.readFully(receiverBuffer, 0, payloadLen)

                    // Write chunk directly to disk buffer & update SHA-256 in single pass
                    currentFileOut.write(receiverBuffer, 0, payloadLen)
                    currentDigest.update(receiverBuffer, 0, payloadLen)

                    overallReceived += payloadLen

                    // Throttled UI Progress dispatch
                    val now = System.currentTimeMillis()
                    if (now - lastEventTime >= PROGRESS_EVENT_INTERVAL_MS) {
                        lastEventTime = now
                        
                        val speedDeltaTime = Math.max(1L, now - lastSpeedUpdateTime)
                        val speedDeltaBytes = overallReceived - lastSpeedUpdateBytes
                        val currentInstantSpeed = (speedDeltaBytes * 1000L) / speedDeltaTime
                        
                        movingAvgSpeed = (movingAvgSpeed * 0.7 + currentInstantSpeed * 0.3).toLong()
                        if (movingAvgSpeed == 0L && currentInstantSpeed > 0) {
                            movingAvgSpeed = currentInstantSpeed
                        }
                        
                        lastSpeedUpdateTime = now
                        lastSpeedUpdateBytes = overallReceived
                        
                        val rawPct = (overallReceived.toDouble() / Math.max(1L, totalExpectedTransferBytes).toDouble()) * 100.0
                        val safePct = if (overallReceived >= totalExpectedTransferBytes) 99.9 else Math.min(99.9, rawPct)
                        val eta = Math.max(0, ((totalExpectedTransferBytes - overallReceived) / Math.max(1L, movingAvgSpeed)).toInt())

                        sendEvent("transferProgress", mapOf(
                            "transferId" to transferId,
                            "state" to "TRANSFERRING",
                            "fileName" to currentFinalFile.name,
                            "transferredBytes" to overallReceived,
                            "totalBytes" to totalExpectedTransferBytes,
                            "speedBytesPerSec" to movingAvgSpeed,
                            "percentage" to safePct,
                            "etaSeconds" to eta,
                            "verificationState" to "STREAMING"
                        ))

                        updateForegroundTransferProgress(safePct.toInt(), formatSpeed(movingAvgSpeed), currentFinalFile.name, overallReceived, totalExpectedTransferBytes, movingAvgSpeed, false)
                    }
                }

                0x23 -> { // FILE_END
                    val endBytes = ByteArray(payloadLen)
                    input.readFully(endBytes)
                    val endInfo = JSONObject(String(endBytes, Charsets.UTF_8))
                    val finalExpectedSha = endInfo.optString("checksum", currentExpectedChecksum)

                    currentFileOut.flush()
                    currentFileOut.close()

                    sendEvent("transferProgress", mapOf(
                        "transferId" to transferId,
                        "state" to "VERIFYING",
                        "fileName" to currentFinalFile.name,
                        "transferredBytes" to overallReceived,
                        "totalBytes" to totalExpectedTransferBytes,
                        "percentage" to 99.9,
                        "verificationState" to "VERIFYING_SHA256"
                    ))

                    val actualSha256 = currentDigest.digest().toHex()
                    val isChecksumValid = finalExpectedSha.isEmpty() || finalExpectedSha.equals(actualSha256, ignoreCase = true)

                    if (!isChecksumValid) {
                        currentPartFile.delete()
                        output.write(buildFrame(0x26, JSONObject().apply {
                            put("status", "FAILED_INTEGRITY")
                            put("expected", finalExpectedSha)
                            put("actual", actualSha256)
                        }.toString().toByteArray()))
                        output.flush()
                        throw IOException("Checksum integrity mismatch!")
                    }

                    // Rename .part to final file
                    currentPartFile.renameTo(currentFinalFile)
                    MediaScannerConnection.scanFile(
                        applicationContext,
                        arrayOf(currentFinalFile.absolutePath),
                        arrayOf(currentMimeType),
                        null
                    )

                    // Reply FILE_ACK
                    output.write(buildFrame(0x25, JSONObject().apply {
                        put("status", "VERIFIED_OK")
                        put("checksum", actualSha256)
                    }.toString().toByteArray()))
                    output.flush()

                    val durationMs = System.currentTimeMillis() - startTime
                    val avgSpeed = if (durationMs > 0) (overallReceived * 1000) / durationMs else 0L

                    // Send DATABASE_COMMIT state
                    sendEvent("transferProgress", mapOf(
                        "transferId" to transferId,
                        "state" to "DATABASE_COMMIT",
                        "fileName" to currentFinalFile.name,
                        "transferredBytes" to overallReceived,
                        "totalBytes" to totalExpectedTransferBytes,
                        "percentage" to 99.9,
                        "verificationState" to "SAVING_HISTORY"
                    ))

                    // Save to SQLite History
                    dbHelper.insertTransfer(mapOf(
                        "id" to transferId,
                        "timestamp" to System.currentTimeMillis(),
                        "senderName" to session.senderName,
                        "receiverName" to deviceName,
                        "fileName" to currentFinalFile.name,
                        "fileType" to currentMimeType,
                        "fileSize" to overallReceived,
                        "direction" to "received",
                        "status" to "completed",
                        "durationMs" to durationMs,
                        "avgSpeed" to avgSpeed,
                        "sha256" to actualSha256,
                        "localPath" to currentFinalFile.absolutePath,
                        "transportType" to "LAN_TCP"
                    ))

                    dbHelper.updateIncomingRequestStatus(transferId, "COMPLETED")
                    notifyForegroundTransferComplete(currentFinalFile.name, currentFinalFile.absolutePath, overallReceived)

                    sendEvent("transferCompleted", mapOf(
                        "transferId" to transferId,
                        "savedPath" to currentFinalFile.absolutePath,
                        "fileName" to currentFinalFile.name,
                        "totalBytes" to overallReceived,
                        "avgSpeed" to avgSpeed,
                        "sha256" to actualSha256,
                        "percentage" to 100.0,
                        "state" to "COMPLETED",
                        "verificationState" to "VERIFIED"
                    ))
                    break
                }
            }
        }

        if (session.isCancelled.get()) {
            try { currentFileOut?.close() } catch (_: Exception) {}
            try { currentPartFile?.delete() } catch (_: Exception) {}
            stopForegroundTransferService()
            AuraOverlayManager.getInstance(applicationContext).dismissCurrentOverlay()
            sendEvent("transferCancelled", mapOf("transferId" to transferId))
        }
    }

    private fun declineIncomingTransfer(transferId: String) {
        val httpDeferred = pendingHttpDecisions.remove(transferId)
        if (httpDeferred != null) {
            dbHelper.updateIncomingRequestStatus(transferId, "DECLINED")
            cancelSystemIncomingShareNotification(transferId)
            httpDeferred.complete(false)
            return
        }

        val session = activeTransfersState.remove(transferId) ?: return
        if (session.isAccepted.get() || session.isDeclined.getAndSet(true)) return
        dbHelper.updateIncomingRequestStatus(transferId, "DECLINED")
        cancelSystemIncomingShareNotification(transferId)
        val socket = session.socket
        scope.launch(Dispatchers.IO) {
            try {
                val output = BufferedOutputStream(socket.getOutputStream(), 4096)
                val declineJson = JSONObject().apply {
                    put("transferId", transferId)
                    put("accepted", false)
                    put("reason", "user_declined")
                }
                output.write(buildFrame(0x11, declineJson.toString().toByteArray()))
                output.flush()
                socket.close()
            } catch (e: Exception) {}
        }
    }

    private fun cancelTransferSession(transferId: String) {
        if (transferId.isNotBlank()) {
            pendingHttpDecisions.remove(transferId)?.complete(false)
            pendingOutboundVerifications.remove(transferId)?.complete(false)
            activeTransfersState[transferId]?.isCancelled?.set(true)
            try { activeClientSockets.remove(transferId)?.close() } catch (_: Exception) {}
            try { activeHttpConnections.remove(transferId)?.disconnect() } catch (_: Exception) {}
            activeTransfersState.remove(transferId)
            httpUploadSessions.remove(transferId)
        } else {
            pendingHttpDecisions.values.forEach { it.complete(false) }
            pendingHttpDecisions.clear()
            pendingOutboundVerifications.values.forEach { it.complete(false) }
            pendingOutboundVerifications.clear()
            activeTransfersState.values.forEach { it.isCancelled.set(true) }
            activeClientSockets.values.forEach { try { it.close() } catch (_: Exception) {} }
            activeHttpConnections.values.forEach { try { it.disconnect() } catch (_: Exception) {} }
            activeTransfersState.clear()
            activeClientSockets.clear()
            activeHttpConnections.clear()
            httpUploadSessions.clear()
        }
        stopForegroundTransferService()
        AuraOverlayManager.getInstance(this).dismissCurrentOverlay()
        sendEvent("transferCancelled", mapOf(
            "transferId" to transferId
        ))
        sendEvent("transferError", mapOf(
            "transferId" to transferId,
            "error" to "Transfer cancelled by user"
        ))
    }

    // ----------------------------------------------------
    // Robust URI & Direct File Stream Resolver
    // ----------------------------------------------------
    private fun openStreamSafely(uriOrPath: String): InputStream {
        val trimmed = uriOrPath.trim()
        if (trimmed.startsWith("content://", ignoreCase = true)) {
            val uri = Uri.parse(trimmed)
            return contentResolver.openInputStream(uri)
                ?: throw FileNotFoundException("Could not open content stream: $trimmed")
        }
        val cleanPath = if (trimmed.startsWith("file://", ignoreCase = true)) {
            Uri.parse(trimmed).path ?: trimmed.substring(7)
        } else {
            trimmed
        }
        val file = File(cleanPath)
        if (file.exists() && file.canRead()) {
            return FileInputStream(file)
        }
        return try {
            contentResolver.openInputStream(Uri.parse(trimmed))
                ?: FileInputStream(file)
        } catch (_: Exception) {
            FileInputStream(file)
        }
    }

    // ----------------------------------------------------
    // TCP Streaming Client (High-Throughput Sender)
    // ----------------------------------------------------
    private suspend fun trySendFilesViaHttp(
        targetIp: String,
        targetPort: Int,
        filesList: List<Map<String, Any>>,
        transferId: String
    ): Boolean {
        if (targetIp.isBlank() || filesList.isEmpty()) return false
        val effectivePort = if (targetPort > 0) targetPort else DEFAULT_PORT
        val prof = dbHelper.getProfile()
        val savedName = prof["display_name"]
        val senderDisplayName = if (!savedName.isNullOrBlank() && savedName != "AuraDrop User") savedName else deviceName

        val transferSession = activeTransfersState.getOrPut(transferId) {
            TransferSession(
                transferId = transferId,
                socket = Socket(),
                senderName = senderDisplayName
            )
        }

        for ((fileIdx, fileMap) in filesList.withIndex()) {
            if (transferSession.isCancelled.get()) return false

            val uriStr = (fileMap["uri"] as? String)?.takeIf { it.isNotBlank() }
                ?: (fileMap["path"] as? String)?.takeIf { it.isNotBlank() }
                ?: continue
            val fileName = fileMap["name"] as? String ?: "file"
            var fileSize = (fileMap["size"] as? Number)?.toLong() ?: 0L
            if (fileSize <= 0L) {
                try {
                    val f = File(if (uriStr.startsWith("file://")) uriStr.substring(7) else uriStr)
                    if (f.exists()) fileSize = f.length()
                } catch (_: Exception) {}
            }
            val fileTransferId = if (filesList.size == 1) transferId else "${transferId}_${fileIdx + 1}"

            sendEvent("dataChannelState", mapOf(
                "transferId" to fileTransferId,
                "state" to "DATA_CHANNEL_CONNECTING"
            ))

            val prepUrl = URL("http://$targetIp:$effectivePort/api/auradrop/v1/prepare-upload")
            val prepConn = (prepUrl.openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                connectTimeout = 10000
                readTimeout = 65000
                doOutput = true
                setRequestProperty("Content-Type", "application/json")
            }

            val senderEph = AuraAeadCrypto.generateEphemeralKeyPair()
            val senderSec1 = AuraAeadCrypto.exportSec1PublicKey(senderEph.public as ECPublicKey)
            val senderTranscript = "auradrop/auth/v1/sender:auradrop/tcp/2:$fileTransferId:$deviceId:${senderSec1.toHex()}".toByteArray(Charsets.UTF_8)
            val senderSig = AuraIdentityManager.sign(senderTranscript)

            val prepPayload = JSONObject().apply {
                put("transferId", fileTransferId)
                put("fileId", fileTransferId)
                put("fileName", fileName)
                put("fileSize", fileSize)
                put("sha256", "")
                put("senderUserId", deviceId)
                put("senderName", senderDisplayName)
                put("senderEphPubKey", senderSec1.toHex())
                put("senderIdentityPubKey", AuraIdentityManager.getPublicKeyHex())
                put("senderSignature", senderSig)
            }

            prepConn.outputStream.use { os ->
                os.write(prepPayload.toString().toByteArray(Charsets.UTF_8))
                os.flush()
            }

            if (prepConn.responseCode !in 200..299) {
                val errText = try { prepConn.errorStream?.bufferedReader()?.readText() } catch (_: Exception) { "" }
                Log.e(TAG, "Prepare-upload failed: HTTP ${prepConn.responseCode} - $errText")
                prepConn.disconnect()
                return false
            }

            val prepRespStr = prepConn.inputStream.bufferedReader().readText()
            prepConn.disconnect()
            val prepResp = JSONObject(prepRespStr)
            val token = prepResp.optString("oneTimeToken", "")
            val encryptionMode = prepResp.optString("encryption", "")
            val receiverId = prepResp.optString("receiverId", prepResp.optString("receiverUserId", ""))

            // Strict fail-closed policy: reject if recipient declined authenticated encryption
            if (encryptionMode != "aead-aes256-gcm") {
                Log.e(TAG, "Recipient rejected authenticated encryption. Plaintext transfer is forbidden.")
                sendEvent("transferError", mapOf(
                    "transferId" to fileTransferId,
                    "error" to "Recipient rejected authenticated encryption. Plaintext transfer is forbidden."
                ))
                return false
            }

            val receiverEphHex = prepResp.optString("receiverEphPubKey", "")
            val receiverIdentityPubKey = prepResp.optString("receiverIdentityPubKey", "")
            val receiverSignature = prepResp.optString("receiverSignature", "")
            val protocol = prepResp.optString("protocol", "auradrop/tcp/2")

            if (receiverEphHex.isEmpty() || receiverIdentityPubKey.isEmpty() || receiverSignature.isEmpty()) {
                Log.e(TAG, "Recipient omitted required cryptographic credentials")
                sendEvent("transferError", mapOf(
                    "transferId" to fileTransferId,
                    "error" to "Recipient omitted required cryptographic credentials. Plaintext transfer is forbidden."
                ))
                return false
            }

            // Verify receiver signature over receiver transcript and validate against Trust Store
            val receiverTranscript = "auradrop/auth/v1/receiver:$protocol:$fileTransferId:$token:$deviceId:$receiverId:${senderSec1.toHex()}:$receiverEphHex".toByteArray(Charsets.UTF_8)
            val isFirstContact = AuraIdentityManager.verifyPeerHandshake(
                applicationContext,
                receiverId,
                receiverIdentityPubKey,
                receiverTranscript,
                receiverSignature
            )
            if (isFirstContact == null) {
                Log.e(TAG, "Cryptographic receiver authentication failed!")
                sendEvent("transferError", mapOf(
                    "transferId" to fileTransferId,
                    "error" to "Cryptographic receiver authentication failed! MitM or identity spoofing detected."
                ))
                return false
            }

            val receiverPub = AuraAeadCrypto.importSec1PublicKey(receiverEphHex.decodeHex())
            val sharedSecret = AuraAeadCrypto.agreeEphemeral(senderEph.private, receiverPub)


            if (isFirstContact) {
                Log.i(TAG, "[AuraTransfer] Outbound first contact with receiver $receiverId - Trust established")
                AuraIdentityManager.markPeerTrusted(applicationContext, receiverId, receiverIdentityPubKey)
            }
            val sessionKey = AuraAeadCrypto.deriveDirectionalSessionKeys(
                sharedSecret,
                fileTransferId,
                token,
                deviceId,
                receiverId,
                AuraIdentityManager.getPublicKeyHex(),
                receiverIdentityPubKey
            )

            sendEvent("dataChannelState", mapOf(
                "transferId" to fileTransferId,
                "state" to "READY_TO_TRANSFER"
            ))

            // Clean URL: Token and transfer ID removed from query string per security requirements
            val uploadUrl = URL("http://$targetIp:$effectivePort/api/auradrop/v1/upload")
            val uploadConn = (uploadUrl.openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                connectTimeout = 10000
                readTimeout = 3600000
                doOutput = true
                setChunkedStreamingMode(512 * 1024)
                setRequestProperty("Authorization", "Bearer $token")
                setRequestProperty("x-token", token)
                setRequestProperty("x-transfer-id", fileTransferId)
                setRequestProperty("x-sender-id", deviceId)
                setRequestProperty("x-file-name", fileName)
                setRequestProperty("x-file-size", fileSize.toString())
                setRequestProperty("x-encryption", "aead-aes256-gcm")
                setRequestProperty("Content-Type", "application/octet-stream")
            }

            activeHttpConnections[fileTransferId] = uploadConn

            startForegroundTransferService("Sending $fileName...", 0)
            val startTime = System.currentTimeMillis()
            var lastProgressTime = 0L
            var lastSpeedTime = startTime
            var lastSpeedBytes = 0L
            var smoothedSpeed = 0.0
            var sentBytes = 0L
            val buf = ByteArray(512 * 1024)

            val inputStream = try {
                openStreamSafely(uriStr)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to open input stream for $fileName ($uriStr): ${e.message}")
                sendEvent("transferError", mapOf(
                    "transferId" to fileTransferId,
                    "error" to "Could not read file '$fileName': ${e.message}"
                ))
                return false
            }

            try {
                inputStream.use { fis ->
                    uploadConn.outputStream.use { uos ->
                        val bos = BufferedOutputStream(uos, 512 * 1024)
                        val dos = DataOutputStream(bos)
                        var chunkIndex = 0L
                        while (sentBytes < fileSize) {
                            if (transferSession.isCancelled.get() || activeTransfersState[transferId]?.isCancelled?.get() == true) {
                                uploadConn.disconnect()
                                break
                            }
                            val toRead = Math.min(buf.size.toLong(), fileSize - sentBytes).toInt()
                            val r = fis.read(buf, 0, toRead)
                            if (r == -1) break

                            val nonce = AuraAeadCrypto.createChunkNonce(1337, chunkIndex)
                            val aad = "$fileTransferId:$chunkIndex".toByteArray(Charsets.UTF_8)
                            val ciphertextAndTag = AuraAeadCrypto.encryptChunk(sessionKey, nonce, aad, buf, 0, r)
                            chunkIndex++

                            dos.writeInt(ciphertextAndTag.size)
                            dos.write(nonce)
                            dos.write(ciphertextAndTag)
                            sentBytes += r

                            val now = System.currentTimeMillis()
                            if (now - lastProgressTime >= PROGRESS_EVENT_INTERVAL_MS || sentBytes == fileSize) {
                                lastProgressTime = now
                                val timeDeltaSec = Math.max(0.001, (now - lastSpeedTime) / 1000.0)
                                if (timeDeltaSec >= 0.15 || sentBytes == fileSize) {
                                    val bytesDelta = sentBytes - lastSpeedBytes
                                    val currentSampleSpeed = bytesDelta / timeDeltaSec
                                    smoothedSpeed = if (smoothedSpeed == 0.0) {
                                        currentSampleSpeed
                                    } else {
                                        0.35 * currentSampleSpeed + 0.65 * smoothedSpeed
                                    }
                                    lastSpeedTime = now
                                    lastSpeedBytes = sentBytes
                                }
                                val speed = smoothedSpeed.toLong().coerceAtLeast(0L)
                                val pct = if (fileSize > 0) ((sentBytes.toDouble() / fileSize.toDouble()) * 100.0).toInt().coerceAtMost(99) else 100
                                val eta = if (speed > 0) ((fileSize - sentBytes) / speed).toInt() else 0

                                sendEvent("transferProgress", mapOf(
                                    "transferId" to fileTransferId,
                                    "state" to "TRANSFERRING",
                                    "fileName" to fileName,
                                    "totalBytes" to fileSize,
                                    "transferredBytes" to sentBytes,
                                    "speedBytesPerSec" to speed,
                                    "etaSeconds" to eta,
                                    "percentage" to pct
                                ))

                                updateForegroundTransferProgress(pct, formatSpeed(speed), fileName, sentBytes, fileSize, speed, true)
                            }
                        }
                        dos.flush()
                        bos.flush()
                    }
                }
            } finally {
                activeHttpConnections.remove(fileTransferId)
            }

            if (transferSession.isCancelled.get() || activeTransfersState[transferId]?.isCancelled?.get() == true) {
                stopForegroundTransferService()
                AuraOverlayManager.getInstance(applicationContext).dismissCurrentOverlay()
                sendEvent("transferCancelled", mapOf("transferId" to fileTransferId))
                return false
            }

            val uploadStatus = uploadConn.responseCode
            val uploadRespStr = if (uploadStatus in 200..299) uploadConn.inputStream.bufferedReader().readText() else ""
            uploadConn.disconnect()

            if (uploadStatus in 200..299) {
                if (isFirstContact) {
                    AuraIdentityManager.markPeerTrusted(applicationContext, receiverId, receiverIdentityPubKey)
                }
                notifyForegroundTransferComplete(fileName, uriStr, sentBytes)
                val elapsedTotalSec = Math.max(0.001, (System.currentTimeMillis() - startTime) / 1000.0)
                val avgSpeed = (sentBytes / elapsedTotalSec).toLong()

                dbHelper.insertTransfer(mapOf(
                    "id" to fileTransferId,
                    "direction" to "sent",
                    "senderName" to senderDisplayName,
                    "receiverName" to targetIp,
                    "fileName" to fileName,
                    "fileSize" to sentBytes,
                    "status" to "completed",
                    "sha256" to "",
                    "localPath" to uriStr,
                    "transportType" to "LAN_HTTP_STREAM",
                    "avgSpeed" to avgSpeed,
                    "createdAt" to System.currentTimeMillis()
                ))

                val completeMap = mapOf(
                    "transferId" to fileTransferId,
                    "fileName" to fileName,
                    "fileSize" to sentBytes,
                    "verified" to true
                )
                sendEvent("transferComplete", completeMap)
                sendEvent("transferCompleted", completeMap)
            } else {
                return false
            }
        }
        return true
    }

    private fun startSendFilesTask(targetIp: String, targetPort: Int, filesList: List<Map<String, Any>>) {
        val transferId = "send_" + UUID.randomUUID().toString().replace("-", "").substring(0, 10)

        scope.launch(Dispatchers.IO) {
            if (targetIp.isBlank()) {
                Log.e(TAG, "Cannot start send: targetIp is blank")
                sendEvent("transferError", mapOf("transferId" to transferId, "error" to "Target IP address is missing."))
                return@launch
            }
            if (filesList.isEmpty()) {
                Log.e(TAG, "Cannot start send: filesList is empty")
                sendEvent("transferError", mapOf("transferId" to transferId, "error" to "No files selected."))
                return@launch
            }

            // High-speed HTTP direct upload trial (100MB/s compatible with Desktop axum engine)
            var httpSuccess = false
            try {
                httpSuccess = trySendFilesViaHttp(targetIp, targetPort, filesList, transferId)
            } catch (e: Exception) {
                Log.d(TAG, "HTTP upload trial failed, falling back: ${e.message}")
            }
            if (httpSuccess || activeTransfersState[transferId]?.isCancelled?.get() == true) {
                return@launch
            }

            var socket: Socket? = null
            try {
                sendEvent("dataChannelState", mapOf(
                    "transferId" to transferId,
                    "state" to "DATA_CHANNEL_CONNECTING"
                ))

                socket = Socket().apply {
                    tcpNoDelay = true
                    trafficClass = 0x10 // IPTOS_THROUGHPUT
                    sendBufferSize = SOCKET_BUFFER_SIZE
                    receiveBufferSize = SOCKET_BUFFER_SIZE
                    connect(InetSocketAddress(targetIp, targetPort), 7000)
                }

                val session = TransferSession(transferId, socket)
                activeTransfersState[transferId] = session
                activeClientSockets[transferId] = socket

                val output = BufferedOutputStream(socket.getOutputStream(), SOCKET_BUFFER_SIZE)
                val input = BufferedInputStream(socket.getInputStream(), SOCKET_BUFFER_SIZE)

                // Handshake Init
                val clientNonce = UUID.randomUUID().toString()
                val initJson = JSONObject().apply {
                    put("protocolVersion", "P2PFS/1")
                    put("deviceId", deviceId)
                    put("deviceName", deviceName)
                    put("platform", "android")
                    put("nonce", clientNonce)
                }
                output.write(buildFrame(0x01, initJson.toString().toByteArray()))
                output.flush()

                // Read Handshake Resp
                val header = ByteArray(20)
                input.readFully(header)
                val respLen = header.readUInt32BE(8)
                val respBytes = ByteArray(respLen)
                input.readFully(respBytes)
                val respJson = JSONObject(String(respBytes, Charsets.UTF_8))

                if (respJson.optString("nonceEcho") != clientNonce) {
                    throw IOException("Handshake integrity check failed")
                }

                // Health Check Ping / Pong
                val pingData = "HEALTH_PING_${System.currentTimeMillis()}".toByteArray()
                output.write(buildFrame(0x03, pingData))
                output.flush()

                input.readFully(header)
                val pongLen = header.readUInt32BE(8)
                val pongBytes = ByteArray(pongLen)
                input.readFully(pongBytes)

                sendEvent("dataChannelState", mapOf(
                    "transferId" to transferId,
                    "state" to "READY_TO_TRANSFER"
                ))

                // Negotiation Request
                val totalBytes = filesList.sumOf { (it["size"] as? Number)?.toLong() ?: 0L }
                val filesJsonArr = JSONArray()
                for (f in filesList) {
                    filesJsonArr.put(JSONObject().apply {
                        put("id", f["id"] ?: UUID.randomUUID().toString())
                        put("name", f["name"] ?: "unnamed")
                        put("size", (f["size"] as? Number)?.toLong() ?: 0L)
                        put("mimeType", f["mimeType"] ?: "application/octet-stream")
                    })
                }

                val prof = dbHelper.getProfile()
                val savedName = prof["display_name"]
                val senderDisplayName = if (!savedName.isNullOrBlank() && savedName != "AuraDrop User") savedName else deviceName

                val negJson = JSONObject().apply {
                    put("transferId", transferId)
                    put("senderName", senderDisplayName)
                    put("senderDeviceName", deviceName)
                    put("deviceId", deviceId)
                    put("totalFiles", filesList.size)
                    put("totalBytes", totalBytes)
                    put("files", filesJsonArr)
                    put("createdAt", System.currentTimeMillis())
                    put("expiresAt", System.currentTimeMillis() + 60000L)
                }
                output.write(buildFrame(0x10, negJson.toString().toByteArray()))
                output.flush()

                sendEvent("transferProgress", mapOf(
                    "transferId" to transferId,
                    "state" to "WAITING_FOR_ACCEPTANCE",
                    "totalBytes" to totalBytes,
                    "transferredBytes" to 0L,
                    "percentage" to 0
                ))

                // Negotiation Response with 60-second timeout
                socket.soTimeout = 60000
                input.readFully(header)
                val negRespLen = header.readUInt32BE(8)
                val negRespBytes = ByteArray(negRespLen)
                input.readFully(negRespBytes)
                val negRespJson = JSONObject(String(negRespBytes, Charsets.UTF_8))
                socket.soTimeout = 0

                if (!negRespJson.optBoolean("accepted", false)) {
                    val declineReason = negRespJson.optString("reason", "declined")
                    val errorMsg = if (declineReason == "blocked") "Transfer was blocked by recipient."
                    else if (declineReason == "visibility_off") "Recipient has sharing turned off."
                    else if (declineReason == "not_trusted") "Recipient only accepts transfers from trusted contacts."
                    else "Recipient declined the transfer request."
                    sendEvent("transferError", mapOf(
                        "transferId" to transferId,
                        "error" to errorMsg
                    ))
                    return@launch
                }

                startForegroundTransferService("Sending files...", 0)

                // Turbo High-Speed Chunk Engine (Starts at 1 MB, scales up to 2 MB / 4 MB for 100MB/s wire speed)
                var currentChunkSize = 1024 * 1024
                var chunkBuffer = ByteArray(currentChunkSize)
                var overallSent = 0L
                val startTime = System.currentTimeMillis()
                var lastEventTime = 0L
                
                var lastSpeedUpdateTime = startTime
                var lastSpeedUpdateBytes = 0L
                var movingAvgSpeed = 0L

                for (fileMap in filesList) {
                    if (session.isCancelled.get()) break

                    val uriStr = (fileMap["uri"] as? String)?.takeIf { it.isNotBlank() }
                        ?: (fileMap["path"] as? String)?.takeIf { it.isNotBlank() }
                        ?: continue
                    val fileName = fileMap["name"] as? String ?: "file"
                    var fileSize = (fileMap["size"] as? Number)?.toLong() ?: 0L
                    if (fileSize <= 0L) {
                        try {
                            val f = File(if (uriStr.startsWith("file://")) uriStr.substring(7) else uriStr)
                            if (f.exists()) fileSize = f.length()
                        } catch (_: Exception) {}
                    }
                    val mimeType = fileMap["mimeType"] as? String ?: "application/octet-stream"

                    val fileDigest = MessageDigest.getInstance("SHA-256")

                    // Send FILE_START
                    val startJson = JSONObject().apply {
                        put("fileId", fileMap["id"] ?: "f1")
                        put("filename", fileName)
                        put("size", fileSize)
                        put("mimeType", mimeType)
                        put("totalTransferBytes", totalBytes)
                        put("offset", 0L)
                    }
                    output.write(buildFrame(0x20, startJson.toString().toByteArray()))
                    output.flush()

                    val inputStream = try {
                        openStreamSafely(uriStr)
                    } catch (e: Exception) {
                        Log.e(TAG, "Failed to open file for $fileName ($uriStr): ${e.message}")
                        sendEvent("transferError", mapOf(
                            "transferId" to transferId,
                            "error" to "Could not open file '$fileName': ${e.message}"
                        ))
                        continue
                    }

                    var fileSent = 0L
                    var chunkIdx = 0

                    inputStream.use { stream ->
                        val bufferedStream = BufferedInputStream(stream, SOCKET_BUFFER_SIZE)

                        while (fileSent < fileSize && !session.isCancelled.get()) {
                            // Adapt chunk size dynamically based on wire throughput
                            val elapsedNow = Math.max(0.1, (System.currentTimeMillis() - startTime) / 1000.0)
                            val currentSpeed = overallSent / elapsedNow
                            val targetChunkSize = when {
                                currentSpeed > 50 * 1024 * 1024 -> 4 * 1024 * 1024 // 4 MB
                                currentSpeed > 15 * 1024 * 1024 -> 2 * 1024 * 1024 // 2 MB
                                else -> 1024 * 1024                                 // 1 MB
                            }
                            if (targetChunkSize != currentChunkSize) {
                                currentChunkSize = targetChunkSize
                                chunkBuffer = ByteArray(currentChunkSize)
                            }

                            val toRead = Math.min(currentChunkSize.toLong(), fileSize - fileSent).toInt()
                            val bytesRead = bufferedStream.read(chunkBuffer, 0, toRead)
                            if (bytesRead <= 0) break

                            fileDigest.update(chunkBuffer, 0, bytesRead)

                            // Direct 20-byte frame header with pure payload stream (zero copy, zero buffer allocation)
                            val chunkFrameHeader = buildChunkFrameHeader(chunkIdx, bytesRead)
                            output.write(chunkFrameHeader)
                            output.write(chunkBuffer, 0, bytesRead)

                            fileSent += bytesRead
                            overallSent += bytesRead
                            chunkIdx++

                            // Throttle EventChannel UI updates to 11/sec
                            val now = System.currentTimeMillis()
                            if (now - lastEventTime >= PROGRESS_EVENT_INTERVAL_MS) {
                                lastEventTime = now
                                
                                val speedDeltaTime = Math.max(1L, now - lastSpeedUpdateTime)
                                val speedDeltaBytes = overallSent - lastSpeedUpdateBytes
                                val currentInstantSpeed = (speedDeltaBytes * 1000L) / speedDeltaTime
                                
                                movingAvgSpeed = (movingAvgSpeed * 0.7 + currentInstantSpeed * 0.3).toLong()
                                if (movingAvgSpeed == 0L && currentInstantSpeed > 0) {
                                    movingAvgSpeed = currentInstantSpeed
                                }
                                
                                lastSpeedUpdateTime = now
                                lastSpeedUpdateBytes = overallSent
                                
                                val rawPct = (overallSent.toDouble() / Math.max(1L, totalBytes).toDouble()) * 100.0
                                val safePct = if (overallSent >= totalBytes) 99.9 else Math.min(99.9, rawPct)
                                val eta = Math.max(0, ((totalBytes - overallSent) / Math.max(1L, movingAvgSpeed)).toInt())

                                sendEvent("transferProgress", mapOf(
                                    "transferId" to transferId,
                                    "state" to "TRANSFERRING",
                                    "fileName" to fileName,
                                    "transferredBytes" to overallSent,
                                    "totalBytes" to totalBytes,
                                    "speedBytesPerSec" to movingAvgSpeed,
                                    "percentage" to safePct,
                                    "etaSeconds" to eta,
                                    "verificationState" to "STREAMING"
                                ))

                                updateForegroundTransferProgress(safePct.toInt(), formatSpeed(movingAvgSpeed), fileName, overallSent, totalBytes, movingAvgSpeed, true)
                            }
                        }
                    }

                    if (session.isCancelled.get()) {
                        stopForegroundTransferService()
                        AuraOverlayManager.getInstance(applicationContext).dismissCurrentOverlay()
                        sendEvent("transferCancelled", mapOf("transferId" to transferId))
                        return@launch
                    }

                    // Flush socket before ending file
                    output.flush()

                    val senderSha256 = fileDigest.digest().toHex()

                    // Send FILE_END
                    output.write(buildFrame(0x23, JSONObject().apply {
                        put("fileId", fileMap["id"])
                        put("checksum", senderSha256)
                    }.toString().toByteArray()))
                    output.flush()

                    // Await FILE_ACK
                    sendEvent("transferProgress", mapOf(
                        "transferId" to transferId,
                        "state" to "VERIFYING",
                        "percentage" to 99.9,
                        "verificationState" to "VERIFYING_SHA256"
                    ))

                    input.readFully(header)
                    val ackLen = header.readUInt32BE(8)
                    val ackBytes = ByteArray(ackLen)
                    input.readFully(ackBytes)
                    val ackJson = JSONObject(String(ackBytes, Charsets.UTF_8))

                    if (ackJson.optString("status") != "VERIFIED_OK") {
                        throw IOException("Receiver integrity verification failed.")
                    }

                    val durationMs = System.currentTimeMillis() - startTime
                    val avgSpeed = if (durationMs > 0) (overallSent * 1000) / durationMs else 0L

                    // Save to SQLite History
                    dbHelper.insertTransfer(mapOf(
                        "id" to transferId,
                        "timestamp" to System.currentTimeMillis(),
                        "senderName" to deviceName,
                        "receiverName" to "Nearby Recipient",
                        "fileName" to fileName,
                        "fileType" to mimeType,
                        "fileSize" to fileSize,
                        "direction" to "sent",
                        "status" to "completed",
                        "durationMs" to durationMs,
                        "avgSpeed" to avgSpeed,
                        "sha256" to senderSha256,
                        "localPath" to uriStr,
                        "transportType" to "LAN_TCP"
                    ))
                }

                if (session.isCancelled.get()) {
                    stopForegroundTransferService()
                    AuraOverlayManager.getInstance(applicationContext).dismissCurrentOverlay()
                    sendEvent("transferCancelled", mapOf("transferId" to transferId))
                    return@launch
                }

                // Send TRANSFER_COMPLETE
                output.write(buildFrame(0x24, JSONObject().apply {
                    put("transferId", transferId)
                    put("status", "complete")
                }.toString().toByteArray()))
                output.flush()

                notifyForegroundTransferComplete("Transfer complete", "", overallSent)

                sendEvent("transferCompleted", mapOf(
                    "transferId" to transferId,
                    "totalBytes" to overallSent,
                    "percentage" to 100.0,
                    "state" to "COMPLETED",
                    "verificationState" to "VERIFIED"
                ))
            } catch (e: Exception) {
                Log.e(TAG, "Transfer send error: ${e.message}")
                stopForegroundTransferService()
                sendEvent("transferError", mapOf(
                    "transferId" to transferId,
                    "error" to (e.message ?: "Transfer error")
                ))
            } finally {
                socket?.close()
                activeClientSockets.remove(transferId)
                activeTransfersState.remove(transferId)
            }
        }
    }

    // ----------------------------------------------------
    // Offline P2P Chat Client Socket
    // ----------------------------------------------------
    private fun sendOfflineChatMessage(targetIp: String, targetPort: Int = DEFAULT_PORT, peerId: String, peerName: String, text: String) {
        val messageId = "msg_" + UUID.randomUUID().toString().replace("-", "").substring(0, 8)
        val timestamp = System.currentTimeMillis()

        val msgMap = mapOf(
            "id" to messageId,
            "peerId" to peerId,
            "peerName" to peerName,
            "senderId" to deviceId,
            "text" to text,
            "timestamp" to timestamp,
            "status" to "sent" // Immediate local P2P assumption
        )
        dbHelper.insertChatMessage(msgMap)
        sendEvent("chatMessageSent", msgMap)

        scope.launch(Dispatchers.IO) {
            var delivered = false
            try {
                val effectivePort = if (targetPort > 0) targetPort else DEFAULT_PORT
                val url = URL("http://$targetIp:$effectivePort/api/auradrop/v1/chat")
                val conn = (url.openConnection() as HttpURLConnection).apply {
                    requestMethod = "POST"
                    connectTimeout = 3000
                    readTimeout = 4000
                    doOutput = true
                    setRequestProperty("Content-Type", "application/json")
                }
                val payload = JSONObject().apply {
                    put("id", messageId)
                    put("senderId", deviceId)
                    put("senderName", deviceName)
                    put("text", text)
                    put("timestamp", timestamp)
                }
                conn.outputStream.use { os ->
                    os.write(payload.toString().toByteArray(Charsets.UTF_8))
                    os.flush()
                }
                if (conn.responseCode in 200..299) {
                    delivered = true
                }
                conn.disconnect()
            } catch (e: Exception) {
                Log.d(TAG, "HTTP chat send failed, attempting socket fallback: ${e.message}")
            }

            if (!delivered) {
                var chatSocket: Socket? = null
                try {
                    chatSocket = Socket().apply {
                        tcpNoDelay = true
                        connect(InetSocketAddress(targetIp, DEFAULT_PORT), 3000)
                    }
                    val output = BufferedOutputStream(chatSocket.getOutputStream(), 4096)
                    val input = BufferedInputStream(chatSocket.getInputStream(), 4096)

                    // Send Handshake Init
                    val initJson = JSONObject().apply {
                        put("protocolVersion", "P2PFS/1")
                        put("deviceId", deviceId)
                        put("deviceName", deviceName)
                        put("platform", "android")
                        put("nonce", UUID.randomUUID().toString())
                    }
                    output.write(buildFrame(0x01, initJson.toString().toByteArray()))
                    output.flush()

                    // Read Handshake Resp
                    val header = ByteArray(20)
                    input.readFully(header)
                    val respLen = header.readUInt32BE(8)
                    val respBytes = ByteArray(respLen)
                    input.readFully(respBytes)

                    // Send CHAT_MESSAGE frame (0x30)
                    val chatPayload = JSONObject().apply {
                        put("id", messageId)
                        put("senderId", deviceId)
                        put("senderName", deviceName)
                        put("text", text)
                        put("timestamp", timestamp)
                    }
                    output.write(buildFrame(0x30, chatPayload.toString().toByteArray()))
                    output.flush()

                    // Read CHAT_ACK
                    input.readFully(header)
                    val ackLen = header.readUInt32BE(8)
                    val ackBytes = ByteArray(ackLen)
                    input.readFully(ackBytes)
                    val ackJson = JSONObject(String(ackBytes, Charsets.UTF_8))

                    val status = ackJson.optString("status", "delivered")
                    delivered = (status == "delivered" || status == "ok")
                } catch (e: Exception) {
                    Log.e(TAG, "Raw socket chat error: ${e.message}")
                } finally {
                    try { chatSocket?.close() } catch (_: Exception) {}
                }
            }

            val finalStatus = if (delivered) "delivered" else "failed"
            dbHelper.updateChatMessageStatus(messageId, finalStatus)
            sendEvent("chatMessageStatusUpdated", mapOf("id" to messageId, "status" to finalStatus))
        }
    }

    private fun sendChatTypingStatus(targetIp: String, isTyping: Boolean) {
        scope.launch(Dispatchers.IO) {
            try {
                val chatSocket = Socket().apply {
                    tcpNoDelay = true
                    connect(InetSocketAddress(targetIp, DEFAULT_PORT), 3000)
                }
                chatSocket.use { s ->
                    val output = BufferedOutputStream(s.getOutputStream(), 1024)
                    val typPayload = JSONObject().apply {
                        put("senderId", deviceId)
                        put("isTyping", isTyping)
                    }
                    output.write(buildFrame(0x32, typPayload.toString().toByteArray()))
                    output.flush()
                }
            } catch (e: Exception) {}
        }
    }

    // ----------------------------------------------------
    // Received Files Inspection
    // ----------------------------------------------------
    private fun listReceivedFiles(): List<Map<String, Any>> {
        val list = mutableListOf<Map<String, Any>>()
        val downloadsDir = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "AuraDrop")
        if (downloadsDir.exists() && downloadsDir.isDirectory) {
            val files = downloadsDir.listFiles { f -> !f.name.endsWith(".part") } ?: emptyArray()
            files.sortByDescending { it.lastModified() }
            for (f in files) {
                list.add(mapOf(
                    "name" to f.name,
                    "path" to f.absolutePath,
                    "size" to f.length(),
                    "lastModified" to f.lastModified(),
                    "extension" to f.extension
                ))
            }
        }
        return list
    }

    // ----------------------------------------------------
    // Binary Framing Helpers (P2PFS/1 Spec)
    // ----------------------------------------------------
    private fun buildFrame(frameType: Int, payload: ByteArray, authTag: ByteArray? = null): ByteArray {
        val tagLen = authTag?.size ?: 0
        val frame = ByteArray(20 + payload.size + tagLen)
        // Magic 'P2PF'
        frame[0] = 0x50.toByte(); frame[1] = 0x32.toByte(); frame[2] = 0x50.toByte(); frame[3] = 0x46.toByte()
        frame[4] = 0x01 // Version 1
        frame[5] = frameType.toByte()
        frame[6] = 0x00; frame[7] = if (authTag != null) 0x08.toByte() else 0x00.toByte() // Flags
        frame.writeUInt32BE(payload.size, 8)
        System.arraycopy(payload, 0, frame, 20, payload.size)
        if (authTag != null) {
            System.arraycopy(authTag, 0, frame, 20 + payload.size, authTag.size)
        }
        return frame
    }

    private fun buildChunkFrameHeader(chunkIdx: Int, payloadLen: Int): ByteArray {
        val frame = ByteArray(20)
        // Magic 'P2PF'
        frame[0] = 0x50.toByte(); frame[1] = 0x32.toByte(); frame[2] = 0x50.toByte(); frame[3] = 0x46.toByte()
        frame[4] = 0x01 // Version 1
        frame[5] = 0x21.toByte() // CHUNK_DATA
        frame[6] = 0x00; frame[7] = 0x00 // Flags
        frame.writeUInt32BE(payloadLen, 8)
        frame.writeUInt32BE(chunkIdx, 12)
        return frame
    }

    private fun ByteArray.readUInt32BE(offset: Int): Int {
        return ((this[offset].toInt() and 0xFF) shl 24) or
               ((this[offset + 1].toInt() and 0xFF) shl 16) or
               ((this[offset + 2].toInt() and 0xFF) shl 8) or
               (this[offset + 3].toInt() and 0xFF)
    }

    private fun ByteArray.writeUInt32BE(value: Int, offset: Int) {
        this[offset] = ((value ushr 24) and 0xFF).toByte()
        this[offset + 1] = ((value ushr 16) and 0xFF).toByte()
        this[offset + 2] = ((value ushr 8) and 0xFF).toByte()
        this[offset + 3] = (value and 0xFF).toByte()
    }

    private fun ByteArray.readUInt64BE(offset: Int): Long {
        var res = 0L
        for (i in 0 until 8) {
            res = (res shl 8) or (this[offset + i].toLong() and 0xFFL)
        }
        return res
    }

    private fun ByteArray.writeUInt64BE(value: Long, offset: Int) {
        for (i in 7 downTo 0) {
            this[offset + (7 - i)] = ((value ushr (i * 8)) and 0xFFL).toByte()
        }
    }

    private fun InputStream.readFully(b: ByteArray) {
        readFully(b, 0, b.size)
    }

    private fun InputStream.readFully(b: ByteArray, offset: Int, length: Int) {
        var currentOffset = offset
        val target = offset + length
        while (currentOffset < target) {
            val count = this.read(b, currentOffset, target - currentOffset)
            if (count < 0) throw EOFException("Unexpected EOF while reading socket frame")
            currentOffset += count
        }
    }

    private fun InputStream.readFullyRemaining(b: ByteArray, initialOffset: Int, remaining: Int) {
        var offset = initialOffset
        val target = initialOffset + remaining
        while (offset < target) {
            val count = this.read(b, offset, target - offset)
            if (count < 0) throw EOFException("Unexpected EOF while reading remaining bytes")
            offset += count
        }
    }

    private fun ByteArray.toHex(): String {
        val result = StringBuilder(size * 2)
        for (b in this) {
            result.append(String.format("%02x", b))
        }
        return result.toString()
    }

    private fun sanitizeFilename(name: String): String {
        var safe = name.replace("[/\\\\:*?\"<>|\\x00-\\x1F]".toRegex(), "_")
        if (safe.matches(Regex("^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\\..*)?$", RegexOption.IGNORE_CASE))) {
            safe = "_$safe"
        }
        return safe.trim().ifEmpty { "file_${System.currentTimeMillis()}" }
    }

    private fun resolveUniqueFile(dir: File, fileName: String): File {
        var target = File(dir, fileName)
        if (!target.exists()) return target

        val dotIdx = fileName.lastIndexOf('.')
        val namePart = if (dotIdx != -1) fileName.substring(0, dotIdx) else fileName
        val extPart = if (dotIdx != -1) fileName.substring(dotIdx) else ""

        var counter = 1
        while (target.exists()) {
            target = File(dir, "$namePart ($counter)$extPart")
            counter++
        }
        return target
    }

    private fun getMimeType(fileName: String): String {
        val ext = fileName.substringAfterLast('.', "").lowercase()
        return MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext) ?: when (ext) {
            "jpg", "jpeg" -> "image/jpeg"
            "png" -> "image/png"
            "webp" -> "image/webp"
            "heic" -> "image/heic"
            "gif" -> "image/gif"
            "bmp" -> "image/bmp"
            "mp4" -> "video/mp4"
            "mov" -> "video/quicktime"
            "mkv" -> "video/x-matroska"
            "avi" -> "video/x-msvideo"
            "3gp" -> "video/3gpp"
            "mp3" -> "audio/mpeg"
            "m4a" -> "audio/mp4"
            "wav" -> "audio/x-wav"
            "flac" -> "audio/flac"
            "aac" -> "audio/aac"
            "pdf" -> "application/pdf"
            "txt" -> "text/plain"
            "zip" -> "application/zip"
            else -> "application/octet-stream"
        }
    }

    private fun registerAndExportToMediaStore(file: File) {
        val name = file.name
        val lower = name.lowercase()
        val isImage = lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".png") ||
                      lower.endsWith(".webp") || lower.endsWith(".heic") || lower.endsWith(".gif") || lower.endsWith(".bmp")
        val isVideo = lower.endsWith(".mp4") || lower.endsWith(".mov") || lower.endsWith(".mkv") || lower.endsWith(".avi") || lower.endsWith(".3gp")
        val isAudio = lower.endsWith(".mp3") || lower.endsWith(".m4a") || lower.endsWith(".wav") || lower.endsWith(".flac") || lower.endsWith(".aac")

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val contentValues = ContentValues().apply {
                    put(MediaStore.MediaColumns.DISPLAY_NAME, name)
                    put(MediaStore.MediaColumns.MIME_TYPE, getMimeType(name))
                    when {
                        isImage -> put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/AuraDrop")
                        isVideo -> put(MediaStore.Video.Media.RELATIVE_PATH, Environment.DIRECTORY_MOVIES + "/AuraDrop")
                        isAudio -> put(MediaStore.Audio.Media.RELATIVE_PATH, Environment.DIRECTORY_MUSIC + "/AuraDrop")
                        else -> put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/AuraDrop")
                    }
                    put(MediaStore.MediaColumns.IS_PENDING, 1)
                }

                val targetUri = when {
                    isImage -> MediaStore.Images.Media.EXTERNAL_CONTENT_URI
                    isVideo -> MediaStore.Video.Media.EXTERNAL_CONTENT_URI
                    isAudio -> MediaStore.Audio.Media.EXTERNAL_CONTENT_URI
                    else -> MediaStore.Downloads.EXTERNAL_CONTENT_URI
                }

                val uri = applicationContext.contentResolver.insert(targetUri, contentValues)
                if (uri != null) {
                    applicationContext.contentResolver.openOutputStream(uri)?.use { out ->
                        file.inputStream().use { inp ->
                            inp.copyTo(out)
                        }
                    }
                    contentValues.clear()
                    contentValues.put(MediaStore.MediaColumns.IS_PENDING, 0)
                    applicationContext.contentResolver.update(uri, contentValues, null, null)
                    Log.i(TAG, "Successfully exported $name to MediaStore URI: $uri")
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error exporting $name to MediaStore: ${e.message}")
        }

        try {
            MediaScannerConnection.scanFile(
                applicationContext,
                arrayOf(file.absolutePath),
                arrayOf(getMimeType(name))
            ) { path, uri ->
                Log.i(TAG, "MediaScanner scanned $path -> $uri")
            }
        } catch (e: Exception) {
            Log.e(TAG, "MediaScanner error: ${e.message}")
        }
    }

    private fun generateSasCode(idA: String, idB: String): String {
        val transcript = AuraAeadCrypto.computeCanonicalSasTranscript(
            protocolVersion = AuraAeadCrypto.SAS_PROTOCOL_VERSION,
            transferId = "legacy_transfer",
            senderId = idA,
            receiverId = idB,
            senderIdentityPubHex = AuraIdentityManager.getPublicKeyHex(),
            receiverIdentityPubHex = "",
            senderEphPubHex = "",
            receiverEphPubHex = "",
            securityParams = AuraAeadCrypto.SAS_SECURITY_PARAMS
        )
        val hash = MessageDigest.getInstance("SHA-256").digest(transcript)
        val bb = ByteBuffer.wrap(hash).order(ByteOrder.BIG_ENDIAN)
        val numRaw = bb.getInt().toLong() and 0xFFFFFFFFL
        val num = (numRaw % 1_000_000L).toInt()
        return String.format("%03d %03d", num / 1000, num % 1000)
    }

    private fun openFileWithSystemViewer(filePath: String): Boolean {
        return try {
            val file = File(filePath)
            if (!file.exists()) {
                Log.e(TAG, "File does not exist: $filePath")
                return false
            }

            val uri = FileProvider.getUriForFile(this, "${applicationContext.packageName}.fileprovider", file)
            val extension = file.extension.lowercase()
            val mimeType = if (extension.isNotEmpty()) {
                MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension) ?: "*/*"
            } else {
                "*/*"
            }

            val viewIntent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, mimeType)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }

            try {
                startActivity(viewIntent)
                true
            } catch (e: ActivityNotFoundException) {
                // Fallback to chooser with generic */*
                val fallbackIntent = Intent(Intent.ACTION_VIEW).apply {
                    setDataAndType(uri, "*/*")
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
                val chooser = Intent.createChooser(fallbackIntent, "Open with").apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
                startActivity(chooser)
                true
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error opening file: ${e.message}")
            false
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
                        return addr.hostAddress ?: "127.0.0.1"
                    }
                }
            }
        } catch (e: Exception) {}
        return "127.0.0.1"
    }

    private fun startForegroundTransferService(title: String, progress: Int) {
        try {
            val intent = Intent(this, TransferForegroundService::class.java).apply {
                action = TransferForegroundService.ACTION_START
                putExtra(TransferForegroundService.EXTRA_TITLE, title)
                putExtra(TransferForegroundService.EXTRA_PROGRESS, progress)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(intent)
            } else {
                startService(intent)
            }
        } catch (e: Exception) {}
    }

    private fun updateForegroundTransferProgress(
        progress: Int,
        speed: String,
        fileName: String = "",
        transferredBytes: Long = 0L,
        totalBytes: Long = 0L,
        speedBytesPerSec: Long = 0L,
        isSending: Boolean = false
    ) {
        try {
            val intent = Intent(this, TransferForegroundService::class.java).apply {
                action = TransferForegroundService.ACTION_UPDATE
                putExtra(TransferForegroundService.EXTRA_PROGRESS, progress)
                putExtra(TransferForegroundService.EXTRA_SPEED, speed)
            }
            startService(intent)
        } catch (e: Exception) {}

        if (fileName.isNotBlank()) {
            AuraOverlayManager.getInstance(this).showOrUpdateTransferProgress(
                transferId = "current",
                fileName = fileName,
                progressPercent = progress,
                transferredBytes = transferredBytes,
                totalBytes = totalBytes,
                speedBytesPerSec = speedBytesPerSec,
                isSending = isSending,
                onCancel = {
                    cancelTransferSession("")
                }
            )
        }
    }

    private fun notifyForegroundTransferComplete(fileName: String, filePath: String, totalBytes: Long = 0L) {
        try {
            val intent = Intent(this, TransferForegroundService::class.java).apply {
                action = TransferForegroundService.ACTION_COMPLETE
                putExtra(TransferForegroundService.EXTRA_FILE_NAME, fileName)
                putExtra(TransferForegroundService.EXTRA_FILE_PATH, filePath)
            }
            startService(intent)
        } catch (e: Exception) {}

        AuraOverlayManager.getInstance(this).markTransferComplete(fileName, totalBytes)
    }

    private fun stopForegroundTransferService() {
        try {
            val intent = Intent(this, TransferForegroundService::class.java).apply {
                action = TransferForegroundService.ACTION_STOP
            }
            startService(intent)
        } catch (e: Exception) {}
    }

    private fun formatSpeed(bytesPerSec: Long): String {
        if (bytesPerSec < 1024) return "$bytesPerSec B/s"
        if (bytesPerSec < 1024 * 1024) return "${bytesPerSec / 1024} KB/s"
        return String.format("%.1f MB/s", bytesPerSec / (1024.0 * 1024.0))
    }

    private fun formatBytes(bytes: Long): String {
        if (bytes < 1024) return "$bytes B"
        if (bytes < 1024 * 1024) return String.format("%.1f KB", bytes / 1024.0)
        if (bytes < 1024 * 1024 * 1024) return String.format("%.1f MB", bytes / (1024.0 * 1024.0))
        return String.format("%.2f GB", bytes / (1024.0 * 1024.0 * 1024.0))
    }

    private fun createSystemNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

            val reqChannel = NotificationChannel(
                INCOMING_REQUEST_CHANNEL_ID,
                "Incoming Share Requests",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Shows actionable notifications when nearby devices request to share files"
                enableVibration(true)
                setShowBadge(true)
            }
            nm.createNotificationChannel(reqChannel)

            val chatChannel = NotificationChannel(
                CHAT_NOTIFICATION_CHANNEL_ID,
                "Chat Messages",
                NotificationManager.IMPORTANCE_DEFAULT
            ).apply {
                description = "Notifies when new messages arrive from nearby peers"
                setShowBadge(true)
            }
            nm.createNotificationChannel(chatChannel)
        }
    }

    private fun showSystemIncomingShareNotification(
        transferId: String,
        senderName: String,
        senderDeviceName: String,
        totalFiles: Int,
        totalBytes: Long,
        firstFileName: String,
        sasCode: String
    ) {
        val overlayMgr = AuraOverlayManager.getInstance(this)
        val nameToShow = if (senderDeviceName.isNotBlank() && senderDeviceName != senderName) {
            "$senderName ($senderDeviceName)"
        } else {
            senderName
        }
        val isPhoto = firstFileName.matches(Regex(".*\\.(jpg|jpeg|png|heic|webp|gif)$", RegexOption.IGNORE_CASE))
        val fileSummary = if (totalFiles > 1) {
            if (isPhoto) "$totalFiles photos" else "$totalFiles files"
        } else {
            if (isPhoto) "1 photo" else firstFileName
        }

        // Display directly on mobile screen ONLY when outside the app (home screen / lock screen / other apps)
        if (!isAppInForeground) {
            overlayMgr.showTransferRequestOverlay(
                transferId = transferId,
                senderName = nameToShow,
                fileName = fileSummary,
                totalBytes = totalBytes,
                onAccept = {
                    acceptIncomingTransfer(transferId)
                    sendEvent("notificationAccept", mapOf("transferId" to transferId))
                },
                onDecline = {
                    declineIncomingTransfer(transferId)
                    sendEvent("notificationDecline", mapOf("transferId" to transferId))
                }
            )
        }
    }

    private fun cancelSystemIncomingShareNotification(transferId: String) {
        AuraOverlayManager.getInstance(this).dismissCurrentOverlay()
    }

    private fun showSystemChatMessageNotification(senderName: String, text: String) {
        try {
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            val openAppIntent = packageManager.getLaunchIntentForPackage(packageName)
            val openPendingIntent = if (openAppIntent != null) {
                PendingIntent.getActivity(this, 0, openAppIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            } else null

            val builder = NotificationCompat.Builder(this, CHAT_NOTIFICATION_CHANNEL_ID)
                .setContentTitle(senderName)
                .setContentText(text)
                .setSmallIcon(android.R.drawable.sym_action_chat)
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .setAutoCancel(true)
                .setContentIntent(openPendingIntent)

            nm.notify(System.currentTimeMillis().toInt(), builder.build())
        } catch (e: Exception) {}
    }

    private fun showSystemNameDropProximityNotification(
        peerId: String = "",
        peerName: String,
        deviceName: String = "",
        platform: String = "device",
        ip: String = "",
        avatarPath: String = ""
    ) {
        // Display sleek floating window directly on mobile screen ONLY over other apps, home screen & lock screen
        if (!isAppInForeground) {
            AuraOverlayManager.getInstance(this).showNameDropOverlay(
                peerId = peerId,
                peerName = peerName,
                deviceName = deviceName,
                platform = platform,
                ip = ip,
                avatarPath = avatarPath,
                onShare = {
                    sendEvent("peerSelected", mapOf("peerId" to peerId))
                },
                onChat = {
                    sendEvent("openChatWithPeer", mapOf("peerId" to peerId))
                }
            )
        }
    }

    override fun onDestroy() {
        if (activeInstance == this) activeInstance = null
        stopDiscoveryEngine()
        scope.cancel()
        transferServer?.close()
        dbHelper.close()
        super.onDestroy()
    }
}
