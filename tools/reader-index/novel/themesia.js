'use strict';
/* sources/mangathemesia.js — قالب Themesia (ووردبريس) */
NovelKit.add('mangathemesia', K => {
  const global = window;
  const { X, sel1, selA, httpErr, textChapter } = K;
  // ---------- MangaThemesia ----------
  function mangathemesia(S, p) {
    p = Object.assign({
      dir: '/manga',
      item: '.utao .uta .imgu, .listupd .bs .bsx, .listo .bs .bsx',
      itemTitle: '',
      next: 'div.pagination .next, div.hpage .r',
      details: 'div.bigcontent, div.animefull, div.main-info, div.postbody',
      title: 'h1.entry-title, .ts-breadcrumb li:last-child span',
      cover: '.infomanga > div[itemprop=image] img, .thumb img',
      desc: '.desc, .entry-content[itemprop=description]',
      genre: 'div.gnr a, .mgen a, .seriestugenre a',
      status: null,
      chapters: 'div.bxcl li, div.cl li, #chapterlist li, ul li:has(div.chbox):has(div.eph-num)',
      chTitle: '.lch a, .chapternum',
      chDate: '.chapterdate',
    }, p || {});
    const H = S.home;
    const ad = {
      listings: S.listings.length ? S.listings : [['update', 'آخر التحديثات'], ['popular', 'الأكثر شعبية']],
      isChapter: u => { const s = X.segs(u); return s.length === 1 && /(chapter|ch-|فصل|-\d+$)/i.test(s[0]); },
      mangaOf: u => { const s = X.segs(u); return s[0] === p.dir.replace(/^\//, '') && s.length >= 2 ? H + p.dir + '/' + s[1] + '/' : null; },
      async list(a) {
        if (a.q) { const hs = await X.siteSearch(S, a.q).catch(() => []); if (hs.length || a.page > 1) return { items: a.page > 1 ? [] : hs, hasNext: false }; }
        const f = Object.assign({}, a.f || {});
        if (!f.order && !a.q) f.order = a.listing === 'popular' ? 'popular' : 'update';
        const q = Object.assign({ page: a.page, title: a.q || '' }, f);
        const d = await X.html(H + p.dir + '/?' + X.qs(q));
        const items = X.uniqBy(selA(d, p.item).map(c => {
          const l = c.querySelector('a[href]'); if (!l) return null;
          const t = (p.itemTitle && X.t(sel1(c, p.itemTitle))) || l.getAttribute('title') || X.t(c.querySelector('.tt')) || '';
          const latest = X.t(c.querySelector('.epxs, .adds .epxs'));
          return t ? { url: X.abs(l.getAttribute('href'), d.__url), title: t.trim().slice(0, 150), cover: X.img(c.querySelector('img'), d.__url), latest, rating: X.t(c.querySelector('.numscore, .score')).replace(/[^\d.]/g, '').slice(0, 4) } : null;
        }).filter(Boolean), 'url');
        return { items, hasNext: !!sel1(d, p.next) };
      },
      async manga(url) {
        const d = await X.html(url);
        const box = sel1(d, p.details) || d;
        const st = p.status ? sel1(box, p.status) : X.byText(box, '.infotable tr, .tsinfo .imptdt, .fmed, .info-label', ['الحالة', 'Status', 'حالة العمل'])[0];
        let stText = '';
        if (st) stText = st.matches && st.matches('tr') ? X.t(st.querySelector('td:last-child')) : (X.t(st.querySelector('i, span, a')) || (st.nextElementSibling ? X.t(st.nextElementSibling) : X.t(st)));
        const r = {
          url,
          title: X.t(sel1(box, p.title)) || X.t(d.querySelector('h1')),
          cover: X.img(sel1(box, p.cover), url),
          summary: X.t(sel1(box, p.desc)).slice(0, 2000),
          genres: selA(box, p.genre).map(X.t).filter(Boolean),
          status: X.status(stText),
        };
        r.chapters = X.uniqBy(selA(d, p.chapters).map(li => {
          const a = li.querySelector('a[href]'); if (!a) return null;
          const t = X.t(sel1(li, p.chTitle)) || X.t(a);
          return { url: X.abs(a.getAttribute('href'), url), title: t, num: X.num(t), date: X.t(sel1(li, p.chDate)) };
        }).filter(Boolean), 'url');
        try { r.start = X.findStart(d, url); } catch (e) { }
        return r;
      },
      async chapter(url) {
        const r = await X.req(url, { html: true });
        if (r.status >= 400) throw httpErr(r, url);
        return textChapter(X.parse(r.text, url), url);
      },
    };
    return ad;
  }
  return mangathemesia;
});
