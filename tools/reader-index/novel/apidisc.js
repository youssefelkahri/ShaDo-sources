'use strict';
/* sources/apidisc.js — اكتشاف واجهة JSON للموقع تلقائياً (للمواقع المرسومة بالجافاسكربت: Vue/Nuxt/React).
 * يجرّب مسارات REST الشائعة على عمل وفصل نموذجيين، ويتحقق من الردود، ويستنتج أسماء الحقول، ثم يُخرج ملف
 * وصف (profile) يقرؤه قالب «api». NovelApiDisc.discover({home,work,chapter,html,onStep}) -> profile | null */
(function (global) {
  const X = () => NovelKit.make().X;
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const txtKeys = ['content', 'text', 'body', 'html', 'chapter_content', 'data'];
  const titleKeys = ['arabic', 'title', 'name', 'english', 'title_ar'];
  const sumKeys = ['about', 'description', 'summary', 'synopsis', 'desc'];
  const covKeys = ['poster_url', 'cover', 'cover_url', 'poster', 'image', 'thumbnail', 'cover_image', 'image_url'];
  const numKeys = ['number', 'num', 'chapter_number', 'chapter', 'index', 'order', 'no'];
  const chTitleKeys = ['title', 'name', 'arabic', 'chapter_title'];
  const dateKeys = ['date', 'created_at', 'published_at', 'updated_at', 'created'];
  const countKeys = ['count', 'total', 'total_count', 'meta.total', 'meta.count', 'pagination.total', 'total_chapters'];
  const resKeys = ['results', 'data', 'chapters', 'items', 'list', 'rows'];
  const nextKeys = ['next', 'links.next', 'meta.next', 'next_page_url'];
  const has = (o, k) => { let v = o; for (const p of k.split('.')) v = v == null ? v : v[p]; return v != null && v !== '' && v !== false; };
  const val = (o, k) => { let v = o; for (const p of k.split('.')) v = v == null ? v : v[p]; return v; };
  const firstKey = (o, ks) => ks.find(k => has(o, k));
  const flat = v => Array.isArray(v) ? v.map(flat).join(' ') : (v && typeof v === 'object') ? Object.values(v).map(flat).join(' ') : String(v == null ? '' : v);
  const plain = s => String(s).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const arRatio = s => { const a = (s.match(/[؀-ۿ]/g) || []).length; return s.length ? a / s.length : 0; };
  // يجرّب المرشّحين على دفعات متوازية بالترتيب ويتوقف عند أول ردّ مقبول (أو عند انتهاء المهلة)
  async function find(urls, fetcher, ok, dl) {
    for (let i = 0; i < urls.length; i += 8) {
      if (Date.now() > dl) return null;
      const rs = await Promise.all(urls.slice(i, i + 8).map(u => fetcher(u).catch(() => null)));
      for (let k = 0; k < rs.length; k++) { const h = rs[k] && ok(rs[k], urls[i + k]); if (h) return h; }
    }
    return null;
  }
  async function pool(tasks, n) { const out = new Array(tasks.length); let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < tasks.length) { const k = i++; try { out[k] = await tasks[k](); } catch (e) { out[k] = null; } } })); return out; }

  async function discover(o) {
    const x = X(), say = m => { try { o.onStep && o.onStep(m); } catch (e) { } };
    const home = new URL(o.home).origin, host = new URL(home).hostname.replace(/^www\./, '');
    const wp = new URL(o.work).pathname.replace(/\/+$/, ''), cp = new URL(o.chapter).pathname.replace(/\/+$/, '');
    const wsegs = wp.split('/').filter(Boolean), slug = wsegs[wsegs.length - 1];
    const csegs = cp.split('/').filter(Boolean), last = csegs[csegs.length - 1];
    const num = /^\d+$/.test(last) ? +last : null;
    if (!slug || num == null) return null;
    const J = async u => { try { const r = await x.req(u, { headers: { Accept: 'application/json' } }); if (r.status >= 400) return null; const t = String(r.text || '').trim(); if (t[0] !== '{' && t[0] !== '[') return null; return JSON.parse(t); } catch (e) { return null; } };
    const chapPageText = String(o.chapterText || '');
    // قواعد الأساس: نفس الأصل، api.<نطاق>، وأي api.* مذكور في الصفحة
    const bases = [home, 'https://api.' + host];
    (o.hints || []).forEach(b => { if (!bases.includes(b)) bases.push(b); });
    // كتالوج مستخرج من تحليل ~650 إضافة (lnreader-plugins وlightnovel-crawler): بادئات وأسماء REST الأكثر استعمالاً، مرتّبة بالشيوع
    const pre = ['/api', '/api/v1', '/api/v2', '/api/public', '/api/new/v2', '/api/v1/content', '/api/content', ''];
    const nouns = ['novels', 'novel', 'works', 'series', 'books', 'titles', 'stories', 'book'];
    const cnouns = ['chapters', 'chapter', 'episodes'];
    const dl = Date.now() + 40000;
    const ordered = fn => { const out = []; for (const p of pre) for (const n of nouns) for (const b of bases) fn(b, p, n, out); return out; };

    // 1) واجهة العمل
    say('البحث عن واجهة العمل…');
    const wlist = []; ordered((b, p, n, out) => { for (const sl of ['/', '']) wlist.push({ t: b + p + '/' + n + '/{slug}' + sl, b, p, n }); });
    const okWork = (r, u) => {
      for (const [obj, wrap] of [[r, ''], [r && r.data, 'data']]) { if (!obj || Array.isArray(obj) || typeof obj !== 'object') continue; const tk = firstKey(obj, titleKeys); if (tk && typeof val(obj, tk) === 'string' && (firstKey(obj, sumKeys) || firstKey(obj, covKeys))) return { r: obj, wrap, m: wlist.find(w => w.t.replace('{slug}', slug) === u) }; }
      return null;
    };
    const work = await find(wlist.map(w => w.t.replace('{slug}', slug)), J, okWork, dl);
    if (!work) return null;
    const m = work.m, W = work.r;
    const prof = { name: '', src: 'اكتشاف تلقائي', listings: [['latest', 'الأحدث']], slugRe: '^' + wsegs.slice(0, -1).map(s => '/' + esc(s)).join('') + '/([^/]+)', item: {} };
    const pfx = work.wrap ? work.wrap + '.' : '';
    prof.workApi = { url: m.t, title: titleKeys.filter(k => has(W, k)).map(k => pfx + k).join('||'), summary: sumKeys.filter(k => has(W, k)).map(k => pfx + k).join('||'), cover: covKeys.filter(k => has(W, k)).map(k => pfx + k).join('||') };
    const ck = firstKey(W, covKeys), cv = ck ? String(val(W, ck)) : '';
    prof.coverBase = cv && !/^https?:/.test(cv) ? (/^\/media|^\/uploads|^\/storage|^\/static|^\/images?/.test(cv) || m.b !== home ? m.b + '/' : home + '/') : '';
    prof.workUrl = home + wsegs.slice(0, -1).map(s => '/' + s).join('') + '/{slug}';
    prof.chapterUrl = home + csegs.slice(0, -2).map(s => '/' + s).join('') + '/{slug}/{n}';
    const cstem = csegs.slice(0, -2).map(s => '/' + esc(s)).join('');
    prof.chapRe = '^' + cstem + '/[^/]+/(\\d+)/?$';
    // 2) نص الفصل
    say('البحث عن واجهة نص الفصل…');
    const clist = [];
    ordered((b, p, nn, out) => { for (const n of cnouns) for (const t of [b + p + '/' + n + '/{slug}/{n}/', b + p + '/' + n + '/{slug}/{n}', b + p + '/' + nn + '/{slug}/' + n + '/{n}/', b + p + '/' + nn + '/{slug}/' + n + '/{n}', b + p + '/' + nn + '/{slug}/' + n + '/{n}/content']) clist.push(t); });
    const cuniq = Array.from(new Set(clist));
    const okContent = (r, u) => { if (Array.isArray(r) || typeof r !== 'object') return null; for (const kk of txtKeys.filter(k => has(r, k))) { const f = plain(flat(val(r, kk))); if (f.length > 200 && arRatio(f) > 0.3) return { t: u, key: kk, r, f }; } return null; };
    const content0 = await find(cuniq.map(t => t.replace('{slug}', slug).replace('{n}', num)), J, okContent, dl);
    const content = content0 && Object.assign(content0, { t: cuniq.find(t => t.replace('{slug}', slug).replace('{n}', num) === content0.t) });
    if (!content) return null;
    if (chapPageText && content.f.length > 60) { const snip = content.f.slice(10, 40).replace(/\s+/g, ' '); prof.verified = chapPageText.replace(/\s+/g, ' ').indexOf(snip) >= 0; }
    prof.content = { url: content.t, path: content.key, title: firstKey(content.r, chTitleKeys) || '' };
    if (/ا[إأآ]ل/.test(content.f)) prof.fixLam = true;
    // 3) قائمة الفصول
    say('البحث عن قائمة الفصول…');
    const llist = [];
    ordered((b, p, nn, out) => { for (const n of cnouns) for (const t of [b + p + '/' + n + '/{slug}/?ordering=number&page={page}', b + p + '/' + n + '/{slug}/?page={page}', b + p + '/' + nn + '/{slug}/' + n + '/?page={page}', b + p + '/' + nn + '/{slug}/' + n + '?page={page}', b + p + '/' + nn + '/{slug}/' + n, b + p + '/' + nn + '/' + n + '-list/{slug}', b + p + '/' + nn + '/chapter-list/{slug}', b + p + '/' + n + '/?novel={slug}&page={page}']) llist.push(t); });
    const luniq = Array.from(new Set(llist));
    const okChap = (r, u) => { const arr = Array.isArray(r) ? r : resKeys.map(k => val(r, k)).find(Array.isArray); if (!arr || !arr.length || typeof arr[0] !== 'object') return null; const nk = firstKey(arr[0], numKeys); if (!nk || (typeof val(arr[0], nk) !== 'number' && !/^\d+$/.test(String(val(arr[0], nk))))) return null; return { t: luniq.find(t => t.replace('{slug}', slug).replace('{page}', 1) === u), r, arr, nk, resKey: Array.isArray(r) ? '' : resKeys.find(k => Array.isArray(val(r, k))) }; };
    const chap = await find(luniq.map(t => t.replace('{slug}', slug).replace('{page}', 1)), J, okChap, dl);
    if (!chap) return null;
    const a0 = chap.arr[0], ck2 = firstKey(r0(chap.r), countKeys);
    function r0(r) { return Array.isArray(r) ? {} : r; }
    prof.chapters = { url: chap.t, per: chap.arr.length, count: ck2 || '', res: chap.resKey || '', num: chap.nk, title: firstKey(a0, chTitleKeys) || '', date: firstKey(a0, dateKeys) || '', side: 0 };
    if (!ck2) { prof.chapters.per = 0; }
    // نقطة «كل الفصول» دفعة واحدة (نمط شائع: .../chapters/{slug}/all)
    { const bu = chap.t.split('?')[0].replace(/\/+$/, ''); for (const av of [bu + '/all', bu + '/all/']) { const aj = await J(av.replace('{slug}', slug)); const al = aj && (Array.isArray(aj) ? aj : val(aj, chap.resKey)); if (al && al.length >= chap.arr.length && typeof al[0] === 'object' && has(al[0], chap.nk)) { prof.chapters.all = av; break; } } }
    // القصص الجانبية: أرقام كبيرة منفصلة في آخر صفحة
    if (ck2) { const total = +val(chap.r, ck2), per = chap.arr.length, pg = Math.ceil(total / per); if (pg > 1) { const lj = await J(chap.t.replace('{slug}', slug).replace('{page}', pg)); const la = lj && (Array.isArray(lj) ? lj : val(lj, chap.resKey)); if (la && la.length) { const ns = la.map(c => +val(c, chap.nk)); if (Math.max.apply(0, ns) >= 10000 && Math.max.apply(0, ns) > 10 * Math.min.apply(0, ns)) prof.chapters.side = 10000 * Math.floor(Math.min.apply(0, ns.filter(n => n >= 10000)) / 10000) || 0; } } }
    if (!prof.chapters.side) delete prof.chapters.side;
    // 4) المكتبة والبحث
    say('البحث عن قائمة الأعمال والبحث…');
    const libT = []; ordered((b, p, n, out) => { libT.push(b + p + '/' + n + '/?page={page}', b + p + '/' + n + '?page={page}'); });
    const libU = Array.from(new Set(libT));
    const lib0 = await find(libU.map(t => t.replace('{page}', 1)), J, (r, u) => { const arr = Array.isArray(r) ? r : resKeys.map(k => val(r, k)).find(Array.isArray); if (!arr || !arr.length || typeof arr[0] !== 'object' || !has(arr[0], 'slug')) return null; return { t: libU.find(t => t.replace('{page}', 1) === u), arr, res: Array.isArray(r) ? '' : resKeys.find(k => Array.isArray(val(r, k))), r }; }, dl);
    const lib = lib0;
    if (lib) {
      const it = lib.arr[0];
      prof.list = { latest: lib.t.indexOf('{page}') >= 0 ? lib.t : lib.t + '?page={page}' };
      prof.listRes = lib.res || ''; prof.listNext = firstKey(r0(lib.r), nextKeys) || 'next';
      prof.item = { slug: 'slug', title: titleKeys.filter(k => has(it, k)).join('||'), cover: covKeys.filter(k => has(it, k)).join('||') };
      const base = prof.list.latest.split('?')[0];
      const sqs = ['?search={q}&page={page}', '?q={q}&page={page}', '?query={q}&page={page}', '?s={q}&page={page}'].map(q => base + q);
      for (const b of bases) for (const p of ['/api', '/api/v1', '/api/public']) sqs.push(b + p + '/search?q={q}&page={page}', b + p + '/search?query={q}&page={page}', b + p + '/novels/search?q={q}&page={page}');
      for (const full of sqs) {
        const wt = String(val(W, titleKeys.find(k => has(W, k)) || '') || '').slice(0, 40);
        let sr = null; for (const qq of [wt, slug.replace(/-/g, ' ')].filter(Boolean)) { sr = await J(full.replace('{q}', encodeURIComponent(qq)).replace('{page}', 1)); const sx = sr && (Array.isArray(sr) ? sr : resKeys.map(k => val(sr, k)).find(Array.isArray)); if (sx && sx.some(e => e && e.slug === slug)) break; }
        const sa = sr && (Array.isArray(sr) ? sr : resKeys.map(k => val(sr, k)).find(Array.isArray));
        if (sa && sa.some(e => e && e.slug === slug)) { prof.list.search = full; break; }
      }
    }
    return prof;
  }
  global.NovelApiDisc = { discover };
})(window);
