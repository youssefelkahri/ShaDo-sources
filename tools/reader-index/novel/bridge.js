/* واجهة المحرك التي يستدعيها التطبيق (نسخة الروايات):
 *   Engine.call(id, method, specJson, argsJson)  → النتيجة عبر ShadoNative.result(id, json)
 *   method: catalog | spec | list | manga | more | moreStatus | chapter | gen | genres
 */
(function (g) {
  'use strict';
  var cache = {}, jobs = {}, jseq = 0;
  function adapter(S) {
    var key = JSON.stringify(S);
    return cache[key] || (cache[key] = g.NovelSources.build(S));
  }
  function out(id, v) { g.ShadoNative.result(id, JSON.stringify(v)); }
  function fail(id, e) { out(id, { error: String((e && e.message) || e || 'خطأ') }); }
  function ch(c, i) { return { url: c.url, title: c.title || '', num: c.num == null ? null : c.num, date: c.date || '', o: c.o == null ? i : c.o }; }
  var M = {
    catalog: async function () {
      var data = g.NOVEL_SOURCES_DATA || [];
      return data.map(function (d) {
        var ad = null; try { ad = adapter({ id: d.id }); } catch (e) { }
        return { id: d.id, name: d.name, home: d.home, tpl: (ad && ad.tpl) || d.tpl || 'custom', remote: !!d.remote,
          listings: (ad && ad.listings) || d.listings || [], filters: (ad && ad.filters) || d.filters || [], note: '' };
      });
    },
    spec: async function (S) {
      var ad = adapter(S);
      return { id: ad.id, name: ad.name, home: ad.home, tpl: ad.tpl, listings: ad.listings || [], filters: ad.filters || [], note: '' };
    },
    genres: async function () { return null; },
    list: async function (S, a) {
      var r = await adapter(S).list(a);
      return { hasNext: !!r.hasNext, items: (r.items || []).map(function (x) { return { url: x.url, title: x.title, cover: x.cover || '', latest: x.latest || '', rating: x.rating || '' }; }) };
    },
    manga: async function (S, a) {
      var r = await adapter(S).manga(a.url);
      var res = { url: r.url || a.url, title: r.title || '', cover: r.cover || '', summary: r.summary || '', status: r.status || '',
        genres: r.genres || [], total: r.total || 0, start: r.start || '', chapters: (r.chapters || []).map(ch) };
      if (typeof r.more === 'function') {
        var t = 'j' + (++jseq), J = jobs[t] = { items: [], got: 0, total: r.total || 0, done: false, error: null };
        r.more({ have: (a.have || []).concat(res.chapters.map(function (c) { return c.url; })), start: a.start || 2,
          onBatch: function (items, p) { (items || []).forEach(function (c) { J.items.push(ch(c, null)); }); J.got = p.got || J.got; J.total = p.total || J.total; } })
          .then(function (x) { J.done = true; if (x) { J.total = x.total || J.total; J.failed = (x.failed || []).length; } },
                function (e) { J.done = true; J.error = String((e && e.message) || e); });
        res.more = t;
      }
      return res;
    },
    /** يسحب دفعات الفصول التي جلبها المصدر في الخلفية منذ آخر سحب. */
    moreStatus: async function (S, a) {
      var J = jobs[a.token]; if (!J) return { done: true, items: [], missing: true };
      var items = J.items; J.items = [];
      if (J.done) delete jobs[a.token];
      return { items: items, got: J.got, total: J.total, done: J.done, error: J.error, failed: J.failed || 0 };
    },
    chapter: async function (S, a) {
      var r = await adapter(S).chapter(a.url);
      var paras = (r && r.paras) || [];
      if (!paras.length) throw new Error('لم يُعثر على نص في هذا الفصل');
      return { title: r.title || '', paras: paras, next: r.next || '', prev: r.prev || '' };
    },
    gen: async function (S, a) {
      if (!g.NovelGen) throw new Error('المولّد غير متوفر');
      var r = await g.NovelGen.scan({ home: a.home, work: a.work, chapter: a.chapter });
      return { rows: (r.rows || []).map(function (x) { return { label: x.label, status: x.status, detail: x.detail || '' }; }), source: r.cfg ? g.NovelGen.source(r.cfg) : null };
    },
  };
  g.Engine = {
    call: function (id, method, specJson, argsJson) {
      var f = M[method]; if (!f) return fail(id, 'unknown ' + method);
      var S = null, A = null;
      try { S = specJson ? JSON.parse(specJson) : null; A = argsJson ? JSON.parse(argsJson) : {}; } catch (e) { return fail(id, e); }
      Promise.resolve().then(function () { return f(S, A); }).then(function (v) { out(id, v == null ? null : v); }, function (e) { fail(id, e); });
    },
    reset: function () { cache = {}; },
  };
  g.ShadoNative.ready();
})(window);
