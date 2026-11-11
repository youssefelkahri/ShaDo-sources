'use strict';
/* sources/seanovel.js — بحر الروايات (seanovel.org). ملف خاص بهذا المصدر وحده.
 * القوائم:  /search?sort=latest|chapters (24 رواية بالصفحة، ?page=N، تُرسم بالجافاسكربت فتُقرأ بالمتصفح الخفي عند الحاجة)
 * الغلاف:   /api/novel/<slug>/cover (متاح من الرابط نفسه)
 * الفصول (من الأسرع): 1) واجهة JSON محتملة /api/novel/<slug>/chapters  2) المتصفح الخفي بالضغط على «عرض المزيد»
 *                      3) الفصول الظاهرة في صفحة الرواية (10 فقط). الفجوات في الأرقام موجودة (لا نبني الروابط بالعدّ). */
NovelKit.add('seanovel', K => {
  const global = window;
  const { X, sel1, selA, httpErr, textChapter } = K;
  const log = (m, o) => { try { global.NovelLog && global.NovelLog.add('sea', m, o); } catch (e) { } };
  const AR = s => String(s || '').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const JUNK = /^انتهى الفصل \d+ من رواية|^قد يكون هناك حرق|جميع الحقوق محفوظة|^تابع القراءة على بحر الروايات/;
  const leafTexts = el => selA(el, '*').filter(e => !e.children.length).map(e => X.t(e)).filter(Boolean);
  const apiOff = {};   // مسارات JSON التي ثبت فشلها في هذه الجلسة

  function seanovel(S) {
    const base = K.TPL.generic(S, { novelPath: 'novels', pageParam: 'page', search: S.search });
    const origin = new URL(S.home).origin;
    const segs = u => { try { return new URL(u).pathname.split('/').filter(Boolean); } catch (e) { return []; } };
    const slugOf = u => { const s = segs(u); return s[0] === 'novels' ? s[1] : null; };
    const chNum = u => { const s = segs(u); return s[0] === 'novels' && s[2] === 'chapters' && s.length === 4 && /^\d+$/.test(s[3]) ? +s[3] : null; };
    const workUrl = slug => origin + '/novels/' + slug;
    const chapUrl = (slug, n) => origin + '/novels/' + slug + '/chapters/' + n;
    const coverOf = slug => origin + '/api/novel/' + slug + '/cover?type=webp';

    // ---------- القوائم ----------
    function cards(d) {
      const map = new Map();
      selA(d, 'a[href]').forEach(a => {
        if (a.closest('header, footer, nav')) return;
        const h = X.abs(a.getAttribute('href'), d.__url); if (!h) return;
        const s = segs(h); if (s[0] !== 'novels' || s.length !== 2) return;
        const it = map.get(s[1]) || { url: workUrl(s[1]), title: '', cover: '', latest: '' };
        const im = a.querySelector('img');
        const t = leafTexts(a).find(x => x.length > 1 && !/^[\d٠-٩.,\s]+$/.test(x)) || (im && im.getAttribute('alt')) || '';
        if (!it.title && t) it.title = t.replace(/\s+/g, ' ').slice(0, 150);
        if (!it.cover) it.cover = (im && X.img(im, d.__url)) || coverOf(s[1]);
        map.set(s[1], it);
      });
      return Array.from(map.values()).filter(x => x.title);
    }
    base.items = cards;
    const seen = {};
    base.list = async function (a) {
      if (a.q) return Object.assign({ hasNext: false }, await K.TPL.generic(S, { novelPath: 'novels', search: S.search }).list(a));
      const sort = a.listing === 'popular' ? 'chapters' : 'latest', page = a.page || 1;
      const url = origin + '/search?sort=' + sort + (page > 1 ? '&page=' + page : '');
      let items = [];
      try { items = cards(await X.html(url)); } catch (e) { }
      if (!items.length && global.NovelFetch.hasNative()) {
        const r = await global.NovelFetch.getList(url, { force: true });
        items = (r.items || []).map(x => { const sg = segs(x.url); return sg[0] === 'novels' && sg.length === 2 ? { url: workUrl(sg[1]), title: x.title, cover: x.cover || coverOf(sg[1]), latest: '' } : null; }).filter(Boolean);
      }
      const set = page === 1 ? (seen[sort] = new Set()) : (seen[sort] = seen[sort] || new Set());
      const fresh = items.filter(x => !set.has(x.url)); fresh.forEach(x => set.add(x.url));
      log('قائمة ' + sort + ' ص' + page, { n: items.length, fresh: fresh.length });
      return { items: fresh, hasNext: fresh.length > 0 };
    };

    // ---------- الفصول ----------
    const mk = (slug, n, title, date) => ({ url: chapUrl(slug, n), title: (title || ('الفصل ' + n)).slice(0, 150), num: n, date: date || '', o: n, sp: 0 });
    function parseRowLeaves(lv) {
      lv = lv.map(s => AR(s).replace(/\s+/g, ' ').trim()).filter(Boolean);
      const date = (lv.find(s => /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) || '');
      const title = lv.find(s => s !== date && /[^\d\s.,/]/.test(s) && s.length < 150) || '';
      return { title, date };
    }
    function rowsOf(d, slug) {
      const out = {};
      selA(d, 'a[href]').forEach(a => {
        const h = X.abs(a.getAttribute('href'), d.__url); if (!h || slugOf(h) !== slug) return;
        const n = chNum(h); if (n == null || out[n] || a.closest('header, footer, nav')) return;
        const r = parseRowLeaves(leafTexts(a));
        if (/^(الفصل\s*(التالي|السابق)|قائمة الفصول)/.test(X.t(a))) return;
        out[n] = mk(slug, n, r.title, r.date);
      });
      return Object.keys(out).map(Number).sort((a, b) => a - b).map(k => out[k]);
    }
    // واجهة JSON محتملة: نقبل أي مصفوفة كائنات فيها حقل رقم وحقل عنوان
    const pickArr = j => { if (Array.isArray(j)) return j; if (j && typeof j === 'object') { for (const k of Object.keys(j)) { const v = pickArr(j[k]); if (v && v.length && typeof v[0] === 'object') return v; } } return null; };
    const numField = o => {
      if (!o || typeof o !== 'object') return null;
      for (const k of ['number', 'chapterNumber', 'chapter_number', 'num', 'chapterNum', 'order', 'index']) if (o[k] != null && isFinite(+o[k])) return +o[k];
      for (const k of Object.keys(o)) if (/num|chapter|order|index/i.test(k) && k !== 'id' && typeof o[k] !== 'object' && o[k] !== '' && isFinite(+o[k])) return +o[k];
      if (o.id != null && isFinite(+o.id)) return +o.id;   // في واجهة الموقع: id = رقم الفصل
      for (const k of ['url', 'slug', 'href', 'path']) { const m = String(o[k] || '').match(/(\d+)\/?$/); if (m) return +m[1]; }
      return null;
    };
    const titleField = o => { for (const k of ['title', 'name', 'chapterTitle', 'chapter_title']) if (o && typeof o[k] === 'string' && o[k]) return o[k]; return ''; };
    const totalField = j => { if (!j || typeof j !== 'object') return 0; for (const k of ['total', 'totalCount', 'count', 'totalChapters']) if (isFinite(+j[k]) && +j[k] > 0) return +j[k]; for (const k of Object.keys(j)) if (j[k] && typeof j[k] === 'object' && !Array.isArray(j[k])) { const t = totalField(j[k]); if (t) return t; } return 0; };
    async function apiChapters(slug, total, o) {
      const path = '/api/novel/' + slug + '/chapters';
      if (apiOff[path]) return null;
      const rows = [], seenN = new Set(); let ok = false, apiTotal = 0;
      try {
        for (let page = 1, off = 0; page <= 250; page++) {
          if (o && o.cancelled && o.cancelled()) break;
          const r = await X.req(origin + path + '?sort=asc&limit=100&offset=' + off, { timeout: 15000, headers: { Accept: 'application/json' } });
          if (r.status >= 400) throw new Error('HTTP ' + r.status);
          let j; try { j = JSON.parse(r.text); } catch (e) { log('ردّ API ليس JSON', { page, len: (r.text || '').length, head: String(r.text || '').slice(0, 200) }); break; }
          const arr = pickArr(j);
          if (page === 1) { apiTotal = totalField(j); log('بنية API الفصول', { keys: Object.keys(j || {}).join(','), n: arr ? arr.length : -1, total: apiTotal, item: arr && arr[0] ? JSON.stringify(arr[0]).slice(0, 220) : '' }); }
          if (!arr || !arr.length) break;
          const part = arr.map(x => { const n = numField(x); return n == null || seenN.has(n) ? null : (seenN.add(n), mk(slug, n, titleField(x), String(x.createdAt || x.date || x.created_at || '').slice(0, 10))); }).filter(Boolean);
          if (!part.length) break;
          ok = true; rows.push(...part); off += arr.length;
          if (o && o.onRows) o.onRows(part);
          if ((apiTotal && rows.length >= apiTotal) || j.hasMore === false || (j.data && j.data.hasMore === false)) break;
          await sleep(120);
        }
      } catch (e) { apiOff[path] = 1; log('API الفصول غير متاحة', { err: String(e && e.message || e).slice(0, 80) }); return null; }
      if (ok) return { rows, path, apiTotal, done: !!apiTotal && rows.length >= apiTotal };
      apiOff[path] = 1; return null;
    }

    base.manga = async function (url) {
      const slug = slugOf(url);
      const r = await X.req(url, { html: true });
      if (r.status >= 400) throw httpErr(r, url);
      const d = X.parse(r.text, r.url || url), body = AR(X.t(d.body || d.documentElement));
      const meta = n => ((sel1(d, 'meta[property="' + n + '"],meta[name="' + n + '"]') || {}).content || '').replace(/\s+/g, ' ').trim();
      const title = X.t(sel1(d, 'h1')) || meta('og:title').split(/\s+[|–—-]\s+/)[0];
      const tm = body.match(/(\d[\d,]*)\s*الفصول/) || body.match(/الفصول\s*(\d[\d,]*)/);
      const total = tm ? +tm[1].replace(/,/g, '') : 0;
      const first = rowsOf(d, slug);
      const st = (body.match(/(مستمرة?|مكتملة?|متوقفة?|ملغاة?)/) || [])[1] || '';
      const cimg = selA(d, 'img').find(i => /\/api\/novel\/[^/]+\/cover/.test((i.getAttribute('src') || '') + (i.getAttribute('data-src') || '')));
      log('عمل ' + slug, { rows: first.length, total, cover: !!cimg });
      const res = {
        url, start: first[0] ? first[0].url : chapUrl(slug, 1), total, cancel() { res._c = true; },
        title: title.slice(0, 200), cover: (cimg && X.img(cimg, url)) || (origin + '/api/novel/' + slug + '/cover?type=original'),
        summary: meta('og:description') || meta('description'),
        genres: X.uniqBy(selA(d, 'a[href*="genre="]').filter(a => !a.closest('header, footer, nav')).map(a => ({ t: X.t(a) })).filter(x => x.t && x.t.length < 30), 't').map(x => x.t),
        status: X.status(st) || st, chapters: first,
      };
      if (total && first.length >= total) return res;
      res.more = async function (o) {
        o = o || {};
        const have = new Set(first.map(c => c.url)); (o.have || []).forEach(u => have.add(u));
        if (total && have.size >= total) { log('الفصول مكتملة محليًا', { have: have.size, total }); return { got: have.size, total, failed: [], skipped: true, contig: 2 }; }
        const t0 = Date.now(); let reason = 'done', via = '';
        const push = rows => { const f = rows.filter(c => !have.has(c.url)); f.forEach(c => have.add(c.url)); if (f.length && o.onBatch) { try { o.onBatch(f, { got: have.size, total, page: 2, contig: 2 }); } catch (e) { } } return f; };
        // 1) واجهة JSON
        const a = await apiChapters(slug, total, { cancelled: () => res._c, onRows: push });
        if (a) via = 'api:' + a.path;
        // فصول البداية (1..3) قد لا تأتي من القائمة: نتحقق منها مباشرة من صفحاتها
        if (!res._c) {
          const nums = [...have].map(chNum).filter(n => n != null);
          const mn = nums.length ? Math.min.apply(null, nums) : 1;
          for (let n = 1; n <= Math.min(3, mn - 1) && !res._c; n++) {
            try {
              const rr = await X.req(chapUrl(slug, n), { html: true, timeout: 15000 });
              if (rr.status >= 400) continue;
              const dd = X.parse(rr.text, chapUrl(slug, n));
              const t = (X.t(sel1(dd, 'h1')) || '').replace(/\s+/g, ' ').trim();
              push([mk(slug, n, t && t.length < 150 ? t : '', '')]);
              log('أُضيف فصل بداية', { n, t });
            } catch (e) { }
          }
        }
        // 2) المتصفح الخفي: «عرض المزيد» مرارًا
        if (!via || (!(a && a.done) && total && have.size < total)) {
          const F = global.NovelFetch;
          if (F.scrape && F.hasNative() && !res._c) {
            try {
              let dd = null;
              for (let t = 0; t < 4 && !dd && !res._c; t++) {
                try { dd = await F.scrape(url, { more: 'عرض المزيد|تحميل المزيد|load\\s*more', expect: total, timeout: 240000 }); } catch (e) { if (!/cancelled/i.test(String(e && e.message || e)) || t === 3) throw e; log('أُلغي المتصفح الخفي — إعادة المحاولة', { t }); await sleep(4000); }
              }
              if (!dd) throw new Error('cancelled');
              const rows = [];
              (dd.chapters || []).forEach(x => { const n = chNum(x.url); if (n == null) return; const rr = parseRowLeaves(String(x.text || '').split('\n')); rows.push(mk(slug, n, rr.title, rr.date)); });
              push(rows); via = (via ? via + '+' : '') + 'webview';
              log('طلبات الصفحة أثناء التحميل', { req: JSON.stringify((dd.req || []).filter(u => /api|chapter|_next\/data|\.json/i.test(u)).slice(0, 12)).slice(0, 900) });
            } catch (e) { reason = res._c ? 'cancelled' : 'failures'; log('فشل المتصفح الخفي', { err: String(e && e.message || e).slice(0, 120) }); }
          } else if (!via) { reason = 'nowebview'; }
        }
        if (res._c) reason = 'cancelled';
        const got = have.size;
        const tot = a && a.done ? a.apiTotal : total;
        log('انتهى جلب الفصول', { reason, via, got, total, match: total ? got >= total : null, sec: Math.round((Date.now() - t0) / 1000) });
        return { got, total: tot, failed: !tot || got >= tot || reason === 'cancelled' ? [] : [1], cancelled: reason === 'cancelled', contig: 2, reason };
      };
      return res;
    };

    // ---------- نص الفصل ----------
    base.chapter = async function (url) {
      const r = await X.req(url, { html: true });
      if (r.status >= 400) throw httpErr(r, url);
      const d = X.parse(r.text, r.url || url);
      const pg = textChapter(d, url);
      pg.paras = (pg.paras || []).filter(p => !JUNK.test(p));
      const slug = slugOf(url), here = url.split('#')[0].split('?')[0];
      const nav = re => { const a = selA(d, 'a[href]').find(x => { const h = X.abs(x.getAttribute('href'), url); return h && slugOf(h) === slug && chNum(h) != null && h.split('#')[0].split('?')[0] !== here && re.test(X.t(x).slice(0, 40)); }); return a ? X.abs(a.getAttribute('href'), url).split('#')[0] : null; };
      pg.next = pg.next || nav(/التالي/);
      pg.prev = pg.prev || nav(/السابق/);
      if (!pg.paras.length) throw new Error('لم يُعثر على نص في هذا الفصل');
      return pg;
    };
    return base;
  }
  return seanovel;
});
