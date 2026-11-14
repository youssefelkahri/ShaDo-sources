// MangaDar (mangadar.com) — custom Alpine.js theme, not Madara.
// Works:    /manga/{slug}/        Chapters: /manga/{slug}/{n}/
// Search:   /?s={q}&post_type=manga
// Images:   signed per-image URLs  /?mdrs=1&c={chapterId}&i={n}&exp=…&pnonce=…&sig=…  read from the chapter page.
const H = S.home.replace(/\/+$/, '');
const segs = u => X.segs(u);
const slugOf = u => { const s = segs(u); return s[0] === 'manga' && s[1] ? s[1] : null; };
const clean = s => String(s || '').replace(/\\\//g, '/').replace(/\\u0026/g, '&').replace(/&amp;/g, '&');

function cards(d) {
  const m = new Map();
  d.querySelectorAll('a[href*="/manga/"]').forEach(a => {
    const u = X.abs(a.getAttribute('href'), d.__url || H + '/');
    if (!u) return;
    const s = segs(u);
    if (s[0] !== 'manga' || s.length !== 2) return;
    const box = a.closest('article, li, .swiper-slide, div');
    const img = a.querySelector('img') || (box && box.querySelector('img'));
    const title = (X.t(a) || a.getAttribute('title') || (img && img.getAttribute('alt')) || '').trim();
    const url = H + '/manga/' + s[1] + '/';
    const o = m.get(url) || { url, title: '', cover: '' };
    if (!o.title && title) o.title = title.slice(0, 150);
    if (!o.cover && img) o.cover = X.img(img, d.__url || H + '/') || '';
    m.set(url, o);
  });
  return Array.from(m.values()).filter(o => o.title);
}

return {
  isChapter: u => { const s = segs(u); return s[0] === 'manga' && s.length >= 3; },
  mangaOf: u => { const s = segs(u); return s[0] === 'manga' && s[1] ? H + '/manga/' + s[1] + '/' : null; },

  async list(a) {
    const page = a.page || 1;
    const pg = page > 1 ? 'page/' + page + '/' : '';
    if (a.q) {
      const d = await X.html(H + '/' + pg + '?s=' + encodeURIComponent(a.q) + '&post_type=manga');
      const items = cards(d);
      return { items, hasNext: items.length >= 10 };
    }
    let d = await X.html(H + '/manga/' + pg);
    let items = cards(d);
    if (!items.length && page === 1) { d = await X.html(H + '/'); items = cards(d); return { items, hasNext: false }; }
    return { items, hasNext: items.length >= 10 };
  },

  async manga(url) {
    const slug = slugOf(url);
    const mu = H + '/manga/' + slug + '/';
    const raw = await X.text(mu);
    const d = X.parse(raw, mu);
    const og = p => (d.querySelector('meta[property="og:' + p + '"]') || {}).content || '';
    const title = (X.t(d.querySelector('h1')) || og('title'))
      .replace(/^جميع فصول مانجا\s*/, '').replace(/\s*مترجمة.*$/, '').replace(/\s*-\s*MangaDar\s*$/i, '').trim();
    const r = {
      url: mu,
      title,
      cover: og('image') || X.img(d.querySelector('img'), mu) || '',
      summary: ((d.querySelector('meta[name="description"]') || {}).content || og('description')).slice(0, 2000),
      genres: Array.from(d.querySelectorAll('a[href*="/genre/"], a[href*="/manga-genre/"]')).map(X.t).filter(Boolean),
      status: '',
    };
    // Chapter numbers: from links and from any JSON the page carries (Alpine x-data / scripts).
    const text = clean(raw);
    const esc = slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = new RegExp('/manga/' + esc + '/(\\d+(?:\\.\\d+)?)/', 'g');
    const nums = new Set();
    let m;
    while ((m = rx.exec(text))) nums.add(m[1]);
    r.chapters = Array.from(nums)
      .map(n => ({ url: mu + n + '/', title: 'الفصل ' + n, num: parseFloat(n), date: '' }))
      .sort((x, y) => y.num - x.num);
    return r;
  },

  async chapter(url) {
    const raw = await X.text(url);
    const text = clean(raw);
    const idx = u => { const k = /[?&]i=(\d+)/.exec(u); return k ? +k[1] : 0; };
    // 1) Signed image URLs written in the page.
    let imgs = (text.match(/(?:https?:\/\/[^"'\s<>]*)?\/?\?mdrs=1[^"'\s<>)]*/g) || [])
      .map(u => X.abs(u, H + '/')).filter(Boolean);
    imgs = Array.from(new Set(imgs)).sort((a, b) => idx(a) - idx(b));
    if (imgs.length) return { images: imgs };
    // 2) Signatures kept as data (pnonce/sig per page): rebuild the URLs.
    const cId = (/"c(?:hapter_?id)?"\s*:\s*"?(\d+)/.exec(text) || [])[1];
    const exp = (/"exp"\s*:\s*"?(\d+)/.exec(text) || [])[1];
    const nonces = Array.from(text.matchAll(/"pnonce"\s*:\s*"([a-f0-9]+)"/g)).map(x => x[1]);
    const sigs = Array.from(text.matchAll(/"sig"\s*:\s*"([A-Za-z0-9_\-]+)"/g)).map(x => x[1]);
    if (cId && exp && nonces.length && nonces.length === sigs.length) {
      return { images: nonces.map((p, i) => H + '/?mdrs=1&c=' + cId + '&i=' + i + '&exp=' + exp + '&pnonce=' + p + '&sig=' + sigs[i]) };
    }
    // 3) Plain uploaded images inside the reader.
    const d = X.parse(raw, url);
    const plain = Array.from(d.querySelectorAll('img')).map(i => X.img(i, url))
      .filter(u => u && /\/wp-content\/uploads\//.test(u) && !/cover|avatar|logo|cosmetics|-1[05]0x1[05]0/.test(u));
    return { images: Array.from(new Set(plain)) };
  },
};
