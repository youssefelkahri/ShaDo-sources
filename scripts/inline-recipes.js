// يدمج knowledge/video/recipes.json داخل نواة الفيديو (فلا يحتاج التطبيق تحديثاً ليقرأها)
const fs = require('fs'), p = require('path');
const root = p.join(__dirname, '..'), k = p.join(root, 'kits/video/video-kit.js');
const rec = JSON.parse(fs.readFileSync(p.join(root, 'knowledge/video/recipes.json'), 'utf8')).recipes || {};
const s = fs.readFileSync(k, 'utf8').replace(/\/\*RECIPES\*\/[\s\S]*?\/\*END\*\//, '/*RECIPES*/' + JSON.stringify(rec) + '/*END*/');
fs.writeFileSync(k, s); console.log('recipes', Object.keys(rec).length);
