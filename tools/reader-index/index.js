// فهرس الصفحات لتطبيق Elkahri Reader (مانجا + روايات).
// يشغّل نفس محرك التطبيق في Chromium (الطلبات عبر curl) ويكتب لكل مصدر ملفاً مضغوطاً فيه:
// الأعمال (العنوان، الغلاف، الوصف، التصنيفات، الحالة)، كل الفصول (مضغوطة بنمط الرابط + الأرقام)،
// ترتيب «الأحدث» و«الأكثر مشاهدة». المرة الأولى كاملة، ثم كل يوم ما تغيّر فقط (+ ملف فرق صغير).
//
//   node index.js catalog                       → {"manga":[ids],"novel":[ids]}
//   KIND=manga SRC=mangalek node index.js       → out/m-mangalek.json.gz (+ .delta.json.gz + .meta.json)
//   PREV=dir      ملف الأمس (m-<id>.json.gz) إن وُجد
//   BUDGET_MIN    وقت العمل الأقصى (افتراضي 300 دقيقة)؛ ما لم يكتمل يكمل في التشغيل القادم
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), zlib = require('zlib'), { execFile } = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
const UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
const OUT = process.env.OUT || path.join(__dirname, 'out');
const START = Date.now();
const DEADLINE = START + (+process.env.BUDGET_MIN || 300) * 60000;
const CONC = +process.env.CONC || 3;

const KINDS = {
  manga: { dir: 'manga', host: 'shado.local', remote: 'manga/remote.json', prefix: 'm' },
  novel: { dir: 'novel', host: 'novels.local', remote: 'novels/remote.json', prefix: 'n' },
};

function curl(url, opt) {
  return new Promise(res => {
    const a = ['-s', '-L', '--compressed', '-m', '30', '-A', UA, '-w', '\n__META__%{http_code} %{url_effective}', '-X', opt.method || 'GET'];
    for (const [k, v] of Object.entries(opt.headers || {})) a.push('-H', k + ': ' + v);
    if (opt.cookie) a.push('-H', 'Cookie: ' + opt.cookie);
    if (opt.via) a.push('-H', 'Referer: ' + opt.via + '/');
    if (opt.body != null) a.push('--data-raw', opt.body);
    a.push(url);
    execFile('curl', a, { maxBuffer: 64 << 20, encoding: 'latin1' }, (e, out) => {
      out = Buffer.from(out || '', 'latin1').toString('utf8');
      const i = out.lastIndexOf('\n__META__');
      if (i < 0) return res({ error: String(e || 'curl failed') });
      const [st, eff] = out.slice(i + 9).split(' ');
      res({ status: +st, url: eff, text: out.slice(0, i) });
    });
  });
}
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
const readGz = f => { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString('utf8')); } catch (e) { return null; } };
const withTimeout = (p, ms) => Promise.race([p, new Promise(r => setTimeout(() => r({ error: 'timeout' }), ms))]);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function openEngine(kind) {
  const K = KINDS[kind], dir = path.join(__dirname, K.dir);
  const remote = readJson(path.join(ROOT, K.remote), null);
  const bundle = remote ? JSON.stringify({ data: remote, code: {} }) : null;
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const pg = await b.newPage();
  await pg.route('https://' + K.host + '/**', async r => {
    const u = new URL(r.request().url());
    if (u.pathname === '/remote.js') return r.fulfill({ contentType: 'application/javascript', body: bundle ? 'try{localStorage.setItem("mr.remote",' + JSON.stringify(bundle) + ')}catch(e){}' : '' });
    const f = path.join(dir, u.pathname === '/' ? 'engine.html' : u.pathname.slice(1));
    if (!fs.existsSync(f)) return r.fulfill({ status: 404, body: '' });
    r.fulfill({ contentType: f.endsWith('.html') ? 'text/html' : 'application/javascript', body: fs.readFileSync(f) });
  });
  // المحرك يقرأ remote.json من localStorage: نضعه قبل تحميل أي سكربت
  if (bundle) await pg.addInitScript(s => { try { localStorage.setItem('mr.remote', s); } catch (e) { } }, bundle);
  const results = {};
  let ready; const readyP = new Promise(r => ready = r);
  await pg.exposeFunction('__nreq', async (id, url, opt) => { const r = await curl(url, JSON.parse(opt)); await pg.evaluate(([i, j]) => window.__done(i, j), [id, JSON.stringify(r)]); });
  await pg.exposeFunction('__nres', (id, json) => { results[id] && results[id](JSON.parse(json)); delete results[id]; });
  await pg.exposeFunction('__nready', () => ready());
  // الروايات: طلبات NovelNative.http (المسار السريع في التطبيق) عبر curl أيضاً
  await pg.exposeFunction('__nhttp', async (id, url, method, h, body) => {
    let headers = {}; try { headers = JSON.parse(h || '{}'); } catch (e) { }
    headers['Accept-Language'] = headers['Accept-Language'] || 'ar,en;q=0.8';
    const r = await curl(url, { method: method || 'GET', headers, body });
    if (r.text && r.text.length > 4 << 20) r.text = r.text.slice(0, 4 << 20);
    await pg.evaluate(([i, j]) => window.NovelFetch && NovelFetch._onReply(i, j), [id, JSON.stringify(r)]);
  });
  await pg.addInitScript(() => {
    if (location.hostname === 'novels.local') {
      const nop = () => { };
      window.NovelNative = { http: (i, u, m, h, b) => window.__nhttp(i, u, m, h, b), setEarly: () => true, setUa: nop, eval: nop, park: nop,
        load: nop, reinject: nop, where: () => '', show: nop, take: () => '{"error":"take"}' };
    }
    window.ShadoNative = { req: (i, u, o) => window.__nreq(i, u, o), result: (i, j) => window.__nres(i, j), take: () => '{"error":"take"}', ready: () => window.__nready(), log: () => { } };
  });
  await pg.goto('https://' + K.host + '/engine.html');
  await withTimeout(readyP, 30000);
  let n = 0;
  const call = (m, S, a, ms = 60000) => withTimeout(new Promise(res => {
    const id = 'c' + (++n); results[id] = res;
    pg.evaluate(([i, m, s, a]) => Engine.call(i, m, s, a), [id, m, S ? JSON.stringify(S) : null, JSON.stringify(a || {})]).catch(e => res({ error: String(e) }));
  }), ms);
  return { call, close: () => b.close(), remote };
}

