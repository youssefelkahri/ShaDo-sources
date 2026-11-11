'use strict';
/* sources/riwayatarab.js — روايات عرب. ملف خاص بهذا المصدر وحده.
 * الفصول (من الأسرع): 1) /novel/<slug>/chapters?page=N (50 فصلًا بالصفحة، تصاعدي) تُجلب الصفحات في الخلفية
 *                      2) قائمة صفحة العمل (أول 20 فصلًا) إن تعذّرت صفحة الفصول
 *                      3) القالب العام (المتصفح الخفي) إن تعذّر كل شيء
 * رقم الفصل في الرابط عدد عادي: /novel/<slug>/chapter/<n>. القوائم والبحث من القالب العام. */
NovelKit.add('riwayatarab', K => {
  const global = window;
  const { X, sel1, selA, httpErr, textChapter } = K;
  const log = (m, o) => { try { global.NovelLog && global.NovelLog.add('ra', m, o); } catch (e) { } };
  const AR = s => String(s || '').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const PER = 50;
  const BANNER = /حقوق\s*\$+.*\$+|عالم الروايات.*افخم|^\s*الفصل\s*\d+\s*من\s*\d+\s*$|عرض قائمة الفصول الكاملة/;

  function riwayatarab(S) {
    const base = K.TPL.generic(S, { novelPath: 'novel', pageParam: S.pageParam, search: S.search });
    const origin = new URL(S.home).origin;
    const segs = u => { try { return new URL(u).pathname.split('/').filter(Boolean); } catch (e) { return []; } };
    const slugOf = u => { const s = segs(u); return s[0] === 'novel' ? s[1] : null; };
    const chNum = h => { const s = segs(h); return s[0] === 'novel' && s[2] === 'chapter' && s.length === 4 && /^\d+$/.test(s[3]) ? +s[3] : null; };
    const chapUrl = (slug, n) => origin + '/novel/' + slug + '/chapter/' + n;
    const leafTexts = el => selA(el, '*').filter(e => !e.children.length).map(e => X.t(e)).filter(Boolean);

    // صفحة فهرس الفصول أو قائمة العمل -> فصول
    function rowsOf(d, slug) {
      const out = {};
      selA(d, 'a[href]').forEach(a => {
        const h = X.abs(a.getAttribute('href'), d.__url); if (!h || slugOf(h) !== slug) return;
        const n = chNum(h); if (n == null || out[n]) return;
        const t = leafTexts(a).find(x => /[^\d\s.,٠-٩]/.test(x) && x.length < 150) || '';
        out[n] = { url: chapUrl(slug, n), title: t || ('الفصل ' + n), num: n, date: '', o: n, sp: 0 };
      });
      return Object.keys(out).map(Number).sort((a, b) => a - b).map(k => out[k]);
    }
    const totalOf = d => { const b = AR(X.t(d.body || d.documentElement)); const m = b.match(/(\d[\d,]*)\s*فصل(?:\s*·|\s*متاح|\s*مترجم)/) || b.match(/(\d[\d,]*)\s*فصل/); return m ? +m[1].replace(/,/g, '') : 0; };
    const listUrl = (url, n) => url.split('#')[0].split('?')[0].replace(/\/+$/, '') + '/chapters' + (n > 1 ? '?page=' + n : '');

    base.manga = async function (url) {
      const slug = slugOf(url);
      const r = await X.req(url, { html: true });
      if (r.status >= 400) throw httpErr(r, url);
      const d = X.parse(r.text, r.url || url), body = X.t(d.body || d.documentElement);
      const meta = n => ((sel1(d, 'meta[property="' + n + '"],meta[name="' + n + '"]') || {}).content || '').replace(/\s+/g, ' ').trim();
      let title = X.t(sel1(d, 'h1')); if (!title) title = meta('og:title').split(/\s+[-|–—]\s+/)[0];
      let total = totalOf(d);
      const st = (body.match(/(متوقفة?|مكتملة?|مستمرة?|ملغاة?)/) || [])[1] || '';
      // الطريقة 1: صفحة الفصول رقم 1
      let first = [], pages = 0, via = 'chapters';
      try {
        const cd = await X.html(listUrl(url, 1));
        first = rowsOf(cd, slug);
        const t2 = totalOf(cd); if (t2) total = Math.max(total, t2);
        const pm = AR(X.t(cd.body || cd.documentElement)).match(/الصفحة\s*\d+\s*من\s*(\d+)/);
        pages = pm ? +pm[1] : (total ? Math.ceil(total / PER) : 1);
      } catch (e) { log('صفحة الفصول 1 فشلت', { err: String(e && e.message || e) }); }
      // الطريقة 2: قائمة صفحة العمل
      if (!first.length) { via = 'work'; first = rowsOf(d, slug); pages = 1; }
      log('عمل ' + slug, { via, rows: first.length, total, pages });
      // الطريقة 3: القالب العام (المتصفح الخفي عند الحاجة)
      if (!first.length) { log('لا فصول — القالب العام'); return base.__generic ? base.__generic(url) : Promise.reject(new Error('لم يُعثر على فصول')); }
      const cimg = selA(d, 'img').find(i => !i.closest('header, footer, nav') && /cover/i.test((i.getAttribute('src') || '') + (i.getAttribute('data-src') || '')))
        || selA(d, 'img').find(i => !i.closest('header, footer, nav') && title && (i.getAttribute('alt') || '').indexOf(title.slice(0, 10)) >= 0);
      const res = {
        url, start: first[0] ? first[0].url : '', total: total || 0, cancel() { res._c = true; },
        title: title.slice(0, 200),
        cover: X.img(cimg, url) || meta('og:image') && !/logo/i.test(meta('og:image')) && X.abs(meta('og:image'), url) || '',
        summary: meta('og:description') || meta('description'),
        genres: X.uniqBy(selA(d, 'a[href*="genre"], a[href*="category"]').filter(a => !a.closest('header, footer, nav')).map(a => ({ t: X.t(a) })).filter(x => x.t && x.t.length < 30), 't').map(x => x.t),
        status: X.status(st) || st, chapters: first,
      };
      if (via !== 'chapters' || pages <= 1 || (total && first.length >= total)) return res;
      res.more = async function (o) {
        o = o || {};
        const have = new Set(first.map(c => c.url)); (o.have || []).forEach(u => have.add(u));
        let got = have.size;
        if (total && got >= total) { log('الفصول مكتملة محليًا', { have: got, total }); return { got, total, failed: [], skipped: true, contig: o.start || 1 }; }
        const failed = []; let fails = 0, n = Math.max(2, o.start || 2), contig = n - 1, reason = 'done'; const t0 = Date.now();
        const fetchPage = async p => {
          for (let t = 0; t < 3; t++) {
            if (res._c) return null;
            try { return rowsOf(await X.html(listUrl(url, p)), slug); } catch (e) { await sleep(700 * (t + 1)); }
          }
          return null;
        };
        const take = rows => { const f = rows.filter(c => !have.has(c.url)); f.forEach(c => have.add(c.url)); got = have.size; return f; };
        for (; n <= pages; n++) {
          if (res._c) { reason = 'cancelled'; break; }
          await sleep(300);
          const rows = await fetchPage(n);
          if (!rows) { if (res._c) { reason = 'cancelled'; break; } failed.push(n); if (++fails >= 3) { reason = 'failures'; break; } continue; }
          fails = 0;
          const f = take(rows);
          if (!failed.length && n === contig + 1) contig = n;
          if (o.onBatch) { try { o.onBatch(f, { got, total, page: n, contig }); } catch (e) { } }
        }
        for (const fp of failed.slice()) {
          if (res._c) break; await sleep(800);
          const rows = await fetchPage(fp);
          if (rows) { const f = take(rows); failed.splice(failed.indexOf(fp), 1); if (o.onBatch) { try { o.onBatch(f, { got, total, page: fp, contig }); } catch (e) { } } }
        }
        log('انتهى جلب الفصول', { reason, got, total, pages, failed: failed.join(','), sec: Math.round((Date.now() - t0) / 1000), match: total ? got >= total : null });
        return { got, total, failed, cancelled: !!res._c, contig, reason };
      };
      return res;
    };
    const generic = K.TPL.generic(S, { novelPath: 'novel', pageParam: S.pageParam, search: S.search, chaptersPage: S.chaptersPage });
    base.__generic = u => generic.manga(u);

    base.chapter = async function (url) {
      const r = await X.req(url, { html: true });
      if (r.status >= 400) throw httpErr(r, url);
      const d = X.parse(r.text, r.url || url);
      const pg = textChapter(d, url);
      pg.paras = (pg.paras || []).filter(p => !BANNER.test(p));
      const slug = slugOf(url), n = chNum(url), here = url.split('#')[0].split('?')[0];
      const nav = re => { const a = selA(d, 'a[href]').find(x => { const h = X.abs(x.getAttribute('href'), url); return h && slugOf(h) === slug && chNum(h) != null && h.split('#')[0].split('?')[0] !== here && re.test(X.t(x).slice(0, 40)); }); return a ? X.abs(a.getAttribute('href'), url).split('#')[0] : null; };
      pg.next = pg.next || nav(/التالي|التالى/);
      pg.prev = pg.prev || nav(/السابق/);
      if (!pg.paras.length) throw new Error('لم يُعثر على نص في هذا الفصل');
      return pg;
    };
    return base;
  }
  return riwayatarab;
});
