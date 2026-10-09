package com.auradrop.auradrop

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log

/**
 * Ensures AuraDrop 24/7 background service restarts automatically when
 * the device finishes booting or the application package is updated.
 */
class AuraBootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action
        Log.d("AuraBootReceiver", "Received boot/restart broadcast: $action")
        if (Intent.ACTION_BOOT_COMPLETED == action ||
            "android.intent.action.QUICKBOOT_POWERON" == action ||
            "com.htc.intent.action.QUICKBOOT_POWERON" == action ||
            Intent.ACTION_MY_PACKAGE_REPLACED == action
        ) {
            try {
                val serviceIntent = Intent(context, AuraBackgroundService::class.java).apply {
                    this.action = AuraBackgroundService.ACTION_START
                }
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(serviceIntent)
                } else {
                    context.startService(serviceIntent)
                }
                Log.d("AuraBootReceiver", "Successfully launched AuraBackgroundService on boot")
            } catch (e: Exception) {
                Log.e("AuraBootReceiver", "Failed to start AuraBackgroundService: ${e.message}")
            }
        }
    }
}
