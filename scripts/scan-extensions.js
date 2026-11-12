// فحص أسبوعي لمستودعات إضافات CloudStream: يلتقط انتقال المواقع لنطاقات جديدة، والمواقع العربية الجديدة،
// ومستخرجات الفيديو الجديدة — يحدّث ملفات المعرفة ويكتب تقريراً (knowledge/video/scan-report.md).
// لا يغيّر كود أي إضافة: الحكم على «طريقة أفضل» يبقى للمراجعة.
const fs = require('fs'), p = require('path'), { execSync } = require('child_process');
const root = p.join(__dirname, '..'), K = (f) => p.join(root, 'knowledge/video', f);
const read = (f, d) => { try { return JSON.parse(fs.readFileSync(K(f), 'utf8')); } catch { return d; } };
const write = (f, v) => fs.writeFileSync(K(f), JSON.stringify(v, null, 1) + '\n');

const repos = read('watch-repos.json', { repos: [] }).repos;
const sites = read('sites.json', []);
const extractors = new Set(read('cloudstream-extractors.json', []));
const moves = read('moves.json', { _doc: '', moves: {} });
moves._doc = 'انتقال المواقع المكتشف من إضافات CloudStream: النطاق القديم ← الجديد. تُدمج في نواة الفيديو.';
const work = fs.mkdtempSync('/tmp/scan-');
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
const origin = (u) => { try { return new URL(u).origin; } catch { return ''; } };
// نفس الموقع باسم قريب (faselhd ↔ faselhdx، brstej ↔ prstej) — شرط اعتبار التغيير «انتقالاً»
const base = (u) => { const s = host(u).split('.'); return (s.length > 1 ? s[s.length - 2] : s[0]).replace(/\d+/g, ''); };
const lev = (a, b) => { const d = Array.from({ length: a.length + 1 }, (_, i) => [i]); for (let j = 1; j <= b.length; j++) d[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length]; };
const sameSite = (a, b) => { const x = base(a), y = base(b); return !!x && !!y && (x === y || (Math.min(x.length, y.length) >= 4 && (lev(x, y) <= 2 || x.includes(y) || y.includes(x)))); };

function scanRepo(repo) {
  const dir = p.join(work, repo.replace('/', '_'));
  try {
    execSync(`git clone -q --depth 1 https://github.com/${repo} ${dir}`, { stdio: 'pipe', timeout: 120000 });
  } catch (e) {
    return { repo, error: String(e.message).slice(0, 120), providers: [], extractors: [] };
  }
  const files = execSync(`find ${dir} -name "*.kt" -not -path "*/build/*"`, { encoding: 'utf8' }).split('\n').filter(Boolean);
  const providers = [], exts = [];
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    const re = /class\s+(\w+)\s*(?:\([^)]*\))?\s*:\s*(MainAPI|ExtractorApi)\s*\(\)/g;
    let m;
    while ((m = re.exec(src))) {
      const body = src.slice(m.index, m.index + 3000);
      const get = (k) => (body.match(new RegExp(`override\\s+va[rl]\\s+${k}\\s*(?::\\s*\\w+\\??)?\\s*=\\s*"([^"]+)"`)) || [])[1];
      const rel = p.relative(dir, f);
      const it = { cls: m[1], name: get('name') || m[1], mod: rel.split('/')[0], mainUrl: get('mainUrl') || '', lang: get('lang') || '', file: rel };
      (m[2] === 'MainAPI' ? providers : exts).push(it);
    }
  }
  return { repo, providers, extractors: exts };
}

const today = new Date().toISOString().slice(0, 10);
const changes = { moved: [], fixed: [], newSites: [], newExtractors: [], errors: [] };
for (const r of repos) {
  const res = scanRepo(r.repo);
  if (res.error) { changes.errors.push(`${r.repo}: ${res.error}`); continue; }
  for (const pr of res.providers) {
    if (!pr.mainUrl || !/^https?:/.test(pr.mainUrl) || /github(usercontent)?\.com$/.test(host(pr.mainUrl))) continue;
    const arabic = pr.lang === 'ar' || r.arabic;
    const ex = sites.find((s) => (s.id === pr.mod || s.id === pr.name) && s.ref === r.repo) || sites.find((s) => s.id === pr.name);
    if (ex) {
      if (origin(ex.host) && origin(pr.mainUrl) && host(ex.host) !== host(pr.mainUrl)) {
        if (sameSite(ex.host, pr.mainUrl)) {
          changes.moved.push(`${pr.name}: ${ex.host} ← ${origin(pr.mainUrl)} (${r.repo})`);
          moves.moves[host(ex.host)] = origin(pr.mainUrl);
        } else changes.fixed.push(`${pr.name}: ${ex.host} ← ${origin(pr.mainUrl)}`);
        ex.prev = [...new Set([...(ex.prev || []), ex.host])];
        ex.host = origin(pr.mainUrl);
        ex.seen = today;
      }
    } else if (arabic) {
      sites.push({ id: pr.mod || pr.name, name: pr.name, host: origin(pr.mainUrl), traits: [], extractors: [], ref: r.repo, added: today });
      changes.newSites.push(`${pr.name} — ${origin(pr.mainUrl)} (${r.repo}/${pr.file})`);
    }
  }
  for (const e of res.extractors) {
    const nm = e.cls;
    if (!extractors.has(nm)) {
      extractors.add(nm);
      changes.newExtractors.push(`${nm}${e.mainUrl ? ' — ' + host(e.mainUrl) : ''} (${r.repo})`);
    }
  }
}

write('sites.json', sites);
write('cloudstream-extractors.json', [...extractors].sort());
write('moves.json', moves);

const sec = (t, a) => `\n### ${t} (${a.length})\n` + (a.length ? a.map((x) => `- ${x}`).join('\n') : '- لا شيء');
const report = `# تقرير فحص الإضافات — ${today}\n\nالمستودعات المفحوصة: ${repos.length}\n` +
  sec('مواقع انتقلت لنطاق جديد (طُبّقت تلقائياً في نواة الفيديو)', changes.moved) +
  sec('مواقع عربية جديدة لها إضافة', changes.newSites) +
  (changes.fixed.length ? sec('نطاقات صُحّحت (اسم مختلف، لم تُعدّ انتقالاً)', changes.fixed) : '') +
  sec('مستخرجات فيديو جديدة (للمراجعة)', changes.newExtractors) +
  (changes.errors.length ? sec('تعذّر فحصه', changes.errors) : '') + '\n';
const old = fs.existsSync(K('scan-report.md')) ? fs.readFileSync(K('scan-report.md'), 'utf8') : '';
// آخر 8 تقارير فقط
const keep = old.split(/(?=^# تقرير فحص الإضافات)/m).filter(Boolean).slice(0, 7).join('');
fs.writeFileSync(K('scan-report.md'), report + (keep ? '\n---\n\n' + keep : ''));
console.log(report);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
const total = changes.moved.length + changes.newSites.length + changes.newExtractors.length;
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `changes=${total}\n`);
