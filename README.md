# ShaDo-sources
المستودع المشترك لتطبيقاتك الثلاثة: مصادر وقاعدة معرفة ومولّد.

- `sources/<id>.js` مصادر JS تُحمَّل وقت التشغيل (`NovelKit.add('<id>', ...)`).
- `manifest.json` قائمة المصادر: النسخة والبصمة (sha256) وأدنى مستوى أصلي `minNative` وبيانات الكتالوج `data`.
- عند دفع تعديل على `sources/` يحدّث سير العمل البصمات ويرفع النسخة تلقائيًا.
- `knowledge/` قاعدة المعرفة (بيانات فقط). انظر `knowledge/README.md`.
- التطبيق يقرأ: `https://raw.githubusercontent.com/youssefelkahri/ShaDo-sources/main/manifest.json`
