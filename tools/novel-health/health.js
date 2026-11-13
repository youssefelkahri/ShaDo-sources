// فحص أسبوعي خفيف لمصادر الروايات: يطلب الصفحة الرئيسية ويسجّل الحالة والنطاق الجديد إن تحوّل.
// النتيجة في novels/health.json. لا يغيّر المصادر نفسها (الإصلاح قرار المالك).
const fs = require('fs'), path = require('path'), { execFile } = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
const M = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const OUT = path.join(ROOT, 'novels', 'health.json');
const UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
const curl = url => new Promise(res => execFile('curl', ['-s', '-L', '-m', '25', '-A', UA, '-o', '/dev/null', '-w', '%{http_code} %{url_effective}', url],
  (e, out) => { const [st, eff] = String(out || '').trim().split(' '); res({ status: +st || 0, url: eff || url, error: e && !out ? String(e.message).slice(0, 80) : undefined }); }));
const origin = u => { try { return new URL(u).origin; } catch (e) { return null; } };
(async () => {
  const prev = (() => { try { return JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (e) { return { sources: {} }; } })();
  const out = { checked: new Date().toISOString().slice(0, 10), sources: {} };
  for (const s of M.sources) {
    const home = s.data && s.data.home; if (!home) continue;
    const r = await curl(home);
    const moved = origin(r.url) && origin(r.url) !== origin(home) ? origin(r.url) : undefined;
    const blocked = r.status === 403 || r.status === 503; // غالباً Cloudflare: لا يعني تعطلاً
    const ok = r.status >= 200 && r.status < 400;
    const was = (prev.sources[s.id] || {}).fails || 0;
    out.sources[s.id] = { status: r.status, ok, blocked, moved, fails: ok || blocked ? 0 : was + 1 };
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
  for (const [id, v] of Object.entries(out.sources)) console.log(id, v.status, v.moved ? '→ ' + v.moved : '', v.fails ? 'fails=' + v.fails : '');
})();
