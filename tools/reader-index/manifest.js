// يجمع ملفات .meta.json لكل مصدر في reader-index.json (ما يقرأه التطبيق أولاً).
//   node manifest.js <old manifest> <dir of metas> <out>
// المصدر الذي فشلت وظيفته اليوم يبقى بسطر الأمس. يطبع CONTINUE إن بقي مصدر لم يكتمل وتقدّم اليوم.
const fs = require('fs'), path = require('path');
const [oldF, dir, outF] = process.argv.slice(2);
let old = { sources: {} };
try { old = JSON.parse(fs.readFileSync(oldF, 'utf8')); } catch (e) { }
const out = { v: 1, at: Math.floor(Date.now() / 1000), sources: Object.assign({}, old.sources || {}) };
let progress = 0, incomplete = 0;
const lines = [];
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.meta.json'))) {
  let m; try { m = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch (e) { continue; }
  const key = f.replace(/\.meta\.json$/, '');
  if (!m.file) { lines.push(`✗ ${key}: ${m.error || 'لا ملف'}`); continue; }
  const e = { kind: m.kind, id: m.id, name: m.name || (out.sources[key] || {}).name || m.id, home: m.home || '', at: m.at,
    file: m.file, size: m.size, count: m.count || 0, detailed: m.detailed || 0, complete: !!m.complete };
  // ملف الفرق صالح فقط لمن عنده نسخة الأمس بالضبط
  if (!m.kept && m.base && m.delta && fs.existsSync(path.join(dir, m.delta))) Object.assign(e, { base: m.base, delta: m.delta, deltaSize: m.deltaSize });
  if (m.error) e.error = m.error;
  out.sources[key] = e;
  if (!e.complete) { incomplete++; if (m.done > 0 || (m.changed || 0) > 0) progress++; }
  lines.push(`${e.complete ? '✓' : '…'} ${key}: ${e.count} عمل · ${e.detailed} بالفصول · ${Math.round(e.size / 1024)} KB` +
    (e.delta ? ` · فرق ${Math.round(e.deltaSize / 1024)} KB` : '') + (m.error ? ` · ${m.error}` : '') + (m.listError ? ` · قائمة: ${m.listError}` : ''));
}
fs.writeFileSync(outF, JSON.stringify(out));
console.log(lines.sort().join('\n'));
const total = Object.values(out.sources).reduce((s, e) => s + (e.size || 0), 0);
console.log(`المجموع: ${Object.keys(out.sources).length} مصدر · ${Math.round(total / 1024 / 1024 * 10) / 10} MB · غير مكتمل ${incomplete}`);
if (incomplete && progress) console.log('CONTINUE');