// ---------- ضغط الفصول: نمط الرابط + الأرقام، والمتتاليات «1~200» ----------
const TOK = /(\d+(?:[.-]\d+)?)(?!.*\d)/;
function tokOf(c) {
  const m = TOK.exec(c.url); if (!m) return null;
  const tok = m[1], n = parseFloat(tok.replace('-', '.'));
  return { tok, n, ut: c.url.slice(0, m.index) + '{n}' + c.url.slice(m.index + tok.length) };
}
function titleTpl(title, tok) {
  // كل ظهور للرقم كرقم مستقل يصير {n} (مثل «الفصل 2: الفصل 2»)
  const num = tok.replace('-', '.').replace(/[.]/g, '\\.');
  const re = new RegExp('(?<![\\d.])' + num + '(?![\\d])', 'g');
  if (!re.test(title || '')) return null;
  return title.replace(re, '{n}');
}
function packChapters(list) {
  if (!list.length) return { u: '', t: '', x: [] };
  const info = list.map(c => { const k = tokOf(c); return k ? Object.assign(k, { tt: titleTpl(c.title, k.tok) }) : null; });
  const count = (f) => { const m = new Map(); info.forEach(k => { const v = k && f(k); if (v != null) m.set(v, (m.get(v) || 0) + 1); }); let best = null, bc = 0; m.forEach((c, v) => { if (c > bc) { bc = c; best = v; } }); return best; };
  const U = count(k => k.ut), T = count(k => k.tt);
  const x = [];
  list.forEach((c, i) => {
    const k = info[i];
    const ok = k && k.ut === U && k.tt === T && (c.num == null || Math.abs(c.num - k.n) < 1e-6);
    x.push(ok ? k.tok : { u: c.url, t: c.title || '', n: c.num == null ? null : c.num });
  });
  // دمج المتتاليات الصحيحة بخطوة ±1
  const out = [];
  for (let i = 0; i < x.length;) {
    const a = x[i];
    if (typeof a === 'string' && /^\d+$/.test(a) && String(+a) === a) {
      let j = i, step = 0;
      while (j + 1 < x.length && typeof x[j + 1] === 'string' && /^\d+$/.test(x[j + 1]) && String(+x[j + 1]) === x[j + 1]) {
        const d = +x[j + 1] - +x[j];
        if ((d !== 1 && d !== -1) || (step && d !== step)) break;
        step = d; j++;
      }
      if (j - i >= 2) { out.push(a + '~' + x[j]); i = j + 1; continue; }
    }
    out.push(a); i++;
  }
  return { u: U || '', t: T || '', x: out };
}

