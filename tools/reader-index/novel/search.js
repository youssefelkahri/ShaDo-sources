'use strict';
/* sources/search.js — بحث متعدد المسارات + متصفح خفي (من Apk-reader-epub) */
NovelKit.add('search', K => {
  const global = window;
  const { X, selA, scoreTitle } = K;
  const BAD_PATH = /(chapter|chap|category|categories|tag|genre|genres|author|page|feed|wp-|login|register|contact|privacy|about|terms|dmca|search|user|account|explore|latest|popular|newest|\/ch-?\d|[?#])/i;
  function looseLinks(d, base) {
    const bh = new URL(base).hostname.replace(/^www\./, ''), m = new Map();
    selA(d, 'a[href]').forEach(a => {
      const u = X.abs(a.getAttribute('href'), base); if (!u) return; let x; try { x = new URL(u); } catch (e) { return; }
      if (x.hostname.replace(/^www\./, '') !== bh || x.pathname.length < 3 || BAD_PATH.test(x.pathname)) return;
      const img = a.querySelector('img') || (a.parentElement && a.parentElement.querySelector('img'));
      const card = a.closest('article,li,.post,.item,.card,.bs,.bsx,.c-tabs-item__content,.page-item-detail,[class*=search],[class*=result],[class*=manga],[class*=novel]');
      if (!img && !card && !a.querySelector('h1,h2,h3,h4,h5')) return;
      const h = a.querySelector('h1,h2,h3,h4,h5,[class*=title],[class*=name]');
      const t = (a.getAttribute('title') || X.t(h) || (img && img.getAttribute('alt')) || X.t(a)).replace(/^(مستمرة|مكتملة|متوقفة|جديد|حصري)\s*/, '').trim().slice(0, 90);
      if (!t || t.length < 2) return;
      const key = x.origin + x.pathname.replace(/\/$/, ''), cur = m.get(key) || { url: x.origin + x.pathname, title: '', cover: '' };
      if (!cur.title) cur.title = t; if (!cur.cover && img) cur.cover = X.img(img, base) || '';
      m.set(key, cur);
    });
    return Array.from(m.values());
  }
  function jsonHits(txt, o) {
    let j; try { j = JSON.parse(txt); } catch (e) { return []; }
    const arr = Array.isArray(j) ? j : (j && Array.isArray(j.data) ? j.data : (j && Array.isArray(j.results) ? j.results : (j && Array.isArray(j.series) ? j.series : (j && Array.isArray(j.novels) ? j.novels : (j && j.data && Array.isArray(j.data.novels) ? j.data.novels : (j && Array.isArray(j.items) ? j.items : []))))));
    const out = [];
    for (const it of arr) {
      if (!it || typeof it !== 'object') continue;
      const url = it.url || it.link || it.permalink || (it.slug ? o + '/novel/' + it.slug : ''), t = String((it.title && (it.title.rendered || it.title)) || it.name || it.title_ar || '').replace(/<[^>]+>/g, '').trim();
      if (!it.cover && (it.coverUrl || it.cover_url || it.image_url)) it.cover = it.coverUrl || it.cover_url || it.image_url;
      if (!url || !t || /chapter|\/ch-?\d/i.test(url) || it.subtype === 'chapter') continue;
      out.push({ url, title: t, cover: (typeof it.thumbnail === 'string' && it.thumbnail) || (typeof it.image === 'string' && it.image) || (typeof it.cover === 'string' && it.cover) || '' });
    }
    return out;
  }
  // الطلبات الأصلية تمرّ عبر 6 خيوط فقط: نُجري البحث على مراحل صغيرة ونتوقف عند أول نتائج (لا نغرق الخيوط بعشرات الطلبات)
  let wvChain = Promise.resolve();   // المتصفح الخفي واحد: عمليات البحث به تُنفَّذ بالتتابع
  X.siteSearch = async function (S, q, extra) {
    const origin = new URL(S.home).origin, b = S.home.replace(/\/+$/, ''), e = encodeURIComponent(q);
    const tiers = [
      [].concat(extra || [], [origin + '/?s=' + e + '&post_type=wp-manga', origin + '/?s=' + e]),
      [b + '/?s=' + e, b + '/search?q=' + e, b + '/search?query=' + e, b + '/search?search=' + e],
      [b + '/search?keyword=' + e, b + '/search?title=' + e, b + '/search?name=' + e, b + '/search/' + e, origin + '/wp-json/wp/v2/search?search=' + e + '&per_page=20', origin + '/wp-json/wp/v2/series?search=' + e + '&per_page=20', origin + '/api/search?q=' + e, origin + '/api/novels?search=' + e, origin + '/api/novels/search?q=' + e],
    ];
    const hits = new Map(), done = new Set(); let anyOk = false, lastErr = null;
    const add = list => list.forEach(r => { const k = r.url.replace(/\/$/, ''), sc = scoreTitle(r.title, q), cur = hits.get(k); if (!cur || sc > cur.sc || (!cur.cover && r.cover)) hits.set(k, Object.assign({}, cur || {}, r, { sc: Math.max(sc, cur ? cur.sc : 0), cover: r.cover || (cur && cur.cover) || '' })); });
    const good = () => Array.from(hits.values()).filter(r => r.sc >= 0.5).sort((a, c) => c.sc - a.sc);
    const getT = async u => { try { const r = await X.req(u, { html: true, timeout: 15000 }); if (r.status < 400) { anyOk = true; return r; } } catch (er) { lastErr = er; } return null; };
    for (const tier of tiers) {
      const us = tier.filter(u => !done.has(u)); us.forEach(u => done.add(u));
      await Promise.all(us.map(u => getT(u).then(r => { if (!r) return; if (/wp-json|\/api\//.test(u)) add(jsonHits(r.text, origin)); else add(looseLinks(X.parse(r.text, r.url || u), r.url || u)); })));
      if (good().length) break;
    }
    let list = good();
    if (!list.length && global.NovelFetch.hasNative()) {
      // النتائج تُرسم بالجافاسكربت (أو الموقع محمي): متصفح خفي يكتب الكلمة في مربع البحث
      const surl = (extra || []).find(u => /search|\?s=/.test(u)) || b + '/search?q=' + e;
      const job = wvChain.then(() => global.NovelFetch.getList(surl, { query: q, force: true })).then(r => { anyOk = true; add((r.items || []).map(x => ({ url: x.url, title: x.title, cover: x.cover || '' }))); }, er => { lastErr = er; });
      wvChain = job.catch(() => { });
      await job;
      list = good();
    }
    if (!list.length && !anyOk && lastErr) throw lastErr;
    return list.map(r => ({ url: r.url, title: r.title, cover: r.cover || '', latest: '' }));
  };
});
