package com.stonx.bot;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import java.io.File;

/**
 * Only revives the bot after a reboot if a WhatsApp session is actually
 * linked. With no session, there is nothing useful to keep running in the
 * background — the app stays fully asleep (no process, no notification)
 * until the user opens it themselves and links an account.
 */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (!Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) return;
        if (!hasLinkedSession(context)) return;

        Intent serviceIntent = new Intent(context, NodeBootstrapService.class);
        serviceIntent.setAction(NodeBootstrapService.ACTION_SET_FOREGROUND);
        serviceIntent.putExtra(NodeBootstrapService.EXTRA_FOREGROUND, true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(serviceIntent);
        } else {
            context.startService(serviceIntent);
        }
    }

    /** Mirrors the bot's own authManager.hasExistingSession() check: a
     *  linked session means Baileys' creds.json exists under the extracted
     *  project's auth directory in app-internal storage (survives reboots). */
    private boolean hasLinkedSession(Context context) {
        File creds = new File(context.getFilesDir(), "nodejs-project/data/auth/creds.json");
        return creds.exists();
    }
}
