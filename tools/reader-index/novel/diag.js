'use strict';
/* sources/diag.js — تشخيص موقع: يجلب صفحة عمل وصفحة فصل كما يراهما التطبيق، ويُخرج تقريراً نصياً قصيراً يُنسخ ويُرسل
 * لمن يكتب مصدراً خاصاً بالموقع. لا يحفظ شيئاً ولا يغيّر إعدادات. NovelDiag.run(workUrl, chapterUrl, progress) -> Promise<string> */
(function (global) {
  const X = NovelSources.X, t = X.t;
  const trunc = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
  const strip = u => { try { const x = new URL(u); return x.origin + x.pathname; } catch (e) { return String(u || ''); } };
  const shape = p => p.replace(/\d+/g, '#');
  const desc = e => { if (!e || !e.tagName) return ''; const c = Array.from(e.classList).slice(0, 2).map(x => '.' + x).join(''); return e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + c; };

  async function get(url) {
    const t0 = Date.now();
    try { const r = await X.req(url, { html: true }); return { r, ms: Date.now() - t0 }; }
    catch (e) { return { err: String(e && e.message || e), ms: Date.now() - t0 }; }
  }
  function frameworks(h) {
    const f = [];
    [[/wp-manga|madara/i, 'Madara'], [/eplister|ts_reader|themesia/i, 'MangaStream'], [/__NEXT_DATA__|__next_f/, 'Next.js'], [/__NUXT__|window\.__nuxt/i, 'Nuxt'], [/ng-version|ng-app/i, 'Angular'], [/data-v-[0-9a-f]{6,}/, 'Vue'], [/wire:id|livewire/i, 'Livewire'], [/csrf-token/i, 'Laravel(csrf)'], [/id="root"|id="app"/, 'جذر SPA'], [/just a moment|cf-browser|challenge-platform/i, 'Cloudflare']]
      .forEach(a => { if (a[0].test(h)) f.push(a[1]); });
    return f.join('، ') || '-';
  }
  function linkShapes(d, base) {
    const m = new Map(); let origin = ''; try { origin = new URL(base).origin; } catch (e) { }
    d.querySelectorAll('a[href]').forEach(a => {
      const u = X.abs(a.getAttribute('href'), base); if (!u) return;
      let x; try { x = new URL(u); } catch (e) { return; }
      if (x.origin !== origin) return;
      const k = shape(decodeURIComponent(x.pathname).replace(/\/+$/, '') || '/');
      const e = m.get(k) || { n: 0, s: [] }; e.n++; if (e.s.length < 2) e.s.push(trunc(t(a), 22)); m.set(k, e);
    });
    return Array.from(m).sort((a, b) => b[1].n - a[1].n).slice(0, 10).map(([k, v]) => '  ' + v.n + '× ' + k + '  «' + v.s.join('، ') + '»');
  }
  function buttons(d) {
    const out = [];
    Array.from(d.querySelectorAll('a,button,div,span,li')).forEach(e => {
      if (e.children.length > 1) return;
      const s = t(e);
      if (s.length <= 24 && /^(تحميل |عرض |اقرأ |قراءة )?(المزيد|الكل|جميع الفصول|التالي|السابق|ابدأ القراءة|load more|show more|next|prev|more)/i.test(s) && out.length < 8) out.push('  ' + desc(e) + ' «' + s + '»' + (e.getAttribute('href') ? ' → ' + trunc(e.getAttribute('href'), 40) : ''));
    });
    return out;
  }
  function jsonHints(d) {
    const out = [];
    const nd = d.getElementById && d.getElementById('__NEXT_DATA__');
    if (nd) { try { const j = JSON.parse(nd.textContent), pp = (j.props && j.props.pageProps) || {}; out.push('  __NEXT_DATA__ pageProps: ' + Object.keys(pp).slice(0, 12).join(', ')); } catch (e) { out.push('  __NEXT_DATA__ موجود (تعذّر تحليله)'); } }
    let sc = ''; d.querySelectorAll('script:not([src])').forEach(s => { if (sc.length < 400000) sc += s.textContent + '\n'; });
    const m = sc.match(/"chapters?"\s*:\s*\[\s*\{[^\]]{0,160}/); if (m) out.push('  في سكربت: ' + trunc(m[0], 170));
    if (/"(chapter_?count|chapters_?count|total_?chapters)"\s*:\s*\d+/i.test(sc)) out.push('  عدد الفصول في سكربت: ' + (sc.match(/"(?:chapter_?count|chapters_?count|total_?chapters)"\s*:\s*(\d+)/i) || [])[1]);
    const ld = d.querySelector('script[type="application/ld+json"]'); if (ld) out.push('  ld+json: ' + trunc(ld.textContent, 140));
    return out;
  }
  function topText(d) {
    return Array.from(d.querySelectorAll('div,article,section,main')).map(e => ({ e, n: Array.from(e.children).filter(c => c.tagName === 'P').reduce((a, p) => a + t(p).length, 0) })).filter(x => x.n > 0).sort((a, b) => b.n - a.n).slice(0, 3).map(x => '  ' + desc(x.e) + (x.e.parentElement ? ' (داخل ' + desc(x.e.parentElement) + ')' : '') + ' — ' + x.n + ' حرفاً');
  }

  async function run(workUrl, chapterUrl, progress) {
    const say = m => { try { progress && progress(m); } catch (e) { } };
    const L = [];
    let host = ''; try { host = new URL(workUrl).hostname; } catch (e) { }
    L.push('# تقرير موقع ' + host, 'إصدار التطبيق ' + ((global.APP_WEB && APP_WEB.version) || '?') + ' · الجلب الأصلي: ' + (global.NovelFetch && NovelFetch.hasNative && NovelFetch.hasNative() ? 'نعم' : 'لا'), '');

    { const kn = (global.NOVEL_KNOWN || {})[host.replace(/^www\./, '')], nt = (global.NOVEL_NOTES || {})[host.replace(/^www\./, '')]; if (kn) L.push('معرفة مسبقة: لدى التطبيق ملف جاهز لهذا الموقع (' + (kn.src || '') + ') — استعمل «فحص ذكي» مباشرة', ''); else if (nt) L.push('معرفة مجتمعية: ' + nt, ''); }
    { const ru = (global.NOVEL_RULES || {})[host.replace(/^www\./, '')]; if (ru) L.push('قواعد معروفة من الإضافات: ' + JSON.stringify(ru).slice(0, 300), ''); }
    say('جلب صفحة العمل…');
    const w = await get(workUrl);
    L.push('## صفحة العمل ' + strip(workUrl));
    let wd = null;
    if (w.err) L.push('تعذّر الجلب: ' + w.err);
    else {
      const r = w.r; wd = X.parse(r.text, r.url || workUrl);
      L.push('الحالة ' + r.status + ' · ' + w.ms + 'ms · حجم ' + (r.text || '').length + ' · نص مرئي ' + ((wd.body && wd.body.textContent) || '').replace(/\s+/g, ' ').length + (r.url && strip(r.url) !== strip(workUrl) ? ' · أُعيد توجيهه إلى ' + strip(r.url) : ''));
      L.push('العنوان: ' + trunc(t(wd.querySelector('title')), 80) + ' | h1: ' + trunc(t(wd.querySelector('h1')), 60));
      const og = (wd.querySelector('meta[property="og:image"]') || {}).content; L.push('og:image: ' + (og ? strip(og) : 'لا يوجد') + ' | أغلفة محتملة: ' + wd.querySelectorAll('img').length + ' صورة');
      L.push('أطر: ' + frameworks(r.text || ''));
      L.push('أكثر أنماط الروابط الداخلية:'); linkShapes(wd, r.url || workUrl).forEach(x => L.push(x));
      const counts = Array.from((wd.body.textContent || '').matchAll(/(\d[\d,]*)\s*(?:فصل|chapters)/gi)).map(m => m[0].trim()).slice(0, 4); if (counts.length) L.push('نصوص عدد الفصول: ' + counts.join(' | '));
      const bt = buttons(wd); if (bt.length) { L.push('أزرار/روابط مفيدة:'); bt.forEach(x => L.push(x)); }
      const jh = jsonHints(wd); if (jh.length) { L.push('بيانات داخل الصفحة:'); jh.forEach(x => L.push(x)); }
    }
    L.push('');

    say('جلب صفحة الفصل…');
    const c = await get(chapterUrl);
    L.push('## صفحة الفصل ' + strip(chapterUrl));
    let cd = null, paras = 0;
    if (c.err) L.push('تعذّر الجلب: ' + c.err);
    else {
      const r = c.r; cd = X.parse(r.text, r.url || chapterUrl);
      L.push('الحالة ' + r.status + ' · ' + c.ms + 'ms · حجم ' + (r.text || '').length + ' · نص مرئي ' + ((cd.body && cd.body.textContent) || '').replace(/\s+/g, ' ').length);
      L.push('العنوان: ' + trunc(t(cd.querySelector('title')), 80) + ' | h1: ' + trunc(t(cd.querySelector('h1')), 60));
      L.push('أطر: ' + frameworks(r.text || ''));
      let ex = { paras: [] }; try { ex = NovelFetch.extractText(cd) || ex; } catch (e) { }
      paras = ex.paras.length;
      L.push('المستخرج: ' + paras + ' فقرة، ' + ex.paras.reduce((a, p) => a + p.length, 0) + ' حرفاً' + (ex.sel ? ' (حاوية: ' + ex.sel + ')' : ''));
      ex.paras.slice(0, 3).forEach((p, i) => L.push('  [' + (i + 1) + '] ' + trunc(p, 80)));
      if (ex.paras.length > 6) ex.paras.slice(-3).forEach((p, i) => L.push('  [آخر-' + (3 - i) + '] ' + trunc(p, 80)));
      const sus = global.NovelGen && NovelGen.suspects ? NovelGen.suspects(ex.paras, host) : [];
      if (sus.length) { L.push('فقرات مشبوهة (إعلانات؟):'); sus.slice(0, 6).forEach(x => L.push('  - ' + trunc(x.text, 70))); }
      L.push('أكبر حاويات الفقرات:'); topText(cd).forEach(x => L.push(x));
      const nx = cd.querySelector(NovelFetch.NAV_NEXT), pv = cd.querySelector(NovelFetch.NAV_PREV);
      L.push('تنقل: التالي ' + (nx ? trunc(nx.getAttribute('href'), 60) : 'لم يُعثر') + ' | السابق ' + (pv ? trunc(pv.getAttribute('href'), 60) : 'لم يُعثر'));
      const bt = buttons(cd); if (bt.length) { L.push('أزرار/روابط مفيدة:'); bt.forEach(x => L.push(x)); }
      const jh = jsonHints(cd); if (jh.length) { L.push('بيانات داخل الصفحة:'); jh.forEach(x => L.push(x)); }
    }

    // المسار البطيء (متصفح مدمج) إن لم ينجح السريع
    if (paras < 3 && global.NovelFetch && NovelFetch.getChapter && NovelFetch.hasNative && NovelFetch.hasNative()) {
      say('تجربة المتصفح المدمج…');
      L.push('', '## المسار البطيء (المتصفح المدمج)');
      try {
        const d = await Promise.race([NovelFetch.getChapter(chapterUrl, { force: true }), new Promise((_, no) => setTimeout(() => no(new Error('انتهت المهلة (45ث)')), 45000))]);
        const ps = (d && d.paras) || [];
        L.push('النتيجة: ' + ps.length + ' فقرة' + (ps[0] ? ' | أولها: ' + trunc(ps[0], 80) : ''));
      } catch (e) { L.push('فشل: ' + trunc(e && e.message || e, 100)); }
    }

    // ===== v2: أرقام الفصول، واجهات API، فحص الحروف =====
    try {
      if (wd) {
        say('تحليل أرقام الفصول…');
        const base = (w.r && w.r.url) || workUrl;
        const nums = []; wd.querySelectorAll('a[href]').forEach(a => { const m = (a.getAttribute('href') || '').split(/[?#]/)[0].match(/\/(\d+)\/?$/); if (m) nums.push(+m[1]); });
        const u = Array.from(new Set(nums)).sort((a, b) => a - b);
        L.push('', '## أرقام الفصول في صفحة العمل');
        L.push(u.length ? ('العدد ' + u.length + ' | الأصغر ' + u[0] + ' | الأكبر ' + u[u.length - 1] + ' | عيّنة: ' + u.slice(0, 12).join(',') + (u.length > 12 ? ' … ' + u.slice(-6).join(',') : '')) : 'لا روابط مرقّمة');
        const big = u.filter(n => n >= 10000); if (big.length) L.push('أرقام ≥10000 (قصص جانبية؟): ' + big.slice(0, 8).join(','));
        const hrefs = Array.from(wd.querySelectorAll('a[href]')).map(a => a.getAttribute('href')).filter(h => /\/\d+\/?(\?|$)/.test(h || '')).slice(0, 3); if (hrefs.length) L.push('أمثلة روابط: ' + hrefs.map(h => strip(h)).join(' | '));
        const scripts = Array.from(new Set(Array.from(wd.querySelectorAll('script[src]')).map(s => s.getAttribute('src')).filter(x => /_nuxt|chunks|static\/js|assets/.test(x || '')))).slice(0, 14);
        const inl = Array.from(wd.querySelectorAll('script:not([src])')).map(s => s.textContent).join('\n');
        const found = new Set();
        const scan = txt => { (txt.match(/["'`](\/?(?:api|_api)\/[A-Za-z0-9_\-\/\.\${}:]*)["'`]/g) || []).forEach(m => { if (/chap|novel|work|episode|part/i.test(m)) found.add(m.slice(0, 90)); }); (txt.match(/baseURL["']?\s*[:=]\s*["'`][^"'`]{3,80}/g) || []).forEach(m => found.add(m.slice(0, 110))); (txt.match(/https?:\/\/api[A-Za-z0-9\.\-]*\.[a-z]{2,}[\/A-Za-z0-9_\-]*/g) || []).slice(0, 4).forEach(m => found.add(m)); };
        scan(inl);
        L.push('', '## مؤشرات واجهة API');
        L.push('كلمة chapter داخل سكربتات الصفحة: ' + ((inl.match(/chapter/gi) || []).length) + ' مرة');
        for (const sUrl of scripts) { if (found.size > 16) break; say('فحص سكربت…'); try { const abs = new URL(sUrl, base).href; if (new URL(abs).hostname !== host) continue; const g = await get(abs); if (g.r && g.r.text) scan(g.r.text); } catch (e) { } }
        L.push(found.size ? Array.from(found).slice(0, 18).map(x => '  - ' + x).join('\n') : 'لم تُعثر مسارات api واضحة');
      }
      if (cd) {
        const txt = Array.from(cd.querySelectorAll('p,div')).map(e => e.children.length ? '' : (e.textContent || '').trim()).filter(x => x.length > 30).sort((a, b) => b.length - a.length)[0] || '';
        if (txt) {
          const words = txt.split(/\s+/).slice(0, 8);
          L.push('', '## فحص الحروف');
          L.push('أول كلمات: ' + words.join(' '));
          const pf = (txt.match(/[\uFB50-\uFDFF\uFE70-\uFEFF]/g) || []).length; L.push('حروف أشكال العرض (FB50-FEFF): ' + pf);
          const w2 = words.find(x => /[\u0627\u0644]{2}/.test(x) || /^ا[ل]/.test(x)) || words[0];
          L.push('أكواد «' + w2 + '»: ' + Array.from(w2).map(ch => ch.codePointAt(0).toString(16)).join(' '));
          const swap = (txt.match(/(?:ج|ا)لل[^\s]{2,}|اإل|األ/g) || []).slice(0, 5); L.push('أنماط الحروف المقلوبة (جلل/اإل/األ): ' + (swap.length ? swap.join(' | ') : 'لا'));
        }
      }
    } catch (e) { L.push('فشل الفحص الإضافي: ' + trunc(e && e.message || e, 100)); }

    // ===== v3: سياق كلمة chapter + فحص مسارات API المحتملة =====
    try {
      if (wd) {
        const inl2 = Array.from(wd.querySelectorAll('script:not([src])')).map(s => s.textContent).join('\n');
        const sn = []; let m, re = /chapter/gi, last = -999;
        while ((m = re.exec(inl2)) && sn.length < 8) { if (m.index - last > 200) { sn.push(inl2.slice(Math.max(0, m.index - 50), m.index + 70).replace(/\s+/g, ' ')); last = m.index; } }
        L.push('', '## سياق كلمة chapter في بيانات الصفحة');
        sn.forEach(x => L.push('  … ' + x + ' …'));
        const nu = inl2.match(/__NUXT__[^;]{0,120}/); if (nu) L.push('NUXT: ' + trunc(nu[0], 130));
        const slug = (workUrl.match(/\/novel\/([^\/?#]+)/) || [])[1];
        const apiB = 'https://api.' + host.replace(/^www\./, '');
        if (slug) {
          L.push('', '## فحص مسارات API (' + apiB + ')');
          const cands = ['/api/novels/' + slug + '/', '/api/novel/' + slug + '/', '/novels/' + slug + '/', '/api/chapters/?novel=' + slug, '/api/novels/' + slug + '/chapters/', '/api/v1/novels/' + slug + '/', '/api/chapters/' + slug + '/1/', '/api/novels/' + slug + '/1/'];
          for (const c of cands) { say('API…'); const g = await get(apiB + c); L.push((g.err ? 'خطأ ' + trunc(g.err, 40) : g.r.status + ' · ' + (g.r.text || '').length + 'ب · ' + trunc((g.r.text || '').replace(/\s+/g, ' '), 90)) + '  ← ' + c); }
        }
      }
    } catch (e) { L.push('فشل فحص v3: ' + trunc(e && e.message || e, 100)); }
    return L.join('\n');
  }
  global.NovelDiag = { run };
})(window);
