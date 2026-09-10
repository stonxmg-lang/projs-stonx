package com.stonx.bot;

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
import android.graphics.LinearGradient;
import android.graphics.Shader;
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
import android.view.inputmethod.EditorInfo;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.ImageView;
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

    // ---- Professional green / blue / white / black palette ----
    private static final int C_BG_TOP    = 0xFF06131A; // near-black teal
    private static final int C_BG_BOTTOM = 0xFF0A1F2B; // deep blue-green
    private static final int C_CARD      = 0xF2101E28; // dark slate card
    private static final int C_CARD_LINE = 0x1AFFFFFF; // subtle border
    private static final int C_BLUE      = 0xFF2EA6FF; // accent blue
    private static final int C_GREEN     = 0xFF25D9A4; // accent green
    private static final int C_RED       = 0xFFEF5A6F; // danger
    private static final int C_AMBER     = 0xFFF5C247; // warn
    private static final int C_TEXT      = 0xFFF3F7F9; // white text
    private static final int C_TEXT_DIM  = 0xFF8CA0AD; // muted
    private static final int C_FIELD_BG  = 0x14FFFFFF; // input background
    private static final int C_LOG_BG    = 0xFF040D12; // console black
    private static final int C_LOG_TEXT  = 0xFF6FE3C0; // console green

    private final Handler handler = new Handler(Looper.getMainLooper());

    private FrameLayout screenContainer;
    private LinearLayout root;

    private View statusDot;
    private TextView statusText;
    private TextView logText;
    private ScrollView logScroll;

    private String currentScreenKind = "";
    private String lastNotifiedState = "";
    private String pendingCountryCode = "968";

    // Whether the last state we saw from the bot counts as an actual linked
    // session (CONNECTED or PAUSED-with-session) vs. no session at all
    // (logged out / still on the method-choice, phone, QR or pairing-code
    // screens). Drives whether the background service is allowed to persist.
    private boolean sessionActive = false;

    // When true, user is at the bottom of the log so we keep autoscrolling;
    // once they scroll up we stop yanking it back down (fixes the "jumpy" log).
    private boolean logStickToBottom = true;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        createNotificationChannel();
        buildUi();
        requestNotificationPermissionIfNeeded();
        startNodeService();
        handler.post(pollLoop);
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacks(pollLoop);
        // If there's no linked session, there's nothing worth keeping alive
        // in the background — the app should fully sleep (no process, no
        // notification, nothing) until reopened.
        //
        // Note on why this kills the whole process: node runs in-process via
        // JNI (node::Start blocks a native thread for as long as the process
        // lives — see NodeBridge/nodebridge.cpp), and nodejs-mobile doesn't
        // expose a way to stop it from Java short of that. Stopping the
        // Service alone unregisters the component but does not stop that
        // native thread, so it would keep running invisibly. Killing the
        // process is the only way to guarantee it actually stops — which is
        // fine here since there's no session to preserve; next launch starts
        // clean. If a session IS active, we skip this entirely and leave the
        // process/service running: it keeps itself in the foreground and
        // BootReceiver will revive it after a reboot.
        // isChangingConfigurations() guards against killing the process on a
        // simple rotation/config-change recreation, which also calls
        // onDestroy() but isn't the user actually leaving the app.
        if (!sessionActive && !isChangingConfigurations()) {
            stopService(new Intent(this, NodeBootstrapService.class));
            android.os.Process.killProcess(android.os.Process.myPid());
        }
        super.onDestroy();
    }

    /** First launch of the service: a plain (non-foreground) start is fine
     *  here because the activity itself is in the foreground while doing it.
     *  The service promotes/demotes itself to a real foreground service (with
     *  notification) only once we know whether a session is actually linked —
     *  see updateServiceForegroundState(), driven by the poll loop below. */
    private void startNodeService() {
        startService(new Intent(this, NodeBootstrapService.class));
    }

    /** Tells the service whether to run as a persistent foreground service
     *  (session linked — must survive the app closing) or a plain background
     *  one (no session yet — fine to die once the app isn't in front). */
    private void updateServiceForegroundState(boolean active) {
        if (active == sessionActive) return;
        sessionActive = active;
        Intent intent = new Intent(this, NodeBootstrapService.class);
        intent.setAction(NodeBootstrapService.ACTION_SET_FOREGROUND);
        intent.putExtra(NodeBootstrapService.EXTRA_FOREGROUND, active);
        startService(intent);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
    }

    // ---------------------------------------------------------------- UI ---

    private int dp(int v) {
        return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics());
    }

    private void buildUi() {
        FrameLayout background = new FrameLayout(this);
        GradientDrawable bgGradient = new GradientDrawable(
                GradientDrawable.Orientation.TOP_BOTTOM, new int[]{C_BG_TOP, C_BG_BOTTOM});
        background.setBackground(bgGradient);

        ScrollView scroll = new ScrollView(this);
        scroll.setLayoutParams(new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        scroll.setFillViewport(true);

        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        // More top padding so content isn't glued to the status bar.
        root.setPadding(dp(20), dp(64), dp(20), dp(32));
        root.setLayoutParams(new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        root.addView(buildLogo());

        TextView subtitle = new TextView(this);
        subtitle.setText("لوحة تحكم البوت");
        subtitle.setTextColor(C_TEXT_DIM);
        subtitle.setTextSize(13);
        subtitle.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams subLp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        subLp.topMargin = dp(6);
        subLp.bottomMargin = dp(26);
        root.addView(subtitle, subLp);

        // Active screen card
        FrameLayout card = buildCardContainer();
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

    /** "STONX BOT" wordmark with a blue→green→red gradient sweep. */
    private View buildLogo() {
        final TextView logo = new TextView(this);
        logo.setText("STONX BOT");
        logo.setTextSize(34);
        logo.setTypeface(Typeface.create("sans-serif-black", Typeface.BOLD));
        logo.setGravity(Gravity.CENTER);
        logo.setLetterSpacing(0.06f);
        logo.setTextColor(Color.WHITE);
        logo.getPaint().setFakeBoldText(true);
        logo.getViewTreeObserver().addOnGlobalLayoutListener(
            new android.view.ViewTreeObserver.OnGlobalLayoutListener() {
                @Override public void onGlobalLayout() {
                    int w = logo.getWidth();
                    if (w <= 0) return;
                    Shader shader = new LinearGradient(0, 0, w, 0,
                            new int[]{C_BLUE, C_GREEN, C_RED},
                            new float[]{0f, 0.55f, 1f}, Shader.TileMode.CLAMP);
                    logo.getPaint().setShader(shader);
                    logo.invalidate();
                    logo.getViewTreeObserver().removeOnGlobalLayoutListener(this);
                }
            });
        return logo;
    }

    private FrameLayout buildCardContainer() {
        FrameLayout cardFrame = new FrameLayout(this);
        GradientDrawable cardBg = new GradientDrawable();
        cardBg.setColor(C_CARD);
        cardBg.setCornerRadius(dp(20));
        cardBg.setStroke(dp(1), C_CARD_LINE);
        cardFrame.setBackground(cardBg);
        cardFrame.setPadding(dp(20), dp(22), dp(20), dp(22));
        if (Build.VERSION.SDK_INT >= 21) cardFrame.setElevation(dp(10));

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
        bg.setColor(C_CARD);
        bg.setCornerRadius(dp(20));
        bg.setStroke(dp(1), C_CARD_LINE);
        panel.setBackground(bg);
        panel.setPadding(dp(18), dp(16), dp(18), dp(16));

        LinearLayout statusRow = new LinearLayout(this);
        statusRow.setOrientation(LinearLayout.HORIZONTAL);
        statusRow.setGravity(Gravity.CENTER_VERTICAL);

        statusDot = new View(this);
        GradientDrawable dotBg = new GradientDrawable();
        dotBg.setShape(GradientDrawable.OVAL);
        dotBg.setColor(C_TEXT_DIM);
        statusDot.setBackground(dotBg);
        LinearLayout.LayoutParams dotLp = new LinearLayout.LayoutParams(dp(11), dp(11));
        dotLp.rightMargin = dp(9);
        statusRow.addView(statusDot, dotLp);

        statusText = new TextView(this);
        statusText.setText("جارِ التحميل...");
        statusText.setTextColor(C_TEXT);
        statusText.setTextSize(14);
        statusText.setTypeface(Typeface.DEFAULT_BOLD);
        statusRow.addView(statusText);

        panel.addView(statusRow);

        // header row: label + copy button
        LinearLayout headerRow = new LinearLayout(this);
        headerRow.setOrientation(LinearLayout.HORIZONTAL);
        headerRow.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout.LayoutParams headerLp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        headerLp.topMargin = dp(14);

        TextView monitorLabel = new TextView(this);
        monitorLabel.setText("سجل الأحداث");
        monitorLabel.setTextColor(C_TEXT_DIM);
        monitorLabel.setTextSize(11);
        LinearLayout.LayoutParams labelLp = new LinearLayout.LayoutParams(
                0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        headerRow.addView(monitorLabel, labelLp);

        TextView copyLog = new TextView(this);
        copyLog.setText("نسخ ⧉");
        copyLog.setTextColor(C_BLUE);
        copyLog.setTextSize(11);
        copyLog.setPadding(dp(10), dp(4), dp(10), dp(4));
        GradientDrawable clBg = new GradientDrawable();
        clBg.setColor(0x142EA6FF);
        clBg.setCornerRadius(dp(8));
        copyLog.setBackground(clBg);
        copyLog.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) {
                ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                cm.setPrimaryClip(ClipData.newPlainText("stonx-log", logText.getText().toString()));
                showToast("تم نسخ السجل");
            }
        });
        headerRow.addView(copyLog);

        panel.addView(headerRow, headerLp);

        // taller, cleaner console
        logScroll = new ScrollView(this);
        LinearLayout.LayoutParams scrollLp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(240));
        scrollLp.topMargin = dp(8);
        GradientDrawable logBg = new GradientDrawable();
        logBg.setColor(C_LOG_BG);
        logBg.setCornerRadius(dp(12));
        logBg.setStroke(dp(1), C_CARD_LINE);
        logScroll.setBackground(logBg);
        logScroll.setPadding(dp(12), dp(10), dp(12), dp(10));
        // Track whether the user has scrolled away from the bottom.
        logScroll.getViewTreeObserver().addOnScrollChangedListener(
            new android.view.ViewTreeObserver.OnScrollChangedListener() {
                @Override public void onScrollChanged() {
                    View child = logScroll.getChildAt(0);
                    if (child == null) return;
                    int diff = child.getBottom() - (logScroll.getHeight() + logScroll.getScrollY());
                    logStickToBottom = diff <= dp(24);
                }
            });

        logText = new TextView(this);
        logText.setText("...");
        logText.setTextColor(C_LOG_TEXT);
        logText.setTextSize(11);
        logText.setTypeface(Typeface.MONOSPACE);
        logText.setLineSpacing(dp(2), 1f);
        // NOT selectable: a selectable TextView is implicitly focusable, and
        // this view's text is replaced every ~2s by the poll loop. Whenever
        // that refresh landed while the phone-number field had focus and the
        // keyboard was open, Android would occasionally hand focus to this
        // TextView instead, closing the keyboard after a single keystroke.
        // The dedicated "نسخ" button above already covers copying the log,
        // so selection here isn't needed.
        logText.setTextIsSelectable(false);
        logText.setFocusable(false);
        logScroll.addView(logText);
        panel.addView(logScroll, scrollLp);

        return panel;
    }

    private void setScreen(String kind, View content) {
        if (kind.equals(currentScreenKind)) return;
        currentScreenKind = kind;
        screenContainer.removeAllViews();
        screenContainer.addView(content);
    }

    // ---- reusable widgets ----

    private Button primaryButton(String text, int colorA, int colorB) {
        Button b = new Button(this);
        b.setText(text);
        b.setAllCaps(false);
        b.setTextColor(Color.WHITE);
        b.setTextSize(15);
        b.setTypeface(Typeface.DEFAULT_BOLD);
        GradientDrawable bg = new GradientDrawable(
                GradientDrawable.Orientation.LEFT_RIGHT, new int[]{colorA, colorB});
        bg.setCornerRadius(dp(14));
        b.setBackground(bg);
        b.setPadding(dp(18), dp(15), dp(18), dp(15));
        if (Build.VERSION.SDK_INT >= 21) b.setElevation(dp(4));
        return b;
    }

    private Button solidButton(String text, int color) {
        Button b = new Button(this);
        b.setText(text);
        b.setAllCaps(false);
        b.setTextColor(Color.WHITE);
        b.setTextSize(15);
        b.setTypeface(Typeface.DEFAULT_BOLD);
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(color);
        bg.setCornerRadius(dp(14));
        b.setBackground(bg);
        b.setPadding(dp(18), dp(15), dp(18), dp(15));
        return b;
    }

    /** Small text-style "back" affordance so the user can back out of a
     *  linking method (phone/QR/pairing-code) and pick the other one,
     *  instead of being stuck once they've chosen. */
    private View backButton() {
        TextView back = new TextView(this);
        back.setText("‹  رجوع لاختيار طريقة أخرى");
        back.setTextColor(C_TEXT_DIM);
        back.setTextSize(12);
        back.setPadding(dp(4), dp(8), dp(4), dp(8));
        back.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) {
                currentScreenKind = "";
                showLoadingScreen();
                runOffThread(new Runnable() {
                    @Override public void run() {
                        try {
                            ApiClient.postJson("/api/back", new JSONObject());
                        } catch (Exception e) {
                            showToast("تعذر الرجوع: " + e.getMessage());
                        }
                    }
                });
            }
        });
        return back;
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
        box.setPadding(0, dp(10), 0, dp(10));
        box.addView(screenLabel("جارِ الاتصال بالبوت..."));
        setScreen("loading", box);
    }

    private void showChooseMethodScreen() {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);

        box.addView(screenLabel("اختر طريقة ربط الحساب"));

        Button phoneBtn = primaryButton("📱  الربط برقم الهاتف", C_BLUE, C_GREEN);
        LinearLayout.LayoutParams lp1 = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp1.topMargin = dp(18);
        phoneBtn.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { chooseMethod("phone"); }
        });
        box.addView(phoneBtn, lp1);

        Button qrBtn = primaryButton("🔳  الربط عبر QR", C_GREEN, C_BLUE);
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
            currentScreenKind = "";
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

        // Two separate fields (country code / number) laid out side by side —
        // a single "code + number" text field looked unpolished and made it
        // easy to accidentally delete the code while typing the number.
        LinearLayout fieldRow = new LinearLayout(this);
        fieldRow.setOrientation(LinearLayout.HORIZONTAL);
        fieldRow.setGravity(Gravity.CENTER_VERTICAL);

        final EditText codeField = new EditText(this);
        codeField.setText(pendingCountryCode);
        codeField.setTextColor(C_TEXT);
        codeField.setTextSize(16);
        codeField.setTypeface(Typeface.DEFAULT_BOLD);
        codeField.setGravity(Gravity.CENTER);
        codeField.setInputType(InputType.TYPE_CLASS_PHONE);
        codeField.setImeOptions(EditorInfo.IME_FLAG_NO_EXTRACT_UI | EditorInfo.IME_ACTION_NEXT);
        codeField.setHint("968");
        codeField.setHintTextColor(C_TEXT_DIM);
        GradientDrawable codeFieldBg = new GradientDrawable();
        codeFieldBg.setColor(C_FIELD_BG);
        codeFieldBg.setCornerRadius(dp(12));
        codeFieldBg.setStroke(dp(1), C_CARD_LINE);
        codeField.setBackground(codeFieldBg);
        codeField.setPadding(dp(4), dp(14), dp(4), dp(14));
        LinearLayout.LayoutParams codeLp = new LinearLayout.LayoutParams(dp(64), ViewGroup.LayoutParams.WRAP_CONTENT);
        fieldRow.addView(codeField, codeLp);

        TextView plus = new TextView(this);
        plus.setText("—");
        plus.setTextColor(C_TEXT_DIM);
        plus.setTextSize(16);
        plus.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams plusLp = new LinearLayout.LayoutParams(dp(20), ViewGroup.LayoutParams.WRAP_CONTENT);
        fieldRow.addView(plus, plusLp);

        final EditText numberField = new EditText(this);
        numberField.setHint("رقم الهاتف بدون صفر في البداية");
        numberField.setHintTextColor(C_TEXT_DIM);
        numberField.setTextColor(C_TEXT);
        numberField.setTextSize(16);
        numberField.setInputType(InputType.TYPE_CLASS_PHONE);
        // Keep the keyboard from closing after each digit.
        numberField.setImeOptions(EditorInfo.IME_FLAG_NO_EXTRACT_UI | EditorInfo.IME_ACTION_DONE);
        GradientDrawable numberFieldBg = new GradientDrawable();
        numberFieldBg.setColor(C_FIELD_BG);
        numberFieldBg.setCornerRadius(dp(12));
        numberFieldBg.setStroke(dp(1), C_CARD_LINE);
        numberField.setBackground(numberFieldBg);
        numberField.setPadding(dp(14), dp(14), dp(14), dp(14));
        LinearLayout.LayoutParams numberLp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        fieldRow.addView(numberField, numberLp);

        LinearLayout.LayoutParams rowLp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        rowLp.topMargin = dp(16);
        box.addView(fieldRow, rowLp);
        numberField.requestFocus();

        TextView hint = new TextView(this);
        hint.setText("مثال: 968 · 77274542  (رمز الدولة ثم الرقم)");
        hint.setTextColor(C_TEXT_DIM);
        hint.setTextSize(11);
        LinearLayout.LayoutParams hintLp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        hintLp.topMargin = dp(6);
        box.addView(hint, hintLp);

        Button connectBtn = primaryButton("اتصال", C_BLUE, C_GREEN);
        LinearLayout.LayoutParams btnLp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        btnLp.topMargin = dp(16);
        connectBtn.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) {
                final String code = codeField.getText().toString().replaceAll("[^0-9]", "");
                final String rest = numberField.getText().toString().replaceAll("[^0-9]", "");
                pendingCountryCode = code.isEmpty() ? pendingCountryCode : code;
                final String digits = code + rest;
                if (code.isEmpty() || rest.length() < 6) {
                    showToast("رقم غير صالح");
                    return;
                }
                runOffThread(new Runnable() {
                    @Override public void run() {
                        try {
                            JSONObject body = new JSONObject();
                            body.put("number", digits);
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

        LinearLayout.LayoutParams backLp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        backLp.topMargin = dp(6);
        backLp.gravity = Gravity.CENTER_HORIZONTAL;
        box.addView(backButton(), backLp);

        setScreen("phone_input", box);
    }

    private void showPairingCodeScreen(String code) {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER_HORIZONTAL);

        TextView hint = new TextView(this);
        hint.setText("واتساب ← الأجهزة المرتبطة ← ربط برقم الهاتف");
        hint.setTextColor(C_TEXT_DIM);
        hint.setTextSize(12);
        hint.setGravity(Gravity.CENTER);
        box.addView(hint);

        // compact code chip + small copy icon side by side
        LinearLayout codeRow = new LinearLayout(this);
        codeRow.setOrientation(LinearLayout.HORIZONTAL);
        codeRow.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams codeRowLp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        codeRowLp.topMargin = dp(16);

        TextView codeText = new TextView(this);
        codeText.setText(code);
        codeText.setTextColor(C_GREEN);
        codeText.setTextSize(22);
        codeText.setTypeface(Typeface.MONOSPACE, Typeface.BOLD);
        codeText.setLetterSpacing(0.12f);
        GradientDrawable codeBg = new GradientDrawable();
        codeBg.setColor(0x1425D9A4);
        codeBg.setCornerRadius(dp(10));
        codeBg.setStroke(dp(1), 0x3325D9A4);
        codeText.setBackground(codeBg);
        codeText.setPadding(dp(18), dp(10), dp(18), dp(10));
        codeText.setGravity(Gravity.CENTER);
        codeRow.addView(codeText);

        final String codeVal = code;
        TextView copyIcon = new TextView(this);
        copyIcon.setText("⧉");
        copyIcon.setTextColor(C_BLUE);
        copyIcon.setTextSize(20);
        copyIcon.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams copyLp = new LinearLayout.LayoutParams(dp(40), dp(40));
        copyLp.leftMargin = dp(10);
        copyIcon.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) {
                ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                cm.setPrimaryClip(ClipData.newPlainText("stonx-pairing-code", codeVal));
                showToast("تم نسخ الرمز");
            }
        });
        codeRow.addView(copyIcon, copyLp);

        box.addView(codeRow, codeRowLp);

        LinearLayout.LayoutParams backLp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        backLp.topMargin = dp(16);
        backLp.gravity = Gravity.CENTER_HORIZONTAL;
        box.addView(backButton(), backLp);

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
        qrBg.setCornerRadius(dp(16));
        qrFrame.setBackground(qrBg);
        qrFrame.setPadding(dp(10), dp(10), dp(10), dp(10));
        LinearLayout.LayoutParams qrFrameLp = new LinearLayout.LayoutParams(dp(210), dp(210));
        qrFrameLp.topMargin = dp(16);
        qrFrameLp.gravity = Gravity.CENTER_HORIZONTAL;

        ImageView qrImgView = new ImageView(this);
        qrImgView.setLayoutParams(new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        qrImgView.setTag("qr_image");
        qrFrame.addView(qrImgView);

        box.addView(qrFrame, qrFrameLp);

        LinearLayout.LayoutParams backLp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        backLp.topMargin = dp(14);
        backLp.gravity = Gravity.CENTER_HORIZONTAL;
        box.addView(backButton(), backLp);

        setScreen("qr", box);
        loadQrImage(qrImgView);
    }

    private void loadQrImage(final ImageView target) {
        runOffThread(new Runnable() {
            @Override public void run() {
                try {
                    byte[] png = ApiClient.getQrPng();
                    if (png != null) {
                        final Bitmap bmp = BitmapFactory.decodeByteArray(png, 0, png.length);
                        handler.post(new Runnable() {
                            @Override public void run() {
                                if ("qr_image".equals(target.getTag())) target.setImageBitmap(bmp);
                            }
                        });
                    }
                } catch (Exception ignored) {}
            }
        });
    }

    private void showConnectedScreen(String jid, boolean paused) {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER_HORIZONTAL);

        TextView ok = new TextView(this);
        ok.setText(paused ? "⏸ البوت متوقف مؤقتًا" : "✅ متصل بنجاح");
        ok.setTextColor(paused ? C_AMBER : C_GREEN);
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

        // Pause / Resume button (keeps session)
        Button pauseBtn = solidButton(paused ? "▶  تشغيل البوت" : "⏸  إيقاف مؤقت",
                paused ? C_GREEN : C_BLUE);
        LinearLayout.LayoutParams pLp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        pLp.topMargin = dp(20);
        final boolean isPaused = paused;
        pauseBtn.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) {
                final String endpoint = isPaused ? "/api/resume" : "/api/pause";
                runOffThread(new Runnable() {
                    @Override public void run() {
                        try {
                            ApiClient.postJson(endpoint, new JSONObject());
                        } catch (Exception e) {
                            showToast("فشل: " + e.getMessage());
                        }
                    }
                });
                showToast(isPaused ? "جارِ التشغيل..." : "جارِ الإيقاف...");
            }
        });
        box.addView(pauseBtn, pLp);

        // Delete session button (full logout)
        Button stopBtn = solidButton("🗑  حذف الجلسة", C_RED);
        LinearLayout.LayoutParams sLp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        sLp.topMargin = dp(10);
        stopBtn.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { confirmLogout(); }
        });
        box.addView(stopBtn, sLp);

        setScreen("connected:" + paused, box);
    }

    private void confirmLogout() {
        new AlertDialog.Builder(this)
                .setTitle("تأكيد")
                .setMessage("هل تريد حذف الجلسة نهائيًا والرجوع لربط جديد؟")
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
        @Override public void run() {
            runOffThread(new Runnable() {
                @Override public void run() { pollOnce(); }
            });
            handler.postDelayed(this, POLL_INTERVAL_MS);
        }
    };

    private void pollOnce() {
        try {
            JSONObject status = ApiClient.getJson("/api/status");
            final String state = status.optString("state", "STARTING");
            final String ownJid = status.optString("ownJid", null);
            final String pairingCode = status.optString("pairingCode", null);

            JSONObject logsResp = ApiClient.getJson("/api/logs");
            JSONArray lines = logsResp.optJSONArray("lines");
            final String logDump = renderLogs(lines);

            handler.post(new Runnable() {
                @Override public void run() {
                    applyState(state, ownJid, pairingCode);
                    updateMonitor(state, logDump);
                    notifyStateChange(state);
                }
            });
        } catch (Exception e) {
            final String errMsg = "⚠ تعذر الوصول إلى خدمة البوت الداخلية.\n" + e.getMessage()
                    + "\n\n--- node-error.log ---\n" + readLogFile("node-error.log")
                    + "\n\n--- node-stdout.log ---\n" + readLogFile("node-stdout.log");
            handler.post(new Runnable() {
                @Override public void run() { updateMonitor("DISCONNECTED", errMsg); }
            });
        }
    }

    private String readLogFile(String name) {
        try {
            java.io.File f = new java.io.File(getFilesDir(), name);
            if (!f.exists()) return "(الملف لسه معملوش)";
            byte[] data = java.nio.file.Files.readAllBytes(f.toPath());
            String content = new String(data);
            return content.length() > 2500 ? content.substring(content.length() - 2500) : content;
        } catch (Exception e) {
            return "(تعذرت قراءة اللوج: " + e.getMessage() + ")";
        }
    }

    private String renderLogs(JSONArray lines) {
        if (lines == null) return "";
        StringBuilder sb = new StringBuilder();
        int start = Math.max(0, lines.length() - 60);
        for (int i = start; i < lines.length(); i++) {
            JSONObject entry = lines.optJSONObject(i);
            if (entry == null) continue;
            String time = entry.optString("time", "");
            if (time.length() >= 19) time = time.substring(11, 19); // HH:mm:ss only
            sb.append(time).append("  ")
              .append(entry.optString("level", "").toUpperCase()).append("  ")
              .append(entry.optString("message", "")).append("\n");

            // The bot logs a structured "meta" object alongside most error/warn
            // lines (the real exception message, stack, etc.) — it was being
            // sent by the API but silently dropped here, leaving only the
            // generic top-level message visible (e.g. "Failed to post story"
            // with no indication of why). Surface it so the log panel is
            // actually useful for diagnosing a failure, not just noticing one.
            JSONObject meta = entry.optJSONObject("meta");
            if (meta != null && meta.length() > 0) {
                sb.append("      ↳ ");
                java.util.Iterator<String> keys = meta.keys();
                boolean first = true;
                while (keys.hasNext()) {
                    String key = keys.next();
                    if (!first) sb.append(" | ");
                    first = false;
                    String value = String.valueOf(meta.opt(key));
                    if (value.length() > 300) value = value.substring(0, 300) + "…";
                    sb.append(key).append('=').append(value);
                }
                sb.append("\n");
            }
        }
        return sb.toString();
    }

    private void applyState(String state, String ownJid, String pairingCode) {
        updateServiceForegroundState("PAUSED".equals(state) || "CONNECTED".equals(state));
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
                    View img = screenContainer.findViewWithTag("qr_image");
                    if (img instanceof ImageView) loadQrImage((ImageView) img);
                }
                break;
            case "PAUSED":
                if (!currentScreenKind.equals("connected:true")) showConnectedScreen(ownJid, true);
                break;
            case "CONNECTED":
                if (!currentScreenKind.equals("connected:false")) showConnectedScreen(ownJid, false);
                break;
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
            if (logStickToBottom) {
                logScroll.post(new Runnable() {
                    @Override public void run() { logScroll.fullScroll(View.FOCUS_DOWN); }
                });
            }
        }
    }

    private String arabicStateLabel(String state) {
        switch (state) {
            case "CONNECTED": return "🟢 متصل";
            case "PAUSED": return "⏸ متوقف مؤقتًا";
            case "RECONNECTING": return "🟡 إعادة الاتصال...";
            case "DISCONNECTED": return "🟡 غير متصل";
            case "AWAITING_QR_SCAN": return "🔳 بانتظار مسح QR";
            case "AWAITING_PAIRING_CONFIRM": return "🔑 بانتظار إدخال الرمز";
            case "AWAITING_PHONE_NUMBER": return "📱 بانتظار الرقم";
            case "AWAITING_METHOD_CHOICE": return "⏳ اختر طريقة الربط";
            case "LOGGED_OUT": return "⚪ تم تسجيل الخروج";
            default: return "⏳ " + state;
        }
    }

    private int colorForState(String state) {
        if ("CONNECTED".equals(state)) return C_GREEN;
        if ("PAUSED".equals(state)) return C_AMBER;
        if ("RECONNECTING".equals(state) || "DISCONNECTED".equals(state)) return C_AMBER;
        if (state == null || state.isEmpty()) return C_TEXT_DIM;
        return C_BLUE;
    }

    private void notifyStateChange(String state) {
        if (state.equals(lastNotifiedState)) return;
        lastNotifiedState = state;
        if (state.equals("CONNECTED")) pushNotification("STONX BOT", "متصل بنجاح ✅");
        else if (state.equals("PAUSED")) pushNotification("STONX BOT", "البوت متوقف مؤقتًا ⏸");
        else if (state.equals("RECONNECTING") || state.equals("DISCONNECTED")) pushNotification("STONX BOT", "جارِ إعادة الاتصال...");
        else if (state.equals("LOGGED_OUT")) pushNotification("STONX BOT", "تم تسجيل الخروج");
    }

    // -------------------------------------------------------- Notifications ---

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID, "حالة STONX BOT", NotificationManager.IMPORTANCE_LOW);
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
