// يعيد إلى الفهرس العام سطر كل مصدر ملفه موجود في الإصدار وسطره ضائع (مثل مصدر فهرسه هاتف المالك).
//   node orphans.js <manifest> <dir of .json.gz files>
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const [manF, dir] = process.argv.slice(2);
const man = JSON.parse(fs.readFileSync(manF, 'utf8'));
let n = 0;
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json.gz') && !f.includes('.delta.'))) {
  const key = f.replace(/\.json\.gz$/, '');
  if (man.sources[key]) continue;
  try {
    const raw = fs.readFileSync(path.join(dir, f));
    const d = JSON.parse(zlib.gunzipSync(raw).toString('utf8'));
    man.sources[key] = { kind: d.kind, id: d.id, name: d.name || d.id, home: d.home || '', at: d.at, file: f, size: raw.length,
      count: d.works || 0, detailed: d.complete ? (d.works || 0) : 0, complete: !!d.complete, ...(d.by ? { by: d.by } : {}) };
    console.log(`↺ ${key}: ${d.works} عمل`); n++;
  } catch (e) { console.log(`✗ ${key}: ${e.message}`); }
}
fs.writeFileSync(manF, JSON.stringify(man));
console.log(`أُعيد ${n} سطر`);
