# ShaDo-sources
مصادر ShaDo-epub بصيغة JS تُحمَّل وقت التشغيل (بدون إعادة بناء APK).
- `sources/<id>.js` ملف كل مصدر (`NovelKit.add('<id>', ...)`).
- `manifest.json` قائمة المصادر: النسخة والبصمة (sha256) وأدنى مستوى أصلي `minNative` وبيانات الكتالوج `data`.
- عند دفع تعديل على `sources/` يحدّث سير العمل البصمات ويرفع النسخة تلقائيًا.
- التطبيق يقرأ: `https://raw.githubusercontent.com/youssefelkahri/ShaDo-sources/main/manifest.json`
