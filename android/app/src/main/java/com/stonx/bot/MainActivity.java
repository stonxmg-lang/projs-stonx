package com.stonx.bot;

import android.animation.Animator;
import android.animation.ObjectAnimator;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Notification;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

public class MainActivity extends Activity {

    private static final int REQ_NOTIF_PERMISSION = 101;
    private static final String CHANNEL_ID = "stonx_status";
    private static final int NOTIF_ID = 1;
    private static final int POLL_INTERVAL_MS = 2000;

    // Palette — dark "professional" tech gradient.
    private static final int C_BG_TOP = 0xFF0B1220;
    private static final int C_BG_BOTTOM = 0xFF1B1035;
    private static final int C_ACCENT = 0xFF7B5CFA;
    private static final int C_ACCENT_2 = 0xFF39C6E8;
    private static final int C_CARD = 0xCC141B2E;
    private static final int C_TEXT = 0xFFF2F3F7;
    private static final int C_TEXT_DIM = 0xFF9AA3B5;
    private static final int C_OK = 0xFF33D17A;
    private static final int C_WARN = 0xFFF5C247;
    private static final int C_BAD = 0xFFEF5A6F;

    private final Handler handler = new Handler(Looper.getMainLooper());

    private FrameLayout screenContainer;
    private LinearLayout root;
    private View card;

    // Monitor panel widgets
    private View statusDot;
    private TextView statusText;
    private TextView logText;
    private ScrollView logScroll;

