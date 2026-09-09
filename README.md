# STONX BOT — بناء تلقائي عن طريق GitHub Actions

## هيكلة المستودع
```
bot/        ← مشروع البوت (src, package.json, package-lock.json, media)
             لا تحط node_modules هنا — الـ CI بيثبتها بنفسه بـ npm ci
android/    ← مشروع التطبيق (Gradle + الواجهة + الجسر البسيط لـ Node)
.github/workflows/build-apk.yml  ← بيبني الـ APK تلقائي مع كل push
```

## أول مرة (نقل مشروع البوت الحالي)
جوه Termux، من مجلد المستودع بعد ما تعمل clone له:
```bash
git clone https://github.com/stonxmg-lang/projs-stonx.git
cd projs-stonx
mkdir -p bot
cp -r ~/stonx/src ~/stonx/package.json ~/stonx/package-lock.json bot/
cp -r ~/stonx/media bot/ 2>/dev/null || true
```
(متنساش تدمج تعديلات `stonx-bot-node-changes.zip` اللي بعتهالك قبل كده
جوه `bot/src` قبل النسخ، لو لسه معملتهاش)

## الرفع
```bash
git add .
git commit -m "أول نسخة من التطبيق"
git push
```

## متابعة البناء
1. روح صفحة المستودع على GitHub → تبويب **Actions**
2. هتلاقي عملية بناء شغالة (اسمها "Build STONX BOT APK") — استنى لحد ما
   تخلص باللون الأخضر (٥-١٠ دقايق تقريبًا)
3. ادخل على العملية اللي خلصت، هتلاقي تحت "Artifacts" ملف اسمه
   `stonx-bot-apk` — نزّله (zip فيه الـ APK)
4. فك الضغط، ثبّت الـ APK مباشرة على تليفونك (هيطلبلك تفعيل "تثبيت من
   مصادر غير معروفة" أول مرة بس)

## أي تعديل مستقبلي
- عدّلت كود البوت (JS)؟ عدّل في `bot/` وارفع (`git push`)
- عدّلت الواجهة (Java)؟ عدّل في `android/app/src/main/java/com/stonx/bot/`
  وارفع
- في الحالتين: نفس الخطوات (push → استنى الـ Actions → نزّل الـ APK
  الجديد من Artifacts)

مفيش MT Manager، مفيش zip يدوي، مفيش patchelf — Gradle بيعمل كل حاجة صح
تلقائي.
