/* novel-merge.js — دمج العمل الواحد من عدة مصادر (مستقل، بلا اعتماديات).
 * الفكرة مأخوذة من manga-reader-api: مفتاح عنوان مطبَّع + تجميع + مناوبة بين المصادر.
 *
 *   NovelMerge.key(title)                 -> مفتاح ثابت للعمل ('' إن تعذّر)
 *   NovelMerge.same(a, b)                 -> هل العنوانان لعمل واحد؟ (تطابق تام للمفتاح)
 *   NovelMerge.close(a, b)                -> مثل same مع تسامح في التهجئة
 *   NovelMerge.group({sid: [items]}, order) -> [{key, title, cover, n, srcs:[{sid,url,title,cover,latest,n}]}]
 *       (مرتبة بالمناوبة بين المصادر حتى لا يطغى مصدر واحد)
 *   NovelMerge.num(text)                  -> أول رقم في النص (يدعم الأرقام العربية)
 */
(function (global) {
  'use strict';
  const AR = s => String(s == null ? '' : s).toLowerCase()
    .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي');
  // كلمات لا تميّز العمل: نوعه أو لاحقة الفصل
  const NOISE = /\b(novel|light novel|ln|the|a|an|official|raw|translated)\b|(^|\s)(رواية|الرواية|روايه|مترجمة|مترجمه)(?=\s|$)/g;
  const CHAP = /(\s|^)(chapter|ch|الفصل|فصل|الحلقة|episode|ep)\.?\s*\d+(\.\d+)?.*$/;
  function key(title) {
    let t = AR(title);
    if (!t) return '';
    t = t.replace(/\([^)]*\)|\[[^\]]*\]|【[^】]*】/g, ' ');
    t = t.replace(CHAP, ' ');
    t = t.replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
    const bare = t.replace(NOISE, ' ').replace(/\s+/g, ' ').trim();
    if (bare.length >= 2) t = bare;
    return t.replace(/\s/g, '');
  }
  const same = (a, b) => { const x = key(a), y = key(b); return !!x && x === y; };
  // مقارنة متسامحة لاختلاف التهجئة (ليفيلينج/ليفلينج): مسافة تعديل صغيرة للعناوين الطويلة
  function lev(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i]; let low = i;
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (cur[j] < low) low = cur[j];
      }
      if (low > max) return max + 1;
      prev = cur;
    }
    return prev[b.length];
  }
  function close(a, b) {
    const x = key(a), y = key(b);
    if (!x || !y) return false;
    if (x === y) return true;
    const L = Math.min(x.length, y.length);
    if (L < 6) return false;
    return lev(x, y, L >= 14 ? 2 : 1) <= (L >= 14 ? 2 : 1);
  }
  function num(s) {
    const m = AR(s).match(/\d+(?:\.\d+)?/);
    return m ? parseFloat(m[0]) : null;
  }
  // يجمع نتائج عدة مصادر: نفس المفتاح = عمل واحد، مع مصدر واحد لكل موقع
  function group(bySrc, order) {
    const sids = (order && order.length ? order.filter(s => bySrc[s]) : Object.keys(bySrc));
    const map = new Map(), out = [];
    const lists = sids.map(sid => (bySrc[sid] || []).filter(x => x && x.url && x.title));
    const max = lists.reduce((n, l) => Math.max(n, l.length), 0);
    // مناوبة: العنصر الأول من كل مصدر، ثم الثاني…
    for (let i = 0; i < max; i++) {
      lists.forEach((l, j) => {
        const x = l[i]; if (!x) return;
        const sid = sids[j], k = key(x.title) || ('u:' + x.url);
        const n = x.n != null ? x.n : num(x.latest);
        let g = map.get(k);
        if (!g) { g = { key: k, title: x.title, cover: x.cover || '', n: null, srcs: [] }; map.set(k, g); out.push(g); }
        if (g.srcs.some(s => s.sid === sid)) return;
        g.srcs.push({ sid, url: x.url, title: x.title, cover: x.cover || '', latest: x.latest || '', n, sc: x.sc });
        if (!g.cover && x.cover) g.cover = x.cover;
        if (n != null && (g.n == null || n > g.n)) g.n = n;
      });
    }
    return out;
  }
  global.NovelMerge = { key, same, close, group, num };
})(typeof window !== 'undefined' ? window : globalThis);
