# kage/ — مصادر Kage Media
إضافات CloudStream الخاصة (`.cs3`) التي يحدّثها تطبيق Kage Media دون APK جديد.

- `plugins.json`: القائمة (الاسم، النسخة `version`، البصمة `fileHash`).
- التطبيق يفحصها كل ساعتين؛ إن وجد `version` أعلى من المثبّتة نزّل الملف وتحقق من بصمته ثم استبدله.
- لتحديث مصدر: ضع ملف `.cs3` الجديد هنا، وارفع `version` وحدّث `fileHash` (sha256) و`fileSize` في `plugins.json`.
- `repo.json` يمكن إضافته كمستودع عادي في CloudStream أو Kage Media.
- إن حُجب raw.githubusercontent يقرأ التطبيق نفس الملفات من jsDelivr.


## matches.json
روابط جاهزة بين أعمال TMDB/AniList وصفحاتها في كل مصدر، يقرؤها Kage Media فيفتح العمل فوراً دون بحث:
`{"tmdb:tv:336153": {"MkMovieBox": "https://..."}}`
