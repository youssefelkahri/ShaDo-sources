'use strict';
/* kits/video/video-kit.js — نواة مصادر الفيديو المشتركة (مستقلة عن المنصّة).
 * ShadoVideo.create({ net, capture?, knowledge?, log? }) -> kit
 *   net.get(url, { headers, method, body })  -> { status, body, url, headers }   (يحقنها التطبيق: fetch أو الوسيط الأصلي)
 *   capture(url, { timeout })                -> [روابط m3u8/mp4]               (WebView مخفي؛ اختياري)
 *   knowledge = { hosters, patterns }        (محتوى knowledge/video/*.json؛ اختياري، لدينا نسخة مدمجة)
 * الطبقات: API ← قالب معروف (iframes/DooPlay) مع مستخرج الخادم ← التقاط الشبكة. والتحقق من الرابط قبل اعتماده. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.ShadoVideo = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const BAD = /\.(jpg|jpeg|png|gif|webp|vtt|srt|css|js|svg|ico)(\?|$)|thumb|poster|preview|sprite/i;
  const abs = (u, base) => { try { if (u.startsWith('//')) u = 'https:' + u; return new URL(u.replace(/\\\//g, '/'), base).href; } catch (e) { return ''; } };
  const origin = u => { try { return new URL(u).origin; } catch (e) { return ''; } };
  const baseName = h => String(h).toLowerCase().replace(/^www\./, '').split('.').slice(-2, -1)[0] || '';
  const b64 = s => { try { return typeof atob === 'function' ? atob(s) : Buffer.from(s, 'base64').toString('binary'); } catch (e) { return ''; } };

  // ---------- فك p.a.c.k.e.r ----------
  function unpackOne(src) {
    const m = src.match(/}\s*\(\s*'([\s\S]*?)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'([\s\S]*?)'\.split\('\|'\)/);
    if (!m) return '';
    let p = m[1]; const a = +m[2]; let c = +m[3]; const k = m[4].split('|');
    const enc = n => (n < a ? '' : enc(Math.floor(n / a))) + ((n = n % a) > 35 ? String.fromCharCode(n + 29) : n.toString(36));
    const dict = {};
    while (c--) dict[enc(c)] = k[c] || enc(c);
    return p.replace(/\\'/g, "'").replace(/\b\w+\b/g, w => (w in dict ? dict[w] : w));
  }
  function unpackAll(html) {
    let out = ''; const rx = /eval\(function\(p,a,c,k,e,[dr]\)[\s\S]*?\.split\('\|'\)[^)]*\)\)/g; let m;
    while ((m = rx.exec(html))) { try { out += '\n' + unpackOne(m[0]); } catch (e) { } }
    return out;
  }

  // ---------- العثور على روابط الوسائط في نص ----------
  function findMedia(text, base) {
    const found = [];
    const rxs = [
      /(?:file|src|source|video_url|hls|url)\s*["']?\s*[:=]\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/gi,
      /sources\s*:\s*\[\s*["']([^"']+)["']/gi,
      /<source[^>]+src=["']([^"']+)["']/gi,
      /["']?(?:hls\d?|hls_url|stream_url|m3u8)["']?\s*[:=]\s*["']([^"']+)["']/gi,
      /player\.src\(\s*(?:\{\s*src\s*:\s*)?["']([^"']+)["']/gi,
      /["'](https?:\\?\/\\?\/[^"'\s]+\.(?:m3u8|mp4)(?:\?[^"'\s]*)?)["']/gi,
    ];
    for (const rx of rxs) { let m; while ((m = rx.exec(text))) { const u = abs(m[1], base); if (u && /^https?:/.test(u) && !BAD.test(u)) found.push(u); } }
    const uniq = [...new Set(found)];
    uniq.sort((x, y) => (/\.m3u8/.test(y) ? 1 : 0) - (/\.m3u8/.test(x) ? 1 : 0));
    return uniq;
  }
  const iframeOf = (html, base) => { const m = html.match(/<iframe[^>]+src=["']([^"']+)["']/i); return m ? abs(m[1], base) : ''; };

  // ---------- المعرفة المدمجة (تُستبدل بـ knowledge/video/hosters.json إن مُرِّر) ----------
  const BUILTIN_HOSTERS = [
    ['streamtape', ['streamtape']], ['dood', ['dood', 'd0o0d']], ['mixdrop', ['mixdrop']], ['okru', ['ok.ru', 'okru']],
    ['streamwish', ['streamwish', 'hgcloud', 'hgplaycdn', 'hglamioz', 'niramirus', 'playnixes', 'medixiru', 'hanerix', 'audinifer', 'vibuxer', 'masukestin']],
    ['filemoon', ['filemoon']], ['filelions', ['filelions']], ['lulustream', ['lulustream', 'luluvdo', 'luluvid']], ['mp4upload', ['mp4upload']],
    ['uqload', ['uqload']], ['voe', ['voe.sx', 'voe-', 'tubeless', 'simpulumlamerop', 'urochsunloath', 'metagnathtuggers']], ['upstream', ['upstream']], ['earnvids', ['earnvids']], ['vidtube', ['vidtube', 'vidoba', 'mp4plus', 'anafast', 'aflam', 'reviewrate', 'vidspeed', '1vid']],
  ];

  function create(opts) {
    opts = opts || {};
    const net = opts.net, capture = opts.capture || null, logf = opts.log || (() => { });
    const K = opts.knowledge || {};
    const hosters = (K.hosters && K.hosters.hosters)
      ? K.hosters.hosters.map(h => [h.id, h.domains.map(d => baseName(d) || d)])
      : BUILTIN_HOSTERS;
    const UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
    const TMO = opts.timeout || 15000;
    const get = async (url, o) => {
      o = o || {}; o.headers = Object.assign({ 'User-Agent': UA }, o.headers || {});
      let t; const lim = new Promise((_, rej) => { t = setTimeout(() => rej(new Error('انتهت المهلة (' + Math.round(TMO / 1000) + 'ث)')), TMO); });
      try { return await Promise.race([net.get(url, o), lim]); } finally { clearTimeout(t); }
    };
    const okr = r => r && r.status < 400 && r.body;
    const cf = b => /just a moment|cf-chl|challenge-platform/i.test(String(b || '').slice(0, 4000));

    function hosterOf(url) {
      let h = ''; try { h = new URL(url).hostname.toLowerCase(); } catch (e) { return ''; }
      for (const [id, keys] of hosters) if (keys.some(k => h.includes(k))) return id;
      return '';
    }

    // ---------- مستخرجات خاصة ----------
    const special = {
      async streamtape(url) {
        const r = await get(url); if (!okr(r)) return null;
        const line = r.body.split('\n').find(l => l.includes("botlink').innerHTML")) || r.body.split('\n').find(l => l.includes('robotlink'));
        if (!line) return null;
        const expr = (line.split(').innerHTML')[1] || line.split('innerHTML')[1] || '').replace(/^\s*=\s*/, '').replace(/;\s*$/, '');
        let out = '';
        for (const part of expr.split('+')) {
          const m = part.match(/['"]([^'"]*)['"]\)?((?:\.substring\(\d+\))*)/); if (!m) continue;
          let s = m[1]; for (const k of m[2].matchAll(/\.substring\((\d+)\)/g)) s = s.substring(+k[1]); out += s;
        }
        return out ? { url: 'https:' + out.replace(/^https?:/, '') + '&stream=1', headers: { Referer: url }, type: 'mp4' } : null;
      },
      async dood(url) {
        const e = url.replace('/d/', '/e/'); const r = await get(e); if (!okr(r)) return null;
        const host = origin(r.url || e); const md5 = (r.body.match(/\/pass_md5\/[^'"]*/) || [])[0]; if (!md5) return null;
        const p = await get(host + md5, { headers: { Referer: r.url || e } }); if (!okr(p)) return null;
        const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        const rand = Array.from({ length: 10 }, () => abc[Math.floor(Math.random() * abc.length)]).join('');
        return { url: p.body.trim() + rand + '?token=' + md5.split('/').pop() + '&expiry=' + Date.now(), headers: { Referer: host + '/' }, type: 'mp4' };
      },
      async mixdrop(url) {
        const r = await get(url.replace('/f/', '/e/')); if (!okr(r)) return null;
        const link = ((unpackAll(r.body).match(/wurl.*?=.*?"(.*?)";/)) || [])[1];
        return link ? { url: abs(link, url), headers: { Referer: url }, type: 'mp4' } : null;
      },
    };

    special.okru = async function (url) {
      const r = await get(url.replace('/video/', '/videoembed/'), { headers: { Origin: 'https://ok.ru' } }); if (!okr(r)) return null;
      const t = r.body.replace(/\\&quot;/g, '"').replace(/&quot;/g, '"').replace(/\\\\/g, '\\').replace(/\\u([0-9A-Fa-f]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
      const hls = (t.match(/"hlsManifestUrl":"([^"]+)"/) || [])[1]; if (hls) return { url: hls.replace(/\\\//g, '/'), headers: { Referer: 'https://ok.ru/' }, type: 'hls' };
      const m = t.match(/"videos":(\[[^\]]*\])/); if (!m) return null; let v = []; try { v = JSON.parse(m[1]); } catch (e) { return null; }
      const rank = ['ultra', 'quad', 'full', 'hd', 'sd', 'low', 'lowest', 'mobile']; v.sort((a, b) => rank.indexOf(a.name) - rank.indexOf(b.name));
      return v[0] && v[0].url ? { url: abs(v[0].url, url), headers: { Referer: 'https://ok.ru/' }, type: 'mp4' } : null;
    };
    special.mp4upload = async function (url) {
      const id = (url.match(/mp4upload\.com\/(?:embed-)?([a-z0-9]+)/i) || [])[1]; if (!id) return null;
      const e = 'https://www.mp4upload.com/embed-' + id + '.html'; const r = await get(e, { headers: { Referer: 'https://www.mp4upload.com/' } }); if (!okr(r)) return null;
      const u = findMedia(r.body + unpackAll(r.body), e)[0]; return u ? { url: u, headers: { Referer: 'https://www.mp4upload.com/' }, type: 'mp4' } : null;
    };
    special.voe = async function (url) {
      let r = await get(url); if (!okr(r)) return null; const red = (r.body.match(/window\.location\.href\s*=\s*'([^']+)';/) || [])[1]; if (red) r = await get(red); if (!okr(r)) return null;
      const enc = (r.body.match(/<script type="application\/json">\s*\["([\s\S]*?)"\]\s*<\/script>/) || [])[1]; if (!enc) { const u = findMedia(r.body, url)[0]; return u ? { url: u, headers: { Referer: origin(url) + '/' }, type: /\.m3u8/.test(u) ? 'hls' : 'mp4' } : null; }
      try {
        let x = enc.replace(/[a-zA-Z]/g, c => String.fromCharCode(((c <= 'Z' ? 90 : 122) >= (c = c.charCodeAt(0) + 13) ? c : c - 26)));
        for (const k of ['@$', '^^', '~@', '%?', '*~', '!!', '#&']) x = x.split(k).join('_'); x = x.split('_').join('');
        x = b64(x); x = x.split('').map(c => String.fromCharCode(c.charCodeAt(0) - 3)).join(''); x = b64(x.split('').reverse().join(''));
        const j = JSON.parse(x); const u = j.source || j.direct_access_url; return u ? { url: u, headers: { Referer: origin(url) + '/' }, type: /\.m3u8/.test(u) ? 'hls' : 'mp4' } : null;
      } catch (e) { return null; }
    };
    // ---------- استخراج رابط من صفحة تضمين ----------
    async function extractEmbed(embed, referer, depth) {
      depth = depth || 0;
      const id = hosterOf(embed);
      if (depth === 0 && special[id]) { try { const s = await special[id](embed); if (s && s.url) return Object.assign({ via: id }, s); } catch (e) { } }
      const r = await get(embed, { headers: referer ? { Referer: referer } : {} });
      if (!r || r.status >= 400) throw new Error('HTTP ' + (r && r.status || '?'));
      const html = r.body || '';
      if (cf(html)) { const e = new Error('cloudflare'); e.cf = true; throw e; }
      let all = html + unpackAll(html);
      // نصوص مشفّرة بسيطة: atob("..") و\uXXXX و\xXX
      for (const m of html.matchAll(/atob\(\s*["']([A-Za-z0-9+\/=]{20,})["']\s*\)/g)) all += '\n' + b64(m[1]);
      if (/\\u00|\\x[0-9a-f]{2}/i.test(all)) all += '\n' + all.replace(/\\u([0-9a-f]{4})/gi, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/\\x([0-9a-f]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
      const urls = findMedia(all, embed);
      if (urls.length) { const o = origin(embed); return { url: urls[0], all: urls, headers: { Referer: o + '/', Origin: o }, type: /\.m3u8/.test(urls[0]) ? 'hls' : 'mp4', via: id || 'generic' }; }
      const inner = depth < 2 && iframeOf(html, embed);
      if (inner && inner !== embed) return extractEmbed(inner, embed, depth + 1);
      const marks = ['eval(', 'atob(', 'player_token', 'm3u8', 'jwplayer', 'sources', 'hls', 'fetch(', 'XMLHttpRequest', 'data-url', 'video_player'].filter(k => html.includes(k));
      throw new Error('لا وسائط · ' + r.status + ' · ' + html.length + 'B' + (marks.length ? ' · ' + marks.join(',') : ''));
    }

    // ---------- خوادم الحلقة من صفحتها ----------
    function serversFromPage(html, pageUrl) {
      const out = [], seen = new Set();
      const add = (url, name, via) => { url = abs(url, pageUrl); if (!url || !/^https?:/.test(url) || seen.has(url) || url === pageUrl) return; seen.add(url); out.push({ url, name: name || hosterOf(url) || baseName(new URL(url).hostname), via }); };
      let m;
      const rxI = /<iframe[^>]+(?:data-src|data-lazy-src|src)=["']([^"']+)["']/gi; while ((m = rxI.exec(html))) add(m[1], '', 'iframe');
      const rxT = /player_iframe\.location\.href\s*=\s*['"]([^'"]+)['"]/g; while ((m = rxT.exec(html))) add(m[1], '', 'tabs');
      const rxA = /data-(?:embed-url|embed-id|embed|url|src|link|server|iframe|video|href|watch|stream)=["']([^"']+)["']/gi;
      while ((m = rxA.exec(html))) { let v = m[1]; if (!/^(https?:)?\/\//.test(v) && /^[A-Za-z0-9+\/=]{16,}$/.test(v)) { const d = b64(v); if (/^(https?:)?\/\//.test(d)) v = d; else if (/<iframe/i.test(d)) { const i = iframeOf(d, pageUrl); if (i) v = i; } } if (/^(https?:)?\/\//.test(v)) add(v, '', 'data-attr'); }
      const rxO = /<option[^>]+value=["']([^"']+)["'][^>]*>([^<]*)/gi; while ((m = rxO.exec(html))) { let v = m[1]; if (/^[A-Za-z0-9+\/=]{16,}$/.test(v)) { const d = b64(v); const i = /<iframe/i.test(d) ? iframeOf(d, pageUrl) : (/^https?:/.test(d) ? d : ''); if (i) v = i; } if (/^(https?:)?\/\//.test(v)) add(v, m[2].trim(), 'option'); }
      return out;
    }
    // DooPlay: li[data-nume] + admin-ajax
    function dooplayItems(html) {
      const out = []; const rx = /<li[^>]+(?:id=["']player-option-\d+["'])?[^>]*data-post=["'](\d+)["'][^>]*data-nume=["'](\w+)["'][^>]*data-type=["'](\w+)["'][^>]*>([\s\S]*?)<\/li>/gi; let m;
      while ((m = rx.exec(html))) out.push({ post: m[1], nume: m[2], type: m[3], name: m[4].replace(/<[^>]+>/g, '').trim() });
      if (!out.length) { const rx2 = /data-post=["'](\d+)["'][^>]*data-nume=["'](\w+)["']/gi; while ((m = rx2.exec(html))) out.push({ post: m[1], nume: m[2], type: 'tv', name: '' }); }
      return out;
    }
    async function dooplayServers(pageUrl, html) {
      const items = dooplayItems(html), o = origin(pageUrl), out = [];
      await Promise.all(items.map(async it => {
        try {
          const r = await get(o + '/wp-admin/admin-ajax.php', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest', Referer: pageUrl }, body: 'action=doo_player_ajax&post=' + it.post + '&nume=' + it.nume + '&type=' + it.type });
          if (!okr(r)) return; let u = '';
          try { const j = JSON.parse(r.body); u = j.embed_url || ''; } catch (e) { }
          if (/<iframe/i.test(u)) u = iframeOf(u, pageUrl);
          if (u) { u = abs(u, pageUrl); if (u && !out.some(x => x.url === u)) out.push({ url: u, name: it.name || hosterOf(u), via: 'dooplay' }); }
        } catch (e) { }
      }));
      return out;
    }

    // ---------- التحقق من الرابط ----------
    async function verify(link) {
      const t = Date.now();
      try {
        const r = await get(link.url, { headers: Object.assign({ Range: 'bytes=0-2047' }, link.headers || {}) });
        const ct = String((r.headers && (r.headers['content-type'] || r.headers['Content-Type'])) || '');
        let ok = false;
        if (r && (r.status === 200 || r.status === 206)) {
          if (/\.m3u8|mpegurl/i.test(link.url + ct) || link.type === 'hls') ok = /^\s*#EXTM3U/.test(r.body || '');
          else ok = /video|octet-stream|mp4|mpegurl/i.test(ct) || /ftyp/.test(String(r.body || '').slice(0, 16));
        }
        return { ok, ms: Date.now() - t, status: r && r.status };
      } catch (e) { return { ok: false, ms: Date.now() - t, err: String(e && e.message || e) }; }
    }

    // ---------- تشغيل خوادم الحلقة وتجميع الروابط الصالحة ----------
    async function resolveServers(servers, referer, conc, o) {
      o = o || {}; const res = []; const q = servers.slice(); conc = conc || 6; let done = false; let wake;
      const first = new Promise(r => { wake = r; });
      const cap = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('انتهت المهلة')), ms))]);
      const worker = async () => {
        while (q.length && !done) {
          const s = q.shift(); const t = Date.now(); let link = null, err = '';
          try { link = await cap(extractEmbed(s.url, referer), 12000); } catch (e) { err = String(e && e.message || e); }
          let v = null; if (link && !done) { try { v = await cap(verify(link), 8000); } catch (e) { v = { ok: false }; } }
          const row = { server: s.name, embed: s.url, via: s.via, link, ok: !!(v && v.ok), ms: Date.now() - t, err: link ? (v && v.ok ? '' : 'لا يشتغل') : (err || 'لم يُستخرج') };
          res.push(row); try { o.onRow && o.onRow(row); } catch (e) { }
          if (row.ok && o.early) { done = true; wake(); }
        }
      };
      const all = Promise.all(Array.from({ length: conc }, worker));
      if (o.early) await Promise.race([all, first]); else await all;
      return res.sort((a, b) => (b.ok - a.ok) || (a.ms - b.ms));
    }

    // ---------- الطبقات ----------
    // الطبقة «قالب»: iframes/DooPlay/data-attr
    async function layerTemplate(pageUrl, html, o) {
      const t = Date.now(); let servers = serversFromPage(html, pageUrl); let fam = 'iframe-list';
      if (dooplayItems(html).length) { const d = await dooplayServers(pageUrl, html); if (d.length) { servers = servers.concat(d.filter(x => !servers.some(y => y.url === x.url))); fam = 'dooplay'; } }
      try { o && o.onStage && o.onStage('servers', servers.length, fam); } catch (e) { }
      const results = await resolveServers(servers, pageUrl, 6, o);
      return { layer: 'template', family: fam, ms: Date.now() - t, servers: servers.length, good: results.filter(r => r.ok).length, results };
    }
    // الطبقة «التقاط الشبكة»
    async function layerCapture(pageUrl) {
      if (!capture) return { layer: 'capture', skipped: true, good: 0, results: [] };
      const t = Date.now(); let urls = [];
      try { urls = await capture(pageUrl, { timeout: 40000 }) || []; } catch (e) { }
      const results = [];
      for (const c of urls.slice(0, 4)) { const u = typeof c === 'string' ? c : c.url; const h = { Referer: (c && c.referer) || origin(pageUrl) + '/' }; if (c && c.userAgent) h['User-Agent'] = c.userAgent; const link = { url: u, headers: h, type: /\.m3u8/.test(u) ? 'hls' : 'mp4' }; const v = await verify(link); results.push({ server: 'capture', embed: pageUrl, via: 'capture', link, ok: v.ok, ms: v.ms, err: v.ok ? '' : 'لا يشتغل' }); }
      return { layer: 'capture', ms: Date.now() - t, servers: urls.length, good: results.filter(r => r.ok).length, results };
    }
    // الطبقة «API» (easyplex وأشباهه): كشف فقط عبر نمط public/api
    async function layerApi(home) {
      const o = origin(home); const t = Date.now();
      for (const p of ['/public/api/genres/all', '/api/genres/all']) {
        try { const r = await get(o + p); if (r && r.status === 200 && /^\s*[\[{]/.test(r.body || '')) return { layer: 'api', detected: true, base: o + p.replace('/genres/all', ''), ms: Date.now() - t }; } catch (e) { }
      }
      return { layer: 'api', detected: false, ms: Date.now() - t };
    }

    // حلّ حلقة: نجرّب القالب ثم الالتقاط إن لم نجد شيئاً صالحاً
    async function resolveEpisode(pageUrl, o) {
      o = o || {};
      const r = await get(pageUrl);
      if (!r || r.status >= 400) return { ok: false, error: 'HTTP ' + (r && r.status || '?') };
      if (cf(r.body)) return { ok: false, cf: true, error: 'cloudflare' };
      const useCap = !!capture && o.capture !== false;
      let capP = null; const startCap = () => { if (!capP) { try { o.onStage && o.onStage('capture', 'run'); } catch (e) { } capP = layerCapture(pageUrl); } };
      const timer = useCap ? setTimeout(startCap, o.capDelay === undefined ? 6000 : o.capDelay) : null; // الالتقاط يبدأ بالتوازي إن تأخر القالب
      let html = r.body, page = pageUrl;
      // قفزة «a.xtgo» ونحوها (Bristege): صفحة المشاهدة → صفحة التشغيل، والمُحيل = الصفحة السابقة
      if (!/data-embed-url|data-embed=|watchButton|data-nume|player_iframe/i.test(html)) {
        const hop = /<a[^>]+class=["'][^"']*\bxtgo\b[^"']*["'][^>]*href=["']([^"']+)["']/i.exec(html) || /<a[^>]+href=["']([^"']+)["'][^>]*class=["'][^"']*\bxtgo\b/i.exec(html);
        if (hop) { const u = abs(hop[1].replace(/&amp;/g, '&'), pageUrl); try { const r2 = await get(u, { headers: { Referer: pageUrl } }); if (okr(r2)) { html = r2.body; page = u; } } catch (e) { } }
      }
      const tpl = await layerTemplate(page, html, o); if (timer) clearTimeout(timer);
      const layers = [tpl];
      if (!tpl.good && useCap) { startCap(); layers.push(await capP); }
      else if (capP && !o.early) layers.push(await capP);
      const links = [].concat(...layers.map(l => (l.results || []).filter(x => x.ok).map(x => Object.assign({ layer: l.layer }, x))));
      return { ok: links.length > 0, links, layers };
    }

    // ---------- العثور على حلقة نموذجية من الرئيسية ----------
    async function autoEpisode(home) {
      const diag = { status: 0, len: 0, links: 0, cf: false, tried: 0 };
      const r = await get(home); diag.status = r && r.status || 0; diag.len = String(r && r.body || '').length;
      if (!okr(r)) return { diag };
      if (cf(r.body)) { diag.cf = true; return { diag }; }
      const O = origin(home);
      const SKIP = /\/(category|tag|genre|genres|page|author|login|register|contact|about|privacy|dmca|search|feed|wp-|cdn-cgi|\?s=)|\.(jpg|png|webp|css|js|xml)(\?|$)|^#/i;
      const linksOf = (html, base) => { const out = [], seen = new Set(); let m; const rx = /<a[^>]+href=["']([^"']+)["']/gi; while ((m = rx.exec(html))) { const u = abs(m[1].replace(/&amp;/g, '&'), base); if (!u || origin(u) !== O || u === base || seen.has(u) || SKIP.test(u)) continue; seen.add(u); out.push(u); } return out; };
      const score = u => { let d = ''; try { d = decodeURIComponent(u); } catch (e) { d = u; } let sc = 0; if (/episode|\/ep[-\/]|حلقة|الحلقة|\/watch|مشاهدة|\/video|\/film|\/movie|فيلم|مسلسل|\/series|\/anime/i.test(d)) sc += 3; const path = d.replace(O, '').split('?')[0]; if (path.length > 12) sc += 1; if (path.split('/').filter(Boolean).length >= 2) sc += 1; return sc; };
      const hasPlayer = h => /<iframe|data-nume|player_iframe|data-embed|<video|jwplayer|\.m3u8/i.test(h);
      const l1 = linksOf(r.body, home); diag.links = l1.length;
      const rank = l1.sort((x, y) => score(y) - score(x));
      for (const u of rank.slice(0, 10)) { diag.tried++; try { const p = await get(u); if (okr(p) && !cf(p.body) && hasPlayer(p.body)) return { url: u, html: p.body, how: 'من الرئيسية', diag }; } catch (e) { } }
      for (const u of rank.slice(0, 5)) { try { const p = await get(u); if (!okr(p) || cf(p.body)) continue; const l2 = linksOf(p.body, u).sort((x, y) => score(y) - score(x)); for (const v of l2.slice(0, 5)) { diag.tried++; const q = await get(v); if (okr(q) && !cf(q.body) && hasPlayer(q.body)) return { url: v, html: q.body, how: 'من صفحة عمل', diag }; } } catch (e) { } }
      return { diag };
    }

    // ---------- المولّد: يكفي رابط الموقع (والحلقة اختيارية) ----------
    async function scan(o, on) {
      let to; const dead = new Promise(res => { to = setTimeout(() => { const row = { id: 'timeout', label: 'المهلة الكلية', status: 'fail', detail: 'تجاوز الفحص 75 ثانية — الموقع بطيء أو يحتاج التقاط الشبكة' }; try { on && on(row); } catch (e) { } res({ rows: [row], cfg: null, links: [] }); }, 75000); });
      try { return await Promise.race([scanInner(o, on), dead]); } finally { clearTimeout(to); }
    }
    async function scanInner(o, on) {
      const apiCfg = await detectApi(o);
      if (apiCfg) { const rows = [], push = (id, label, status, detail) => { const x = { id, label, status, detail }; rows.push(x); try { on && on(x); } catch (e) { } }; push('api', 'واجهة API (EasyPlex)', 'ok', apiCfg.base); try { const r = await epSearch(apiCfg, 'a'); push('search', 'بحث', r.length ? 'ok' : 'fail', r.length + ' نتيجة'); if (!r.length) return { rows, cfg: null }; const eps = await epEpisodes(epDec(r[0].url)); const st = await epStream(epDec(eps[0])); push('result', 'النتيجة', 'ok', 'رابط صالح · ' + (/\.m3u8/.test(st.url) ? 'HLS' : 'MP4')); return { rows, cfg: { home: apiCfg.base, family: 'easyplex', api: apiCfg }, links: [st] }; } catch (e) { push('result', 'النتيجة', 'fail', String(e && e.message || e)); return { rows, cfg: null }; } }
      const rows = [], push = (id, label, status, detail) => { const x = { id, label, status, detail }; rows.push(x); try { on && on(x); } catch (e) { } return x; };
      const home = origin(o.home);
      const api = await layerApi(home);
      push('api', 'واجهة API', api.detected ? 'ok' : 'skip', api.detected ? api.base : 'غير مكتشفة');
      let ep = o.episode ? { url: o.episode, how: 'من المستخدم' } : null;
      if (ep) { const p = await get(ep.url); ep.html = okr(p) ? p.body : ''; }
      let dg = null;
      if (!ep) { const f = await autoEpisode(o.home); dg = f && f.diag; ep = f && f.url ? f : null; }
      if (!ep) { push('episode', 'حلقة نموذجية', 'fail', (dg ? 'الرئيسية: HTTP ' + dg.status + ' · ' + dg.len + 'B · ' + dg.links + ' رابط · جُرّب ' + dg.tried + (dg.cf ? ' · Cloudflare' : '') + ' — ' : '') + 'ألصق رابط صفحة مشاهدة'); return { rows, cfg: null }; }
      push('episode', 'حلقة نموذجية', 'ok', ep.how + ': ' + decodeURIComponent(ep.url).slice(0, 50));
      if (cf(ep.html)) { push('cf', 'حماية Cloudflare', 'fail', 'يلزم فتح الموقع في المتصفح الداخلي لحلّ التحدّي'); return { rows, cfg: { home, family: 'cloudflare' } }; }
      const res = await resolveEpisode(ep.url, {
        onStage: (k, n, fam) => { if (k === 'servers') push('servers', 'خوادم الحلقة', n ? 'ok' : 'fail', n + ' خادماً (' + fam + ')'); else if (k === 'capture') push('capture', 'التقاط الشبكة', 'run', 'جارٍ فتح الصفحة في المتصفح المخفي…'); },
        onRow: (r) => push('srv', r.server || 'خادم', r.ok ? 'ok' : 'fail', (r.via || '') + ' · ' + r.ms + 'ms' + (r.ok ? '' : ' · ' + r.err)),
      });
      const cap = res.layers && res.layers.find(l => l.layer === 'capture');
      if (cap) push('capture', 'نتيجة الالتقاط', cap.good ? 'ok' : (cap.skipped ? 'skip' : 'fail'), cap.skipped ? 'غير متاح في هذا التطبيق' : cap.good + ' رابط صالح');
      const tpl = res.layers && res.layers[0];
      const good = (res.links || []).length;
      push('result', 'النتيجة', good ? 'ok' : 'fail', good ? good + ' رابط صالح' : 'لا رابط صالح');
      const cfg = { home, family: (tpl && tpl.family) || 'unknown', api: api.detected ? api.base : '', layer: good ? res.links[0].layer : '', sample: ep.url };
      return { rows, cfg: good ? cfg : null, links: res.links || [] };
    }

    // ---------- تحليل الطرق: الأسرع ---------- 
    async function compare(pageUrl) {
      const r = await get(pageUrl); const html = okr(r) ? r.body : '';
      const tpl = await layerTemplate(pageUrl, html);
      const out = [{ label: 'قالب · ' + tpl.family, ms: tpl.ms, good: tpl.good, total: tpl.servers }];
      if (capture) { const c = await layerCapture(pageUrl); out.push({ label: 'التقاط الشبكة', ms: c.ms, good: c.good, total: c.servers }); }
      return { cur: out[0], alts: out.slice(1), all: out };
    }

    // ---------- واجهة EasyPlex (JSON): cfg.api = { base: '.../public/api', key } ----------
    const EP = 'easyplex://';
    const epEnc = o => EP + encodeURIComponent(JSON.stringify(o));
    const epDec = u => { try { return JSON.parse(decodeURIComponent(u.slice(EP.length))); } catch (e) { return null; } };
    const epKind = t => (/serie|tv/i.test(t) ? 'series' : /anime/i.test(t) ? 'animes' : 'movies');
    async function epJson(url) { const r = await get(url); if (!okr(r)) throw new Error('HTTP ' + (r && r.status || '?')); return JSON.parse(r.body); }
    async function epSearch(api, q) {
      const j = await epJson(api.base + '/search/' + encodeURIComponent(q) + '/' + api.key);
      const list = Array.isArray(j) ? j : (j.search || j.data || [].concat(j.movies || [], j.series || [], j.animes || []));
      return list.filter(x => x && x.id && (x.name || x.title)).map(x => ({ title: x.name || x.title, url: epEnc({ api, kind: epKind(x.type || x.kind || ''), id: x.id }), poster: x.poster_path || x.poster || '', tmdb: x.tmdb_id || null }));
    }
    async function epShow(o) { return epJson(o.api.base + '/' + o.kind + '/show/' + o.id + '/' + o.api.key); }
    const epLinks = (videos) => (videos || []).filter(v => v && v.link).map(v => ({ url: v.link, name: v.server || v.lang || '', embed: !!v.embed || /\.html?$|\/e\//.test(v.link) && !/\.(m3u8|mp4)/.test(v.link), headers: Object.assign({}, v.header ? { Referer: v.header } : {}, v.useragent ? { 'User-Agent': v.useragent } : {}) }));
    async function epEpisodes(o) {
      const j = await epShow(o);
      if (o.kind === 'movies') return [epEnc(Object.assign({}, o, { v: 1 }))];
      const out = [];
      for (const se of (j.seasons || [])) for (const e of (se.episodes || [])) out.push(epEnc({ api: o.api, kind: o.kind, id: o.id, s: se.season_number || se.id, e: e.episode_number || e.id, eid: e.id }));
      return out;
    }
    async function epStream(o) {
      const j = await epShow(o); let videos = j.videos;
      if (o.eid) for (const se of (j.seasons || [])) for (const e of (se.episodes || [])) if (e.id === o.eid) videos = e.videos;
      const ls = epLinks(videos); const direct = ls.filter(l => !l.embed);
      for (const l of direct) { const v = await verify({ url: l.url, headers: l.headers, type: /\.m3u8/.test(l.url) ? 'hls' : 'mp4' }); if (v.ok) return { url: l.url, headers: l.headers, res: '', qualities: [], servers: direct }; }
      for (const l of ls.filter(x => x.embed)) { try { const x = await extractEmbed(l.url, ''); if (x && x.url && (await verify(x)).ok) return { url: x.url, headers: x.headers || {}, res: '', qualities: [], servers: ls }; } catch (e) { } }
      throw new Error('لا روابط');
    }
    async function detectApi(o) { // o.home قد يحمل .../public/api/<key>
      const m = String(o.home || '').match(/^(https?:\/\/[^?#]*?\/(?:public\/)?api)(?:\/([A-Za-z0-9]{16,}))?\/?$/); if (!m) return null;
      const key = o.apiKey || m[2]; if (!key) return null; return { base: m[1], key };
    }

    // ---------- واجهة المصدر: بحث + حلقات + تشغيل (يستعملها التطبيق كمصدر عادي) ----------
    const SKIPL = /\/(category|tag|genre|genres|page|author|login|register|contact|about|privacy|dmca|feed|wp-|cdn-cgi)(\/|$)|\.(jpg|jpeg|png|webp|gif|css|js|xml)(\?|$)|^#|^javascript:/i;
    const txt = h => String(h || '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#0?39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
    function anchors(html, base) {
      const out = [], seen = new Set(); let m; const O = origin(base);
      const rx = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
      while ((m = rx.exec(html))) {
        const u = abs(m[1].replace(/&amp;/g, '&'), base); if (!u || origin(u) !== O || SKIPL.test(u) || seen.has(u) || u === base || u === O + '/') continue;
        const tag = m[0]; const ti = (tag.match(/\btitle=["']([^"']+)["']/i) || [])[1] || (m[2].match(/<img[^>]+alt=["']([^"']+)["']/i) || [])[1] || txt(m[2]);
        const img = (m[2].match(/<img[^>]+(?:data-src|data-lazy-src|src)=["']([^"']+)["']/i) || [])[1];
        seen.add(u); out.push({ url: u, title: txt(ti), poster: img ? abs(img, base) : '' });
      }
      return out;
    }
    const SEARCH_TPL = ['/?s={q}', '/search?q={q}', '/search/{q}', '/?search={q}', '/search.php?q={q}', '/?q={q}','/search.php?keywords={q}','/search?keyword={q}','/search/{q}/'];
    async function search(cfg, q) {
      if (cfg.api) { try { const r = await epSearch(cfg.api, q); return { results: r, tpl: 'api' }; } catch (e) { return { results: [], tpl: '' }; } }
      const home = origin(cfg.home); const tpls = [cfg.searchTpl, ...SEARCH_TPL].filter(Boolean); const seen = new Set();
      for (const t of tpls) {
        if (seen.has(t)) continue; seen.add(t);
        try {
          const r = await get(home + t.replace('{q}', encodeURIComponent(q))); if (!okr(r) || cf(r.body)) continue;
          const list = anchors(r.body, home + '/').filter(x => x.title && x.title.length > 1 && x.title.length < 150 && !/^(الرئيسية|home|المزيد|more|تسجيل|login)$/i.test(x.title));
          if (list.length) return { results: list, tpl: t };
        } catch (e) { }
      }
      return { results: [], tpl: '' };
    }
    const epNum = (a) => {
      const d = (() => { try { return decodeURIComponent(a.url); } catch (e) { return a.url; } })();
      const m = (a.title + ' ' + d).match(/(?:حلقة|الحلقة|episode|ep)[\s\-_:.]*0*(\d{1,4})/i) || d.match(/[-\/_](\d{1,4})\/?$/);
      return m ? +m[1] : 0;
    };
    async function episodes(workUrl) {
      if (workUrl.startsWith(EP)) return epEpisodes(epDec(workUrl));
      const r = await get(workUrl); if (!okr(r)) return [];
      if (cf(r.body)) throw new Error('cloudflare');
      const links = anchors(r.body, workUrl).filter(a => /episode|\/ep[-\/]|حلقة|الحلقة|\/watch|مشاهدة/i.test((() => { try { return decodeURIComponent(a.url) + a.title; } catch (e) { return a.url + a.title; } })()));
      const arr = [];
      for (const a of links) { const n = epNum(a); if (n > 0 && n < 3000 && !arr[n - 1]) arr[n - 1] = a.url; }
      const have = arr.filter(Boolean).length;
      if (have) return arr.map(x => x || '');
      if (links.length) return links.map(a => a.url).reverse();
      return /<iframe|data-nume|player_iframe|data-embed/i.test(r.body) ? [workUrl] : [];
    }
    async function stream(epUrl) {
      if (epUrl.startsWith(EP)) return epStream(epDec(epUrl));
      const res = await resolveEpisode(epUrl, { capture: true, early: true });
      if (!res.ok) throw new Error(res.cf ? 'cloudflare' : (res.error || 'لا روابط'));
      const best = res.links.find(l => l.link.type === 'hls') || res.links[0];
      const out = res.links.map(l => ({ url: l.link.url, headers: l.link.headers || {}, name: l.server, hls: l.link.type === 'hls' }));
      return { url: best.link.url, headers: best.link.headers || {}, res: '', qualities: [], servers: out };
    }
    // مرايا: إن لم يستجب الموقع جرّب نطاقات معروفة بنفس الاسم
    async function pickMirror(home, mirrors) {
      const list = [home, ...(mirrors || [])]; const m = K.mirrors || {};
      for (const g of Object.values(m)) if (g && g.domains && g.domains.some(d => home.includes(d))) for (const d of g.domains) { const u = 'https://' + d; if (!list.includes(u)) list.push(u); }
      for (const h of list) { try { const r = await get(h); if (okr(r)) return { home: origin(h), tried: list.indexOf(h) }; } catch (e) { } }
      return { home: '', tried: list.length };
    }

    // تحليل سرعة البحث: كل قالب بحث (الزمن وعدد النتائج). الاستبدال مسموح إن كانت النتائج ≥95% من الحالي وأسرع
    async function compareSearch(cfg, q) {
      const home = origin(cfg.home); const cur = cfg.searchTpl || ''; const rows = [];
      for (const t of [...new Set([cur, ...SEARCH_TPL].filter(Boolean))]) {
        const t0 = Date.now(); let n = 0, err = '';
        try { const r = await get(home + t.replace('{q}', encodeURIComponent(q))); if (okr(r) && !cf(r.body)) n = anchors(r.body, home + '/').filter(x => x.title && x.title.length > 1 && x.title.length < 150).length; else err = 'HTTP ' + (r && r.status); } catch (e) { err = String(e && e.message || e); }
        rows.push({ tpl: t, ms: Date.now() - t0, n, err, cur: t === cur });
      }
      const base = rows.find(x => x.cur) || { n: 0, ms: 1e9 };
      rows.forEach(x => { x.ok = x.n > 0 && x.n >= 0.95 * base.n && x.n <= 1.5 * Math.max(base.n, 1) + 5; x.faster = !x.cur && x.ok && x.ms < base.ms; x.x = x.ms ? +(base.ms / x.ms).toFixed(1) : 0; });
      return { cur: base, rows };
    }

    // معلومات صفحة العمل: العنوان والغلاف والوصف
    async function title(url) {
      if (url.startsWith(EP)) { const o = epDec(url); const j = await epShow(o); return { title: j.name || j.title || '', cover: j.poster_path || '', description: j.overview || '', eps: await epEpisodes(o) }; }
      const r = await get(url); if (!okr(r)) throw new Error('HTTP ' + (r && r.status || '?'));
      if (cf(r.body)) throw new Error('cloudflare');
      const meta = (n) => { const m = r.body.match(new RegExp('<meta[^>]+(?:property|name)=["\']' + n + '["\'][^>]*content=["\']([^"\']*)["\']', 'i')) || r.body.match(new RegExp('<meta[^>]+content=["\']([^"\']*)["\'][^>]*(?:property|name)=["\']' + n + '["\']', 'i')); return m ? txt(m[1]) : ''; };
      const t = meta('og:title') || txt((r.body.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '') || txt((r.body.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1] || '');
      const img = meta('og:image'); const ep = await episodes(url);
      return { title: t.replace(/\s*[-|–]\s*[^-|–]*$/, '') || t, cover: img ? abs(img, url) : '', description: meta('og:description') || meta('description'), eps: ep };
    }

    // تقرير تشخيص نصي (ينسخه المستخدم ويرسله للمطوّر): عيّنات حقيقية من صفحات الموقع لبناء قالب دقيق
    async function diagnose(cfg, q) {
      const out = []; const home = origin(cfg.home); const cut = (h, n) => String(h || '').replace(/\s+/g, ' ').slice(0, n);
      const step = async (name, fn) => { try { out.push('## ' + name + '\n' + await fn()); } catch (e) { out.push('## ' + name + '\nخطأ: ' + (e && e.message || e)); } };
      let work = '', epu = '';
      await step('الرئيسية', async () => { const r = await get(home + '/'); return 'HTTP ' + r.status + ' · ' + String(r.body || '').length + 'B · cf=' + cf(r.body) + '\n' + cut(r.body, 1500); });
      await step('البحث «' + q + '»', async () => {
        const s = await search(cfg, q); const f = s.results[0]; if (f) work = f.url;
        return 'قالب=' + s.tpl + ' · ' + s.results.length + ' نتيجة\n' + s.results.slice(0, 5).map(x => x.title + ' → ' + x.url).join('\n');
      });
      await step('صفحة العمل', async () => { if (!work) return 'لا عمل'; const r = await get(work); const eps = await episodes(work); epu = eps.find(Boolean) || ''; return work + '\nHTTP ' + r.status + ' · ' + String(r.body || '').length + 'B\nحلقات=' + eps.length + ' · أولها=' + epu + '\n' + cut(r.body, 1800); });
      await step('صفحة الحلقة', async () => {
        const u = epu || work; if (!u) return 'لا حلقة'; const r = await get(u); const sv = serversFromPage(r.body || '', u); const d = dooplayItems(r.body || '');
        let t = u + '\nHTTP ' + r.status + ' · ' + String(r.body || '').length + 'B · cf=' + cf(r.body) + '\nخوادم=' + sv.length + ' · dooplay=' + d.length + '\n' + sv.slice(0, 6).map(x => x.via + ' ' + x.url).join('\n');
        for (const x of sv.slice(0, 3)) { try { const e = await get(x.url, { headers: { Referer: u } }); t += '\n--- ' + x.url + ' HTTP ' + e.status + ' ' + String(e.body || '').length + 'B\n' + cut(e.body, 1200); } catch (er) { t += '\n--- ' + x.url + ' خطأ ' + (er && er.message || er); } }
        return t + '\n--- بداية صفحة الحلقة\n' + cut(r.body, 1500);
      });
      return out.join('\n\n');
    }

    return { epSearch, detectApi, diagnose, title, compareSearch, search, episodes, stream, pickMirror, anchors, hosterOf, extractEmbed, serversFromPage, dooplayServers, verify, resolveServers, resolveEpisode, autoEpisode, scan, compare, layerTemplate, layerCapture, layerApi, unpackAll, findMedia };
  }
  return { create, unpackAll, findMedia };
});
