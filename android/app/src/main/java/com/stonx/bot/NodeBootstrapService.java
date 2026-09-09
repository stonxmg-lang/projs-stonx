package com.stonx.bot;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.res.AssetManager;
import android.os.Build;
import android.os.IBinder;
import android.system.Os;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;

public class NodeBootstrapService extends Service {

    private static final String CHANNEL_ID = "stonx_status";
    private static final int FOREGROUND_NOTIF_ID = 100;
    private static final String PROJECT_DIR_NAME = "nodejs-project";
    private static volatile boolean nodeStarted = false;

    @Override
    public void onCreate() {
        super.onCreate();
        createChannel();
        startForeground(FOREGROUND_NOTIF_ID, buildNotification());
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (!nodeStarted) {
            nodeStarted = true;
            new Thread(new Runnable() {
                @Override public void run() { extractAndStartNode(); }
            }, "stonx-node-thread").start();
        }
        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    // --------------------------------------------------------------------

    private void extractAndStartNode() {
        try {
            File projectDir = new File(getFilesDir(), PROJECT_DIR_NAME);
            File marker = new File(getFilesDir(), ".stonx-bundle-version");
            String expectedVersion = "1"; // bump if you repackage the JS project

            if (!marker.exists() || !readMarker(marker).equals(expectedVersion)) {
                deleteRecursive(projectDir);
                extractFromManifest(PROJECT_DIR_NAME, PROJECT_DIR_NAME + "-filelist.txt", projectDir);
                writeLog("extracted bot project");
                writeMarker(marker, expectedVersion);
            }

            Os.setenv("HOME", getFilesDir().getAbsolutePath(), true);
            Os.setenv("TMPDIR", getCacheDir().getAbsolutePath(), true);

            // Redirect this process's stdout+stderr (fd 1 and 2) into our log
            // file at the OS level, BEFORE node starts. node (running via JNI
            // in this same process) writes its startup errors to stderr,
            // which normally goes to Android's logcat where Termux can't read
            // it. This captures the real crash reason into node-error.log.
            try {
                File nodeOut = new File(getFilesDir(), "node-stdout.log");
                java.io.FileDescriptor fd = new java.io.FileOutputStream(nodeOut, true).getFD();
                Os.dup2(fd, 1); // stdout
                Os.dup2(fd, 2); // stderr
                writeLog("redirected node stdio to node-stdout.log");
            } catch (Throwable redirErr) {
                writeLog("could not redirect node stdio: " + redirErr);
            }

            String entryScript = new File(projectDir, "src/index.js").getAbsolutePath();
            writeLog("starting node with entry: " + entryScript);
            int exitCode = NodeBridge.startNodeWithArguments(new String[]{"node", entryScript});
            writeLog("node exited with code " + exitCode);
        } catch (Throwable t) {
            writeLog("FAILED: " + t + "\n" + android.util.Log.getStackTraceString(t));
        } finally {
            nodeStarted = false;
        }
    }

    private void extractFromManifest(String assetSubdir, String manifestName, File targetRoot) throws IOException {
        AssetManager am = getAssets();
        targetRoot.mkdirs();
        InputStream listStream = am.open(manifestName);
        BufferedReader reader = new BufferedReader(new InputStreamReader(listStream, "UTF-8"));
        try {
            String relPath;
            int count = 0;
            while ((relPath = reader.readLine()) != null) {
                relPath = relPath.trim();
                if (relPath.isEmpty()) continue;
                File outFile = new File(targetRoot, relPath);
                File parent = outFile.getParentFile();
                if (parent != null) parent.mkdirs();
                InputStream in;
                try {
                    in = am.open(assetSubdir + "/" + relPath);
                } catch (IOException notFound) {
                    // Android's asset packager silently drops dot-files
                    // (e.g. .gitkeep) and some other ignored patterns, so a
                    // path can be listed in the manifest yet absent from the
                    // APK. Skipping these is correct — they're placeholders,
                    // never needed at runtime.
                    continue;
                }
                try {
                    OutputStream out = new FileOutputStream(outFile);
                    try {
                        byte[] buf = new byte[8192];
                        int n;
                        while ((n = in.read(buf)) != -1) out.write(buf, 0, n);
                    } finally {
                        out.close();
                    }
                } finally {
                    in.close();
                }
                count++;
            }
            writeLog("extracted " + count + " files from " + manifestName);
        } finally {
            reader.close();
        }
    }

    private void deleteRecursive(File f) {
        if (f.isDirectory()) {
            File[] kids = f.listFiles();
            if (kids != null) for (File k : kids) deleteRecursive(k);
        }
        f.delete();
    }

    private String readMarker(File f) {
        try {
            byte[] data = java.nio.file.Files.readAllBytes(f.toPath());
            return new String(data).trim();
        } catch (Exception e) {
            return "";
        }
    }

    private void writeMarker(File f, String value) {
        try {
            FileOutputStream out = new FileOutputStream(f);
            try {
                out.write(value.getBytes());
            } finally {
                out.close();
            }
        } catch (IOException ignored) {
        }
    }

    private void writeLog(String text) {
        try {
            FileOutputStream out = new FileOutputStream(new File(getFilesDir(), "node-error.log"), true);
            try {
                out.write((new java.util.Date() + "  " + text + "\n").getBytes());
            } finally {
                out.close();
            }
        } catch (IOException ignored) {
        }
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID, "حالة STONX BOT", NotificationManager.IMPORTANCE_LOW);
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(channel);
        }
    }

    private Notification buildNotification() {
        Intent openIntent = new Intent(this, MainActivity.class);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT
                | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
        PendingIntent pi = PendingIntent.getActivity(this, 0, openIntent, flags);

        Notification.Builder builder = (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                ? new Notification.Builder(this, CHANNEL_ID)
                : new Notification.Builder(this);
        builder.setContentTitle("STONX BOT")
                .setContentText("يعمل في الخلفية")
                .setSmallIcon(android.R.drawable.stat_sys_download_done)
                .setContentIntent(pi)
                .setOngoing(true);
        return builder.build();
    }
}
