'use strict';
/* sources/sunovels.js — شمس الروايات (sunovels.com). ملف خاص بهذا المصدر وحده.
 * العمل:   /novel/<slug>            الفصل: /novel/<slug>/<رقم>   (الأرقام فيها فجوات — لا نبني الروابط بالعدّ)
 * القوائم: /library?page=N (24 رواية بالصفحة)  ·  الأحدث: الصفحة الرئيسية (قسم «أحدث الفصول»)
 * الغلاف:  og:image في صفحة العمل (/uploads/…)
 * الفصول (من الأسرع): 1) صفحات تبويب الفصول ?activeTab=chapters&page=N (50 فصلًا بالصفحة) بالتوازي
 *                      2) المتصفح الخفي بالضغط على الترقيم/«عرض المزيد»   3) الفصول الظاهرة في صفحة العمل نفسها
 * البحث:   معامل البحث غير مؤكد → X.siteSearch (يجرّب عدة صيغ ثم المتصفح الخفي يكتب في مربع البحث).
 * التنظيف: رموز الهاش + «شمس الروايات» المحقونة بين الفقرات، وأسطر الاعتماد (TLC / منقول من). */
NovelKit.add('sunovels', K => {
  const global = window;
  const { X, sel1, selA, httpErr, textChapter } = K;
  const log = (m, o) => { try { global.NovelLog && global.NovelLog.add('sun', m, o); } catch (e) { } };
  const AR = s => String(s || '').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const MARK = /[0-9a-f]{10,}\s*شمس\s*الروايات/gi;
  const JUNK = /^(TLC\s*[:：]|منقول من|ترجمة\s*[:：]|\*[\s*]*$|[-–—_=*~•\s]{3,}$|شمس الروايات$|Show Commits)/i;
  const leafTexts = el => selA(el, '*').filter(e => !e.children.length).map(e => X.t(e)).filter(Boolean);
  const STATUS = /^(مكتمل[ةه]?|جديد[ةه]?|مستمر[ةه]?|متوقف[ةه]?|ملغا?[ةه]?)$/;

  function sunovels(S) {
    const base = K.TPL.generic(S, { novelPath: 'novel', pageParam: 'page', search: S.search });
    const origin = new URL(S.home).origin;
    const segs = u => { try { return decodeURIComponent(new URL(u).pathname).split('/').filter(Boolean); } catch (e) { return []; } };
    const slugOf = u => { const s = segs(u); return s[0] === 'novel' && s[1] ? s[1] : null; };
    const chNum = u => { const s = segs(u); return s[0] === 'novel' && s.length === 3 && /^\d+$/.test(s[2]) ? +s[2] : null; };
    const workUrl = slug => origin + '/novel/' + slug;
    const chapUrl = (slug, n) => origin + '/novel/' + slug + '/' + n;
    const tabUrl = (slug, p) => workUrl(slug) + '?activeTab=chapters&page=' + p;

    // ---------- القوائم ----------
    function cards(d) {
      const map = new Map();
      selA(d, 'a[href]').forEach(a => {
        if (a.closest('header, footer, nav')) return;
        const h = X.abs(a.getAttribute('href'), d.__url); if (!h) return;
        const s = segs(h); if (s[0] !== 'novel' || s.length !== 2) return;
        const it = map.get(s[1]) || { url: workUrl(s[1]), title: '', cover: '', latest: '' };
        const im = a.querySelector('img');
        const alt = im && (im.getAttribute('alt') || '').trim();
        const t = (a.getAttribute('title') || '').replace(/\s*Novel$/i, '').trim()
          || leafTexts(a).filter(x => x.length > 1 && !STATUS.test(x) && !/^[\d٠-٩.,\s]+$/.test(x)).sort((x, y) => y.length - x.length)[0]
          || (alt && !/logo/i.test(alt) ? alt : '');
        if (!it.title && t) it.title = t.replace(/\s+/g, ' ').slice(0, 150);
        if (!it.cover && im) { const c = X.img(im, d.__url); if (c && !/logo/i.test(c)) it.cover = c; }
        map.set(s[1], it);
      });
      return Array.from(map.values()).filter(x => x.title);
    }
    base.items = cards;
    const seen = {};
    base.list = async function (a) {
      if (a.q) {
        const e = encodeURIComponent(a.q);
        const items = await X.siteSearch(S, a.q, [origin + '/search?q=' + e, origin + '/library?search=' + e, origin + '/library?title=' + e]);
        return { items, hasNext: false };
      }
      const latest = a.listing === 'latest', page = a.page || 1;
      if (latest && page > 1) return { items: [], hasNext: false };
      const url = latest ? origin + '/' : origin + '/library' + (page > 1 ? '?page=' + page : '');
      let items = [];
      try { items = cards(await X.html(url)); } catch (e) { if (!global.NovelFetch.hasNative()) throw e; }
      if (!items.length && global.NovelFetch.hasNative()) {
        const r = await global.NovelFetch.getList(url, { force: true });
        items = (r.items || []).map(x => { const sg = segs(x.url); return sg[0] === 'novel' && sg.length === 2 ? { url: workUrl(sg[1]), title: x.title, cover: x.cover || '', latest: '' } : null; }).filter(Boolean);
      }
      const key = latest ? 'latest' : 'lib';
      const set = page === 1 ? (seen[key] = new Set()) : (seen[key] = seen[key] || new Set());
      const fresh = items.filter(x => !set.has(x.url)); fresh.forEach(x => set.add(x.url));
      log('قائمة ' + key + ' ص' + page, { n: items.length, fresh: fresh.length });
      return { items: fresh, hasNext: !latest && fresh.length > 0 };
    };

    // ---------- الفصول ----------
    const mk = (slug, n, title, date) => ({ url: chapUrl(slug, n), title: (title || ('الفصل ' + n)).slice(0, 150), num: n, date: date || '', o: n, sp: 0 });
    // عنوان الصف يأتي «N الفصل» أو «الفصل N : عنوان»؛ التاريخ نسبي («5 سنة») فلا نحفظه
    function rowTitle(a, n) {
      const t = (a.getAttribute('title') || '').replace(/\s+/g, ' ').trim();
      const lv = leafTexts(a).map(s => AR(s).replace(/\s+/g, ' ').trim()).filter(Boolean);
      const named = lv.find(s => /[^\d\s.,:/]/.test(s) && !/^\d+\s*الفصل$|^الفصل\s*\d+$/.test(s) && !/^\d+\s*(سنة|سنوات|شهر|أشهر|يوم|أيام|ساعة|ساعات|دقيقة|دقائق|week|day|hour|year|month)/.test(s) && s.length < 150);
      return named || (t && t.length < 150 ? t : '') || ('الفصل ' + n);
    }
    function rowsOf(d, slug) {
      const out = {};
      selA(d, 'a[href]').forEach(a => {
        if (a.closest('header, footer, nav')) return;
        const h = X.abs(a.getAttribute('href'), d.__url); if (!h || slugOf(h) !== slug) return;
        const n = chNum(h); if (n == null || out[n]) return;
        if (/^(التالي|السابق|فهرس|أقرء)/.test(X.t(a))) return;
        out[n] = mk(slug, n, rowTitle(a, n), '');
      });
      return Object.keys(out).map(Number).sort((a, b) => a - b).map(k => out[k]);
    }
    const pagesOf = d => Math.max(1, ...selA(d, 'a[href*="page="]').map(a => { const m = (a.getAttribute('href') || '').match(/[?&]page=(\d+)/); return m ? +m[1] : 1; }), ...selA(d, 'a, button, li').map(e => { const t = AR(X.t(e)); return /^\d{1,4}$/.test(t) ? +t : 1; }).filter(n => n < 2000));

    base.manga = async function (url) {
      const slug = slugOf(url);
      const r = await X.req(workUrl(slug), { html: true });
      if (r.status >= 400) throw httpErr(r, url);
      const d = X.parse(r.text, r.url || url), body = AR(X.t(d.body || d.documentElement));
      const meta = n => ((sel1(d, 'meta[property="' + n + '"],meta[name="' + n + '"]') || {}).content || '').replace(/\s+/g, ' ').trim();
      const title = (meta('og:title') || X.t(sel1(d, 'title'))).split(/\s+[|–—]\s+/)[0].replace(/^رواية\s+/, '').trim() || X.t(sel1(d, 'h1'));
      // العدد الكلي: آخر رقم فصل في رابط «أقرء الفصل الأخير» (العدّاد المعروض قد لا يطابق بسبب الفجوات)
      const lastA = selA(d, 'a[href]').find(a => /الأخير/.test(X.t(a)) && chNum(X.abs(a.getAttribute('href'), d.__url)) != null);
      const lastNo = lastA ? chNum(X.abs(lastA.getAttribute('href'), d.__url)) : 0;
      const firstA = selA(d, 'a[href]').find(a => /الأول/.test(X.t(a)) && chNum(X.abs(a.getAttribute('href'), d.__url)) != null);
      const firstNo = firstA ? chNum(X.abs(firstA.getAttribute('href'), d.__url)) : 1;
      const cm = body.match(/(\d[\d,]*)\s*(?:فصل|الفصول|chapters)/i);
      const total = cm ? +cm[1].replace(/,/g, '') : 0;
      const st = (body.match(/(مستمرة?|مكتملة?|متوقفة?|ملغاة?)/) || [])[1] || '';
      // الصفحة الأولى من تبويب الفصول مباشرة (50 فصلًا) + ما يظهر في صفحة العمل
      let first = rowsOf(d, slug), pages = 1;
      try {
        const td = await X.html(tabUrl(slug, 1));
        const tr = rowsOf(td, slug); pages = pagesOf(td);
        const m = new Map(first.map(c => [c.num, c])); tr.forEach(c => m.set(c.num, c));
        first = Array.from(m.values()).sort((a, b) => a.num - b.num);
      } catch (e) { log('تبويب الفصول ص1 فشل', { err: String(e && e.message || e).slice(0, 80) }); }
      const expect = lastNo || Math.max(total, 0);
      log('عمل ' + slug, { rows: first.length, total, lastNo, pages });
      const res = {
        url, start: first[0] ? first[0].url : chapUrl(slug, firstNo || 1), total: expect, cancel() { res._c = true; },
        title: title.slice(0, 200), cover: meta('og:image') || meta('twitter:image') || '',
        summary: meta('og:description') || meta('description'),
        genres: X.uniqBy(selA(d, 'a[href*="library?category="]').filter(a => !a.closest('header, footer, nav')).map(a => ({ t: X.t(a) })).filter(x => x.t && x.t.length < 30), 't').map(x => x.t),
        status: X.status(st) || st, chapters: first,
      };
      if (lastNo && first.length >= lastNo - firstNo + 1) return res;
      res.more = async function (o) {
        o = o || {};
        const have = new Set(first.map(c => c.url)); (o.have || []).forEach(u => have.add(u));
        const t0 = Date.now(); let reason = 'done', via = '';
        const push = rows => { const f = rows.filter(c => !have.has(c.url)); f.forEach(c => have.add(c.url)); if (f.length && o.onBatch) { try { o.onBatch(f, { got: have.size, total: expect, page: 2, contig: 2 }); } catch (e) { } } return f; };
        // 1) الأرقام (الأسرع): الفصول متسلسلة /novel/<slug>/<رقم> من أول رقم معروف إلى آخر فصل؛ العناوين المعروفة تُحفظ والبقية «الفصل N»
        const top = lastNo || Math.max(0, ...[...have].map(chNum).filter(n => n != null));
        if (top > 0) {
          const rows = []; for (let n = firstNo || 1; n <= top; n++) rows.push(mk(slug, n, '', ''));
          push(rows); via = 'numbers';
        }
        // 2) المتصفح الخفي: إن بقي نقص ولم تنجح الصفحات
        const lack = !via;
        if (lack && !res._c && global.NovelFetch.scrape && global.NovelFetch.hasNative()) {
          try {
            const dd = await global.NovelFetch.scrape(tabUrl(slug, 1), { more: 'عرض المزيد|تحميل المزيد|load\\s*more|التالي|next', expect: expect, timeout: 240000 });
            const rows = [];
            (dd.chapters || []).forEach(x => { const n = chNum(x.url); if (n != null) rows.push(mk(slug, n, '', '')); });
            push(rows); via = (via ? via + '+' : '') + 'webview';
          } catch (e) { reason = res._c ? 'cancelled' : 'failures'; log('فشل المتصفح الخفي', { err: String(e && e.message || e).slice(0, 120) }); }
        }
        if (res._c) reason = 'cancelled';
        const got = have.size;
        log('انتهى جلب الفصول', { reason, via, got, total: expect, lastNo, sec: Math.round((Date.now() - t0) / 1000) });
        // الفجوات في الأرقام طبيعية في هذا الموقع: يكفي أن نصل إلى قرابة العدد المعلن
        const tot = expect || got;
        return { got, total: tot, failed: got >= tot * 0.97 || reason === 'cancelled' ? [] : [1], cancelled: reason === 'cancelled', contig: 2, reason };
      };
      return res;
    };

    // ---------- نص الفصل ----------
    const clean = p => String(p || '').replace(MARK, '').replace(/\s+/g, ' ').trim();
    base.chapter = async function (url) {
      const r = await X.req(url, { html: true });
      if (r.status >= 400) throw httpErr(r, url);
      const d = X.parse(r.text, r.url || url);
      selA(d, '[hidden], [aria-hidden="true"], [style*="display:none"], [style*="display: none"], [class*="hidden"], script, style, noscript').forEach(e => { try { e.remove(); } catch (er) { } });
      const pg = textChapter(d, url);
      let paras = (pg.paras || []).map(clean).filter(p => p && !JUNK.test(p));
      const n = chNum(url);
      // سطر «الفصل N : العنوان» أول النص: يصير العنوان ويُحذف من الفقرات
      if (paras.length && /^الفصل\s*\d+\s*[:：-]?/.test(paras[0]) && paras[0].length < 150) { pg.title = paras[0]; paras = paras.slice(1); }
      pg.paras = paras;
      const slug = slugOf(url), here = url.split('#')[0].split('?')[0];
      const nav = re => { const a = selA(d, 'a[href]').find(x => { const h = X.abs(x.getAttribute('href'), url); return h && slugOf(h) === slug && chNum(h) != null && h.split('#')[0].split('?')[0] !== here && re.test(X.t(x).slice(0, 40)); }); return a ? X.abs(a.getAttribute('href'), url).split('#')[0] : null; };
      pg.next = nav(/التالي/) || (pg.next && chNum(pg.next) != null ? pg.next : null);
      pg.prev = nav(/السابق/) || (pg.prev && chNum(pg.prev) != null ? pg.prev : null);
      if (!pg.title && n != null) pg.title = 'الفصل ' + n;
      if (!pg.paras.length) throw new Error('لم يُعثر على نص في هذا الفصل');
      return pg;
    };
    return base;
  }
  return sunovels;
});
