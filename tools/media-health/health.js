// فحص أسبوعي لمواقع الميديا (Kage Media): يتبع انتقال النطاقات ويكتب kage/health.json.
// نطاق جديد انتقل إليه موقع يُضاف أول قائمة knowledge/video/mirrors.json، فيجرّبه التطبيق أولاً دون تحديث.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const mirrorsPath = path.join(root, 'knowledge', 'video', 'mirrors.json');
const outPath = path.join(root, 'kage', 'health.json');
const UA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36';

async function probe(domain) {
  const url = `https://${domain}/`;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 20000);
  try {
    const r = await fetch(url, { redirect: 'follow', signal: ctl.signal, headers: { 'User-Agent': UA } });
    const body = (await r.text()).slice(0, 4000);
    const finalHost = new URL(r.url).host.replace(/^www\./, '');
    const challenge = r.status === 403 || r.status === 503 ? /cloudflare|cf-chl|Just a moment/i.test(body) : false;
    return { domain, status: r.status, finalHost, ok: r.ok || challenge, challenge };
  } catch (e) {
    return { domain, status: 0, error: String(e.name || e.message || e).slice(0, 80), ok: false };
  } finally {
    clearTimeout(timer);
  }
}

(async () => {
  const mirrors = JSON.parse(fs.readFileSync(mirrorsPath, 'utf8'));
  const report = { checkedAt: new Date().toISOString(), sites: {} };
  let changed = false;
  for (const [key, entry] of Object.entries(mirrors)) {
    if (!entry || !Array.isArray(entry.domains)) continue;
    const results = [];
    for (const d of entry.domains) results.push(await probe(d));
    // A domain that now redirects to a host we do not know: the site moved. Only hosts that carry the
    // site's own name count, so a takedown page (alliance4creativity.com and the like) is never adopted.
    const stem = h => h.split('.')[0].replace(/[^a-z]/g, '');
    const names = new Set([key.replace(/[^a-z]/g, ''), ...entry.domains.map(stem)]);
    const sameSite = h => [...names].some(n => n.length >= 4 && stem(h).includes(n.slice(0, Math.min(n.length, 5))));
    for (const r of results) {
      if (r.finalHost && !sameSite(r.finalHost)) { r.ok = false; r.note = 'redirects elsewhere'; }
      if (r.ok && r.finalHost && !entry.domains.includes(r.finalHost) && r.finalHost !== r.domain) {
        entry.domains.unshift(r.finalHost);
        changed = true;
        console.log(`${key}: moved ${r.domain} -> ${r.finalHost}`);
      }
    }
    const best = results.find(r => r.ok && !r.challenge) || results.find(r => r.ok);
    report.sites[key] = { ok: !!best, best: best ? (best.finalHost || best.domain) : null, domains: results };
    console.log(`${key}: ${best ? 'ok ' + report.sites[key].best : 'DOWN'}`);
  }
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n');
  if (changed) fs.writeFileSync(mirrorsPath, JSON.stringify(mirrors, null, 2) + '\n');
})();
