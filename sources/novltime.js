'use strict';
/* sources/novltime.js — نوفل تايم (Next.js). ملف خاص بهذا المصدر وحده.
 * القائمة:  /ar/explore?sort=…&language=ar  (بطاقات رابط /ar/novel/<slug>)
 * العمل:    الصفحة الثابتة تعرض الفصول 1–100 ثم سطرًا نصيًا «و148 فصلاً آخر» ثم آخر 20 فصلًا؛
 *           الباقي يأتي من تبويب «الفصول» بزر «تحميل المزيد» (20 فصلًا للدفعة) فنكمله بالمتصفح الخفي.
 * الفصل:    /ar/novel/<slug>/chapter/<id> — المعرّف غير متسلسل (chapter-900240، chapter-201-1)
 *           لذلك رقم الفصل = الرقم الظاهر بجانبه في القائمة (موضعه)، لا رقم الرابط. */
NovelKit.add('novltime', K => {
  const global = window;
  const { X, sel1, selA, httpErr, textChapter } = K;
  const log = (m, o) => { try { global.NovelLog && global.NovelLog.add('nt', m, o); } catch (e) { } };
  const AR = s => String(s || '').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
  const SP_RE = /^\s*(تحديث|تأجيل|تاجيل|إعلان|اعلان|إشعار|اشعار|تنويه|ملاحظة)|الانقطاع|عطلة/;
  const NAV_BTN = /^\s*(ابدأ|ابدا|أحدث|احدث|آخر|اخر|السابق|التالي|العرض|الفهرس)/;
  const leafTexts = el => selA(el, '*').filter(e => !e.children.length).map(e => X.t(e)).filter(Boolean);

  function novltime(S) {
    const H = S.home, origin = new URL(H).origin;
    const base = K.TPL.generic(S, { novelPath: 'ar/novel', search: S.search });
    const novelSegs = u => { try { const s = new URL(u).pathname.split('/').filter(Boolean); return s[0] === 'ar' && s[1] === 'novel' ? s.slice(2) : null; } catch (e) { return null; } };
    const workUrl = slug => origin + '/ar/novel/' + slug + '/';
    const isCh = h => { const r = novelSegs(h); return !!r && r.length === 3 && r[1] === 'chapter'; };

    // ---------- القوائم ----------
    function cards(d) {
      const map = new Map();
      selA(d, 'a[href]').forEach(a => {
        if (a.closest('header, footer, nav')) return;
        const h = X.abs(a.getAttribute('href'), d.__url); if (!h) return;
        const r = novelSegs(h); if (!r || r.length !== 1) return;
        const k = workUrl(r[0]), it = map.get(k) || { url: k, title: '', cover: '', latest: '' };
        const card = a.closest('article, li, [class*=card]') || a;
        const hd = sel1(a, 'h1,h2,h3,h4,h5') || sel1(card, 'h1,h2,h3,h4,h5');
        const im = sel1(a, 'img') || sel1(card, 'img');
        if (!it.title) it.title = X.t(hd) || (im && im.getAttribute('alt')) || (leafTexts(a).find(t => t.length > 1 && !/^\d/.test(t)) || '');
        if (im && !it.cover) it.cover = X.img(im, d.__url);
        map.set(k, it);
      });
      return Array.from(map.values()).map(it => { it.title = String(it.title || '').replace(/\s+/g, ' ').trim().slice(0, 150); return it; }).filter(it => it.title.length > 1);
    }
    const seenByListing = {};
    base.items = cards;
    base.list = async function (a) {
      if (a.q) return Object.assign({ hasNext: false }, await K.TPL.generic(S, { novelPath: 'ar/novel', search: S.search }).list(a));
      const sort = a.listing === 'latest' ? 'latest' : 'popular', page = a.page || 1;
      const url = origin + '/ar/explore?sort=' + sort + '&language=ar' + (page > 1 ? '&page=' + page : '');
      let items = [];
      if (page === 1) {
        try { items = cards(await X.html(url)); } catch (e) { if (!global.NovelFetch.hasNative()) throw e; }
      } else if (global.NovelFetch.scrape && global.NovelFetch.hasNative()) {
        // الصفحات التالية: زر «تحميل المزيد» (يُضغط page-1 مرة) في المتصفح الخفي
        const dd = await global.NovelFetch.scrape(origin + '/ar/explore?sort=' + sort + '&language=ar', { rowRe: '/ar/novel/[^/?#]+/?$', more: 'تحميل المزيد|عرض المزيد|load\\s*more|common\\.loadMore', clicks: page - 1, timeout: 60000 });
        const by = new Map();
        (dd.chapters || []).forEach(x => {
          const r = novelSegs(x.url); if (!r || r.length !== 1) return;
          const lines = String(x.text || '').split('\n').map(t => t.trim()).filter(t => t.length > 1 && !/^[\d٠-٩.,\s]+$/.test(t));
          const title = (x.h || x.alt || lines[0] || '').replace(/\s+/g, ' ').trim().slice(0, 150);
          let cover = x.img || ''; try { const u = new URL(cover, origin); if (/\/_next\/image/.test(u.pathname) && u.searchParams.get('url')) cover = new URL(u.searchParams.get('url'), origin).href; else cover = u.href; } catch (e) { }
          if (title) by.set(x.url, { url: workUrl(r[0]), title, cover, latest: '' });
        });
        items = Array.from(by.values());
        log('تحميل المزيد ص' + page, { rows: (dd.chapters || []).length, items: items.length });
      }
      // إن تجاهل الموقع معامل الصفحة أعاد القائمة نفسها: نمنع التكرار ونوقف التصفح
      const seen = page === 1 ? (seenByListing[sort] = new Set()) : (seenByListing[sort] = seenByListing[sort] || new Set());
      if (page > 1 && !seen.size) { /* لم تُحمَّل الصفحة الأولى في هذه الجلسة: نقبل الكل */ }
      const fresh = items.filter(x => !seen.has(x.url)); fresh.forEach(x => seen.add(x.url));
      log('قائمة ' + sort + ' ص' + page, { n: items.length, fresh: fresh.length, withCover: fresh.filter(x => x.cover).length });
      return { items: page === 1 ? items : fresh, hasNext: page === 1 ? items.length > 0 : fresh.length > 0 };
    };

    // ---------- الفصول ----------
    // نص عنصر فصل (أسطر) -> {pos, title, date}
    function parseRow(lines) {
      lines = lines.map(s => AR(s).replace(/\s+/g, ' ').trim()).filter(Boolean);
      const pi = lines.findIndex(s => /^\d{1,5}$/.test(s));
      let pos = pi >= 0 ? +lines[pi] : null;
      if (pos == null && lines.length) { const m = lines[0].match(/^(\d{1,5})\s+(\S.*)$/); if (m) { pos = +m[1]; lines[0] = m[2]; } }
      if (pos == null) return null;
      let date = '';
      const title = lines.filter((s, i) => {
        if (i === pi || s === 'ف') return false;
        if (/كلمة|words?\b/i.test(s) || /\d{4}/.test(s) && s.length < 40) { const dm = s.match(/\d{1,2}\s+\S+\s+\d{4}/); if (dm && !date) date = dm[0]; return false; }
        return true;
      }).join(' ').trim();
      return { pos, title, date };
    }
    const mkCh = (url, r) => ({ url, title: (r.title || ('الفصل ' + r.pos)).slice(0, 150), num: r.pos, date: r.date || '', o: r.pos, sp: SP_RE.test(r.title || '') ? 1 : 0 });
    function rowsOf(d) {
      const out = {};
      selA(d, 'a[href]').forEach(a => {
        const h = X.abs(a.getAttribute('href'), d.__url); if (!h || !isCh(h)) return;
        if (NAV_BTN.test(X.t(a))) return;
        let r = parseRow(leafTexts(a)); if (!r) { const li = a.closest('li'); r = li && parseRow(leafTexts(li)); } if (!r) return;
        const u = h.split('#')[0].split('?')[0];
        if (!out[r.pos]) out[r.pos] = mkCh(u, r);
      });
      return out;
    }

    base.manga = async function (url) {
      const r = await X.req(url, { html: true });
      if (r.status >= 400) throw httpErr(r, url);
      const d = X.parse(r.text, r.url || url), body = X.t(d.body || d.documentElement);
      const meta = n => ((sel1(d, 'meta[property="' + n + '"],meta[name="' + n + '"]') || {}).content || '').replace(/\s+/g, ' ').trim();
      const title = X.t(sel1(d, 'h1')) || meta('og:title').split(/\s+[|–—-]\s+/)[0];
      const rows = rowsOf(d);
      // العدد الكلي: «فصول (268)» أو «268 فصل مترجم» أو «و148 فصلاً آخر»
      const nums = [];
      const m1 = body.match(/فصول\s*\(\s*(\d[\d,]*)\s*\)/); if (m1) nums.push(+m1[1].replace(/,/g, ''));
      const m2 = AR(body).match(/(\d[\d,]*)\s*فصل\s*مترجم/); if (m2) nums.push(+m2[1].replace(/,/g, ''));
      const m3 = AR(body).match(/و\s*(\d[\d,]*)\s*فصلاً\s*آخر/); if (m3) nums.push(Object.keys(rows).length + +m3[1].replace(/,/g, ''));
      const total = Math.max(0, ...nums) || 0;
      const chapters = Object.keys(rows).map(Number).sort((a, b) => a - b).map(k => rows[k]);
      const rawSlugs = new Set((r.text.match(/\/chapter\/[\w-]+/g) || [])).size;
      const missing = total ? total - chapters.length : 0;
      log('عمل ' + url.split('/').filter(Boolean).pop(), { rows: chapters.length, total, missing, rawSlugs, nextData: /__NEXT_DATA__|__next_f/.test(r.text), first: chapters[0] && chapters[0].url, sample: JSON.stringify(chapters.slice(0, 3).map(c => [c.num, c.title, c.sp])).slice(0, 300) });
      // الغلاف: صور /uploads/covers (تُمرَّر عبر _next/image) قبل أي صورة أخرى
      const imgs = selA(d, 'img').filter(i => !i.closest('header, footer, nav'));
      const cimg = imgs.find(i => /uploads%2Fcovers|uploads\/covers/i.test(decodeURIComponent((i.getAttribute('src') || '') + ' ' + (i.getAttribute('srcset') || '')))) || imgs.find(i => (i.getAttribute('alt') || '').indexOf(title.slice(0, 12)) >= 0 && title);
      const first = chapters.find(c => !c.sp);
      const res = {
        url, start: first ? first.url : '', total, cancel() { res._c = true; },
        title: title.slice(0, 200),
        cover: (cimg && X.img(cimg, url)) || '',
        summary: meta('og:description') || meta('description'),
        genres: X.uniqBy(selA(d, 'a[href*="genre"]').filter(a => !a.closest('header, footer, nav')).map(a => ({ t: X.t(a) })).filter(x => x.t && x.t.length < 30), 't').map(x => x.t),
        status: (() => { const g = (body.match(/(منشور|مكتملة?|مستمرة?|متوقفة?)/) || [])[1] || ''; return g === 'منشور' ? 'مستمر' : X.status(g); })(),
        chapters,
      };
      if (!missing) return res;
      // الباقي من تبويب «الفصول» (زر تحميل المزيد) في المتصفح الخفي
      res.more = async function (o) {
        o = o || {};
        const have = new Set(chapters.map(c => c.url)); (o.have || []).forEach(u => have.add(u));
        if (have.size >= total) { log('الفصول مكتملة محليًا', { have: have.size, total }); return { got: have.size, total, failed: [], skipped: true, contig: 2 }; }
        // 1) الأرقام (الأسرع): نستنتج نمط الرابط من الصفوف المعروفة (…/chapter/<بادئة><رقم الموضع>) ونبني المواضع الناقصة
        const t0n = Date.now();
        const pat = {};
        chapters.forEach(c => { const m = c.url.match(/^(.*\/chapter\/)([^/?#]*?)(\d+)\/?$/); if (m && +m[3] === c.num) { const k = m[1] + '\u0001' + m[2]; pat[k] = (pat[k] || 0) + 1; } });
        const best = Object.keys(pat).sort((a, b) => pat[b] - pat[a])[0];
        if (best) {
          const [dir, pre] = best.split('\u0001'), seenN = new Set(chapters.map(c => c.num)), fresh0 = [];
          for (let n = 1; n <= total; n++) { if (seenN.has(n)) continue; const u = dir + pre + n; if (have.has(u)) continue; have.add(u); fresh0.push(mkCh(u, { pos: n, title: '', date: '' })); }
          if (fresh0.length && o.onBatch) { try { o.onBatch(fresh0, { got: have.size, total, page: 2, contig: 2 }); } catch (e) { } }
          log('بناء بالأرقام', { pattern: dir + pre + 'N', added: fresh0.length, got: have.size, total, sec: Math.round((Date.now() - t0n) / 1000) });
          if (have.size >= total) return { got: have.size, total, failed: [], contig: 2, reason: 'numbers' };
        }
        const F = global.NovelFetch;
        if (!F.scrape || !F.hasNative()) { log('لا متصفح خفي: الفصول الناقصة غير متاحة', { have: have.size, total }); return { got: have.size, total, failed: [1], reason: 'nowebview', contig: 1 }; }
        const t0 = Date.now(); let reason = 'done', fresh = [];
        try {
          const dd = await F.scrape(url, { tab: '^\\s*(الفصول|فصول)', more: 'تحميل المزيد|عرض المزيد|load\\s*more|common\\.loadMore', expect: total, timeout: 85000 });
          const seenPos = new Set(chapters.map(c => c.num));
          (dd.chapters || []).forEach(x => {
            if (!isCh(x.url)) return;
            const r2 = parseRow(String(x.text || '').split('\n')); if (!r2) return;
            const u = x.url.split('#')[0].split('?')[0];
            if (have.has(u) || seenPos.has(r2.pos)) return;
            have.add(u); seenPos.add(r2.pos); fresh.push(mkCh(u, r2));
          });
          log('نتيجة التبويب', { rows: (dd.chapters || []).length, fresh: fresh.length, sample: JSON.stringify((dd.chapters || []).slice(0, 2)).slice(0, 300) });
        } catch (e) { reason = res._c ? 'cancelled' : 'failures'; log('فشل جلب التبويب', { err: String(e && e.message || e) }); }
        if (res._c) reason = 'cancelled';
        const got = have.size;
        if (fresh.length && o.onBatch) { try { o.onBatch(fresh, { got, total, page: 2, contig: 2 }); } catch (e) { } }
        log('انتهى جلب الفصول', { reason, got, total, match: got >= total, sec: Math.round((Date.now() - t0) / 1000) });
        return { got, total, failed: got >= total || reason === 'cancelled' ? [] : [1], cancelled: reason === 'cancelled', contig: 2, reason };
      };
      return res;
    };

    // ---------- نص الفصل ----------
    base.chapter = async function (url) {
      const r = await X.req(url, { html: true });
      if (r.status >= 400) throw httpErr(r, url);
      const d = X.parse(r.text, r.url || url);
      const pg = textChapter(d, url);
      pg.paras = (pg.paras || []).filter(p => !/^[❦\s]*(اكتمل الفصل)?[❦\s]*$/.test(p));
      const here = url.split('#')[0].split('?')[0];
      const nav = re => { const a = selA(d, 'a[href]').find(x => { const h = X.abs(x.getAttribute('href'), url); return h && isCh(h) && h.split('#')[0].split('?')[0] !== here && re.test(X.t(x).slice(0, 40)); }); return a ? X.abs(a.getAttribute('href'), url).split('#')[0] : null; };
      pg.next = pg.next || nav(/التالي|التالى/);
      pg.prev = pg.prev || nav(/السابق/);
      if (!pg.paras.length) throw new Error('لم يُعثر على نص في هذا الفصل');
      // عدد الكلمات: الإعلان القصير يُعدّ معلومة، والطويل فصل حقيقي مهما كان عنوانه
      pg.words = pg.paras.join(' ').split(/\s+/).filter(Boolean).length;
      pg.spHint = SP_RE.test(pg.title || '') ? 1 : 0;
      return pg;
    };
    return base;
  }
  return novltime;
});
