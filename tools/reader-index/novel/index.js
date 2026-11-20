'use strict';
/* sources/index.js — بناء محوّل المصدر من بيانات sources/data.js.
 * المحوّل: list({page,q,listing,f}) · manga(url) · chapter(url) -> {paras,title,next,prev} · isChapter · mangaOf */
(function (global) {
  const K = NovelKit.make();
  const X = K.X;
  // ================= البناء =================
  const DATA = global.NOVEL_SOURCES_DATA || [];
  // base: المقطع الذي تبدأ به روابط الأعمال (Madara: novel/manga ... ، Themesia: series)
  function build(S, ro) {
    const TPL = (ro ? NovelKit.make(ro) : K).TPL;
    const d = DATA.find(x => x.id === S.id);
    S = Object.assign({ listings: [], filters: [] }, d || {}, S);
    const tpl = S.tpl || (S.type === 'mangathemesia' ? 'mangathemesia' : 'madara');
    const ad = (S.tpl === 'api' || S.api) ? TPL.api(S)
      : (S.engine && TPL[S.engine]) ? TPL[S.engine](S)
      : (S.id === 'kolnovel' && /kolnovel\./.test(S.home || '')) ? TPL.kolnovel(S)
      : (S.id === 'novltime' && /novltime\./.test(S.home || '')) ? TPL.novltime(S)
      : (S.id === 'riwayatarab' && /riwayatarab\./.test(S.home || '')) ? TPL.riwayatarab(S)
      : (S.id === 'seanovel' && /seanovel\./.test(S.home || '')) ? TPL.seanovel(S)
      : (S.id === 'sunovels' && /sunovels\./.test(S.home || '')) ? TPL.sunovels(S)
      : (S.tpl === 'custom' && TPL[S.id]) ? TPL[S.id](S)
      : tpl === 'generic' ? TPL.generic(S, { novelPath: S.novelPath, pageParam: S.pageParam, search: S.search, chaptersPage: S.chaptersPage })
      : tpl === 'mangathemesia'
      ? TPL.mangathemesia(S, { dir: '/' + String(S.base || 'series').replace(/^\/+|\/+$/g, '') })
      : TPL.madara(S, { base: S.base || 'novel', paginated: !!S.paginated });
    // استبدال طريقة جلب بيانات العمل وقائمة الفصول (يختاره المستخدم من «تحليل الطرق الأسرع»): الباقي (قوائم/بحث/نص الفصل) يبقى لطريقة المصدر
    if (S.mangaVia && ad.manga) {
      try {
        const alt = build(Object.assign({ id: 'via-' + S.id, name: S.name, home: S.home }, S.mangaVia));
        const om = ad.manga.bind(ad);
        // نقارن الطريقتين معاً ولا نعتمد البديلة إلا إن أعطت قائمة كاملة (≥ المعلن/الأصلية): الطريقة تنجح في عمل وتقصّر في آخر
        ad.manga = async u => {
          const [o, a] = await Promise.all([om(u).catch(e => ({ _e: e })), alt.manga(u).catch(() => null)]);
          if (o && o._e) { if (a && a.chapters && a.chapters.length) return a; throw o._e; }
          const oc = (o && o.chapters) || [], need = Math.max((o && o.total) || 0, oc.length);
          if (a && a.chapters && a.chapters.length && a.chapters.length >= need * 0.95 && a.chapters.length >= oc.length) {
            const ot = new Map(oc.map(c => [c.url, c.title]));
            const res = Object.assign({}, o, { chapters: a.chapters.map(c => (ot.get(c.url) ? Object.assign({}, c, { title: ot.get(c.url) }) : c)) });
            delete res.more; return res;
          }
          return o;
        };
      } catch (e) { }
    }
    // حاوية نص الفصل لهذا المصدر (مستنتجة أو مُدخلة): نستخرج منها وحدها بنفس قواعد التنقية العامة، وإلا نعود للمحوّل
    if (S.contentSel && ad.chapter) {
      const orig0 = ad.chapter.bind(ad), F = global.NovelFetch;
      ad.chapter = async u => {
        try {
          const d = await X.html(u), el = d.querySelector(S.contentSel);
          if (el) {
            const nd = X.parse('<html><body><div class="entry-content"></div></body></html>', u);
            nd.querySelector('.entry-content').innerHTML = el.innerHTML;
            const ex = F.extractText(nd);
            if (ex.paras.length >= 3) {
              const link = q => { const e = d.querySelector(q); return e ? X.abs(e.getAttribute('href'), u) : null; };
              return { paras: ex.paras, title: X.t(d.querySelector('h1')) || ex.title, next: link(F.NAV_NEXT), prev: link(F.NAV_PREV) };
            }
          }
        } catch (e) { }
        return orig0(u);
      };
    }
    // إصلاح اللام-ألف المقلوبة (بعض المواقع تكتب «اإلله» بدل «الإله» و«األن» بدل «الأن»)
    if (S.fixLam && ad.chapter) {
      const o1 = ad.chapter.bind(ad);
      const fx = x => String(x).replace(/ا([إأآ])ل/g, (m, h) => 'ال' + h).replace(/(^|[\s"«(])ال(?=[\s".,!؟،:»)]|$)/g, '$1لا').replace(/جاللة/g, 'جلالة').replace(/جاللتك/g, 'جلالتك').replace(/جاللتها/g, 'جلالتها').replace(/جاللته/g, 'جلالته');
      ad.chapter = async u => { const r = await o1(u); if (r && r.paras) r.paras = r.paras.map(fx); return r; };
    }
    // تنقل بالرقم حين لا توجد روابط التالي/السابق في الصفحة (مواقع Vue)
    if (S.numNav && ad.chapter) {
      const o2 = ad.chapter.bind(ad);
      ad.chapter = async u => {
        const r = await o2(u);
        const m = String(u).split(/[?#]/)[0].match(/^(.*\/[^\/\d]*?)(\d+)\/?$/);
        if (r && m) {
          const n = +m[2], lim = S.numNav === true ? 89999 : +S.numNav;
          if (!r.next && n < lim) r.next = m[1] + (n + 1);
          if (!r.prev && n > 1 && n < 90000) r.prev = m[1] + (n - 1);
        }
        return r;
      };
    }
    // واجهة ووردبريس REST: إن عجز استخراج الصفحة نجلب نص الفصل من wp-json (المحتوى في content.rendered)
    if (S.wpRest && ad.chapter) {
      const orig1 = ad.chapter.bind(ad), F1 = global.NovelFetch;
      ad.chapter = async u => {
        let r = null; try { r = await orig1(u); } catch (e) { }
        if (r && r.paras && r.paras.length >= 3) return r;
        const slug = decodeURIComponent(new URL(u).pathname.split('/').filter(Boolean).pop() || '');
        const js = await X.json(new URL(S.home).origin + '/wp-json/wp/v2/' + S.wpRest + '?slug=' + encodeURIComponent(slug) + '&_fields=title,content');
        const it = Array.isArray(js) ? js[0] : null;
        if (!it || !it.content) { if (r) return r; throw new Error('تعذّر جلب الفصل'); }
        const nd = X.parse('<html><body><div class="entry-content">' + it.content.rendered + '</div></body></html>', u);
        const ex = F1.extractText(nd);
        return Object.assign({}, r || {}, { paras: ex.paras, title: (it.title && X.t(X.parse('<p>' + it.title.rendered + '</p>', u))) || (r && r.title) || ex.title });
      };
    }
    // تنقية خاصة بالمصدر: أنماط (regex) لفقرات تُحذف من نص الفصل (إعلانات الموقع، روابطه، ترويجاته)
    const cl = (S.clean || []).map(x => { try { return new RegExp(x, 'i'); } catch (e) { return null; } }).filter(Boolean);
    if (cl.length && ad.chapter) { const orig = ad.chapter.bind(ad); ad.chapter = async u => { const r = await orig(u); if (r && r.paras) r.paras = r.paras.filter(q => !cl.some(x => x.test(q))); return r; }; }
    ad.id = S.id; ad.name = S.name; ad.home = S.home; ad.tpl = tpl;
    ad.listings = ad.listings || (S.listings.length ? S.listings : [['latest', 'الأحدث']]);
    ad.filters = S.filters || [];
    ad.note = '';
    ad.owns = u => { try { return new URL(u).hostname.replace(/^www\./, '') === new URL(S.home).hostname.replace(/^www\./, ''); } catch (e) { return false; } };
    return ad;
  }

  global.NovelSources = {
    CATALOG: DATA.map(d => Object.assign({}, d)),
    build, X,
  };
})(window);