// ---------- المصدر الواحد ----------
async function indexSource(kind, id) {
  const K = KINDS[kind];
  const prevFile = process.env.PREV ? path.join(process.env.PREV, K.prefix + '-' + id + '.json.gz') : null;
  const prev = prevFile ? readGz(prevFile) : null;
  const E = await openEngine(kind);
  const meta = { id, kind, at: Math.floor(START / 1000), base: prev ? prev.at : 0 };
  try {
    const sp = await E.call('spec', { id });
    if (sp.error) throw new Error('spec: ' + sp.error);
    meta.name = sp.name; meta.home = sp.home;
    const L = (sp.listings || []).map(l => l[0]);
    const latest = L.find(l => /latest|update|recent/i.test(l)) || (L.length && !/popular|view|most|trend|rating/i.test(L[0]) ? L[0] : undefined);
    const popular = L.find(l => /popular|view|most|trend/i.test(l)) || L.find(l => /rating/i.test(l)) || 'popular';

    const works = new Map();
    (prev && prev.works || []).forEach(w => works.set(w.u, w));
    const pending = new Set((prev && prev.pending) || []);
    works.forEach(w => { if (!w.x) pending.add(w.u); });
    const changed = new Set();
    // walkv: نسخة قاعدة المرور؛ مرور قديم (توقف عند صفحة فارغة) يُعاد مرة كاملة
    let walked = !!(prev && prev.walked && prev.walkv === 2) && !process.env.FULL;
    const now = meta.at;

    // 1) «الأحدث»: كامل في المرة الأولى، ثم حتى صفحتين بلا جديد
    let pos = 0, quiet = 0, lastFirst = null;
    for (let page = 1; page <= 3000 && Date.now() < DEADLINE; page++) {
      // صفحة فارغة أو خطأ في الوسط غالباً حدّ طلبات مؤقت من الموقع، لا نهاية القائمة: انتظار وإعادة
      let r = null;
      for (let t = 0; t < 5; t++) {
        r = await E.call('list', { id }, { page, listing: latest });
        if (!r.error && r.items && r.items.length) break;
        if (!r.error && page > 1 && r.hasNext === false) break;
        await sleep(4000 * (t + 1));
      }
      if (r.error) { meta.listError = 'ص ' + page + ': ' + String(r.error).slice(0, 180); break; }
      const items = r.items || [];
      if (!items.length) { if (page === 1 || r.hasNext === false) walked = true; else meta.listError = 'صفحة فارغة ' + page; break; }
      if (items[0].url === lastFirst) { walked = true; break; }
      await sleep(250);
      lastFirst = items[0].url;
      let fresh = 0;
      for (const it of items) {
        const w = works.get(it.url);
        // غلاف القائمة (المصغّر) هو غلاف البطاقات دائماً
        if (w && it.cover && w.c !== it.cover) { if (!w.cb && w.c) w.cb = w.c; w.c = it.cover; }
        if (!w) {
          works.set(it.url, { u: it.url, t: it.title, c: it.cover || '', l: it.latest || '', r: it.rating || '', up: now - pos });
          pending.add(it.url); changed.add(it.url); fresh++;
        } else if ((it.latest || '') !== (w.l || '') || (it.title && it.title !== w.t)) {
          w.l = it.latest || ''; w.t = it.title || w.t; if (it.cover) w.c = it.cover; if (it.rating) w.r = it.rating;
          w.up = now - pos; pending.add(it.url); changed.add(it.url); fresh++;
        }
        pos++;
      }
      if (!r.hasNext) { walked = true; break; }
      if (walked) { quiet = fresh ? 0 : quiet + 1; if (quiet >= 2) break; }
    }

    // 2) «الأكثر مشاهدة»: الترتيب من صفحات الموقع (حتى 15 صفحة)
    const pop = {};
    let rank = 0; lastFirst = null;
    for (let page = 1; page <= 15 && Date.now() < DEADLINE; page++) {
      const r = await E.call('list', { id }, { page, listing: popular });
      if (r.error || !r.items || !r.items.length || r.items[0].url === lastFirst) break;
      lastFirst = r.items[0].url;
      for (const it of r.items) {
        if (pop[it.url] != null) continue;
        pop[it.url] = ++rank;
        if (!works.has(it.url)) { works.set(it.url, { u: it.url, t: it.title, c: it.cover || '', l: it.latest || '', r: it.rating || '', up: 0 }); pending.add(it.url); changed.add(it.url); }
      }
      if (!r.hasNext) break;
    }

    // 3) التفاصيل + الفصول لما تغيّر (الجديد أولاً)
    const queue = [...pending].sort((a, b) => (works.get(b).up || 0) - (works.get(a).up || 0));
    let done = 0, failed = 0;
    async function detail(url) {
      const w = works.get(url);
      let m = await E.call('manga', { id }, { url }, 120000);
      if (m.error) { await sleep(2000); m = await E.call('manga', { id }, { url }, 120000); }
      if (m.error) { failed++; w.err = String(m.error).slice(0, 120); return; }
      let chs = m.chapters || [];
      if (m.more) {  // الروايات: باقي الفصول تُجلب على دفعات
        const until = Math.min(DEADLINE, Date.now() + 15 * 60000);
        while (Date.now() < until) {
          await sleep(1500);
          const s = await E.call('moreStatus', { id }, { token: m.more });
          if (s.error) break;
          chs = chs.concat(s.items || []);
          if (s.done) break;
        }
      }
      if (m.title) w.t = m.title;
      // الغلاف في القوائم = الصورة المصغّرة من صفحة القائمة (خفيفة)؛ الكبير من صفحة العمل في cb
      if (m.cover && m.cover !== w.c) { if (w.c) w.cb = m.cover; else w.c = m.cover; }
      w.d = (m.summary || m.description || '').slice(0, 3000);
      w.s = m.status || '';
      w.g = (m.genres || []).map(g => typeof g === 'string' ? g : (g && (g.name || g.title)) || '').filter(Boolean);
      const seen = new Set();
      chs = chs.filter(c => c && c.url && !seen.has(c.url) && seen.add(c.url))
        .map(c => ({ url: c.url, title: c.title || c.name || '', num: c.num != null ? c.num : (c.number != null ? c.number : null), date: c.date || '' }));
      w.k = chs.length;
      w.dt = chs.length ? (chs[0].date || '') : '';
      w.x = packChapters(chs);
      delete w.err;
      pending.delete(url); changed.add(url); done++;
    }
    let qi = 0;
    await Promise.all(Array.from({ length: CONC }, async () => {
      while (qi < queue.length && Date.now() < DEADLINE) await detail(queue[qi++]);
    }));

    const all = [...works.values()];
    const full = { v: 1, kind, id, name: meta.name, home: meta.home, at: now, walked, walkv: 2, complete: walked && pending.size === 0,
      pop, pending: [...pending], works: all };
    const delta = { v: 1, kind, id, at: now, base: meta.base, pop, works: all.filter(w => changed.has(w.u)) };
    fs.mkdirSync(OUT, { recursive: true });
    const name = K.prefix + '-' + id;
    const fz = zlib.gzipSync(JSON.stringify(full), { level: 9 });
    const dz = zlib.gzipSync(JSON.stringify(delta), { level: 9 });
    fs.writeFileSync(path.join(OUT, name + '.json.gz'), fz);
    fs.writeFileSync(path.join(OUT, name + '.delta.json.gz'), dz);
    Object.assign(meta, { file: name + '.json.gz', size: fz.length, delta: name + '.delta.json.gz', deltaSize: dz.length,
      count: all.length, detailed: all.filter(w => w.x).length, changed: changed.size, failed, done,
      complete: full.complete, popular: Object.keys(pop).length, minutes: Math.round((Date.now() - START) / 60000) });
  } catch (e) {
    meta.error = String(e && e.message || e).slice(0, 300);
    // نُبقي ملف الأمس كما هو
    if (prev && prevFile) {
      fs.mkdirSync(OUT, { recursive: true });
      const name = K.prefix + '-' + id;
      fs.copyFileSync(prevFile, path.join(OUT, name + '.json.gz'));
      Object.assign(meta, { file: name + '.json.gz', size: fs.statSync(prevFile).size, at: prev.at, count: (prev.works || []).length, complete: !!prev.complete, kept: true });
    }
  }
  await E.close();
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, KINDS[kind].prefix + '-' + id + '.meta.json'), JSON.stringify(meta));
  console.log(JSON.stringify(meta));
}

(async () => {
  if (process.argv[2] === 'catalog') {
    const out = {};
    for (const kind of Object.keys(KINDS)) {
      const E = await openEngine(kind);
      const cat = await E.call('catalog');
      const off = new Set((E.remote && E.remote.off) || []);
      out[kind] = Array.isArray(cat) ? cat.map(c => c.id).filter(i => !off.has(i)) : [];
      await E.close();
    }
    const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
    // مصادر موقوفة مؤقتاً (يقررها المالك): لا تُفهرس حتى تُحذف من skip.json
    const skip = new Set(readJson(path.join(__dirname, 'skip.json'), []));
    const matrix = [];
    for (const k of Object.keys(out)) for (const id of out[k]) if ((!only || only.includes(id)) && !skip.has(id)) matrix.push({ kind: k, id });
    console.log(JSON.stringify(matrix));
    return;
  }
  await indexSource(process.env.KIND, process.env.SRC);
})().catch(e => { console.error(e); process.exit(1); });
