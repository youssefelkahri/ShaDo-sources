/* تطبيق تحديثات المستودع (novels/remote.json) على كتالوج المصادر قبل بنائه:
 * sources: إضافة/تعديل مصادر · homes: نطاق جديد لمصدر · off: إخفاء مصدر · code: إضافات JS (NovelKit.add). */
(function (g) {
  'use strict';
  g.APP_WEB = { version: 'kage-novels', native: 1 };
  var R = null; try { R = JSON.parse(localStorage.getItem('mr.remote') || 'null'); } catch (e) { }
  var DATA = g.NOVEL_SOURCES_DATA = g.NOVEL_SOURCES_DATA || [];
  if (!R || !R.data) return;
  var d = R.data;
  Object.keys(R.code || {}).forEach(function (id) {
    try { (0, eval)(R.code[id] + '\n//# sourceURL=plugin-' + id + '.js'); } catch (e) { console.warn('plugin ' + id + ': ' + e.message); }
  });
  (d.sources || []).forEach(function (s) {
    if (!s || !s.id) return;
    var i = DATA.findIndex(function (x) { return x.id === s.id; });
    if (i < 0 && !s.home) return;
    var v = Object.assign({ listings: [], filters: [] }, i >= 0 ? DATA[i] : {}, s);
    delete v.plugin; delete v.sha256;
    if (i >= 0) DATA[i] = v; else { v.remote = true; DATA.push(v); }
  });
  Object.keys(d.homes || {}).forEach(function (id) {
    var x = DATA.find(function (y) { return y.id === id; });
    if (x && /^https?:\/\//.test(d.homes[id])) x.home = String(d.homes[id]).replace(/\/+$/, '');
  });
  (d.off || []).forEach(function (id) { var i = DATA.findIndex(function (x) { return x.id === id; }); if (i >= 0) DATA.splice(i, 1); });
})(window);
