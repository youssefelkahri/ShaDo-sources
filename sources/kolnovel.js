'use strict';
/* sources/kolnovel.js — ملوك الروايات (من Mangayomi وQuickNovel) */
NovelKit.add('kolnovel', K => {
  const global = window;
  const { X, sel1, selA, httpErr, textChapter } = K;
  // ---------- ملوك الروايات kolnovel (ثيم starless) — منقول من Mangayomi وQuickNovel ----------
  // القوائم: div.listupd article ؛ البحث: admin-ajax (ts_ac_do_search) يُرجع JSON بالأغلفة ؛
  // الفصل: /wp-json/wp/v2/posts/<id> (رقم آخر رابط الفصل) نصّ نظيف بلا صفحة الموقع.
  function kolnovel(S) {
    const base = K.TPL.mangathemesia(S, { dir: '/series' }), H = S.home;
    const clean = t => { t = String(t || ''); if (!/[-_&@#%^)(*\s]*(كول|kol)/i.test(t)) return t.trim(); return t.replace(/[-_&@#%^)(*\s]*(كول|kol)\b.*$/i, '').replace(/[-–_&@#%^)(*+،؛:]+/g, ' ').replace(/\s+/g, ' ').trim() || t.trim(); };
    const cardsOld = d => X.uniqBy(selA(d, 'div.listupd article, .listupd .bs .bsx').map(el => {
      const a = sel1(el, 'h2 a, a.tip, a[href]'); if (!a) return null;
      const t = clean(X.t(sel1(el, 'h2 a')) || a.getAttribute('title') || X.t(el.querySelector('.tt')));
      return t ? { url: X.abs(a.getAttribute('href'), d.__url), title: t.slice(0, 150), cover: X.img(el.querySelector('img'), d.__url), latest: X.t(el.querySelector('.epxs')) } : null;
    }).filter(Boolean), 'url');
    // الواجهة الجديدة: بطاقة = رابط /series/<slug>/ (عنوان h2/h3 + غلاف) بلا أصناف ثابتة، فنجمع حسب الرابط
    const cardsNew = d => {
      const map = new Map(), origin = (() => { try { return new URL(d.__url).origin; } catch (e) { return ''; } })();
      selA(d, 'a[href*="/series/"]').forEach(a => {
        if (a.closest('header, footer, nav')) return;
        const h = X.abs(a.getAttribute('href'), d.__url); if (!h) return;
        let u; try { u = new URL(h); } catch (e) { return; }
        const sg = u.pathname.split('/').filter(Boolean); if (u.origin !== origin || sg.length !== 2 || sg[0] !== 'series') return;
        const k = u.origin + u.pathname, it = map.get(k) || { url: k, title: '', cover: '', latest: '' };
        const head = sel1(a, 'h1,h2,h3,h4') || (a.parentElement && /^H[1-4]$/.test(a.parentElement.tagName) ? a.parentElement : null);
        const t = X.t(head || a);
        if (head && t && !it.title) it.title = t; else if (!it.title && t && !sel1(a, 'img') && t.length > 1 && t.length < 90) it.titleAlt = it.titleAlt || t;
        const im = sel1(a, 'img'); if (im && !it.cover) it.cover = X.img(im, d.__url);
        map.set(k, it);
      });
      return Array.from(map.values()).map(it => { it.title = clean(it.title || it.titleAlt || '').slice(0, 150); delete it.titleAlt; return it; }).filter(it => it.title);
    };
    const cards = d => { let r = cardsOld(d); const via = r.length ? 'old' : 'new'; if (!r.length) r = cardsNew(d); logKol('بطاقات القائمة', { n: r.length, via }); return r; };

    // ---------- فصول الواجهة الجديدة: /series/x/?chapter_volume=__kol_all__&chapter_order=oldest&chapter_page=N ----------
    // الصفحة تُرسَل مبنيّة من الخادم (48 فصلًا أو أقل في الصفحة) وزر «عرض المزيد» رابط إلى chapter_page=N+1.
    const AR = s => String(s || '').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
    const toN = s => { const m = AR(s).replace(/[,٬\s]/g, '').match(/\d+/); return m ? parseInt(m[0], 10) : null; };
    const isChUrl = (h, origin) => { try { const u = new URL(h); if (u.origin !== origin) return false; const p = u.pathname.split('/').filter(Boolean); return p.length === 1 && /-\d+$/.test(p[0]) && !/^(series|genre|genres|tag|page|author|wp-|category)/i.test(p[0]); } catch (e) { return false; } };
    const baseOf = url => String(url).split('#')[0].split('?')[0];
    const pageUrl = (url, n, vol) => baseOf(url) + '?chapter_volume=' + encodeURIComponent(vol || '__kol_all__') + '&chapter_search&chapter_order=oldest&chapter_page=' + n;
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const leafTexts = el => selA(el, '*').filter(e => !e.children.length).map(e => X.t(e)).filter(Boolean);
    function chapterLinks(root, origin) { return selA(root, 'a[href]').filter(a => isChUrl(X.abs(a.getAttribute('href'), root.ownerDocument.__url || origin), origin)); }
    function chaptersRoot(d, origin) {
      const body = d.body || d.documentElement;
      let el = sel1(d, '#chapters');
      while (el && el !== body && !chapterLinks(el, origin).length) el = el.parentElement;
      return el || body;
    }
    function parsePage(d, url, n) {
      const origin = new URL(url).origin, root = chaptersRoot(d, origin), docUrl = d.__url || url;
      // أزرار «الفصل الأول» و«آخر فصل» ليست عناصر قائمة: نستثنيها حتى لا تحلّ محلّ عنوان الفصل الحقيقي
      const links = chapterLinks(root, origin).filter(a => !a.closest('header, footer, nav, aside') && !/^\s*(الفصل\s*الأول|الفصل\s*الاول|آخر\s*فصل|اخر\s*فصل)/.test(X.t(a)));
      const items = [];
      links.forEach(a => {
        const href = X.abs(a.getAttribute('href'), docUrl); if (!href) return;
        let card = a;
        for (let i = 0; i < 4 && leafTexts(card).length < 2 && card.parentElement && card.parentElement !== root; i++) {
          const p = card.parentElement, hs = new Set(chapterLinks(p, origin).map(x => X.abs(x.getAttribute('href'), docUrl)));
          if (hs.size > 1) break; card = p;
        }
        let tx = leafTexts(card);
        if (tx.length < 2) tx = [X.t(card)];
        let num = null, date = '', views = '', rest = [], odd = false;
        tx.forEach(t => {
          // «فصل 23» رقم عادي؛ أما «فصل 1INFO1» أو نص بلا «فصل N» فعنصر خاص (معلومات، مستويات التدريب…) وليس فصلًا مرقّمًا
          const mn = t.match(/^فصل\s*([\d٠-٩]+(?:\.\d+)?)(?:\s+(.*))?$/), mo = t.match(/^فصل\s*\S*[\d٠-٩]\S*[A-Za-z\u0600-\u06FF]/), md = t.match(/\d{1,2}\/\d{1,2}\/\d{4}/);
          if (mn && num == null) { num = parseFloat(AR(mn[1])); if (mn[2]) rest.push(mn[2]); }
          else if (mo) { odd = true; rest.push(t.replace(/^فصل\s*[\d٠-٩]*/, '').trim() || t); }
          else if (/^\s*المشاهد/.test(t)) views = t;
          else if (md && t.length <= 14) date = md[0];
          else rest.push(t);
        });
        rest = rest.map(t => t.replace(/\s*المشاهدات?\s*[\d,٬.]*.*$/, '').replace(/\s*\d{1,2}\/\d{1,2}\/\d{4}\s*$/, '').trim()).filter(t => t && t !== 'الفصول');
        const title = rest[0] || '', arc = /^[\d٠-٩٬,.\s]+$/.test(rest[1] || '') ? '' : (rest[1] || ''); // رقم مجرّد = عدّاد مشاهدات لا اسم مجلد
        const sp = num == null || odd;
        if (sp) num = null;
        items.push({ url: href.split('#')[0], title: (sp ? ((!title || /^(فصل\s*)?[-—–\s]*$|^INFO\d*$/i.test(title)) && arc ? arc : (title || X.t(a))) : ((num != null ? 'فصل ' + num : '') + (title ? ' - ' + title : ''))).slice(0, 150), num, date, arc, sp: sp ? 1 : 0, o: (n || 1) * 1000 + items.length });
      });
      const nextAnchor = selA(d, 'a[href*="chapter_page="]').find(a => { const m = String(a.getAttribute('href')).match(/chapter_page=(\d+)/); return m && parseInt(m[1], 10) === n + 1; });
      const bt = AR(X.t(d.body || d.documentElement)), mt = bt.match(/عرض\s*([\d,٬]+)\s*من\s*([\d,٬]+)/);
      let total = mt ? toN(mt[2]) : null;
      if (total == null) { const h = bt.match(/الفصول\s*([\d,٬]{2,})/); total = h ? toN(h[1]) : null; }
      return { items: X.uniqBy(items, 'url'), hasNext: !!nextAnchor, total };
    }
    // غلاف الرواية: الصفحة تحوي الشعار مكررًا (رأس وقائمة وتذييل) وهو نفسه og:image، أما الغلاف فصورة وحيدة نصّها البديل (alt) عنوان الرواية
    const isLogo = u => !u || /logo|icon|favicon|avatar|placeholder|default|sprite/i.test(u);
    function pickCover(d, url, meta) {
      const og = meta('og:image');
      const imgs = selA(d, 'img').map(im => ({ u: X.img(im, url), alt: X.normAr(im.getAttribute('alt') || '') })).filter(x => x.u);
      const cnt = {}; imgs.forEach(x => { cnt[x.u] = (cnt[x.u] || 0) + 1; });
      const ok = x => !isLogo(x.u) && cnt[x.u] === 1 && x.u !== og && /\/wp-content\/uploads\//.test(x.u);
      const title = X.normAr(clean(X.t(d.querySelector('h1')) || meta('og:title')));
      const byAlt = title && imgs.find(x => ok(x) && x.alt && (x.alt === title || x.alt.indexOf(title) >= 0 || title.indexOf(x.alt) >= 0));
      if (byAlt) return byAlt.u;
      const old = X.img(sel1(d, 'img.attachment-post-thumbnail, div.sertothumb img'), url);
      if (old && ok({ u: old })) return old;
      const first = imgs.find(ok); return first ? first.u : '';
    }
    const logKol = (m, o) => { try { global.NovelLog && global.NovelLog.add('kol', m, o); } catch (e) { } };
    const searchQ = {};
    return Object.assign(base, {
      async list(a) {
        if (a.q) {
          const q0 = a.q.trim(), pg = a.page || 1;
          // بحث ووردبريس لا يوحّد الهمزات: «اشورا» ≠ «أشورا». نجرّب الأصل ثم صيغًا بديلة ونتذكّر الصيغة الناجحة للصفحات التالية
          const variants = [q0];
          const addV = v => { if (v && variants.indexOf(v) < 0) variants.push(v); };
          addV(q0.replace(/(^|\s)ا/g, '$1أ')); addV(q0.replace(/(^|\s)ا/g, '$1إ')); addV(q0.replace(/(^|\s)ا/g, '$1آ')); addV(q0.replace(/ه(?=\s|$)/g, 'ة')); addV(q0.replace(/ى/g, 'ي'));
          if (pg > 1) {
            const v = searchQ[q0]; if (!v) return { items: [], hasNext: false };
            try { const its = cards(await X.html(H + '/page/' + pg + '/?s=' + encodeURIComponent(v))); return { items: its, hasNext: its.length >= 20 }; } catch (e) { return { items: [], hasNext: false }; }
          }
          let items = [], via = '', clean200 = false;
          const stat = {};
          for (let i = 0; i < variants.length && !items.length && i < 4; i++) {
            try { items = cards(await X.html(H + '/?s=' + encodeURIComponent(variants[i]))); clean200 = true; if (items.length) { via = i ? 's=~' + i : 's='; searchQ[q0] = variants[i]; } }
            catch (e) { stat.s = String(e && e.message || e).slice(0, 80); break; }
          }
          if (!items.length) {
            try {
              const j = await X.json(H + '/wp-json/app/v2/discover?q=' + encodeURIComponent(q0));
              items = ((j && j.data) || []).map(t => ({ url: t.url, title: clean(t.title), cover: t.cover_url || '', latest: '' })).filter(x => x.url && x.title);
              if (items.length) via = 'app/v2'; else stat.v2 = 'فارغ';
            } catch (e) { stat.v2 = String(e && e.message || e).slice(0, 80); }
          }
          // الصفحة سليمة ولا نتائج = لا نتائج فعلًا: لا نُغرق الموقع بتخمينات؛ التخمين فقط إن فشل البحث نفسه
          if (!items.length && !clean200) {
            try {
              const r = await X.postForm(H + '/wp-admin/admin-ajax.php', 'action=ts_ac_do_search&ts_ac_query=' + encodeURIComponent(q0).replace(/%20/g, '+'));
              const j = JSON.parse(r.text);
              items = ((j.series && j.series[0] && j.series[0].all) || []).map(e => ({ url: e.post_link, title: clean(e.post_title), cover: e.post_image || '', latest: '' })).filter(x => x.url && x.title);
              if (items.length) via = 'ajax';
            } catch (e) { stat.ajax = String(e && e.message || e).slice(0, 80); }
            if (!items.length) { items = await X.siteSearch(S, q0).catch(() => []); if (items.length) via = 'siteSearch'; }
          }
          logKol('بحث', { q: q0, n: items.length, via: via || '-', fail: JSON.stringify(stat) });
          return { items, hasNext: via.indexOf('s=') === 0 && items.length >= 20 };
        }
        const f = Object.assign({}, a.f || {});
        if (!f.order) f.order = a.listing === 'popular' ? 'popular' : 'update';
        const d = await X.html(H + '/series/?' + X.qs(Object.assign(a.page > 1 ? { paged: a.page } : {}, f)));
        const items = cards(d);
        const pn = (a.page || 1) + 1, nx = sel1(d, 'div.hpage a.r, div.pagination .next, a.next.page-numbers, a[rel=next]') || selA(d, 'a[href]').find(x => { const hh = x.getAttribute('href') || ''; return hh.indexOf('paged=' + pn) >= 0 || hh.indexOf('/page/' + pn) >= 0; });
        return { items, hasNext: !!nx || items.length >= 20 };
      },
      async manga(url) {
        let d, pg;
        try { d = await X.html(pageUrl(url, 1)); pg = parsePage(d, url, 1); } catch (e) { logKol('صفحة الفصول 1 فشلت', { err: String(e && e.message || e) }); pg = null; }
        if (!pg || !pg.items.length) { logKol('الواجهة الجديدة لم تُرجع فصولًا — الطريقة القديمة', { ok: !!pg }); return this.legacyManga(url); }
        const info = sel1(d, 'div.sertoinfo') || d;
        const meta = p => { const e = sel1(d, 'meta[property="' + p + '"],meta[name="' + p + '"]'); return e ? (e.getAttribute('content') || '').trim() : ''; };
        const body = X.t(d.body || d.documentElement);
        const st = (body.match(/الحالة\s*(مستمرة|مستمر|مكتملة|مكتمل|متوقفة|متوقف|ملغاة|ملغى)/) || [])[1] || '';
        const genres = X.uniqBy(selA(d, 'a[href*="/genre/"], a[href*="/genres/"]').filter(a => !a.closest('header, footer, nav')).map(a => ({ url: a.getAttribute('href'), t: X.t(a) })).filter(x => x.t && x.t.length < 40), 't').map(x => x.t);
        // الفصل الأول الحقيقي: أول عنصر مرقّم (زر «الفصل الأول» في الموقع قد يشير إلى صفحة INFO)
        const first = (pg.items.find(c => !c.sp) || {}).url || (() => { const a = X.byText(d, 'a[href]', ['الفصل الأول']).map(x => X.abs(x.getAttribute('href'), url)).find(h => h && isChUrl(h, new URL(url).origin)); return a ? a.split('#')[0] : ''; })();
        const total = pg.total, firstItems = pg.items;
        // واجهة app/v2 (100 فصل بالطلب): نجلب أول دفعة هنا، ويستعملها more() إن طابقت صفحة الفصول الأولى
        let tid = ''; try { tid = (sel1(d, '[data-kol-series-id]') || { getAttribute: () => '' }).getAttribute('data-kol-series-id') || ((sel1(d, 'article[id^="post-"]') || { id: '' }).id || '').replace('post-', ''); } catch (e) { }
        const apiList = cur => X.json(H + '/wp-json/app/v2/titles/' + tid + '/reading-list' + (cur ? '?cursor=' + cur : ''));
        const apiFirst = !tid ? Promise.resolve(null) : (async () => {
          try {
            const t0 = Date.now(), j = await apiList('');
            const it = (j && j.data && j.data[0]) || {};
            logKol('app/v2 reading-list', { ms: Date.now() - t0, n: ((j && j.data) || []).length, total: j && j.meta && j.meta.total, keys: Object.keys(it).join(','), sample: JSON.stringify(it).slice(0, 300), page1: (firstItems[0] || {}).url });
            return j;
          } catch (e) { logKol('app/v2 فشل', { e: String(e && e.message || e).slice(0, 80) }); return null; }
        })();
        let cancelled = false;
        logKol('فصول ' + baseOf(url).split('/').filter(Boolean).pop(), { page1: firstItems.length, total, next: pg.hasNext, start: first, sample: JSON.stringify(firstItems.slice(0, 4).map(c => [c.title, c.num, c.sp, c.arc])).slice(0, 400) });
        const res = {
          url, start: first, total, cancel() { cancelled = true; },
          title: clean(X.t(sel1(info, 'h1.entry-title')) || X.t(d.querySelector('h1'))) || clean(meta('og:title')),
          cover: pickCover(d, url, meta),
          summary: (selA(info, 'div.sersys.entry-content p, .entry-content[itemprop=description] p, [itemprop=description] p').map(X.t).join('\n') || meta('og:description') || meta('description')).slice(0, 2000),
          genres, status: st ? X.status(st) || st : X.t(sel1(info, 'div.sertostat span')), chapters: firstItems,
        };
        // باقي الصفحات في الخلفية: onBatch(items, {got,total}) ثم يُرجع {got,total,failed}
        res.more = async function (o) {
          o = o || {};
          // have: روابط الفصول المحفوظة سابقًا؛ start: الصفحة التي نُكمل منها (آخر صفحة اكتملت)
          const have = new Set(firstItems.map(c => c.url)); (o.have || []).forEach(u => have.add(u));
          let got = have.size;
          if (total && got >= total) { logKol('الفصول مكتملة محليًا', { have: got, total }); return { got, total, failed: [], skipped: true, contig: o.start || 1 }; }
          const failed = [], arcs = {}; firstItems.forEach(c => { if (c.arc) arcs[c.arc] = (arcs[c.arc] || 0) + 1; });
          const fetchPage = async n => {
            for (let t = 0; t < 3; t++) {
              if (cancelled) return null;
              try { const dd = await X.html(pageUrl(url, n)); return parsePage(dd, url, n); } catch (e) { await sleep(700 * (t + 1)); }
            }
            return null;
          };
          const take = (pp, n) => {
            const fresh = pp.items.filter(c => !have.has(c.url)); fresh.forEach(c => { have.add(c.url); if (c.arc) arcs[c.arc] = (arcs[c.arc] || 0) + 1; });
            got = have.size; return fresh;
          };
          // الطريقة السريعة: reading-list بدفعات 100 بالتوازي (cursor = موضع العنصر). تُعتمد فقط إن طابقت معرّفات الصفحة الأولى؛ وإلا نرجع لصفحات HTML.
          const viaApi = async () => {
            const j1 = await apiFirst; if (!j1 || !Array.isArray(j1.data) || !j1.data.length) return null;
            const total0 = Number(j1.meta && j1.meta.total), step = j1.data.length, ps = firstItems.length;
            const pm = ((firstItems[0] || {}).url || '').match(/^(.*-)(\d+)\/?$/);
            if (!pm || !(total0 > 0) || ps < 2) return null;
            for (let i = 0; i < ps; i++) { const m = (firstItems[i].url || '').match(/-(\d+)\/?$/); if (!m || !j1.data[i] || String(j1.data[i].id) !== m[1]) return null; }
            const mk = (c, p) => {
              const ns = AR(String(c.number == null ? '' : c.number).trim()), sp = !/^\d+(\.\d+)?$/.test(ns), num = sp ? null : parseFloat(ns);
              const tt = clean(c.title || ''), pa = String(c.published_at || '');
              return { url: pm[1] + c.id + '/', title: (sp ? (tt || ('فصل ' + ns)) : ('فصل ' + num + (tt ? ' - ' + tt : ''))).slice(0, 150), num, date: pa.length >= 10 ? pa.slice(8, 10) + '/' + pa.slice(5, 7) + '/' + pa.slice(0, 4) : '', arc: clean(c.volume || ''), sp: sp ? 1 : 0, o: (Math.floor(p / ps) + 1) * 1000 + (p % ps) };
            };
            const t0 = Date.now(), emit = (arr, base) => { const fresh = arr.map((c, i) => mk(c, base + i)).filter(c => !have.has(c.url)); fresh.forEach(c => { have.add(c.url); if (c.arc) arcs[c.arc] = (arcs[c.arc] || 0) + 1; }); got = have.size; return fresh; };
            const pgOf = p => Math.floor(p / ps) + 1;
            let fr = emit(j1.data, 0); if (o.onBatch && fr.length) { try { o.onBatch(fr, { got, total: total0, page: pgOf(step - 1), contig: pgOf(step - 1) }); } catch (e) { } }
            const offs = []; for (let c = step; c < total0; c += step) offs.push(c);
            for (let i = 0; i < offs.length; i += 4) {
              if (cancelled) return { got, total: total0, failed: [], cancelled: true, contig: 1, reason: 'cancelled' };
              const grp = offs.slice(i, i + 4);
              const rs = await Promise.all(grp.map(async c => { for (let t = 0; t < 3; t++) { try { const jj = await apiList(c); if (jj && Array.isArray(jj.data)) return jj.data; } catch (e) { } await sleep(500 * (t + 1)); } return null; }));
              for (let k = 0; k < rs.length; k++) {
                if (!rs[k]) throw new Error('reading-list cursor ' + grp[k]);
                fr = emit(rs[k], grp[k]); const last = grp[k] + rs[k].length - 1;
                if (o.onBatch && fr.length) { try { o.onBatch(fr, { got, total: total0, page: pgOf(last), contig: pgOf(last) }); } catch (e) { } }
              }
            }
            const contig = pgOf(Math.max(0, total0 - 1));
            logKol('انتهى جلب الفصول', { reason: 'api', got, total: total0, failed: '', sec: Math.round((Date.now() - t0) / 1000), arcs: JSON.stringify(arcs).slice(0, 300), match: got === total0 });
            return { got, total: total0, failed: [], cancelled: false, contig, reason: 'api' };
          };
          try { const ra = await viaApi(); if (ra) return ra; } catch (e) { logKol('app/v2 جلب فشل — صفحات HTML', { e: String(e && e.message || e).slice(0, 80) }); }
          const pre = new Map();
          let n = Math.max(2, o.start || 2), fails = 0, stale = 0, contig = n - 1, hasNext = true;
          const t0 = Date.now(); let reason = 'done';
          while (hasNext && n <= 800) {
            if (cancelled) { reason = 'cancelled'; break; }
            // جلب مسبق لصفحتين تاليتين بالتوازي (حتى عدد الصفحات المتوقع) — يقلّص الزمن بلا تغيير الترتيب
            const lastPg = total && firstItems.length ? Math.ceil(total / firstItems.length) + 1 : n;
            for (let k = 0; k < 3; k++) if (n + k <= lastPg && !pre.has(n + k)) pre.set(n + k, fetchPage(n + k));
            if (!pre.has(n)) pre.set(n, fetchPage(n));
            await sleep(100);
            const pp = await pre.get(n); pre.delete(n);
            if (!pp) { if (cancelled) { reason = 'cancelled'; break; } failed.push(n); if (++fails >= 3) { reason = 'failures'; break; } n++; continue; }
            fails = 0;
            const fresh = take(pp, n);
            if (!failed.length && n === contig + 1) contig = n;
            if (o.onBatch) { try { o.onBatch(fresh, { got, total, page: n, contig }); } catch (e) { } }
            stale = fresh.length ? 0 : stale + 1;
            const more = pp.hasNext || (total ? got < total : pp.items.length >= 20);
            hasNext = more && stale < 3 && pp.items.length > 0;
            n++;
          }
          // إعادة محاولة الصفحات الفاشلة مرة واحدة
          for (const fp of failed.slice()) {
            if (cancelled) break; await sleep(800);
            const pp = await fetchPage(fp);
            if (pp) { const fresh = take(pp, fp); failed.splice(failed.indexOf(fp), 1); if (o.onBatch) { try { o.onBatch(fresh, { got, total, page: fp, contig }); } catch (e) { } } }
          }
          if (!failed.length && !cancelled) contig = Math.max(contig, n - 1);
          logKol('انتهى جلب الفصول', { reason, got, total, failed: failed.join(','), from: Math.max(2, o.start || 2), to: n - 1, sec: Math.round((Date.now() - t0) / 1000), arcs: JSON.stringify(arcs).slice(0, 500), match: total ? got === total : null });
          return { got, total, failed, cancelled, contig, reason };
        };
        return res;
      },
      async legacyManga(url) {
        const d = await X.html(url);
        const info = sel1(d, 'div.sertoinfo') || d;
        const parseCh = (d, url) => selA(d, '#chapter_list li[data-id] a, div.sertobody div.bixbox ul li > a, .eplister li > a, li[data-id] > a').map(a => {
          const num = X.t(sel1(a, '.epl-num')), tt = X.t(sel1(a, '.epl-title'));
          let raw = X.t(a), dm = raw.match(/\d{1,2}\/\d{1,2}\/\d{4}/);
          // الواجهة الجديدة: النص يضم «الفصول» و«المشاهدات N» والتاريخ: نقتصر على «فصل N العنوان»
          raw = raw.replace(/\s*(الفصول\s*)?المشاهدات?\s*[\d,٬.]*.*$/, '').replace(/\s*الفصول\s*$/, '').replace(/\s*\d{1,2}\/\d{1,2}\/\d{4}\s*$/, '').trim();
          const title = [num, tt].filter(Boolean).join(' - ') || raw;
          const n = X.num(num) != null ? X.num(num) : X.num(title);
          return { url: X.abs(a.getAttribute('href'), url), title: title.slice(0, 150), num: n, date: X.t(sel1(a, '.epl-date')) || (dm ? dm[0] : '') };
        }).filter(c => c.url);
        let all = parseCh(d, url);
        // قد تُقسَّم الفصول على صفحات (ترقيم) أو تُحمَّل عند الطلب: نتتبّع روابط الصفحات الفرعية إن وُجدت
        const pgs = X.uniqBy(selA(d, '.sertobody .pagination a, .eplister ~ .pagination a, .chapter-pagination a, .page-numbers a, a.page-numbers').map(a => X.abs(a.getAttribute('href'), url)).filter(h => h && h !== url && !/#$/.test(h) && h.split('#')[0] !== url), 'url').slice(0, 80);
        let pgOk = 0;
        for (const h of pgs) {
          try { const dd = await X.html(h); const more = parseCh(dd, h); if (more.length) { all = all.concat(more); pgOk++; } } catch (e) { }
        }
        try { global.NovelLog && global.NovelLog.add('kol', 'فصول ' + url.split('/').filter(Boolean).pop(), { n: all.length, pages: pgs.length, ok: pgOk, ul: selA(d, '.eplister').length, li: selA(d, 'li').length, more: selA(d, '[class*=load],[class*=more],[data-page],[data-max]').length, len: (d.documentElement.outerHTML || '').length }); } catch (e) { }
        let start = X.findStart(d, url);
        if (!start) {
          // كما في epub: ترتيب الفصول من الأقدم (chapter_order=oldest) ثم أول رابط فصل
          try { const d2 = await X.html(url.split('#')[0] + (url.includes('?') ? '&' : '?') + 'chapter_order=oldest'); const f = parseCh(d2, url)[0]; if (f) start = f.url; } catch (e) { }
        }
        try { global.NovelLog && global.NovelLog.add('kol', 'بداية الفصول', { start: start || '-' }); } catch (e) { }
        const chapters = X.uniqBy(all, 'url');
        return {
          url, start, title: clean(X.t(sel1(info, 'h1.entry-title')) || X.t(d.querySelector('h1'))),
          cover: X.img(sel1(d, 'img.attachment-post-thumbnail, div.sertothumb img, .thumb img'), url) || X.findCover(d, url, ''),
          summary: selA(info, 'div.sersys.entry-content p, .entry-content[itemprop=description] p').map(X.t).join('\n').slice(0, 2000),
          genres: selA(info, 'div.sertogenre a, .genxed a').map(X.t).filter(Boolean),
          status: X.t(sel1(info, 'div.sertostat span')), chapters,
        };
      },
      async chapter(url) {
        // كما في epub: صفحة الفصل أولًا (النص + «التالي/السابق»)؛ واجهة wp-json احتياط فقط (قد تكون مغلقة في الموقع)
        let pg = null;
        const r = await X.req(url, { html: true }).catch(e => { if (!/-\d+\/?$/.test(url)) throw e; return null; });
        if (r && r.status === 404) throw httpErr(r, url);
        if (r && r.status < 400) pg = textChapter(X.parse(r.text, url), url);
        if (pg && pg.paras.length >= 3) return pg;
        const m = String(url).split('#')[0].split('?')[0].match(/-(\d+)\/?$/);
        if (m) {
          try {
            const rj = await X.json(H + '/wp-json/app/v2/reader/' + m[1]);
            const html = rj && rj.data && rj.data.entry && rj.data.entry.content;
            if (rj && rj.data && rj.data.access && rj.data.access.has_access === false) throw new Error('الفصل مقفل في الموقع');
            if (html) {
              const ex2 = global.NovelFetch.extractText(X.parse('<html><body><article>' + html + '</article></body></html>', url));
              if (ex2.paras.length >= 3) return { paras: ex2.paras, title: clean(String(rj.data.entry.title || '').replace(/<[^>]+>/g, '')) || (pg && pg.title) || '', next: pg && pg.next, prev: pg && pg.prev };
            }
          } catch (e) { if (/مقفل/.test(String(e && e.message))) throw e; }
          try {
            const j = await X.json(H + '/wp-json/wp/v2/posts/' + m[1]);
            const doc = X.parse('<html><body><article>' + ((j && j.content && j.content.rendered) || '') + '</article></body></html>', url);
            const ex = global.NovelFetch.extractText(doc);
            if (ex.paras.length >= 3) return { paras: ex.paras, title: clean(String((j.title && j.title.rendered) || '').replace(/<[^>]+>/g, '')) || (pg && pg.title) || '', next: pg && pg.next, prev: pg && pg.prev };
          } catch (e) { }
        }
        if (pg) return pg;
        if (r) throw httpErr(r, url);
        throw new Error('تعذّر جلب الفصل');
      },
    });
  }
  return kolnovel;
});