    private String currentScreenKind = "";
    private String lastNotifiedState = "";
    private String pendingCountryCode = "+968";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        createNotificationChannel();
        buildUi();
        requestNotificationPermissionIfNeeded();
        startNodeService();
        handler.post(pollLoop);
    }

    private void startNodeService() {
        Intent serviceIntent = new Intent(this, NodeBootstrapService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(serviceIntent);
        } else {
            startService(serviceIntent);
        }
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacks(pollLoop);
        super.onDestroy();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        // Nothing else required — polling/UI works regardless of the result,
        // it only affects whether status notifications are shown.
    }

    // ---------------------------------------------------------------- UI ---

    private int dp(int v) {
        return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics());
    }

    private void buildUi() {
        FrameLayout background = new FrameLayout(this);
        GradientDrawable bgGradient = new GradientDrawable(
                GradientDrawable.Orientation.TL_BR, new int[]{C_BG_TOP, C_BG_BOTTOM});
        background.setBackground(bgGradient);

        ScrollView scroll = new ScrollView(this);
        scroll.setLayoutParams(new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(20), dp(36), dp(20), dp(28));
        root.setLayoutParams(new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        TextView title = new TextView(this);
        title.setText("STONX BOT");
        title.setTextColor(C_TEXT);
        title.setTextSize(26);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setGravity(Gravity.CENTER);
        title.setLetterSpacing(0.08f);
        root.addView(title);

        TextView subtitle = new TextView(this);
        subtitle.setText("لوحة تحكم ربط الحساب");
        subtitle.setTextColor(C_TEXT_DIM);
        subtitle.setTextSize(13);
        subtitle.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams subLp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        subLp.gravity = Gravity.CENTER;
        subLp.bottomMargin = dp(24);
        root.addView(subtitle, subLp);

        // "Card" that holds the active screen — this is what gets the 3D
        // entrance animation whenever the screen changes.
        card = buildCardContainer();
        LinearLayout.LayoutParams cardLp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        cardLp.bottomMargin = dp(18);
        root.addView(card, cardLp);

        root.addView(buildMonitorPanel());

        scroll.addView(root);
        background.addView(scroll);
        setContentView(background);

        showLoadingScreen();
    }

    private View buildCardContainer() {
        FrameLayout cardFrame = new FrameLayout(this);
        GradientDrawable cardBg = new GradientDrawable();
        cardBg.setColor(C_CARD);
        cardBg.setCornerRadius(dp(18));
        cardBg.setStroke(dp(1), 0x33FFFFFF);
        cardFrame.setBackground(cardBg);
        cardFrame.setPadding(dp(20), dp(22), dp(20), dp(22));
        if (Build.VERSION.SDK_INT >= 21) cardFrame.setElevation(dp(14));
        cardFrame.setCameraDistance(14000);

        screenContainer = new FrameLayout(this);
        screenContainer.setLayoutParams(new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        cardFrame.addView(screenContainer);
        return cardFrame;
    }

    private View buildMonitorPanel() {
        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(0xCC0A0F1C);
        bg.setCornerRadius(dp(16));
        bg.setStroke(dp(1), 0x22FFFFFF);
        panel.setBackground(bg);
        panel.setPadding(dp(16), dp(14), dp(16), dp(14));

        LinearLayout statusRow = new LinearLayout(this);
        statusRow.setOrientation(LinearLayout.HORIZONTAL);
        statusRow.setGravity(Gravity.CENTER_VERTICAL);

        statusDot = new View(this);
        GradientDrawable dotBg = new GradientDrawable();
        dotBg.setShape(GradientDrawable.OVAL);
        dotBg.setColor(C_TEXT_DIM);
        statusDot.setBackground(dotBg);
        LinearLayout.LayoutParams dotLp = new LinearLayout.LayoutParams(dp(10), dp(10));
        dotLp.rightMargin = dp(8);
        statusRow.addView(statusDot, dotLp);

        statusText = new TextView(this);
        statusText.setText("جارِ التحميل...");
        statusText.setTextColor(C_TEXT);
        statusText.setTextSize(14);
        statusText.setTypeface(Typeface.DEFAULT_BOLD);
        statusRow.addView(statusText);

        panel.addView(statusRow);

        LinearLayout monitorHeaderRow = new LinearLayout(this);
        monitorHeaderRow.setOrientation(LinearLayout.HORIZONTAL);
        monitorHeaderRow.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout.LayoutParams headerRowLp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        headerRowLp.topMargin = dp(12);

        TextView monitorLabel = new TextView(this);
        monitorLabel.setText("سجل الأحداث");
        monitorLabel.setTextColor(C_TEXT_DIM);
        monitorLabel.setTextSize(11);
        LinearLayout.LayoutParams monitorLabelLp = new LinearLayout.LayoutParams(
                0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        monitorHeaderRow.addView(monitorLabel, monitorLabelLp);

        Button copyLogBtn = new Button(this);
        copyLogBtn.setText("⧉ نسخ السجل");
        copyLogBtn.setTextColor(Color.WHITE);
        copyLogBtn.setTextSize(11);
        copyLogBtn.setAllCaps(false);
        copyLogBtn.setPadding(dp(10), dp(4), dp(10), dp(4));
        copyLogBtn.setMinHeight(0);
        copyLogBtn.setMinimumHeight(0);
        GradientDrawable copyLogBg = new GradientDrawable();
        copyLogBg.setColor(0x33FFFFFF);
        copyLogBg.setCornerRadius(dp(8));
        copyLogBtn.setBackground(copyLogBg);
        copyLogBtn.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) {
                ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                cm.setPrimaryClip(ClipData.newPlainText("stonx-log", logText.getText().toString()));
                showToast("تم نسخ السجل كامل");
            }
        });
        monitorHeaderRow.addView(copyLogBtn);

        panel.addView(monitorHeaderRow, headerRowLp);

        logScroll = new ScrollView(this);
        LinearLayout.LayoutParams scrollLp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(160));
        scrollLp.topMargin = dp(6);
        GradientDrawable logBg = new GradientDrawable();
        logBg.setColor(0xFF05070D);
        logBg.setCornerRadius(dp(10));
        logScroll.setBackground(logBg);
        logScroll.setPadding(dp(10), dp(8), dp(10), dp(8));

        logText = new TextView(this);
        logText.setText("...");
        logText.setTextColor(0xFF7CE3B5);
        logText.setTextSize(11);
        logText.setTypeface(Typeface.MONOSPACE);
        logText.setTextIsSelectable(true);
        logScroll.addView(logText);
        panel.addView(logScroll, scrollLp);

        return panel;
    }

    /** Swaps the content of the card with a 3D flip-in animation. */
    private void setScreen(String kind, View content) {
        if (kind.equals(currentScreenKind)) return; // don't rebuild & lose input while user is typing
        currentScreenKind = kind;
        screenContainer.removeAllViews();
        screenContainer.addView(content);

        card.setRotationY(-90f);
        card.setAlpha(0.2f);
        ObjectAnimator rotate = ObjectAnimator.ofFloat(card, "rotationY", -90f, 0f);
        ObjectAnimator fade = ObjectAnimator.ofFloat(card, "alpha", 0.2f, 1f);
        rotate.setDuration(420);
        fade.setDuration(420);
        rotate.start();
        fade.start();
    }

    private Button bigButton(String text) {
        Button b = new Button(this);
        b.setText(text);
        b.setAllCaps(false);
        b.setTextColor(Color.WHITE);
        b.setTextSize(15);
        b.setTypeface(Typeface.DEFAULT_BOLD);
        GradientDrawable bg = new GradientDrawable(
                GradientDrawable.Orientation.LEFT_RIGHT, new int[]{C_ACCENT, C_ACCENT_2});
        bg.setCornerRadius(dp(14));
        b.setBackground(bg);
        b.setPadding(dp(18), dp(16), dp(18), dp(16));
        if (Build.VERSION.SDK_INT >= 21) b.setElevation(dp(6));
        return b;
    }

    private TextView screenLabel(String text) {
        TextView t = new TextView(this);
        t.setText(text);
        t.setTextColor(C_TEXT);
        t.setTextSize(16);
        t.setTypeface(Typeface.DEFAULT_BOLD);
        t.setGravity(Gravity.CENTER);
        return t;
    }

    // ------------------------------------------------------------ Screens ---

    private void showLoadingScreen() {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER);
        TextView t = screenLabel("جارِ الاتصال بالبوت...");
        box.addView(t);
        setScreen("loading", box);
    }

    private void showChooseMethodScreen() {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);

        box.addView(screenLabel("اختر طريقة ربط الحساب"));

        Button phoneBtn = bigButton("📱  الربط برقم الهاتف");
        LinearLayout.LayoutParams lp1 = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp1.topMargin = dp(18);
        phoneBtn.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { chooseMethod("phone"); }
        });
        box.addView(phoneBtn, lp1);

        Button qrBtn = bigButton("🔳  الربط عبر QR");
        LinearLayout.LayoutParams lp2 = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp2.topMargin = dp(12);
        qrBtn.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { chooseMethod("qr"); }
        });
        box.addView(qrBtn, lp2);

        setScreen("choose", box);
    }

    private void chooseMethod(final String method) {
        runOffThread(new Runnable() {
            @Override public void run() {
                try {
                    JSONObject body = new JSONObject();
                    body.put("method", method);
                    ApiClient.postJson("/api/method", body);
                } catch (Exception e) {
                    showToast("تعذر الاتصال بالبوت: " + e.getMessage());
                }
            }
        });
        if (method.equals("phone")) {
            currentScreenKind = ""; // force rebuild even though state hasn't changed yet
            showPhoneInputScreen();
        } else {
            currentScreenKind = "";
            showQrScreen();
        }
    }

    private void showPhoneInputScreen() {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.addView(screenLabel("أدخل رقم الهاتف"));

        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        LinearLayout.LayoutParams rowLp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        rowLp.topMargin = dp(16);

        EditText codeInput = fieldInput(pendingCountryCode, InputType.TYPE_CLASS_PHONE);
        LinearLayout.LayoutParams codeLp = new LinearLayout.LayoutParams(dp(80), ViewGroup.LayoutParams.WRAP_CONTENT);
        codeLp.rightMargin = dp(8);
        row.addView(codeInput, codeLp);

        EditText numberInput = fieldInput("رقم الهاتف بدون صفر", InputType.TYPE_CLASS_PHONE);
        numberInput.setHint("رقم الهاتف بدون صفر");
        numberInput.setText("");
        LinearLayout.LayoutParams numLp = new LinearLayout.LayoutParams(
                0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        row.addView(numberInput, numLp);

        box.addView(row, rowLp);

        Button connectBtn = bigButton("اتصال");
        LinearLayout.LayoutParams btnLp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        btnLp.topMargin = dp(16);
        connectBtn.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) {
                String cc = codeInput.getText().toString().replaceAll("[^0-9]", "");
                String num = numberInput.getText().toString().replaceAll("[^0-9]", "");
                if (num.length() < 6) {
                    showToast("رقم غير صالح");
                    return;
                }
                pendingCountryCode = "+" + cc;
                final String fullNumber = cc + num;
                runOffThread(new Runnable() {
                    @Override public void run() {
                        try {
                            JSONObject body = new JSONObject();
                            body.put("number", fullNumber);
                            ApiClient.postJson("/api/phone", body);
                        } catch (Exception e) {
                            showToast("تعذر إرسال الرقم: " + e.getMessage());
                        }
                    }
                });
                showToast("تم الإرسال، بانتظار رمز الربط...");
            }
        });
        box.addView(connectBtn, btnLp);

        setScreen("phone_input", box);
    }

    private EditText fieldInput(String hint, int inputType) {
        EditText e = new EditText(this);
        e.setHint(hint);
        e.setHintTextColor(C_TEXT_DIM);
        e.setTextColor(C_TEXT);
        e.setInputType(inputType);
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(0x33FFFFFF);
        bg.setCornerRadius(dp(10));
        e.setBackground(bg);
        e.setPadding(dp(12), dp(10), dp(12), dp(10));
        return e;
    }

    private void showPairingCodeScreen(String code) {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.addView(screenLabel("افتح واتساب → الأجهزة المرتبطة → ربط برقم الهاتف"));

        LinearLayout codeRow = new LinearLayout(this);
        codeRow.setOrientation(LinearLayout.HORIZONTAL);
        codeRow.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout.LayoutParams codeRowLp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        codeRowLp.topMargin = dp(18);

        TextView codeText = new TextView(this);
        codeText.setText(code);
        codeText.setTextColor(C_ACCENT_2);
        codeText.setTextSize(26);
        codeText.setTypeface(Typeface.MONOSPACE, Typeface.BOLD);
        codeText.setLetterSpacing(0.15f);
        GradientDrawable codeBg = new GradientDrawable();
        codeBg.setColor(0x22FFFFFF);
        codeBg.setCornerRadius(dp(12));
        codeText.setBackground(codeBg);
        codeText.setPadding(dp(16), dp(12), dp(16), dp(12));
        codeText.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams codeTextLp = new LinearLayout.LayoutParams(
                0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        codeRow.addView(codeText, codeTextLp);

        // No drawable resources are available in this build (no aapt/res
        // compilation on-device), so the copy button is a styled glyph
        // button rather than an ImageButton with an icon drawable.
        Button copyGlyphBtn = new Button(this);
        copyGlyphBtn.setText("⧉");
        copyGlyphBtn.setTextColor(Color.WHITE);
        copyGlyphBtn.setTextSize(18);
        GradientDrawable copyBg = new GradientDrawable();
        copyBg.setColor(C_ACCENT);
        copyBg.setCornerRadius(dp(12));
        copyGlyphBtn.setBackground(copyBg);
        LinearLayout.LayoutParams copyLp = new LinearLayout.LayoutParams(dp(52), dp(52));
        copyLp.leftMargin = dp(10);
        copyGlyphBtn.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) {
                ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                cm.setPrimaryClip(ClipData.newPlainText("stonx-pairing-code", code));
                showToast("تم نسخ الرمز");
            }
        });
        codeRow.addView(copyGlyphBtn, copyLp);

        box.addView(codeRow, codeRowLp);
        setScreen("phone_code:" + code, box);
    }

    private void showQrScreen() {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER_HORIZONTAL);
        box.addView(screenLabel("امسح الرمز من واتساب"));

        FrameLayout qrFrame = new FrameLayout(this);
        GradientDrawable qrBg = new GradientDrawable();
        qrBg.setColor(Color.WHITE);
        qrBg.setCornerRadius(dp(14));
        qrFrame.setBackground(qrBg);
        qrFrame.setPadding(dp(10), dp(10), dp(10), dp(10));
        LinearLayout.LayoutParams qrFrameLp = new LinearLayout.LayoutParams(dp(240), dp(240));
        qrFrameLp.topMargin = dp(18);
        qrFrameLp.gravity = Gravity.CENTER_HORIZONTAL;

        android.widget.ImageView qrImgView = new android.widget.ImageView(this);
        qrImgView.setLayoutParams(new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        qrImgView.setTag("qr_image");
        qrFrame.addView(qrImgView);

        box.addView(qrFrame, qrFrameLp);
        setScreen("qr", box);
        loadQrImage(qrImgView);
    }

    private void loadQrImage(final android.widget.ImageView target) {
        runOffThread(new Runnable() {
            @Override public void run() {
                try {
                    byte[] png = ApiClient.getQrPng();
                    if (png != null) {
                        final Bitmap bmp = BitmapFactory.decodeByteArray(png, 0, png.length);
                        handler.post(new Runnable() {
                            @Override public void run() {
                                if (target.getTag() != null && "qr_image".equals(target.getTag())) {
                                    target.setImageBitmap(bmp);
                                }
                            }
                        });
                    }
                } catch (Exception ignored) {
                    // Will retry on the next poll tick while state stays AWAITING_QR_SCAN.
                }
            }
        });
    }

    private void showConnectedScreen(String jid) {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER_HORIZONTAL);

        TextView ok = new TextView(this);
        ok.setText("✅ متصل بنجاح");
        ok.setTextColor(C_OK);
        ok.setTextSize(18);
        ok.setTypeface(Typeface.DEFAULT_BOLD);
        ok.setGravity(Gravity.CENTER);
        box.addView(ok);

        TextView jidText = new TextView(this);
        jidText.setText(jid == null ? "" : jid);
        jidText.setTextColor(C_TEXT_DIM);
        jidText.setTextSize(12);
        jidText.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams jidLp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        jidLp.topMargin = dp(4);
        box.addView(jidText, jidLp);

        Button stopBtn = bigButton("🗑  حذف الجلسة / إيقاف");
        GradientDrawable stopBg = new GradientDrawable();
        stopBg.setColor(C_BAD);
        stopBg.setCornerRadius(dp(14));
        stopBtn.setBackground(stopBg);
        LinearLayout.LayoutParams stopLp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        stopLp.topMargin = dp(22);
        stopBtn.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { confirmLogout(); }
        });
        box.addView(stopBtn, stopLp);

        setScreen("connected", box);
    }

    private void confirmLogout() {
        new AlertDialog.Builder(this)
                .setTitle("تأكيد")
                .setMessage("هل تريد حذف الجلسة الحالية وإيقاف الربط؟")
                .setPositiveButton("حذف", new android.content.DialogInterface.OnClickListener() {
                    @Override public void onClick(android.content.DialogInterface d, int w) {
                        runOffThread(new Runnable() {
                            @Override public void run() {
                                try {
                                    ApiClient.postJson("/api/logout", new JSONObject());
                                } catch (Exception e) {
                                    showToast("فشل الحذف: " + e.getMessage());
                                }
                            }
                        });
                    }
                })
                .setNegativeButton("إلغاء", null)
                .show();
    }

    // ------------------------------------------------------------- Polling ---

    private final Runnable pollLoop = new Runnable() {
        @Override
        public void run() {
            runOffThread(new Runnable() {
                @Override public void run() { pollOnce(); }
            });
            handler.postDelayed(this, POLL_INTERVAL_MS);
        }
    };

    private void pollOnce() {
        try {
            JSONObject status = ApiClient.getJson("/api/status");
            String state = status.optString("state", "STARTING");
            String ownJid = status.optString("ownJid", null);
            String pairingCode = status.optString("pairingCode", null);

            JSONObject logsResp = ApiClient.getJson("/api/logs");
            JSONArray lines = logsResp.optJSONArray("lines");
            String logDump = renderLogs(lines);

            final String fState = state;
            final String fOwnJid = ownJid;
            final String fPairingCode = pairingCode;
            final String fLogDump = logDump;
            handler.post(new Runnable() {
                @Override public void run() {
                    applyState(fState, fOwnJid, fPairingCode);
                    updateMonitor(fState, fLogDump);
                    notifyStateChange(fState);
                }
            });
        } catch (Exception e) {
            final String errMsg = "⚠ تعذر الوصول إلى خدمة البوت الداخلية.\n" + e.getMessage()
                    + "\n\n--- node-error.log ---\n" + readNodeErrorLog();
            handler.post(new Runnable() {
                @Override public void run() {
                    updateMonitor("DISCONNECTED", errMsg);
                }
            });
        }
    }

    /** Reads the crash/status log NodeBootstrapService writes to app-private storage. */
    private String readNodeErrorLog() {
        try {
            java.io.File f = new java.io.File(getFilesDir(), "node-error.log");
            if (!f.exists()) return "(الملف لسه معملوش — الـ Service يمكن ماشتغلش خالص)";
            byte[] data = java.nio.file.Files.readAllBytes(f.toPath());
            String content = new String(data);
            // keep only the last ~2000 chars so the monitor box doesn't overflow
            return content.length() > 2000 ? content.substring(content.length() - 2000) : content;
        } catch (Exception e) {
            return "(تعذرت قراءة اللوج: " + e.getMessage() + ")";
        }
    }

    private String renderLogs(JSONArray lines) {
        if (lines == null) return "";
        StringBuilder sb = new StringBuilder();
        int start = Math.max(0, lines.length() - 40);
        for (int i = start; i < lines.length(); i++) {
            JSONObject entry = lines.optJSONObject(i);
            if (entry == null) continue;
            sb.append(entry.optString("time", "").replace("T", " ").replace("Z", ""))
              .append("  ")
              .append(entry.optString("level", "").toUpperCase())
              .append("  ")
              .append(entry.optString("message", ""))
              .append("\n");
        }
        return sb.toString();
    }

    private void applyState(String state, String ownJid, String pairingCode) {
        switch (state) {
            case "AWAITING_METHOD_CHOICE":
            case "LOGGED_OUT":
                if (!currentScreenKind.equals("choose")) showChooseMethodScreen();
                break;
            case "AWAITING_PHONE_NUMBER":
                if (!currentScreenKind.equals("phone_input")) showPhoneInputScreen();
                break;
            case "AWAITING_PAIRING_CONFIRM":
                if (pairingCode != null && !currentScreenKind.equals("phone_code:" + pairingCode)) {
                    showPairingCodeScreen(pairingCode);
                }
                break;
            case "AWAITING_QR_SCAN":
                if (!currentScreenKind.equals("qr")) showQrScreen();
                else {
                    // still on the qr screen — keep refreshing the image in case it rotated
                    View img = screenContainer.findViewWithTag("qr_image");
                    if (img instanceof android.widget.ImageView) loadQrImage((android.widget.ImageView) img);
                }
                break;
            case "CONNECTED":
                if (!currentScreenKind.equals("connected")) showConnectedScreen(ownJid);
                break;
            case "STARTING":
            case "CONNECTING":
            default:
                if (currentScreenKind.isEmpty() || currentScreenKind.equals("loading")) showLoadingScreen();
                break;
        }
    }

    private void updateMonitor(String state, String logDump) {
        statusText.setText(arabicStateLabel(state));
        GradientDrawable dotBg = (GradientDrawable) statusDot.getBackground();
        dotBg.setColor(colorForState(state));
        if (!logDump.isEmpty()) {
            logText.setText(logDump);
            logScroll.post(new Runnable() {
                @Override public void run() { logScroll.fullScroll(View.FOCUS_DOWN); }
            });
        }
    }

    private String arabicStateLabel(String state) {
        switch (state) {
            case "CONNECTED": return "🟢 متصل";
            case "RECONNECTING": return "🟡 إعادة الاتصال...";
            case "DISCONNECTED": return "🟡 غير متصل";
            case "AWAITING_QR_SCAN": return "🔳 بانتظار مسح QR";
            case "AWAITING_PAIRING_CONFIRM": return "🔑 بانتظار إدخال رمز الربط";
            case "AWAITING_PHONE_NUMBER": return "📱 بانتظار رقم الهاتف";
            case "AWAITING_METHOD_CHOICE": return "⏳ بانتظار اختيار طريقة الربط";
            case "LOGGED_OUT": return "⚪ تم تسجيل الخروج";
            default: return "⏳ " + state;
        }
    }

    private int colorForState(String state) {
        if ("CONNECTED".equals(state)) return C_OK;
        if ("RECONNECTING".equals(state) || "DISCONNECTED".equals(state)) return C_WARN;
        if (state == null || state.isEmpty()) return C_TEXT_DIM;
        return C_ACCENT_2;
    }

    private void notifyStateChange(String state) {
        if (state.equals(lastNotifiedState)) return;
        lastNotifiedState = state;
        if (state.equals("CONNECTED")) {
            pushNotification("STONX BOT", "متصل بنجاح ✅");
        } else if (state.equals("RECONNECTING") || state.equals("DISCONNECTED")) {
            pushNotification("STONX BOT", "جارِ إعادة الاتصال...");
        } else if (state.equals("LOGGED_OUT")) {
            pushNotification("STONX BOT", "تم تسجيل الخروج");
        }
    }

    // -------------------------------------------------------- Notifications ---

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID, "حالة STONX BOT", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("إشعارات حالة اتصال بوت STONX");
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(channel);
        }
    }

    private void requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= 33) {
            String perm = "android.permission.POST_NOTIFICATIONS";
            if (checkSelfPermission(perm) != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{perm}, REQ_NOTIF_PERMISSION);
            }
        }
    }

    private void pushNotification(String title, String text) {
        boolean canNotify = Build.VERSION.SDK_INT < 33
                || checkSelfPermission("android.permission.POST_NOTIFICATIONS") == PackageManager.PERMISSION_GRANTED;
        if (!canNotify) return;

        Intent openIntent = new Intent(this, MainActivity.class);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
        PendingIntent pi = PendingIntent.getActivity(this, 0, openIntent, flags);

        Notification.Builder builder = (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                ? new Notification.Builder(this, CHANNEL_ID)
                : new Notification.Builder(this);
        builder.setContentTitle(title)
                .setContentText(text)
                .setSmallIcon(android.R.drawable.stat_sys_download_done)
                .setContentIntent(pi)
                .setAutoCancel(true);

        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        nm.notify(NOTIF_ID, builder.build());
    }

    // -------------------------------------------------------------- Helpers ---

    private void runOffThread(Runnable r) {
        new Thread(r).start();
    }

    private void showToast(final String msg) {
        handler.post(new Runnable() {
            @Override public void run() {
                Toast.makeText(MainActivity.this, msg, Toast.LENGTH_SHORT).show();
            }
        });
    }
}
