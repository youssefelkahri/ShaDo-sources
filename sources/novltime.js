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
    // ---------- فهرس محلي للأعمال (عنوان عربي + غلاف) يكبر كلما ظهرت أعمال في القوائم/البحث ----------
    const IDX_KEY = 'nt.idx.' + new URL(H).hostname;
    let idx = null, idxT = 0;
    const loadIdx = () => { if (idx) return idx; try { idx = JSON.parse(localStorage.getItem(IDX_KEY) || '{}') || {}; } catch (e) { idx = {}; } return idx; };
    const saveIdx = () => { clearTimeout(idxT); idxT = setTimeout(() => { try { localStorage.setItem(IDX_KEY, JSON.stringify(idx)); } catch (e) { } }, 800); };
    const addIdx = items => { const I = loadIdx(); let n = 0; (items || []).forEach(x => { if (!x || !x.url || !x.title) return; const sg = novelSegs(x.url); if (!sg || sg.length !== 1) return; const o = I[sg[0]]; if (!o || o[2] || (x.cover && !o[1])) { I[sg[0]] = [x.title, x.cover || (o && o[1]) || '']; n++; } }); if (n) saveIdx(); return n; };
    const searchIdx = q => {
      const toks = X.normAr(q).split(' ').filter(Boolean); if (!toks.length) return [];
      const I = loadIdx(), out = [];
      Object.keys(I).forEach(sl => { const t = X.normAr(I[sl][0] + ' ' + decodeURIComponent(sl).replace(/[-_]+/g, ' ')); if (toks.every(k => t.indexOf(k) >= 0)) out.push({ url: workUrl(sl), title: I[sl][0], cover: I[sl][1] || '', latest: '' }); });
      return out.slice(0, 60);
    };
    let smCache = null;
    async function sitemapSlugs() {
      if (smCache) return smCache;
      const out = [], seenS = new Set(), todo = ['/sitemap.xml', '/sitemap_index.xml', '/ar/sitemap.xml'].map(p => origin + p);
      for (let i = 0; i < todo.length && i < 12; i++) {
        let r; try { r = await X.req(todo[i], {}); } catch (e) { continue; }
        if (!r || r.status >= 400 || !r.text) continue;
        const locs = (r.text.match(/<loc>\s*([^<\s]+)\s*<\/loc>/g) || []).map(x => x.replace(/<\/?loc>/g, '').trim());
        const before = out.length, xmls = [];
        locs.forEach(u => {
          if (/\.xml(\?|$)/i.test(u)) { xmls.push(u); if (todo.length < 12 && !todo.includes(u)) todo.push(u); return; }
          // مع بادئة اللغة أو بدونها: /ar/novel/<slug> أو /novel/<slug>
          let sg = null; try { const ps = new URL(u).pathname.split('/').filter(Boolean), k = ps.indexOf('novel'); if (k >= 0 && ps.length === k + 2) sg = ps[k + 1]; } catch (e) { }
          if (sg && !seenS.has(sg)) { seenS.add(sg); out.push(sg); }
        });
        log('sitemap', { f: todo[i].replace(origin, ''), locs: locs.length, novels: out.length - before, xml: xmls.length, sample: locs.slice(0, 2).join(' | ').slice(0, 200) });
        if (out.length) break;
      }
      return (smCache = out);
    }
    // ---------- واجهة البحث بالمؤشر: /api/v1/search?languages=ar&sort=popular&cursor=…&perPage=20 ----------
    const apiCur = {}, sortOk = {}, apiErr = {};
    let apiShape = false;
    function findItems(j) {
      let best = null;
      const walk = (o, d) => { if (!o || typeof o !== 'object' || d > 4 || best) return; if (Array.isArray(o)) { if (o.length && typeof o[0] === 'object' && o[0] && (o[0].slug || o[0].title || o[0].name)) { best = o; return; } o.forEach(x => walk(x, d + 1)); return; } Object.keys(o).forEach(k => walk(o[k], d + 1)); };
      walk(j, 0); return best || [];
    }
    function findCursor(j, items) {
      const keys = ['nextCursor', 'next_cursor', 'cursor', 'next'];
      for (const holder of [j, j && j.meta, j && j.pagination, j && j.pageInfo, j && j.data]) {
        if (!holder || typeof holder !== 'object' || Array.isArray(holder)) continue;
        for (const k of keys) if (typeof holder[k] === 'string' && holder[k].length > 20) return holder[k];
      }
      let found = ''; const walk = (o, d) => { if (found || !o || typeof o !== 'object' || d > 3 || o === items) return; Object.keys(o).forEach(k => { const v = o[k]; if (!found && typeof v === 'string' && /^eyJ[\w.-]{30,}$/.test(v)) found = v; else walk(v, d + 1); }); };
      walk(j, 0); return found;
    }
    const coverOf = it => {
      let c = it.coverUrl || it.cover_url || it.cover || it.coverImage || it.image || it.thumbnail || it.poster || ''; if (c && typeof c === 'object') c = c.url || c.src || '';
      if (!c || typeof c !== 'string') {
        // اسم الحقل غير معروف: ابحث في كل قيم العنصر عن مسار صورة (…/uploads/covers/… أو امتداد صورة)
        c = ''; const walk = (o, d) => { if (c || !o || typeof o !== 'object' || d > 3) return; Object.keys(o).forEach(k => { const v = o[k]; if (c) return; if (typeof v === 'string' && /(\/uploads\/|covers?\/|\.(jpe?g|png|webp|avif)(\?|$))/i.test(v) && !/avatar/i.test(k)) c = v; else walk(v, d + 1); }); };
        walk(it, 0);
        if (!c) return '';
      }
      try { const u = new URL(c, origin); if (/\/_next\/image/.test(u.pathname) && u.searchParams.get('url')) return new URL(u.searchParams.get('url'), origin).href; return u.href; } catch (e) { return ''; }
    };
    // عدد فصول العنصر إن وُجد حقل رقمي اسمه يحوي chapter (chaptersCount…)؛ null = غير معروف
    const chapN = it => { let v = null; const scan = o => Object.keys(o || {}).forEach(k => { if (v === null && /chapter/i.test(k) && typeof o[k] === 'number') v = o[k]; }); scan(it); if (v === null && it && typeof it.stats === 'object') scan(it.stats); return v; };
    let emptyHid = 0;
    const seenPop = new Set(), popDone = { end: 0 }; // «الأكثر شعبية» ينتهي عند ~687 عملاً (hasMore=false)؛ نكمل بعدها من «الأحدث» دون تكرار
    async function apiPage(sort, page, perPage, extra) {
      let cur = page > 1 ? (apiCur[sort] || {})[page - 1] : '';
      if (page > 1 && !cur) {
        // حالة ضاعت (تحديث المصدر أثناء الجلسة أو صفحات محفوظة): نعيد بناء سلسلة المؤشرات من الصفحة 1 بدل الرجوع للطريقة القديمة
        for (let p = 1; p < page; p++) { if ((apiCur[sort] || {})[p]) continue; const r0 = await apiPage(sort, p, perPage, extra); if (!r0) break; }
        cur = (apiCur[sort] || {})[page - 1];
        if (!cur) return null;
      }
      // قيمة الترتيب «الأحدث» غير معروفة (latest تُرجع 400): نجرّب أسماء محتملة مرة واحدة ونحفظ الناجح
      const cands = sort === 'popular' ? ['popular'] : (sortOk[sort] ? [sortOk[sort]] : [sort, 'updated', 'recent', 'newest', 'new', 'updatedAt', 'createdAt', 'date']);
      let r = null, used = '';
      for (const sv of cands) {
        const q = 'languages=ar&sort=' + sv + (cur ? '&cursor=' + encodeURIComponent(cur) : '') + '&perPage=' + (perPage || 20) + (extra ? '&' + extra : '');
        r = await X.req(origin + '/api/v1/search?' + q, { headers: { Accept: 'application/json' }, timeout: 20000 });
        if (r.status < 400) { used = sv; break; }
        if (!apiErr[sv]) { apiErr[sv] = 1; log('API رفضت الترتيب', { sv, st: r.status, body: String(r.text || '').slice(0, 220) }); }
        if (r.status !== 400) break;
      }
      if (!used) throw new Error('HTTP ' + (r ? r.status : 0));
      if (sort !== 'popular' && !sortOk[sort]) { sortOk[sort] = used; log('ترتيب API مقبول', { sort, used }); }
      const j = JSON.parse(r.text), arr = findItems(j), next = findCursor(j, arr);
      if (!apiShape) { apiShape = true; log('بنية API البحث', { ch: Object.keys(arr[0] || {}).filter(k => /chapter/i.test(k)).join(',') + '=' + chapN(arr[0]), stats: JSON.stringify((arr[0] || {}).stats || {}).slice(0, 200), n: arr.length }); }
      const items = arr.map(it => { if (chapN(it) === 0) { emptyHid++; return null; } const sg = it.slug || (it.url && (novelSegs(it.url) || [])[0]) || ''; const t = clean2(it.title || it.name || it.titleAr || ''); return sg && t ? { url: workUrl(sg), title: t, cover: coverOf(it), latest: (chapN(it) > 0 ? chapN(it) + ' فصل' : '') } : null; }).filter(Boolean);
      if (next) (apiCur[sort] = apiCur[sort] || {})[page] = next;
      // بلا مؤشر معروف: نُبقي الصفحة التالية ممكنة (تعود للطريقة القديمة) بدل إنهاء القائمة
      if (emptyHid && page === 1) log('روايات بلا فصول مخفية', { n: emptyHid });
      const hm = j && j.data && typeof j.data.hasMore === 'boolean' ? j.data.hasMore : undefined;
      if (sort === 'popular') { items.forEach(it => seenPop.add(it.url)); if (hm === false || (!next && arr.length)) { if (!popDone.end) log('نهاية «الأكثر شعبية»', { page, seen: seenPop.size, total: j && j.data && j.data.total }); popDone.end = popDone.end || (arr.length ? page : page - 1); } }
      return { items, hasNext: sort === 'popular' ? arr.length > 0 : (hm === undefined ? arr.length > 0 : hm) };
    }
    // صفحة قائمة واحدة؛ بعد نهاية «الشعبية» نكمل من «الأحدث» ونحذف ما سبق عرضه
    let tailPtr = 1;
    async function listPage(sort, page) {
      if (sort === 'popular' && popDone.end && page > popDone.end) {
        if (page === popDone.end + 1) tailPtr = 1;
        for (let k = 0; k < 8; k++) {
          const r = await apiPage('newest', tailPtr++, 20); if (!r) return null;
          const it = r.items.filter(i => !seenPop.has(i.url));
          if (it.length || !r.hasNext) return { items: it, hasNext: r.hasNext };
        }
        return { items: [], hasNext: false };
      }
      const r0 = await apiPage(sort, page, 20);
      // صفحة الشعبية الأخيرة فارغة: ننتقل فوراً لذيل «الأحدث» بدل الرجوع للمتصفح الخفي
      if (sort === 'popular' && popDone.end && page > popDone.end) return listPage(sort, page);
      return r0;
    }
    async function apiWalk(sort, maxPages) {
      let n = 0, pg = 1; const key = '__walk' + sort; apiCur[key] = {};
      let cur = '';
      for (; pg <= maxPages; pg++) {
        const q = 'languages=ar&sort=' + sort + (cur ? '&cursor=' + encodeURIComponent(cur) : '') + '&perPage=50';
        let j; try { const r = await X.req(origin + '/api/v1/search?' + q, { headers: { Accept: 'application/json' }, timeout: 20000 }); if (r.status >= 400) break; j = JSON.parse(r.text); } catch (e) { break; }
        const arr = findItems(j), next = findCursor(j, arr);
        const its = arr.map(it => { if (chapN(it) === 0) return null; const sg = it.slug || (it.url && (novelSegs(it.url) || [])[0]) || ''; const t = clean2(it.title || it.name || ''); return sg && t ? { url: workUrl(sg), title: t, cover: coverOf(it) } : null; }).filter(Boolean);
        n += addIdx(its); cur = next;
        if (!next || !its.length) break;
        await new Promise(r => setTimeout(r, 250));
      }
      return { pages: pg, added: n };
    }
    // زحف خفيف على صفحات التصنيفات (/ar/genre/<g>: 48 عملًا ثابتة لكل تصنيف) لملء الفهرس المحلي مرة كل 24 ساعة
    let crawling = false;
    async function crawlGenres() {
      if (crawling) return; crawling = true;
      try {
        const TKA = IDX_KEY + '.a'; let lastA = 0; try { lastA = +localStorage.getItem(TKA) || 0; } catch (e) { }
        if (Date.now() - lastA > 864e5) { try { const w = await apiWalk('popular', 120); log('زحف API البحث', w); if (w.added) { try { localStorage.setItem(TKA, String(Date.now())); } catch (e) { } } } catch (e) { } }
        const TK = IDX_KEY + '.t';
        let last = 0; try { last = +localStorage.getItem(TK) || 0; } catch (e) { }
        if (Date.now() - last < 864e5 && Object.keys(loadIdx()).length > 150) return;
        const gs = new Set(['action', 'scifi', 'sliceoflife', 'system', 'horror', 'litrpg', 'mystery', 'drama', 'fantasy', 'historical', 'adventure', 'comedy', 'romance', 'harem', 'martialarts', 'xianxia', 'xuanhuan', 'wuxia', 'supernatural', 'psychological', 'tragedy', 'schoollife', 'mature', 'ecchi', 'josei', 'seinen', 'shounen', 'mecha', 'sports', 'gamelit', 'urban', 'isekai', 'reincarnation']);
        try { const j = await X.json(origin + '/api/v1/genres'); const walk = o => { if (!o || typeof o !== 'object') return; if (Array.isArray(o)) return o.forEach(walk); if (typeof o.slug === 'string' && /^[a-z0-9-]+$/i.test(o.slug)) gs.add(o.slug.toLowerCase()); Object.keys(o).forEach(k => walk(o[k])); }; walk(j); } catch (e) { }
        let added = 0, ok = 0;
        const list = Array.from(gs);
        for (let i = 0; i < list.length; i += 3) {
          await Promise.all(list.slice(i, i + 3).map(async g => { try { const d = await X.html(origin + '/ar/genre/' + g); const c = cards(d); if (c.length) ok++; added += addIdx(c); } catch (e) { } }));
        }
        // خلاصة RSS (آخر ~88 فصلًا): عنوان الرواية قبل « — » ورابطها من رابط الفصل
        try {
          const r = await X.req(origin + '/feed.xml', {});
          if (r && r.status < 400 && r.text) {
            const its = [], re = /<item>[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?<link>\s*([^<\s]+)\s*<\/link>/g; let m;
            while ((m = re.exec(r.text))) { const t = m[1].replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").trim(), k = t.lastIndexOf(' — '); const sg = novelSegs(m[2]); if (k > 1 && sg && sg.length >= 1) its.push({ url: workUrl(sg[0]), title: clean2(t.slice(0, k)), cover: '' }); }
            added += addIdx(its);
          }
        } catch (e) { }
        try { localStorage.setItem(TK, String(Date.now())); } catch (e) { }
        log('زحف التصنيفات', { genres: list.length, ok, added, total: Object.keys(loadIdx()).length });
      } catch (e) { } finally { crawling = false; }
    }
    const clean2 = t => String(t || '').replace(/\s+/g, ' ').trim().slice(0, 150);
    const seenByListing = {};
    base.items = cards;
    base.list = async function (a) {
      if (a.q) {
        // 1) الفهرس المحلي (عناوين عربية) 2) خريطة الموقع (أسماء لاتينية من الرابط) 3) المتصفح الخفي
        if (Object.keys(loadIdx()).length < 150) await crawlGenres();
        const hit = searchIdx(a.q);
        if (hit.length) { log('بحث من الفهرس المحلي', { q: a.q, n: hit.length }); return { items: hit, hasNext: false }; }
        try {
          const toks = X.normAr(a.q).split(' ').filter(Boolean);
          if (toks.length && toks.every(k => /^[a-z0-9]+$/.test(k))) {
            const sm = (await sitemapSlugs()).filter(sl => { const t = decodeURIComponent(sl).replace(/[-_]+/g, ' ').toLowerCase(); return toks.every(k => t.indexOf(k) >= 0); }).slice(0, 30);
            if (sm.length) { log('بحث من خريطة الموقع', { q: a.q, n: sm.length }); return { items: sm.map(sl => ({ url: workUrl(sl), title: sl.replace(/[-_]+/g, ' '), cover: '', latest: '' })), hasNext: false }; }
          }
        } catch (e) { }
        // 2ب) اسم لاتيني: نبني الرابط مباشرة (reverend insanity -> /ar/novel/reverend-insanity/) ونتحقق أنه موجود
        try {
          const toks2 = String(a.q).toLowerCase().replace(/['’]/g, '').split(/[^a-z0-9]+/).filter(Boolean);
          if (toks2.length && toks2.length <= 8 && !/[^\x00-\x7F]/.test(String(a.q).replace(/[\s\u2019]/g, ''))) {
            const cands = [toks2.join('-')]; if (toks2[0] === 'the' && toks2.length > 1) cands.push(toks2.slice(1).join('-'));
            for (const sl of cands) {
              let d2; try { d2 = await X.html(workUrl(sl)); } catch (e) { continue; }
              const t = clean2(X.t(sel1(d2, 'h1')) || ''), im = sel1(d2, 'meta[property="og:image"]');
              if (t) { const it = { url: workUrl(sl), title: t, cover: im ? im.getAttribute('content') || '' : '', latest: '' }; addIdx([it]); log('بحث برابط مباشر', { sl }); return { items: [it], hasNext: false }; }
            }
          }
        } catch (e) { }
        // نتائج البحث تُرسم بالجافاسكربت (الصفحة الثابتة بلا نتائج): نقرؤها من المتصفح الخفي بعد رسمها
        if (global.NovelFetch.hasNative() && global.NovelFetch.getList) {
          try {
            const q = String(a.q).trim();
            const r = await global.NovelFetch.getList(origin + '/ar/search?q=' + encodeURIComponent(q), { query: q, force: true, timeout: 30000, mangaRe: '/ar/novel/[^/?#]+/?$' });
            const by = new Map();
            (r.items || []).forEach(x => { const sg = novelSegs(x.url); if (sg && sg.length === 1 && x.title) by.set(sg[0], { url: workUrl(sg[0]), title: String(x.title).replace(/\s+/g, ' ').trim().slice(0, 150), cover: x.cover || '', latest: '' }); });
            log('بحث المتصفح الخفي', { q, n: by.size });
            if (by.size) { addIdx(Array.from(by.values())); return { items: Array.from(by.values()), hasNext: false }; }
          } catch (e) { log('بحث المتصفح الخفي فشل', { e: String(e && e.message || e).slice(0, 80) }); }
        }
        return Object.assign({ hasNext: false }, await K.TPL.generic(S, { novelPath: 'ar/novel', search: S.search }).list(a));
      }
      const sort = a.listing === 'latest' ? 'latest' : 'popular', page = a.page || 1;
      try {
        let ar = await listPage(sort, page);
        // صفحة كلها روايات بلا فصول (مخفية) تُرجع فارغة: نتخطّاها بدل إنهاء القائمة (كان يوقف «الأكثر شعبية» عند ~460)
        let skipped = 0;
        while (ar && !ar.items.length && ar.hasNext && skipped < 8) {
          const np = page + skipped + 1, nx = await listPage(sort, np);
          if (!nx) break; skipped++; ar = nx;
          (apiCur[sort] = apiCur[sort] || {})[page] = (apiCur[sort] || {})[np] || (apiCur[sort] || {})[page];
        }
        if (skipped) log('صفحات فارغة تخطّيتها', { page, skipped, n: ar ? ar.items.length : 0 });
        if (ar && ar.items.length) { addIdx(ar.items); log('قائمة API ' + sort + ' ص' + page, { n: ar.items.length, next: ar.hasNext }); return { items: ar.items, hasNext: ar.hasNext }; }
      } catch (e) { log('قائمة API فشلت', { e: String(e && e.message || e).slice(0, 80) }); }
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
      addIdx(items); if (page === 1) setTimeout(crawlGenres, 1500);
      const fresh = items.filter(x => !seen.has(x.url)); fresh.forEach(x => seen.add(x.url));
      log('قائمة ' + sort + ' ص' + page, { n: items.length, fresh: fresh.length, withCover: fresh.filter(x => x.cover).length });
      if (page > 1 && !fresh.length) {
        // بديل: خريطة الموقع (إن فشل زر «تحميل المزيد») — العنوان من الرابط تقريبًا والغلاف يُجلب عند فتح العمل
        try {
          const sm = await sitemapSlugs();
          const rest = sm.filter(sl => !seen.has(workUrl(sl))), part = rest.slice(0, 40), I = loadIdx();
          const its = part.map(sl => { const u = workUrl(sl); seen.add(u); return { url: u, title: (I[sl] && I[sl][0]) || decodeURIComponent(sl).replace(/[-_]+/g, ' ').trim(), cover: (I[sl] && I[sl][1]) || '', latest: '' }; });
          log('خريطة الموقع ص' + page, { n: its.length, all: sm.length, left: rest.length - its.length });
          if (its.length) return { items: its, hasNext: rest.length > its.length };
        } catch (e) { log('خريطة الموقع فشلت', { e: String(e && e.message || e) }); }
      }
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
      // النبذة الكاملة: og:description نصّ SEO («اقرأ رواية… مترجمة… — N فصل. …») ومقصوص، والنبذة الحقيقية كاملة في تبويب «نبذة» من الصفحة
      function synopsis(d, meta) {
        const og = meta('og:description') || meta('description');
        const tail = (og.match(/فصل\.\s+(.+)$/) || [])[1] || og, key = tail.replace(/…$/, '').slice(0, 30);
        const cands = selA(d, 'p, div, span, section').filter(e => !e.closest('header, footer, nav') && !e.querySelector('p, div, section')).map(e => X.t(e).replace(/\s+/g, ' ').trim())
          .filter(t => t.length > 60 && t.length < 4000 && !/اقرأ رواية|مترجمة للعربية اونلاين/.test(t) && (!key || t.indexOf(key) === 0));
        cands.sort((a, b) => b.length - a.length);
        return cands[0] || tail;
      }
      const meta = n => ((sel1(d, 'meta[property="' + n + '"],meta[name="' + n + '"]') || {}).content || '').replace(/\s+/g, ' ').trim();
      const title = X.t(sel1(d, 'h1')) || meta('og:title').split(/\s+[|–—-]\s+/)[0];
      const rows = rowsOf(d);
      // العدد الكلي: «فصول (268)» أو «268 فصل مترجم» أو «و148 فصلاً آخر»
      const nums = [];
      const m1 = body.match(/فصول\s*\(\s*(\d[\d,]*)\s*\)/); if (m1) nums.push(+m1[1].replace(/,/g, ''));
      const m2 = AR(body).match(/(\d[\d,]*)\s*فصل\s*مترجم/); if (m2) nums.push(+m2[1].replace(/,/g, ''));
      const m3 = AR(body).match(/و\s*(\d[\d,]*)\s*فصلاً\s*آخر/); if (m3) nums.push(Object.keys(rows).length + +m3[1].replace(/,/g, ''));
      const total = (m1 && +m1[1].replace(/,/g, '')) || Math.max(0, ...nums) || 0; // العدد المعلن في «فصول (N)» هو الأدق؛ تخمين «و148 فصلاً آخر» قد يتضخّم بصفوف غير فصول
      const chapters = Object.keys(rows).map(Number).sort((a, b) => a - b).map(k => rows[k]);
      const rawSlugs = new Set((r.text.match(/\/chapter\/[\w-]+/g) || [])).size;
      const missing = total ? Math.max(0, total - chapters.length) : 0;
      log('عمل ' + url.split('/').filter(Boolean).pop(), { rows: chapters.length, total, missing, rawSlugs, nextData: /__NEXT_DATA__|__next_f/.test(r.text), first: chapters[0] && chapters[0].url, sample: JSON.stringify(chapters.slice(0, 3).map(c => [c.num, c.title, c.sp])).slice(0, 300) });
      // الغلاف: صور /uploads/covers (تُمرَّر عبر _next/image) قبل أي صورة أخرى
      const imgs = selA(d, 'img').filter(i => !i.closest('header, footer, nav'));
      const cimg = imgs.find(i => /uploads%2Fcovers|uploads\/covers/i.test(decodeURIComponent((i.getAttribute('src') || '') + ' ' + (i.getAttribute('srcset') || '')))) || imgs.find(i => (i.getAttribute('alt') || '').indexOf(title.slice(0, 12)) >= 0 && title);
      const first = chapters.find(c => !c.sp);
      const res = {
        url, start: first ? first.url : '', total, cancel() { res._c = true; },
        title: title.slice(0, 200),
        cover: (cimg && X.img(cimg, url)) || '',
        summary: synopsis(d, meta),
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
