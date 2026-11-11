// يحسب sha256 لكل ملف مصدر ويرفع version تلقائيًا إن تغيّر الملف عن آخر بصمة. التشغيل: node scripts/build-manifest.js
const fs = require('fs'), crypto = require('crypto'), path = require('path');
const mp = path.join(__dirname, '..', 'manifest.json');
const m = JSON.parse(fs.readFileSync(mp, 'utf8'));
let changed = 0;
for (const s of m.sources) {
  const h = crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, '..', s.file))).digest('hex');
  if (s.sha256 !== h) { if (s.sha256) s.version = (s.version | 0) + 1; s.sha256 = h; changed++; console.log('updated', s.id, 'v' + s.version); }
}
if (changed) fs.writeFileSync(mp, JSON.stringify(m, null, 2) + '\n');
