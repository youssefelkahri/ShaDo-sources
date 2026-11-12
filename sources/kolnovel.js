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
        const title = rest[0] || '', arc = rest[1] || '';
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
    return Object.assign(base, {
      async list(a) {
        if (a.q) {
          if (a.page > 1) return { items: [], hasNext: false };
          let items = [];
          try {
            const r = await X.postForm(H + '/wp-admin/admin-ajax.php', 'action=ts_ac_do_search&ts_ac_query=' + encodeURIComponent(a.q.trim()).replace(/%20/g, '+'));
            const j = JSON.parse(r.text);
            items = ((j.series && j.series[0] && j.series[0].all) || []).map(e => ({ url: e.post_link, title: clean(e.post_title), cover: e.post_image || '', latest: '' })).filter(x => x.url && x.title);
          } catch (e) { }
          if (!items.length) { try { items = cards(await X.html(H + '/?s=' + encodeURIComponent(a.q))); } catch (e) { } }
          if (!items.length) {
            try {
              const j = await X.json(H + '/wp-json/app/v2/discover?q=' + encodeURIComponent(a.q.trim()));
              items = ((j && j.data) || []).map(t => ({ url: t.url, title: clean(t.title), cover: t.cover_url || '', latest: '' })).filter(x => x.url && x.title);
            } catch (e) { }
          }
          if (!items.length) items = await X.siteSearch(S, a.q).catch(() => []);
          return { items, hasNext: false };
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
          let n = Math.max(2, o.start || 2), fails = 0, stale = 0, contig = n - 1, hasNext = true;
          const t0 = Date.now(); let reason = 'done';
          while (hasNext && n <= 800) {
            if (cancelled) { reason = 'cancelled'; break; }
            await sleep(350);
            const pp = await fetchPage(n);
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
