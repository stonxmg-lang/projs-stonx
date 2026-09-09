# STONX

بوت WhatsApp معياري (Modular) مبني على Baileys، مصمم للعمل على Termux/Android.
A modular WhatsApp bot built on Baileys, designed to run on Termux/Android.

---

## المتطلبات / Requirements

- Node.js >= 18
- FFmpeg — `pkg install ffmpeg` (Termux) أو `apt install ffmpeg` (Linux)
- yt-dlp — `pip install yt-dlp` أو `pkg install yt-dlp`
- مكتبة `@innovatorssoft/baileys` (مذكورة في `package.json`)

## التثبيت / Installation

```bash
npm install
```

عند أول تشغيل، يفحص البوت هذه المتطلبات تلقائيًا ويخبرك بأي شيء ناقص.
On first run, the bot checks these dependencies automatically and tells you what's missing.

## التشغيل / Running

```bash
npm start
```

## أول عملية ربط / First-time linking

عند عدم وجود جلسة محفوظة في `data/auth/`، سيُطلب منك الاختيار بين:
When no saved session exists in `data/auth/`, you'll be asked to choose:

- **[1] رقم الهاتف / Phone number** — يعرض BOT رمز ربط من 8 خانات (Pairing Code) تدخله في:
  WhatsApp → الإعدادات → الأجهزة المرتبطة → ربط جهاز → الربط برقم الهاتف.
- **[2] QR** — يُعرض QR في الطرفية، امسحه من نفس القائمة في WhatsApp.

الجلسة تُحفظ بعدها في `data/auth/` ولن يُطلب الربط مرة أخرى ما لم يتم تسجيل الخروج فعليًا.
The session is then saved and you won't be asked to re-link unless you actually log out from WhatsApp.

## الأوامر / Commands

| Command | الوصف |
|---|---|
| `/menu` | يعرض الأوامر المتاحة لك فقط |
| `/ping` | فحص حالة البوت |
| `/settings` | إدارة الصلاحيات (انظر أدناه) |
| `/stond <url>` | تنزيل فيديو فقط |
| `/song <url>` أو رد فيديو بـ `/song` | استخراج/تنزيل صوت |
| `/story` (كرد على صورة/فيديو) | نشر Story |
| `/male [current\|all\|groups\|users\|self]` | إرسال رسالة صوتية محفوظة |

ضع ملف الصوت الخاص بك هنا قبل استخدام `/male`:
Place your own audio file here before using `/male`:
`media/male/salawat.mp3`

## نظام الصلاحيات / Permissions

مستويان مستقلان:

1. **Bot Access** (عام): `PUBLIC` / `WHITELIST` / `PUBLIC_WITH_BLACKLIST` / `DISABLED`
2. **Command Permission** (لكل أمر): `ALL` / `ADMIN_ONLY` / `DISABLED` — يمكن ضبطها عالميًا أو لكل محادثة.

أمثلة عبر `/settings`:

```
/settings access WHITELIST
/settings scope ALL
/settings allowuser 9665xxxxxxx@s.whatsapp.net
/settings command story ADMIN_ONLY
/settings command song ALL here
```

`/male` بوضع غير `current`/`self` (أي Broadcast حقيقي) متاح فقط لمالك البوت (owners في settings.json)،
بغض النظر عن صلاحية الأمر العامة — لمنع إساءة استخدام الإرسال الجماعي.

## المالك / Bot Owner

`/settings` و`/story` صلاحيتهما الافتراضية `ADMIN_ONLY`، والمالك (owner) هو من يملك صلاحية دائمة بغض النظر عن أي إعداد آخر.

عند أول اتصال ناجح وبدون أي مالك مسجل، **يتم تلقائيًا تعيين الحساب الذي يشغّل البوت نفسه (رقمك) كمالك افتراضي**.
للتحكم بالبوت كمالك، راسل نفس رقم البوت عبر **محادثتك الذاتية (Self-Chat / رسالة لنفسك)** — هذه هي القناة الوحيدة
التي يمكن للمالك من خلالها إرسال أوامر، لأن رسائل "fromMe" تُتجاهل في كل مكان آخر لمنع التكرار اللانهائي.

لإضافة مالك آخر (من نفس محادثة Self-Chat):

```
/settings addowner 9665xxxxxxx@s.whatsapp.net
```

لإتاحة أمر معين (مثل `/story`) للجميع بدل المدراء فقط:

```
/settings command story ALL
```

## Story / Status

النشر يعتمد على `StatusHelper` المُصدَّرة من `@innovatorssoft/baileys` (وليس `sock.sendMessage('status@broadcast', ...)` الخام،
لأن هذا المسار موثّق لكنه معروف بعدم الموثوقية عبر إصدارات Baileys — ينجح بدون خطأ لكن لا ينشر شيئًا فعليًا).

`/story` يعمل **فقط داخل الجروبات** (مطابقًا للمواصفة الأصلية) — يُمرَّر JID الجروب نفسه ضمن قائمة الوجهات لـ`StatusHelper.send()`،
وهذا يكفي لنشره كـ *Group Status* يظهر لأعضاء ذلك الجروب. أي استخدام خارج جروب (محادثة خاصة أو محادثة الذات) يُرفض برسالة واضحة.

## yt-dlp و FFmpeg

- `yt-dlp` مستخدم فقط في `/stond` (فيديو) و`/song` (رابط → صوت).
- `FFmpeg` مستخدم في استخراج الصوت من فيديو مرفق (`/song`) وفي تحويل ملف `/male` إلى صيغة PTT (opus/ogg).
- كلاهما يُستدعى عبر `spawn`/`execFile` بمعاملات منفصلة (وليس عبر shell string)، لمنع Command Injection.

## حل المشاكل الشائعة / Troubleshooting

- **"FFmpeg is not installed" / "yt-dlp is not installed"** — ثبّت الأداة الناقصة وأعد التشغيل.
- **لا يظهر QR أو رمز الربط** — تأكد من حذف `data/auth/` إذا كانت الجلسة تالفة، ثم أعد التشغيل.
- **انقطاع متكرر** — البوت يعيد الاتصال تلقائيًا بـ backoff تصاعدي؛ راجع `data/logs/stonx.log`.
- **`/story` تفشل دائمًا** — تأكد أن `statusJidList` غير فارغة (يوجد مستخدمون مسجلون في قاعدة البيانات).

## البنية / Architecture

```
src/
├── index.js              نقطة الدخول
├── core/                 bot.js, router.js, command.js, events.js
├── connection/           connectionManager.js وملحقاتها
├── commands/             ملف واحد لكل أمر
├── services/             downloaders, story/voice, target resolver
├── permissions/           access + command policy
├── database/             JSON repository layer (قابل للاستبدال بـ SQLite لاحقًا)
└── utils/                logger, files, validation, media, dependency checker
```

لإضافة أمر جديد: أنشئ ملفًا في `src/commands/` بالشكل `{ name, description, execute(context) }` فقط —
لا حاجة لتعديل `router.js` أو `connectionManager.js` أو `database.js`.
