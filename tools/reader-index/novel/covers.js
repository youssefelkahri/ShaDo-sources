'use strict';
/* sources/covers.js — الأغلفة: من الصفحة، ثم من مصادر أخرى */
NovelKit.add('covers', K => {
  const global = window;
  const { X, selA, scoreTitle } = K;
  // غلاف: صورة og إن كانت حقيقية، وإلا أفضل صورة في الصفحة بالدرجات (كما في epub)
  X.findCover = function (d, url, title) {
    const og = X.abs((d.querySelector('meta[property="og:image"]') || {}).content, url) || '';
    const ogBad = !og || /\/og\?|\/api\/og|og[-_]image|opengraph-image|twitter-image|default|logo|banner|placeholder|favicon|icon/i.test(og);
    if (!title) title = X.t(d.querySelector('h1'));
    const nt = X.normAr(title); let best = null, bsc = 0;
    if (nt) { const hit = selA(d, 'img').find(im => { const al = X.normAr(im.getAttribute('alt') || ''); const iu = X.img(im, url); return al && al.length > 3 && iu && !/logo|icon|avatar|favicon|\.svg(\?|$)/i.test(iu) && (al === nt || al.indexOf(nt) >= 0 || (nt.indexOf(al) >= 0 && al.length >= nt.length * 0.6)); }); if (hit) return X.img(hit, url); }
    if (!ogBad) return og;
    selA(d, 'img').forEach(im => {
      const u = X.img(im, url); if (!u || /\.svg(\?|$)|logo|icon|avatar|sprite|emoji|flag/i.test(u)) return;
      let sc = 1; const alt = X.normAr(im.getAttribute('alt') || ''), cls = ((im.className || '') + ' ' + ((im.parentElement && im.parentElement.className) || '')).toLowerCase();
      if (nt && alt && (alt.indexOf(nt) >= 0 || nt.indexOf(alt) >= 0)) sc += 6;
      if (/cover|poster|thumb|book|novel|image/.test(cls)) sc += 3;
      if (/_next\/image|cover|poster|thumb/i.test(u)) sc += 2;
      const w = +im.getAttribute('width') || 0, h = +im.getAttribute('height') || 0; if (w && h && h >= w) sc += 1; if (w && w < 60) sc -= 3;
      if (sc > bsc) { bsc = sc; best = u; }
    });
    return best || og;
  };

  // غلاف بديل من مصادر أخرى (عربية ثم أجنبية) حين لا يوجد غلاف صالح في الموقع نفسه
  // حدّ للتزامن + ذاكرة للنتائج + إيقاف مؤقت للمضيف عند تكرار الفشل (يمنع سيل الطلبات الفاشلة)
  const CS = { memo: {}, q: [], busy: 0, bad: { ko: 0, mu: 0 }, off: { ko: 0, mu: 0 } };
  const csOff = k => Date.now() < CS.off[k];
  const csFail = k => { if (++CS.bad[k] >= 2) { CS.off[k] = Date.now() + 10 * 60 * 1000; CS.bad[k] = 0; } };
  // ذاكرة دائمة للنتائج الفارغة (يوم واحد): لا نعيد البحث عن غلاف لم نجده في كل جلسة
  let NEG = {}; try { NEG = JSON.parse(localStorage.getItem('shado.cvneg') || '{}'); } catch (e) { }
  const negSave = () => { try { const k = Object.keys(NEG); if (k.length > 400) k.slice(0, k.length - 400).forEach(x => delete NEG[x]); localStorage.setItem('shado.cvneg', JSON.stringify(NEG)); } catch (e) { } };
  X.coverSearch = function (title, pageUrl) {
    const key = (title || '') + '|' + (pageUrl || '');
    if (CS.memo[key]) return CS.memo[key];
    if (NEG[key] && Date.now() - NEG[key] < 24 * 3600 * 1000) return Promise.resolve('');
    return CS.memo[key] = new Promise(res => { CS.q.push(() => X.coverSearch0(title, pageUrl).catch(() => '').then(r => { if (!r) { NEG[key] = Date.now(); negSave(); } res(r); })); csPump(); });
  };
  function csPump() {
    if (CS.busy >= 1 || !CS.q.length) return;
    CS.busy++; const f = CS.q.shift();
    f().then(() => { CS.busy--; setTimeout(csPump, 150); });
  }
  X.coverSearch0 = async function (title, pageUrl) {
    const ok = (a, b) => scoreTitle(a, b) >= 0.6 || scoreTitle(b, a) >= 0.6;
    // 1) ملوك الروايات: بحث داخلي يُرجع الأغلفة مباشرة (عناوين عربية)
    if (title && !csOff('ko')) {
      try {
        const r = await X.postForm('https://kolnovel.com/wp-admin/admin-ajax.php', 'action=ts_ac_do_search&ts_ac_query=' + encodeURIComponent(title.trim()).replace(/%20/g, '+'), { timeout: 12000 });
        if (r.status >= 400) throw new Error('http ' + r.status);
        const j = JSON.parse(r.text), all = (j.series && j.series[0] && j.series[0].all) || [];
        const hit = all.find(e => e.post_image && ok(String(e.post_title || '').replace(/[-_\s]*(كول|kol).*$/i, ''), title));
        CS.bad.ko = 0;
        if (hit) return hit.post_image;
      } catch (e) { csFail('ko'); }
    }
    // 2) نوفل تايم (موقع روايات): بحث بالعنوان؛ البطاقة تحمل الغلاف والعنوان
    if (title && !csOff('mu')) {
      try {
        const d = await X.html('https://novltime.com/ar/search?q=' + encodeURIComponent(title.trim()), { timeout: 12000 });
        let hit = '';
        selA(d, 'a[href*="/novel/"]').some(a => {
          if (a.closest('header, footer, nav')) return false;
          const card = a.closest('article, li, [class*=card]') || a, h = card.querySelector('h1,h2,h3,h4,h5'), im = a.querySelector('img') || card.querySelector('img');
          const t = X.t(h) || (im && im.getAttribute('alt')) || '';
          const u = im && X.img(im, d.__url);
          if (t && u && ok(t, title)) { hit = u; return true; }
          return false;
        });
        CS.bad.mu = 0;
        if (hit) return hit;
      } catch (e) { csFail('mu'); }
    }
    return '';
  };

  // غلاف رواية من صفحتها (للمواقع التي لا تضع صورًا في القوائم، مثل riwayatarab)
  X.coverOf = async function (url) {
    const d = await X.html(url);
    // صورة غلاف صريحة في الصفحة (مسار covers/…) قبل التخمين بالعنوان والدرجات
    const ci = selA(d, 'img').find(i => !i.closest('header, footer, nav') && /\/covers?\/|uploads%2Fcovers|uploads\/covers/i.test(decodeURIComponent((i.getAttribute('src') || '') + ' ' + (i.getAttribute('data-src') || ''))));
    if (ci && X.img(ci, url)) return X.img(ci, url);
    const t = X.t(d.querySelector('h1')) || String(((d.querySelector('meta[property="og:title"]') || {}).content) || '').split(/\s+[|–—-]\s+/)[0];
    return X.findCover(d, url, t) || '';
  };
});
