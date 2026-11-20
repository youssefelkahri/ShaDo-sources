'use strict';
/* sources/cenele.js — سينيل (cenele.com). ملف خاص بهذا المصدر وحده.
 * الموقع Madara (قالب madara-child-novel، نوع المحتوى «cont») وله واجهة تطبيق عامة على wp-json/nhv/v1:
 *   القائمة والبحث: /library?page=N&per_page=60&orderby=latest|views|rating&search=<q>   → data.items[], data.total_pages
 *   بيانات العمل:   /novels/<id>                                                         (id من <link rel=shortlink ?p=ID>)
 *   الفصول:         /novels/<id>/chapters?order=asc&per_page=300&page=N                   → data.chapters[], data.total_pages
 *   رابط الفصل:     /cont/<slug>/[<volume_slug>/]<chapter_slug>/   (الـslugs مرمّزة كما تأتي من الواجهة)
 *   نص الفصل: واجهة /chapters/<id> تحتاج توقيعاً (chapter_signature_required) فنقرأ صفحة الفصل (div.reading-content) بقالب Madara. */
NovelKit.add('cenele', K => {
  const global = window;
  const { X, sel1, selA, httpErr, textChapter } = K;
  const JUNK = /^(اذكر الله|…|\.{2,}|\s*)$|يسرق|فضاء الروايات|تطبيق فضاء|حمله من هنا|Google Play/;
  const log = (m, o) => { try { global.NovelLog && global.NovelLog.add('cen', m, o); } catch (e) { } };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const PER_LIST = 60, PER_CH = 300;

  function cenele(S) {
    const origin = new URL(S.home).origin, API = origin + '/wp-json/nhv/v1';
    const madara = K.TPL.madara(S, { base: 'cont' });
    const J = async u => { const r = await X.req(u, { headers: { Accept: 'application/json' }, timeout: 25000 }); if (r.status >= 400) throw httpErr(r, u); const j = JSON.parse(r.text); if (j && j.success === false) throw new Error((j.error && j.error.message) || 'API'); return j && j.data !== undefined ? j.data : j; };
    const isText = it => !it.reader || !it.reader.type || it.reader.type === 'text';
    const toItem = it => ({ url: it.permalink || (origin + '/cont/' + it.slug + '/'), title: String(it.title || '').trim(), cover: it.cover || '', latest: it.chapters_count ? it.chapters_count + ' فصل' : '' });
    async function lib(params) {
      const d = await J(API + '/library?' + X.qs(Object.assign({ per_page: PER_LIST }, params)));
      const items = (d.items || []).filter(isText).map(toItem).filter(x => x.title);
      return { items, hasNext: (d.page || 1) < (d.total_pages || 1), total: d.total };
    }
    const chUrl = (slug, c) => origin + '/cont/' + slug + '/' + (c.volume_slug ? c.volume_slug + '/' : '') + c.chapter_slug + '/';
    const nameNum = n => { const m = String(n || '').match(/(\d+(?:\.\d+)?)/); return m ? +m[1] : null; };

    const orig = { list: madara.list.bind(madara), manga: madara.manga.bind(madara) };
    return Object.assign(madara, {
      async list(a) {
        const page = a.page || 1;
        try {
          if (a.q) { const r = await lib({ page, search: a.q.trim() }); log('بحث', { q: a.q, n: r.items.length, total: r.total }); return r; }
          const ob = a.listing === 'popular' ? 'views' : (a.listing === 'rating' ? 'rating' : 'latest');
          const r = await lib({ page, orderby: ob }); log('قائمة ' + ob + ' ص' + page, { n: r.items.length, next: r.hasNext }); return r;
        } catch (e) { log('API القائمة فشلت — Madara', { e: String(e && e.message || e).slice(0, 80) }); }
        return orig.list(a);
      },

      // نص الفصل: الصفحة تحقن وسوم مخفية (blockquote[inert] بحروف مزخرفة «يسرق من موقع…») وإعلان التطبيق وفقرات «اذكر الله»
      async chapter(url) {
        const r = await X.req(url, { html: true });
        if (r.status >= 400) throw httpErr(r, url);
        const d = X.parse(r.text, r.url || url);
        selA(d, '[inert], [data-nosnippet], .nhv-reader-promo, blockquote, style, script, .nhv-reading-chapter-head, input').forEach(e => { try { e.remove(); } catch (er) { } });
        const pg = textChapter(d, url);
        pg.paras = (pg.paras || []).filter(x => !JUNK.test(String(x).trim()));
        if (!pg.paras.length) throw new Error('لم يُعثر على نص في هذا الفصل');
        return pg;
      },
      async manga(url) {
        const slug = decodeURIComponent((new URL(url).pathname.match(/\/cont\/([^\/]+)/) || [])[1] || '');
        try {
          const r = await X.req(url, { html: true });
          if (r.status >= 400) throw httpErr(r, url);
          const id = (String(r.text).match(/rel=['"]shortlink['"][^>]*[?&]p=(\d+)/) || String(r.text).match(/postid-(\d+)/) || [])[1];
          if (!id) throw new Error('no id');
          const [w, c1] = await Promise.all([J(API + '/novels/' + id), J(API + '/novels/' + id + '/chapters?order=asc&per_page=' + PER_CH + '&page=1')]);
          const total = +c1.total || (c1.chapters || []).length, pages = +c1.total_pages || 1;
          const mk = c => ({ url: chUrl(slug, c), title: (c.chapter_name + (c.chapter_name_extend ? ' - ' + c.chapter_name_extend : '')).trim(), num: nameNum(c.chapter_name), date: String(c.date || '').slice(0, 10), arc: c.volume_name || '' });
          const first = (c1.chapters || []).map(mk);
          log('عمل ' + slug, { id, total, pages, first: first.length });
          const res = {
            url, start: first[0] ? first[0].url : '', total, title: w.title || '', cover: w.cover || '', summary: String(w.summary || '').replace(/\r/g, '').slice(0, 2000),
            genres: (w.genres || []).map(g => g.name).filter(Boolean), status: X.status ? (X.status(w.status === 'end' ? 'مكتملة' : 'مستمرة') || '') : (w.status === 'end' ? 'مكتملة' : 'مستمرة'),
            chapters: first, cancel() { res._c = true; },
          };
          if (pages > 1) {
            res.more = async function (o) {
              o = o || {}; const have = new Set(first.map(c => c.url)); (o.have || []).forEach(u => have.add(u));
              const failed = []; let got = have.size, contig = 1; const t0 = Date.now();
              const fetchP = async p => { for (let t = 0; t < 3; t++) { if (res._c) return null; try { return (await J(API + '/novels/' + id + '/chapters?order=asc&per_page=' + PER_CH + '&page=' + p)).chapters || []; } catch (e) { await sleep(600 * (t + 1)); } } return null; };
              for (let p = 2; p <= pages; p += 3) {
                if (res._c) break;
                const grp = []; for (let k = p; k < p + 3 && k <= pages; k++) grp.push(k);
                const rs = await Promise.all(grp.map(fetchP));
                grp.forEach((pg, i) => {
                  const rows = rs[i]; if (!rows) { failed.push(pg); return; }
                  const fresh = rows.map(mk).filter(c => !have.has(c.url)); fresh.forEach(c => have.add(c.url)); got = have.size;
                  if (!failed.length) contig = pg;
                  if (o.onBatch) { try { o.onBatch(fresh, { got, total, page: pg, contig }); } catch (e) { } }
                });
              }
              log('انتهى جلب الفصول', { got, total, pages, failed: failed.join(','), sec: Math.round((Date.now() - t0) / 1000), match: total ? got >= total : null });
              return { got, total, failed, cancelled: !!res._c, contig, reason: failed.length ? 'failures' : 'done' };
            };
          }
          return res;
        } catch (e) { log('API العمل فشلت — Madara', { e: String(e && e.message || e).slice(0, 80) }); }
        return orig.manga(url);
      },
    });
  }
  return cenele;
});
