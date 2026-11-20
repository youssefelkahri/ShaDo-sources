'use strict';
/* sources/core.js — أدوات المصادر المشتركة. كل ملف آخر في sources/ يضيف جزءًا عبر NovelKit.add().
 * NovelKit.make(RO) يبني نسخة مستقلة من الأدوات والقوالب (RO = خيارات الطلبات، مثل native:'only' للبحث الشامل). */
(function (global) {
  const parts = [];
  const NovelKit = global.NovelKit = { add(name, fn) { parts.push([name, fn]); }, make };
  function httpErr(r, url) { const e = new Error('HTTP ' + r.status); e.status = r.status; e.url = url; return e; }
  function make(RO) {
  RO = RO || {};
  const X = {};
  X.req = (url, o) => global.NovelFetch.req(url, Object.assign({ via: (() => { try { return new URL(url).origin; } catch (e) { return undefined; } })() }, RO, o));
  X.abs = (h, base) => { try { return h ? new URL(String(h).trim(), base).href : null; } catch (e) { return null; } };
  // رابط «ابدأ القراءة / الفصل الأول» في صفحة العمل (للمواقع التي لا تُظهر كل الفصول في القائمة)
  X.findStart = (d, url) => {
    const re = /(ابدأ\s*القراءة|ابدا\s*القراءة|الفصل\s*(الأول|الاول|1)\b|فصل\s*(1|الأول)\b|chapter\s*(1|one)\b|first\s*chapter|start\s*reading|read\s*first)/i;
    try {
      for (const a of d.querySelectorAll('a[href]')) {
        if (!re.test(String(a.textContent || '').replace(/\s+/g, ' ').trim())) continue;
        const u = X.abs(a.getAttribute('href'), url); if (!u) continue;
        const h = u.split('#')[0]; if (h === url || /\/(series|tag|genre|category|page|author|wp-|login|register|feed)\b/i.test(new URL(h).pathname) || new URL(h).origin !== new URL(url).origin) continue;
        return h;
      }
    } catch (e) { }
    return '';
  };
  X.t = e => (e && e.textContent || '').replace(/\s+/g, ' ').trim();
  X.num = s => { const m = String(s == null ? '' : s).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).match(/\d+(?:\.\d+)?/); return m ? parseFloat(m[0]) : null; };
  X.qs = o => {
    const p = [];
    Object.keys(o).forEach(k => {
      const v = o[k];
      if (v == null || v === '') return;
      (Array.isArray(v) ? v : [v]).forEach(x => { if (x != null && x !== '') p.push(encodeURIComponent(k) + '=' + encodeURIComponent(x)); });
    });
    return p.join('&');
  };
  const IMG_ATTRS = ['data-src', 'data-lazy-src', 'data-original', 'data-cfsrc', 'data-wpfc-original-src', 'data-lazy', 'data-image', 'data-url', 'data-zoom-src', 'src'];
  const IMG_BAD = u => !u || /^(data|blob):/i.test(u) || /placeholder|blank|pixel|spacer|loading|lazy\.(gif|png|svg)|1x1/i.test(u);
  const unNext = u => { try { const x = new URL(u); if (/\/_next\/image\/?$/.test(x.pathname) && x.searchParams.get('url')) return new URL(x.searchParams.get('url'), x.origin).href; } catch (e) { } return u; };
  X.img = (el, base) => { const r = imgRaw(el, base); return r ? unNext(r) : r; };
  const imgRaw = (el, base) => {
    if (!el) return '';
    if (el.querySelector && !/^img$/i.test(el.tagName || '')) { const i2 = el.querySelector('img'); if (i2) el = i2; }
    for (const a of IMG_ATTRS) { const v = (el.getAttribute(a) || '').trim(); if (v && !IMG_BAD(v)) return X.abs(v, base); }
    const ss = el.getAttribute('data-srcset') || el.getAttribute('data-lazy-srcset') || el.getAttribute('srcset');
    if (ss) {
      const parts = ss.split(',').map(x => x.trim().split(/\s+/)).filter(x => x[0] && !IMG_BAD(x[0]));
      parts.sort((a, b) => (parseFloat(b[1]) || 0) - (parseFloat(a[1]) || 0));
      if (parts[0]) return X.abs(parts[0][0], base);
    }
    for (const at of Array.from(el.attributes || [])) { if (/^data-/.test(at.name) && /\.(jpe?g|png|webp|avif)(\?|$)/i.test(at.value) && !IMG_BAD(at.value)) return X.abs(at.value.trim(), base); }
    const st = el.getAttribute('style') || '';
    const m = st.match(/url\(['"]?([^'")]+)/);
    return m ? X.abs(m[1], base) : '';
  };
  X.parse = (text, url) => {
    const d = new DOMParser().parseFromString(text || '', 'text/html');
    try { const b = d.createElement('base'); b.href = url; (d.head || d.documentElement).prepend(b); } catch (e) { }
    d.__url = url;
    return d;
  };
  function httpErr(r, url) { const e = new Error('HTTP ' + r.status); e.status = r.status; e.url = url; return e; }
  X.html = async (url, o) => { const r = await X.req(url, Object.assign({ html: true }, o)); if (r.status >= 400) throw httpErr(r, url); return X.parse(r.text, r.url || url); };
  X.json = async (url, o) => {
    o = Object.assign({}, o); o.headers = Object.assign({ Accept: 'application/json' }, o.headers || {});
    const r = await X.req(url, o);
    if (r.status >= 400) throw httpErr(r, url);
    try { return JSON.parse(r.text); } catch (e) { throw new Error('ردّ غير متوقع من الموقع'); }
  };
  X.postForm = (url, obj, o) => { o = o || {}; return X.req(url, Object.assign({}, o, { method: 'POST', body: typeof obj === 'string' ? obj : X.qs(obj), headers: Object.assign({ 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' }, o.headers || {}) })); };
  X.postJson = async (url, obj, o) => {
    const r = await X.req(url, Object.assign({}, o, { method: 'POST', body: JSON.stringify(obj), headers: Object.assign({ 'Content-Type': 'application/json', Accept: 'application/json' }, (o && o.headers) || {}) }));
    if (r.status >= 400) throw httpErr(r, url);
    return JSON.parse(r.text);
  };
  X.between = (s, a, b) => { const i = s.indexOf(a); if (i < 0) return null; const j = s.indexOf(b, i + a.length); return j < 0 ? null : s.slice(i + a.length, j); };
  // عناصر تحمل نصًا معيّنًا (بديل :contains)
  X.byText = (root, sel, words) => Array.from(root.querySelectorAll(sel)).filter(e => words.some(w => X.t(e).indexOf(w) >= 0));
  X.uniqBy = (arr, k) => { const s = new Set(); return arr.filter(x => { const v = x[k]; if (!v || s.has(v)) return false; s.add(v); return true; }); };
  X.path = u => { try { return decodeURIComponent(new URL(u).pathname); } catch (e) { return ''; } };
  X.segs = u => X.path(u).split('/').filter(Boolean);
  // حمولة Next.js (self.__next_f.push)
  X.status = s => {
    s = String(s || '').toLowerCase();
    if (/مستمر|ongoing|on-going|releasing|coming|قادم/.test(s)) return 'مستمر';
    if (/مكتمل|completed|end\b|finished|منتهي/.test(s)) return 'مكتمل';
    if (/متوقف|hiatus|on-hold|on_hold/.test(s)) return 'متوقف';
    if (/ملغ|cancel|dropped|متروك/.test(s)) return 'ملغى';
    return '';
  };
  const sameHost = (u, home) => { try { return new URL(u).hostname.replace(/^www\./, '') === new URL(home).hostname.replace(/^www\./, ''); } catch (e) { return false; } };
  const sel1 = (root, s) => { try { return root.querySelector(s); } catch (e) { return null; } };
  const selA = (root, s) => { try { return Array.from(root.querySelectorAll(s)); } catch (e) { return []; } };


  const normAr = t => String(t || '').toLowerCase().replace(/[ً-ٰٟـ]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  X.normAr = normAr;
  function scoreTitle(title, q) {
    const nq = normAr(q), t = normAr(title), toks = nq.split(' ').filter(x => x.length > 1); if (!nq) return 0;
    if (t.replace(/ /g, '').includes(nq.replace(/ /g, ''))) return 1;
    if (!toks.length) return t.includes(nq) ? 1 : 0;
    const tw = t.split(' '); let n = 0;
    for (const k of toks) { const kk = k.replace(/^(ال|و|ب|ل)/, ''); if (t.includes(k) || (kk.length > 1 && t.includes(kk)) || tw.some(w => w.length > 2 && k.length > 2 && (w.startsWith(k) || k.startsWith(w)))) n++; }
    return n / toks.length;
  }
  function textChapter(d, url) {
    const F = global.NovelFetch;
    // قواعد خاصة بالموقع (rules.js): حذف عناصر الإعلانات/الزخارف قبل الاستخراج، ثم تصفية الفقرات بأنماط الموقع
    let R = null; try { R = (global.NOVEL_RULES || {})[new URL(url).hostname.replace(/^www\./, '')] || null; } catch (e) { }
    if (R) {
      (R.css || []).forEach(q => { try { selA(d, q).forEach(e => e.parentNode && e.parentNode.removeChild(e)); } catch (e) { } });
      (R.tags || []).filter(t => /^(h[2-6]|span|em|strong|b|i|small|sup|hr|center)$/i.test(t)).forEach(t => { try { selA(d, (R.body ? R.body + ' ' : '') + t).forEach(e => e.parentNode && e.parentNode.removeChild(e)); } catch (e) { } });
    }
    const ex = F.extractText(d);
    if (R && R.rx && R.rx.length) {
      const res = R.rx.map(x => { try { return new RegExp(String(x).replace(/^\(\?i\)/, ''), 'i'); } catch (e) { return null; } }).filter(Boolean);
      if (res.length) ex.paras = ex.paras.filter(p => !res.some(r => r.test(p)));
    }
    // تنظيف عام لكل المصادر: رسائل مضادة للنسخ برمز عشوائي، وأسطر واجهة الموقع الدخيلة
    const HEX = /\s*\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{8,14}\b/gi;
    const GUARD = /(?:هذا|هـذا|هذه)\s*(?:التطبيق|الموقع)[^.؟!]{0,40}?(?:يسرق|مسروق|منسوخ)[\s\S]*?(?:\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{8,14}\b|$)/gi;
    const UI = /^(report a problem|google play|app store|download( the)? app|صفحة الرواية|حمّ?له من هنا.{0,30}|حمل (التطبيق|تطبيقنا).{0,30}|الفصل \d+ من \d+ فصل|الفصل (السابق|التالي)|(?:الفصل|فصل)\s*\d+)$/i;
    ex.paras = ex.paras.map(p => p.replace(GUARD, ' ').replace(/\s{2,}/g, ' ').trim()).filter(p => p && !UI.test(p) && !/^(?:[0-9a-f]{8,14})$/i.test(p));
    const link = sel => { const e = sel1(d, sel); return e ? X.abs(e.getAttribute('href'), url) : null; };
    const byText = re => {
      for (const a of selA(d, 'a[href]')) {
        const t = X.t(a).replace(/[«»<>←→›‹]/g, '').trim(), h = a.getAttribute('href') || '';
        if (t.length <= 24 && re.test(t) && !/^(#|javascript:)/i.test(h)) { const u = X.abs(h, url); if (u && u !== url && sameHost(u, url)) return u; }
      }
      return null;
    };
    return {
      paras: ex.paras, title: ex.title || X.t(sel1(d, '#chapter-heading, h1.entry-title, h1')),
      next: link(F.NAV_NEXT) || byText(/^(الفصل\s*)?(التالي|التالى)$|^next(\s*chapter)?$/i),
      prev: link(F.NAV_PREV) || byText(/^(الفصل\s*)?(السابق)$|^prev(ious)?(\s*chapter)?$/i),
    };
  }

    const K = { X, RO, sel1, selA, sameHost, httpErr, normAr, scoreTitle, textChapter, TPL: {} };
    // الأجزاء: دوال تضيف أدوات إلى X (القيمة undefined) أو قوالب (دالة) تُحفظ في K.TPL
    parts.forEach(([name, fn]) => { const v = fn(K); if (typeof v === 'function') K.TPL[name] = v; });
    return K;
  }
})(window);
