'use strict';
/* sources/gen.js — مولّد المصادر: يفحص موقعًا من رابطه ورابط عمل ورابط فصل نموذجيين،
 * ويستنتج إعدادات مصدر متوافقة مع القوالب الموجودة (madara / mangathemesia / generic)، ويطلب يدويًا فقط ما عجز عنه.
 * NovelGen.scan({home, work, chapter}, onRow) -> {rows, cfg} · NovelGen.apply(cfg, key, value) · NovelGen.source(cfg) -> عنصر لـ db.sources */
(function (global) {
  const X = NovelSources.X;
  const t = X.t;
  const P = u => X.path(u).replace(/\/+$/, '');
  const segsOf = u => P(u).split('/').filter(Boolean);
  const esc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const shape = p => p.toLowerCase().replace(/\d+([-._]\d+)*/g, '#');
  const same = (a, b) => { try { return new URL(a).hostname.replace(/^www\./, '') === new URL(b).hostname.replace(/^www\./, ''); } catch (e) { return false; } };
  const hrefs = (d, base) => Array.from(d.querySelectorAll('a[href]')).map(a => ({ a, u: (X.abs(a.getAttribute('href'), base) || '').split('#')[0] })).filter(x => x.u);
  const html = async (u, opt) => { try { return await X.html(u); } catch (e) { if (opt) return null; throw e; } };

  // أول رابط تكملة ظاهر في صفحة القائمة (صفحات مرقمة / رابط تالٍ / زر مزيد)
  function findPaging(d, base) {
    const q = s => { try { return d.querySelector(s); } catch (e) { return null; } };
    for (const s of ['a.next.page-numbers', '.pagination a.next', 'a[rel~=next]', 'link[rel=next]', 'li.next a', '.nav-next a', 'a.next']) {
      const e = q(s), h = e && e.getAttribute('href');
      if (h) return { kind: 'nextLink', sample: X.abs(h, base) };
    }
    for (const s of ['#navigation-ajax', '.load-more', '.loadmore', '#load-more', '.load_more', 'button.more', '.btn-load-more']) if (q(s)) return { kind: 'loadMore' };
    const all = Array.from(d.querySelectorAll('a,button,div,span'));
    if (all.some(e => !e.children.length && /^(تحميل |عرض )?(المزيد|load more|show more|more)$/i.test(t(e)))) return { kind: 'loadMore' };
    const nx = Array.from(d.querySelectorAll('.pagination a,.page-numbers a,.nav-links a,.wp-pagenavi a')).find(a => /^(التالي|التالى|next|›|»|>)$/i.test(t(a)));
    if (nx) return { kind: 'nextLink', sample: X.abs(nx.getAttribute('href'), base) };
    return null;
  }

  // روابط الأعمال في صفحة قائمة: مسار واحد تحت novelPath
  function works(d, base, bs) {
    const set = new Set();
    hrefs(d, base).forEach(({ u }) => { if (!same(u, base)) return; const s = segsOf(u); if (s.length === bs.length + 1 && bs.every((b, i) => s[i] === b)) set.add(s[bs.length]); });
    return set;
  }

  function chapRe(cp, slug) {
    const segs = cp.split('/').filter(Boolean);
    return '^/' + segs.map((s, i) => s === slug ? '[^/?#]+' : esc(s).replace(/\d+/g, i === segs.length - 1 ? '\\d+' : '\\d+')).join('/') + '/?$';
  }

  const NOISE = /^(active|current|odd|even|first|last|selected|open|show|hide|clearfix|row|col-.*|[\d_-]+|.*\d{3,}.*)$/i;
  const cssEsc = x => (global.CSS && CSS.escape) ? CSS.escape(x) : String(x).replace(/[^\w-]/g, '\\$&');
  const sig = el => { if (!el || !el.tagName) return ''; const c = Array.from(el.classList).filter(x => !NOISE.test(x) && x.length < 40).slice(0, 2); return el.tagName.toLowerCase() + c.map(x => '.' + cssEsc(x)).join(''); };
  const cnt = (d, q) => { try { return d.querySelectorAll(q).length; } catch (e) { return 0; } };
  function shortPath(el, d) {
    const own = sig(el); if (cnt(d, own) === 1) return own;
    let p = el.parentElement, n = 0;
    while (p && p.tagName !== 'BODY' && n < 4) { const q = sig(p) + ' ' + own; if (q.includes('.') && cnt(d, q) === 1) return q; p = p.parentElement; n++; }
    return own;
  }
  // أفضل صورة غلاف محتملة في صفحة العمل: تطابق alt مع العنوان، صنف cover/poster، قربها من h1
  function guessCover(d, title) {
    const nt = X.normAr(title), h1 = d.querySelector('h1');
    let best = null, bs = 0;
    Array.from(d.querySelectorAll('img')).forEach(im => {
      const u = X.img(im, d.__url || ''); if (!u || /\.svg(\?|$)|logo|icon|avatar|sprite|emoji|flag|favicon/i.test(u) || im.closest('header,footer,nav')) return;
      let sc = 1; const al = X.normAr(im.getAttribute('alt') || ''), cls = ((im.className || '') + ' ' + ((im.parentElement && im.parentElement.className) || '')).toLowerCase();
      if (nt && al && (al.indexOf(nt) >= 0 || nt.indexOf(al) >= 0)) sc += 6;
      if (/cover|poster|thumb|book|novel|image/.test(cls)) sc += 3;
      if (h1 && im.closest('main,article,section,div') && im.closest('main,article,section,div').contains(h1)) sc += 1;
      if (sc > bs) { bs = sc; best = im; }
    });
    return best && bs >= 3 ? shortPath(best, d) : '';
  }

  // فقرات يُحتمل أنها إعلانات أو ترويج من الموقع (روابط، حسابات تواصل، دعوات اشتراك، رموز عشوائية)
  function suspects(paras, siteName) {
    const STRONG = [/https?:\/\/|www\.|\b[\w-]+\.(com|net|org|io|me|co|info|xyz)\b/i, /@\w+|t\.me|telegram|whatsapp|discord|facebook|instagram|تيليجرام|تلغرام|واتساب|ديسكورد|فيسبوك|انستغرام|انستجرام/i, /^[A-Za-z0-9_\-+=\/]{24,}$/];
    const WEAK = /انضم|انضموا|تابعونا|تابعنا|اشترك|اشتركوا|ادعمنا|ادعم|تبرع|إعلان|اعلان|حقوق|ترجمة|مترجم|تدقيق|قراءة\s*ممتعة|شكراً\s*لقراءة|شكرا\s*لقراءة|موقعنا/i;
    const nm = String(siteName || '').slice(0, 8), out = [], seen = new Set();
    (paras || []).forEach((p, i) => {
      if (p.length > 220) return;
      const hash = STRONG[2].test(p), strong = hash || STRONG[0].test(p) || STRONG[1].test(p);
      const weak = !strong && (WEAK.test(p) || ((i < 2 || i >= paras.length - 2) && p.length < 100 && nm.length > 3 && p.indexOf(nm) >= 0));
      if (!strong && !weak) return;
      const re = hash ? '^[A-Za-z0-9_\\-+=/]{24,}$' : '^' + p.slice(0, 28).replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&').replace(/\d+/g, '\\d+');
      if (seen.has(re)) return; seen.add(re);
      out.push({ text: p.slice(0, 90), re, on: strong });
    });
    return out.slice(0, 12);
  }

  // حاوية نص الفصل حين يعجز المستخرج العام: الأب المشترك لأكبر كتل الفقرات
  function guessContent(d) {
    const blocks = Array.from(d.querySelectorAll('div,article,section')).map(e => ({ e, n: Array.from(e.children).filter(c => c.tagName === 'P').reduce((a, p) => a + t(p).length, 0) })).filter(x => x.n > 200).sort((a, b) => b.n - a.n);
    if (!blocks.length) return '';
    const top = blocks.slice(0, 3).map(x => x.e);
    let anc = top[0];
    while (anc && !top.every(e => anc.contains(e))) anc = anc.parentElement;
    if (!anc || /^(BODY|HTML)$/.test(anc.tagName)) anc = top[0].parentElement || top[0];
    return shortPath(anc, d);
  }


  // اكتشاف عمل وفصل نموذجيين تلقائياً من رابط الموقع وحده
  async function autoSamples(home, on) {
    const step = m => { if (on) on({ id: 'step', label: m, status: 'run', detail: '' }); };
    const origin = new URL(home).origin, kh = new URL(origin).hostname.replace(/^www\./, '');
    const BAD = /^(tag|tags|genre|genres|category|categories|author|authors|user|users|page|wp-|feed|search|login|register|account|profile|bookmark|about|contact|privacy|terms|dmca|faq|blog|news|forum|comments?|cdn-cgi|wp-json|\?)/i;
    const dec = s => { try { return decodeURIComponent(s); } catch (e) { return s; } };
    // 1) موقع معروف بواجهة API: نأخذ العمل والفصل من الواجهة نفسها
    if ((global.NOVEL_KNOWN || {})[kh]) {
      try {
        step('قاعدة المعرفة: جلب عمل من الواجهة…');
        const ad = NovelSources.build({ id: 'gen-auto', name: kh, home: origin, tpl: 'api', known: kh });
        const l = await ad.list({ page: 1, listing: (ad.listings[0] || ['latest'])[0] });
        for (const it of l.items.slice(0, 3)) {
          const m = await ad.manga(it.url);
          const ch = m.chapters && m.chapters[0];
          if (ch) return { work: it.url, chapter: ch.url, how: 'من واجهة معروفة' };
        }
      } catch (e) { /* ننتقل للتحليل العام */ }
    }
    // 2) تجميع الروابط الداخلية من الرئيسية وصفحات القوائم المعتادة وخريطة الموقع
    const pages = [origin + '/'];
    ['novels', 'novel', 'series', 'manga', 'library', 'list', 'all', 'ar/novels'].forEach(p => pages.push(origin + '/' + p + '/'));
    const links = new Map();
    const add = (u, hasImg) => {
      if (!u || !same(u, origin)) return;
      const p = P(u); if (!p || p === '/') return;
      const k = new URL(u).origin + p;
      const o = links.get(k) || { u: u.split('?')[0], img: false, n: 0 }; o.n++; o.img = o.img || hasImg; links.set(k, o);
    };
    const maxPages = 5;
    let got = 0;
    for (const pu of pages) {
      if (got >= maxPages) break;
      step('تحليل ' + pu.replace(origin, '') + '…');
      const d = await html(pu, true); if (!d) continue; got++;
      hrefs(d, pu).forEach(({ a, u }) => add(u, !!a.querySelector('img') || !!(a.parentElement && a.parentElement.querySelector('img'))));
    }
    if (links.size < 8) {
      step('خريطة الموقع…');
      for (const sm of ['/sitemap.xml', '/wp-sitemap.xml', '/sitemap_index.xml', '/novel-sitemap.xml', '/manga-sitemap.xml']) {
        const d = await html(origin + sm, true); if (!d) continue;
        const locs = (d.documentElement.outerHTML.match(/https?:\/\/[^<\s"]+/g) || []).filter(x => !/\.(xml|jpg|png|webp)(\?|$)/i.test(x));
        locs.forEach(u => add(u, false));
        const sub = (d.documentElement.outerHTML.match(/https?:\/\/[^<\s"]+\.xml/g) || []).filter(x => /novel|manga|series|post|work|page/i.test(x) && !/page-sitemap|category|tag/i.test(x)).slice(0, 2);
        for (const su of sub) { const d2 = await html(su, true); if (d2) (d2.documentElement.outerHTML.match(/https?:\/\/[^<\s"]+/g) || []).filter(x => !/\.(xml|jpg|png|webp)(\?|$)/i.test(x)).forEach(u => add(u, false)); }
        if (links.size >= 8) break;
      }
    }
    // 3) مجموعة العمل: مسار بادئة واحد تحته أكثر الروابط (ويفضَّل ما فيه صور بطاقات)
    const groups = new Map();
    links.forEach(o => {
      const s = segsOf(o.u).map(dec);
      if (!s.length || s.length > 4 || BAD.test(s[0])) return;
      if (s.some(x => /^(page|\d+)$/.test(x))) return;
      const key = s.slice(0, -1).join('/');
      const g = groups.get(key) || { key, items: [], img: 0 }; g.items.push(o); if (o.img) g.img++; groups.set(key, g);
    });
    const cands = Array.from(groups.values()).filter(g => g.items.length >= 3 && g.key).sort((a, b) => (b.img * 2 + b.items.length) - (a.img * 2 + a.items.length));
    const flat = Array.from(groups.values()).filter(g => !g.key && g.items.length >= 6).sort((a, b) => b.img - a.img);
    const worksTry = [];
    cands.slice(0, 3).forEach(g => g.items.slice(0, 3).forEach(o => worksTry.push(o.u)));
    flat.slice(0, 1).forEach(g => g.items.filter(o => o.img).slice(0, 3).forEach(o => worksTry.push(o.u)));
    // 4) من صفحة العمل: مجموعة روابط الفصول الأكبر؛ وإلا نجرّب work/1 (مواقع SPA)
    for (const wu of worksTry.slice(0, 6)) {
      step('فحص عمل محتمل: ' + dec(P(wu)).slice(0, 40) + '…');
      const d = await html(wu, true); if (!d) continue;
      const wp = P(wu), gs = new Map();
      hrefs(d, wu).forEach(({ u }) => {
        if (!same(u, origin)) return;
        const p = P(u); if (!p || p === wp || p === '/') return;
        const s = dec(p); if (BAD.test(s.replace(/^\//, ''))) return;
        const k = shape(s);
        const g = gs.get(k) || []; g.push(u); gs.set(k, g);
      });
      const best = Array.from(gs.entries()).filter(([k, v]) => v.length >= 3 && (/chapter|فصل|ch|episode|read|capitulo|#/i.test(k))).sort((a, b) => b[1].length - a[1].length)[0];
      if (best) {
        const pick = best[1].find(u => /(?:^|\D)1(?:\D|$)/.test(dec(P(u)).split('/').pop())) || best[1][0];
        return { work: wu, chapter: pick.split('#')[0], how: 'من صفحة العمل' };
      }
      const spa = /__NUXT__|id="__next"|id="app"|ng-version|id="root"|data-reactroot/i.test(d.documentElement.outerHTML);
      if (spa) return { work: wu, chapter: origin + wp.replace(/\/$/, '') + '/1', how: 'موقع مرسوم بالجافاسكربت (تخمين رقم الفصل)' };
    }
    return null;
  }

  async function scan(o, on) {
    const rows = [];
    const push = (id, label, status, detail, manual) => { const r = { id, label, status, detail, manual: manual || null }; rows.push(r); if (on) on(r); return r; };
    if (!o.work || !o.chapter) {
      const A = await autoSamples(o.home, on);
      if (!A) { push('sample', 'عمل وفصل نموذجيان', 'fail', 'تعذّر إيجادهما تلقائياً — الصق رابط عمل من الموقع في الخانة الاختيارية'); return { rows, cfg: null }; }
      o = Object.assign({}, o, { work: o.work || A.work, chapter: o.chapter || A.chapter });
      push('sample', 'عمل وفصل نموذجيان', 'ok', A.how + ': ' + decodeURIComponent(P(o.work)).slice(0, 40));
    }
    // رابط الفصل قد يُكتب بعلامة رقم (%d أو {n} أو {id}...): نستبدلها برقم فعلي
    const PH = /%[ds](?![0-9a-f])|\{\{?\s*(?:n|num|number|id|chapter|ch)\s*\}?\}|<\s*(?:n|num|number|id)\s*>|\[\s*(?:n|num|number|id)\s*\]/gi;
    if (PH.test(o.chapter || '')) { PH.lastIndex = 0; o = Object.assign({}, o, { chapter: o.chapter.replace(PH, '1') }); } PH.lastIndex = 0;
    const home = new URL(o.home).origin, wu = o.work, cu = o.chapter;
    if (!same(wu, home) || !same(cu, home)) throw new Error('روابط العمل والفصل يجب أن تكون من نفس الموقع');
    const ws = segsOf(wu), cs = segsOf(cu);
    if (!ws.length) throw new Error('رابط العمل لا يحوي مساراً');
    const slug = ws[ws.length - 1], bs = ws.slice(0, -1);

    // تحقق من ملف api (معروف مسبقاً أو مكتشف) بمحوّل التطبيق نفسه
    const runApi = async (cfgK, note) => {
      push('tpl', 'قالب الموقع', 'ok', note);
      const adK = NovelSources.build(Object.assign({ id: 'gen-tmp' }, cfgK));
      let wTitle = '';
      try { const m = await adK.manga(wu); wTitle = m.title || ''; push('work', 'صفحة العمل', m.title ? 'ok' : 'fail', m.title || 'لا عنوان'); push('chapters', 'الفصول', m.chapters && m.chapters.length ? 'ok' : 'fail', (m.total || (m.chapters || []).length) + ' فصلاً'); push('cover', 'الغلاف', m.cover ? 'ok' : 'fail', m.cover ? 'وُجد' : 'لا غلاف'); } catch (e) { push('work', 'صفحة العمل', 'fail', String(e.message || e)); }
      try { const c = await adK.chapter(cu); push('content', 'نص الفصل', c.paras && c.paras.length >= 3 ? 'ok' : 'fail', (c.paras || []).length + ' فقرة'); } catch (e) { push('content', 'نص الفصل', 'fail', String(e.message || e)); }
      try { const l = await adK.list({ page: 1, listing: (adK.listings[0] || ['latest'])[0] }); push('library', 'المكتبة', l.items.length ? 'ok' : 'fail', l.items.length + ' عملاً'); } catch (e) { push('library', 'المكتبة', 'fail', String(e.message || e)); }
      try { let q = await adK.list({ page: 1, q: wTitle || slug.replace(/-/g, ' ') }); if (!q.items.length && wTitle) q = await adK.list({ page: 1, q: slug.replace(/-/g, ' ') }); push('search', 'البحث', q.items.length ? 'ok' : 'fail', q.items.length + ' نتيجة'); } catch (e) { push('search', 'البحث', 'fail', String(e.message || e)); }
      return { rows, cfg: cfgK };
    };
    // معرفة مسبقة بهذا الموقع (known.js): نطبّق ملفها ونتحقق به مباشرة بلا تخمين
    const kh = new URL(home).hostname.replace(/^www\./, ''), K0 = (global.NOVEL_KNOWN || {})[kh];
    if (K0) return runApi({ name: K0.name || kh, home, tpl: 'api', known: kh }, 'معروف مسبقاً (' + (K0.src || 'قاعدة المعرفة') + ')');
    const wd = await html(wu), cd = await html(cu);
    const raw = (wd.documentElement.outerHTML || '') + (cd.documentElement.outerHTML || '');
    // موقع مرسوم بالجافاسكربت (Vue/Nuxt/React): نكتشف واجهة JSON تلقائياً بدل الاعتماد على HTML الفارغ
    if (/__NUXT__|id="__next"|id="app"|ng-version|id="root"|data-reactroot/i.test(raw) && global.NovelApiDisc) {
      try {
        const hints = Array.from(new Set((raw.match(/https?:\/\/api[\w.-]*\.[a-z]{2,}/gi) || []).map(x => new URL(x).origin)));
        const prof = await NovelApiDisc.discover({ home, work: wu, chapter: cu, hints, chapterText: (cd.body && cd.body.textContent) || '', onStep: m => { if (on) on({ id: 'step', label: m, status: 'run', detail: '' }); } });
        if (prof && prof.chapters && prof.content) {
          const nm = ((wd.querySelector('meta[property="og:site_name"]') || {}).content || '').trim() || t(wd.querySelector('title')).split(/\s[-|–]\s/).pop().trim() || new URL(home).hostname;
          prof.name = nm;
          const out = await runApi({ name: nm, home, tpl: 'api', api: prof }, 'واجهة JSON اكتُشفت تلقائياً' + (prof.verified ? ' (النص مطابق للصفحة)' : ''));
          const bad = out.rows.filter(r => r.status === 'fail' && (r.id === 'work' || r.id === 'chapters' || r.id === 'content'));
          if (!bad.length) return out;
          rows.length = 0;
        }
      } catch (e) { rows.length = 0; }
    }
    // معرفة القالب من قاعدة الإضافات (rules.js) تُكمّل الكشف من الصفحة
    const RU = (global.NOVEL_RULES || {})[new URL(home).hostname.replace(/^www\./, '')] || {};
    const madara = /wp-manga|madara/i.test(raw) || RU.tpl === 'madara', themesia = !madara && (/eplister|ts_reader|themesia|mangastream|listupd/i.test(raw) || RU.tpl === 'lightnovelwp');
    // القالب الجاهز يفترض مقطعاً واحداً لمسار الأعمال؛ غير ذلك يعالجه القالب العام
    const tpl = (madara || themesia) && bs.length === 1 ? (madara ? 'madara' : 'mangathemesia') : 'generic';
    const name = ((wd.querySelector('meta[property="og:site_name"]') || {}).content || '').trim() || t(wd.querySelector('title')).split(/\s[-|–]\s/).pop().trim() || new URL(home).hostname;
    const cfg = { name, home, tpl, type: tpl, base: bs[0] || 'novel', chapterFmt: '{n}' };
    push('tpl', 'قالب الموقع', 'ok', (tpl === 'madara' ? 'Madara' : tpl === 'mangathemesia' ? 'MangaStream / Themesia' : 'موقع مخصص (عام)') + (RU.tpl ? ' · مؤكَّد من الإضافات' : '') + (RU.css || RU.rx ? ' · قواعد تنظيف جاهزة' : ''));

    if (tpl === 'generic') {
      if (!bs.length) push('path', 'مسار الأعمال', 'fail', 'رابط العمل بلا مقطع قبل اسم العمل', { key: 'novelPath', hint: 'مقطع مسار الأعمال مثل novel أو ar/novel' });
      else { cfg.novelPath = bs.join('/'); push('path', 'مسار الأعمال', 'ok', '/' + cfg.novelPath + '/'); }
      cfg.chapterRe = chapRe(P(cu), slug);
      cfg.mangaRe = '^/' + bs.map(esc).join('/') + '/[^/?#]+/?$';
    }

    const title = t(wd.querySelector('h1'));
    const cshape = shape(P(cu));
    const chs = hrefs(wd, wu).filter(x => same(x.u, home) && P(x.u) !== P(wu) && shape(P(x.u)) === cshape);
    const nChap = new Set(chs.map(x => x.u)).size;

    // نتحقق بمحوّل التطبيق الحقيقي نفسه على العمل النموذجي، ونصحّح ما يظهر خطؤه
    const tryWork = async ad => { try { const m = await ad.manga(wu); return { title: m.title || '', cover: m.cover || '', n: (m.chapters || []).length }; } catch (e) { return { err: String(e.message || e) }; } };
    let ad = null, w = {};
    const build = () => NovelSources.build(Object.assign({ id: 'gen-tmp' }, cfg));
    try { ad = build(); w = await tryWork(ad); } catch (e) { w = { err: String(e.message || e) }; }
    let note = '';
    if (ad && w.n > 3000 && nChap < w.n / 10) { cfg.fill = false; ad = build(); w = await tryWork(ad); note = ' (أرقام الروابط ليست ترقيم فصول، فاكتفيت بالروابط الظاهرة)'; }
    if (ad && w.title && !w.cover) { const cs = guessCover(wd, title); if (cs) { cfg.coverSel = cs; ad = build(); w = await tryWork(ad); } }

    if (w.title) push('work', 'صفحة العمل', 'ok', w.title);
    else push('work', 'صفحة العمل', 'fail', w.err || 'لم أجد عنواناً (h1)');
    if (w.cover) push('cover', 'الغلاف', 'ok', (cfg.coverSel ? 'بمحدد مستنتج: ' : '') + w.cover.replace(/^https?:\/\//, '').slice(0, 48));
    else push('cover', 'الغلاف', 'fail', 'لم أجد غلافاً في صفحة العمل', { key: 'coverSel', hint: 'معرّف صورة الغلاف مثل .cover img' });
    // العدد المعلن في الصفحة («الفصول 655» أو «655 فصل») لنتأكد أن القائمة كاملة
    const declared = (() => { const tx = (wd.body && wd.body.textContent || '').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/\s+/g, ' '); const nums = []; let m; const re1 = /(?:الفصول|فصول|chapters)\s*[:：]?\s*(\d[\d,]{1,7})/gi, re2 = /(\d[\d,]{1,7})\s*(?:فصل|فصلاً|chapters)/gi; while ((m = re1.exec(tx))) nums.push(+m[1].replace(/,/g, '')); while ((m = re2.exec(tx))) nums.push(+m[1].replace(/,/g, '')); return nums.length ? Math.max.apply(0, nums) : 0; })();
    // سباق الطرق: إن كان العدد أقل بكثير من المعلن في الصفحة، نجرّب كل طرق جلب الفصول المعروفة ونختار الأكمل بدل التنبيه فقط
    let picked = '';
    const need = declared >= 20 ? declared * 0.9 : 3, maxOk = declared >= 20 ? declared * 1.5 : 1e9;
    if ((declared >= 20 && (w.n || 0) < declared * 0.9) || (w.n || 0) < 2) {
      const gcfg = extra => Object.assign({ tpl: 'generic', type: 'generic', novelPath: bs.join('/'), chapterRe: chapRe(P(cu), slug), mangaRe: '^/' + bs.map(esc).join('/') + '/[^/?#]+/?$' }, extra || {});
      const cands = [];
      if (bs.length === 1) { cands.push(['Madara · ajax', { tpl: 'madara', type: 'madara', base: bs[0] }]); cands.push(['Madara · صفحات ajax', { tpl: 'madara', type: 'madara', base: bs[0], paginated: true }]); }
      if (bs.length) { cands.push(['فهرس /chapters', gcfg({ chaptersPage: 'chapters' })]); cands.push(['روابط الصفحة', gcfg({ fill: false })]); }
      ['sunovels', 'seanovel', 'riwayatarab', 'novltime', 'kolnovel'].forEach(en => cands.push(['قالب «' + en + '» الجاهز', { tpl: 'custom', engine: en, base: bs[0] || 'novel' }]));
      let best = { n: w.n || 0, label: '', cfg: null };
      for (const [label, patch] of cands) {
        if (on) on({ id: 'step', label: 'تجربة طريقة الفصول: ' + label, status: 'run', detail: '' });
        const c2 = Object.assign({ name: cfg.name, home: cfg.home }, patch);
        let r = {}; try { r = await tryWork(NovelSources.build(Object.assign({ id: 'gen-tmp' }, c2))); } catch (e) { }
        if ((r.n || 0) > best.n && r.n <= maxOk) best = { n: r.n, label, cfg: c2 };
        if (best.n >= need) break;
      }
      if (best.n < need && global.NovelApiDisc && /^\d+$/.test(cs[cs.length - 1] || '')) {
        try {
          if (on) on({ id: 'step', label: 'تجربة واجهة JSON…', status: 'run', detail: '' });
          const prof = await NovelApiDisc.discover({ home, work: wu, chapter: cu, hints: [], chapterText: (cd.body && cd.body.textContent) || '', onStep: m => { if (on) on({ id: 'step', label: m, status: 'run', detail: '' }); } });
          if (prof && prof.chapters) { const c2 = { name: cfg.name, home: cfg.home, tpl: 'api', api: prof }; const r = await tryWork(NovelSources.build(Object.assign({ id: 'gen-tmp' }, c2))); if ((r.n || 0) > best.n && r.n <= maxOk) best = { n: r.n, label: 'واجهة JSON', cfg: c2 }; }
        } catch (e) { }
      }
      if (best.cfg) { Object.keys(cfg).forEach(k => { if (k !== 'name' && k !== 'home') delete cfg[k]; }); Object.assign(cfg, best.cfg); w.n = best.n; picked = best.label; ad = null; }
    }
    if (w.n >= 1) {
      const part = declared >= 20 && w.n < declared * 0.7;
      push('chapters', 'قائمة الفصول', part ? 'fail' : 'ok', w.n + ' فصلاً' + (nChap ? ' (ظاهر منها ' + nChap + ')' : '') + (declared ? ' · المعلن في الصفحة ' + declared : '') + (picked ? ' · اختيرت طريقة «' + picked + '» تلقائياً' : '') + (part ? ' — القائمة ناقصة' : '') + note);
    }
    else push('chapters', 'قائمة الفصول', tpl === 'generic' ? 'skip' : 'ok', tpl === 'generic' ? 'لا قائمة ظاهرة؛ يُكمل القالب بروابط «التالي»' : 'يحمّلها القالب بنفسه');

    let tx = { paras: [] };
    try { tx = global.NovelFetch.extractText(cd) || tx; } catch (e) { }
    let viaSel = false;
    if ((tx.paras || []).length < 3 || (tx.paras || []).reduce((a, p) => a + String(p).length, 0) < 400) {
      const cs = guessContent(cd);
      if (cs) {
        cfg.contentSel = cs;
        try { const c2 = await build().chapter(cu); if ((c2.paras || []).length >= 3) { tx = { paras: c2.paras }; viaSel = true; } else delete cfg.contentSel; } catch (e) { delete cfg.contentSel; }
      }
    }
    if ((tx.paras || []).some(p => /ا[إأآ]ل/.test(p))) cfg.fixLam = true;
    try { const c3 = await build().chapter(cu); if (c3 && !c3.next && /\/[^\/\d]*\d+\/?$/.test(cu.split(/[?#]/)[0])) cfg.numNav = true; } catch (e) { }
    const chars = (tx.paras || []).reduce((a, p) => a + String(p).length, 0);
    if ((tx.paras || []).length >= 3 && chars >= 400) push('content', 'نص الفصل', 'ok', tx.paras.length + ' فقرة، ' + chars + ' حرفاً' + (viaSel ? ' (حاوية مستنتجة: ' + cfg.contentSel + ')' : ''));
    else {
      // بديل ووردبريس: محتوى الفصل من wp-json
      let wpOk = false;
      for (const nn of ['posts', 'pages', 'chapter', 'chapters']) {
        try { cfg.wpRest = nn; const c4 = await build().chapter(cu); if ((c4.paras || []).length >= 3) { wpOk = true; tx = { paras: c4.paras }; push('content', 'نص الفصل', 'ok', c4.paras.length + ' فقرة (عبر واجهة ووردبريس wp-json/' + nn + ')'); break; } } catch (e) { }
        delete cfg.wpRest;
      }
      if (!wpOk) push('content', 'نص الفصل', 'fail', 'لم يُستخرج نص كافٍ تلقائياً (قد يلزم المتصفح المدمج)');
    }
    const sus = suspects(tx.paras, name);
    push('ads', 'تنقية الإعلانات', 'ok', sus.length ? sus.length + ' فقرة مشبوهة في الفصل النموذجي، اختر ما يُحذف' : 'لم أجد فقرات مشبوهة في الفصل النموذجي').pick = sus;

    if (tpl === 'generic' && cfg.novelPath) {
      const bsx = bs;
      let lib = null;
      const pre = bs.length > 1 ? '/' + bs.slice(0, -1).join('/') : '';
      const hp = new URL(o.home).pathname.replace(/\/+$/, '');
      const roots = Array.from(new Set([pre, hp, ''])), libs = ['/' + cfg.novelPath + '/'];
      roots.forEach(r => ['/explore', '/library', '/novels', '/latest', '/'].forEach(x => libs.push(r + x)));
      for (const p of Array.from(new Set(libs))) {
        const u = home + p, d = await html(u, true);
        if (!d) continue;
        const w = works(d, u, bsx);
        if (w.size >= 6) { lib = { p, d, u, n: w.size, first: Array.from(w).join(',') }; break; }
      }
      if (lib) { cfg.lists = { latest: lib.p }; push('library', 'قائمة الأعمال', 'ok', lib.n + ' عملاً في ' + lib.p); }
      else push('library', 'قائمة الأعمال', 'fail', 'لم أجد صفحة تعرض قائمة أعمال', { key: 'lists.latest', hint: 'مسار صفحة القائمة مثل /explore' });

      if (lib) {
        let pp = '';
        for (const k of ['page', 'paged', 'p']) {
          const u = lib.u + (lib.u.indexOf('?') >= 0 ? '&' : '?') + k + '=2', d = await html(u, true);
          if (!d) continue;
          const w = Array.from(works(d, u, bsx)).join(',');
          if (w && w !== lib.first) { pp = k; break; }
        }
        const pg = findPaging(lib.d, lib.u);
        if (pp) { cfg.pageParam = pp; push('paging', 'التكملة', 'ok', 'صفحات بمعامل ' + pp + (pg && pg.kind === 'loadMore' ? ' (والموقع يعرض زر مزيد)' : '')); }
        else push('paging', 'التكملة', 'fail', pg ? ({ nextLink: 'رابط تالٍ', loadMore: 'زر «المزيد»' })[pg.kind] + ' لا يدعمه القالب العام بعد' : 'لم أجد تكملة ظاهرة', { key: 'pageParam', hint: 'اسم معامل الصفحة مثل page (أو اتركه فارغاً وتخطَّ)' });
        // التكملة لم تُكتشف (غالباً قائمة تُرسم بالجافاسكربت): نجرّب قوالب مصادرنا الجاهزة التي حلّت ذلك
        if (!pp) {
          for (const en of ['novltime', 'seanovel', 'sunovels', 'riwayatarab', 'kolnovel']) {
            if (on) on({ id: 'step', label: 'تجربة قالبنا الجاهز: ' + en, status: 'run', detail: '' });
            try {
              const eng = { name: cfg.name, home: cfg.home, tpl: 'custom', engine: en, base: bs[0] || 'novel' };
              const ea = NovelSources.build(Object.assign({ id: 'gen-tmp' }, eng));
              const m = await ea.manga(wu), l1 = await ea.list({ page: 1, listing: (ea.listings[0] || ['latest'])[0] });
              const l2b = await ea.list({ page: 2, listing: (ea.listings[0] || ['latest'])[0] });
              const a = (l1.items || []).map(x => x.url).join(','), b = (l2b.items || []).map(x => x.url).join(',');
              if ((m.chapters || []).length >= Math.max(2, (w.n || 0)) && l1.items.length && b && a !== b) {
                Object.keys(cfg).forEach(k => { if (k !== 'name' && k !== 'home') delete cfg[k]; });
                Object.assign(cfg, eng);
                const tr = rows.find(r => r.id === 'tpl'); if (tr) { tr.detail = 'قالبنا الجاهز «' + en + '» (اختير تلقائياً: التكملة والفصول تعمل به)'; }
                const cr = rows.find(r => r.id === 'chapters'); if (cr) { cr.status = 'ok'; cr.detail = (m.chapters || []).length + ' فصلاً · بقالب «' + en + '»'; }
                const pr = rows.find(r => r.id === 'paging'); if (pr) { pr.status = 'ok'; pr.manual = null; pr.detail = 'التكملة تعمل بقالب «' + en + '»'; }
                const lr = rows.find(r => r.id === 'library'); if (lr) { lr.status = 'ok'; lr.detail = l1.items.length + ' عملاً · بقالب «' + en + '»'; }
                push('search', 'البحث', 'ok', 'يتولاه قالب «' + en + '»');
                return { rows, cfg };
              }
            } catch (e) { }
          }
        }
      }

      const q = (title.split(/\s+/).find(w => w.length >= 3) || title).slice(0, 12);
      let sr = '';
      const sCands = [];
      roots.forEach(r => ['/search?q={q}', '/?s={q}', '/search/{q}', '/?search={q}'].forEach(x => sCands.push(r + x)));
      sCands.push('/' + cfg.novelPath + '/?s={q}');
      if (q) for (const s of Array.from(new Set(sCands))) {
        const u = home + s.replace('{q}', encodeURIComponent(q)), d = await html(u, true);
        if (d && works(d, u, bs).has(slug)) { sr = s; break; }
      }
      if (sr) { cfg.search = sr; push('search', 'البحث', 'ok', sr); }
      else push('search', 'البحث', 'fail', 'لم أجد رابط بحث يُرجع العمل النموذجي', { key: 'search', hint: 'قالب البحث مع {q} مثل /search?q={q}' });
    }
    return { rows, cfg };
  }

  // تحليل سرعة: يقارن طريقة المصدر الحالية بكل الطرق المعروفة (زمن وعدد فصول) ويطبع تقريراً نصياً
  async function compare(src, on) {
    const step = m => { if (on) on(m); };
    const L = [], ALT = [], CUR = {}, ms = t0 => ((Date.now() - t0) / 1000).toFixed(1) + 's';
    const origin = new URL(src.home).origin;
    L.push('تقرير سرعة · ' + src.name + ' · ' + src.home + ' · tpl=' + (src.tpl || src.type) + (src.engine ? ' · engine=' + src.engine : ''));
    const ad = NovelSources.build(src);
    step('البحث عن عمل نموذجي…');
    let work = '', first = null;
    try { const l = await ad.list({ page: 1, listing: (ad.listings[0] || ['latest'])[0] }); first = (l.items || [])[0]; work = first && first.url; L.push('القائمة: ' + (l.items || []).length + ' عملاً'); } catch (e) { L.push('القائمة: فشل ' + (e.message || e)); }
    // زمن صفحات القائمة التالية (المتصفح الخفي غالباً أبطأ ما في المصدر)
    for (const pgN of [2, 3]) {
      step('قياس صفحة القائمة ' + pgN + '…');
      const tl = Date.now();
      try { const l2 = await Promise.race([ad.list({ page: pgN, listing: (ad.listings[0] || ['latest'])[0] }), new Promise((_, rj) => setTimeout(() => rj(new Error('مهلة 70 ثانية')), 70000))]); L.push('القائمة صفحة ' + pgN + ': ' + (l2.items || []).length + ' عملاً في ' + ms(tl)); } catch (e) { L.push('القائمة صفحة ' + pgN + ': فشل ' + String(e.message || e).slice(0, 80) + ' بعد ' + ms(tl)); }
    }
    if (!work) { const A = await autoSamples(origin, null).catch(() => null); work = A && A.work; }
    if (!work) { L.push('لم أجد عملاً نموذجياً.'); return { text: L.join('\n'), cur: CUR, alts: ALT }; }
    L.push('العمل: ' + work);
    // طريقتنا الحالية
    step('قياس طريقة المصدر الحالية…');
    let t0 = Date.now(), m = null, chs = [];
    try { m = await ad.manga(work); chs = m.chapters || []; CUR.n = chs.length; CUR.t = Date.now() - t0; L.push('[الحالية] أول دفعة: ' + chs.length + ' فصل في ' + ms(t0) + (m.total ? ' · الإجمالي المعلن ' + m.total : '')); } catch (e) { L.push('[الحالية] فشل: ' + (e.message || e)); }
    if (m && typeof m.more === 'function') {
      t0 = Date.now();
      try { const r = await Promise.race([m.more({}), new Promise((_, rj) => setTimeout(() => rj(new Error('مهلة 90 ثانية')), 90000))]); CUR.n = Math.max(CUR.n || 0, (r && r.got) || 0); CUR.t += Date.now() - t0; L.push('[الحالية] إكمال الباقي: ' + JSON.stringify({ got: r && r.got, total: r && r.total, reason: r && r.reason }) + ' في ' + ms(t0)); } catch (e) { L.push('[الحالية] إكمال الباقي فشل: ' + (e.message || e)); }
    }
    const declared = m && m.total ? m.total : 0;
    // الطرق البديلة
    const bs = segsOf(work).slice(0, -1);
    const alt = [];
    alt.push(['عام · روابط الصفحة + تعبئة بالأرقام', { tpl: 'generic', novelPath: bs.join('/') }]);
    alt.push(['عام · فهرس /chapters', { tpl: 'generic', novelPath: bs.join('/'), chaptersPage: 'chapters' }]);
    if (bs.length === 1) { alt.push(['Madara · ajax', { tpl: 'madara', base: bs[0] }]); alt.push(['Madara · صفحات ajax', { tpl: 'madara', base: bs[0], paginated: true }]); alt.push(['MangaThemesia', { tpl: 'mangathemesia', base: bs[0] }]); }
    ['sunovels', 'seanovel', 'riwayatarab', 'novltime', 'kolnovel'].forEach(en => { if (en !== src.engine && en !== src.id) alt.push(['قالبنا «' + en + '»', { tpl: 'custom', engine: en, base: bs[0] || 'novel' }]); });
    for (const [label, patch] of alt) {
      step('تجربة: ' + label);
      const t1 = Date.now();
      try { const a2 = NovelSources.build(Object.assign({ id: 'gen-cmp', name: src.name, home: src.home }, patch)); const r = await Promise.race([a2.manga(work), new Promise((_, rj) => setTimeout(() => rj(new Error('مهلة 25 ثانية')), 25000))]); L.push('[' + label + '] ' + (r.chapters || []).length + ' فصل في ' + ms(t1)); ALT.push({ label, patch, n: (r.chapters || []).length, t: Date.now() - t1 }); } catch (e) { L.push('[' + label + '] فشل: ' + String(e.message || e).slice(0, 80)); }
    }
    // كشف طلبات الشبكة خلف زر «تحميل المزيد» في صفحة القائمة (لإيجاد واجهة أسرع من المتصفح الخفي)
    try {
      const F = global.NovelFetch;
      if (F.scrape && F.hasNative() && bs.length) {
        const hp = new URL(src.home).pathname.replace(/\/+$/, '');
        const lp = [hp + '/explore', hp + '/library', hp + '/novels', hp + '/'].map(p => origin + p);
        let lu = '';
        for (const u of lp) { const d = await html(u, true); if (d && works(d, u, bs).size >= 6) { lu = u; break; } }
        if (lu) {
          step('كشف طلبات «تحميل المزيد»…');
          const tq = Date.now();
          const dd = await F.scrape(lu, { rowRe: '/' + bs.map(esc).join('/') + '/[^/?#]+/?$', more: 'تحميل المزيد|عرض المزيد|load\\s*more|common\\.loadMore', clicks: 1, timeout: 45000 });
          L.push('[طلبات الشبكة] ' + lu + ' · ' + (dd.chapters || []).length + ' صفاً في ' + ms(tq));
          (dd.req || []).filter(u => !/analytics|gtag|google|doubleclick|facebook|sentry|cloudflare/i.test(u)).slice(0, 25).forEach(u => L.push('  ' + u));
        }
      }
    } catch (e) { L.push('[طلبات الشبكة] فشل: ' + String(e.message || e).slice(0, 80)); }
    // واجهة JSON / ووردبريس
    step('البحث عن واجهة JSON…');
    if (global.NovelApiDisc && chs.length) {
      const t2 = Date.now(), cu = (chs.find(c => /\/\d+\/?$/.test(c.url)) || chs[0]).url;
      try { const prof = await NovelApiDisc.discover({ home: origin, work, chapter: cu, hints: [], chapterText: '', onStep: () => { } }); L.push('[واجهة JSON] ' + (prof ? 'وُجدت: ' + JSON.stringify(prof).slice(0, 300) : 'لم توجد') + ' في ' + ms(t2)); } catch (e) { L.push('[واجهة JSON] فشل: ' + (e.message || e)); }
    }
    for (const nn of ['posts', 'pages', 'chapter', 'chapters']) {
      try { const js = await X.json(origin + '/wp-json/wp/v2/' + nn + '?per_page=1&_fields=id'); if (Array.isArray(js)) { L.push('[ووردبريس] wp-json/' + nn + ' متاح'); } } catch (e) { }
    }
    if (declared) L.push('المعلن: ' + declared);
    return { text: L.join('\n'), cur: CUR, alts: ALT };
  }

  function apply(cfg, key, value) {
    const parts = key.split('.');
    let o = cfg;
    for (let i = 0; i < parts.length - 1; i++) { if (!o[parts[i]] || typeof o[parts[i]] !== 'object') o[parts[i]] = {}; o = o[parts[i]]; }
    o[parts[parts.length - 1]] = value;
    return cfg;
  }
  // عنصر جاهز لـ db.sources (الشكل نفسه الذي تنشئه شاشة «إضافة مصدر»)
  function source(cfg) {
    const s = Object.assign({ id: 'u' + Date.now() }, cfg);
    if (s.tpl === 'api') { delete s.type; delete s.base; delete s.chapterFmt; }
    if (s.tpl === 'generic') { s.type = 'generic'; delete s.base; delete s.chapterFmt; }
    Object.keys(s).forEach(k => { if (s[k] === '' || s[k] == null || (Array.isArray(s[k]) && !s[k].length)) delete s[k]; });
    return s;
  }
  global.NovelGen = { scan, apply, source, suspects, compare };
})(window);
