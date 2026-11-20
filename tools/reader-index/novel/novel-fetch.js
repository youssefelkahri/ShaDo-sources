/* novel-fetch.js — جلب صفحات الروايات (القوائم، صفحة العمل، نص الفصل) عبر متصفح مدمج يجتاز Cloudflare.
 * مستقل عن الواجهة. يعتمد على الجزء الأصلي NovelWeb.java (window.NovelNative).
 *
 *   NovelFetch.getWork(url, {onStatus})   -> {url, title, cover, chapters:[{url,title,num}]}
 *   NovelFetch.getChapter(url, {onStatus}) -> {url, title, paras:[نص], next, prev}
 *   NovelFetch.imgSrc(imageUrl, referer)   -> رابط يمرّ عبر الوسيط الأصلي (كوكيز + Referer)
 *   NovelFetch.kind(url)                   -> 'chapter' | 'manga'
 *   NovelFetch.showBrowser(true|false), NovelFetch.cancel()
 * onStatus يستقبل {type:'loading'|'page'|'challenge'|'progress'|'hidden', count?, url?}
 */
(function (global) {
  'use strict';

  // ---------- المصادر ----------
  // مصدر = {id, name, home, type: 'madara'|'auto', base: 'manga', chapterFmt: '{n}'}
  // base: المقطع الذي تبدأ به روابط الأعمال (/manga/...) ، chapterFmt: شكل رابط الفصل داخل العمل
  const CATALOG = (global.NovelSources && global.NovelSources.CATALOG) || [{ id: 'kolnovel', name: 'ملوك الروايات', home: 'https://kolnovel.com', tpl: 'mangathemesia', base: 'series' }];
  const BUILTIN = CATALOG.map(c => Object.assign({}, c, { type: c.tpl, base: c.base || 'novel', chapterFmt: '{n}', builtin: true }));
  const reEsc = x => String(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  function makeSite(src) {
    const home = String(src.home).replace(/\/+$/, '');
    const host = new URL(home).hostname.replace(/^www\./, '');
    const base = (src.base || 'novel').replace(/^\/+|\/+$/g, '');
    const B = reEsc(base);
    const mangaSlug = u => { const m = u.pathname.match(new RegExp('^/' + B + '/([^/]+)')); return m ? m[1] : null; };
    let ad = null;
    try { ad = global.NovelSources ? global.NovelSources.build(src) : null; } catch (e) { ad = null; }
    return {
      id: src.id, name: src.name || host, home, type: src.type || 'madara', base, src, ad,
      host: new RegExp('(^|\\.)' + reEsc(host) + '$', 'i'),
      chapterRe: src.chapterRe || '/' + B + '/[^/]+/[^/?#]+/?$',
      mangaRe: src.mangaRe || '^/' + B + '/[^/?#]+/?$',
      imgRe: '',
      isChapter: u => new RegExp('^/' + B + '/[^/]+/[^/]+/?$').test(u.pathname),
      mangaUrl: u => { const sl = mangaSlug(u); return sl ? u.origin + '/' + base + '/' + sl + '/' : null; },
      chapterUrl: (mangaUrl, n) => { const u = new URL(mangaUrl); const sl = mangaSlug(u); return sl ? u.origin + '/' + base + '/' + sl + '/' + (src.chapterFmt || '{n}').replace('{n}', n) + '/' : null; },
      browse: {
        latest: o => o + '/' + base + '/?m_orderby=latest',
        popular: o => o + '/' + base + '/?m_orderby=views',
        search: (o, q) => o + '/?s=' + encodeURIComponent(q) + '&post_type=wp-manga',
        page: (url, n) => { const u = new URL(url); u.pathname = u.pathname.replace(/\/page\/\d+\/?$/, '').replace(/\/?$/, '/page/' + n + '/'); return u.href; },
      },
    };
  }
  let SITES = BUILTIN.map(makeSite);
  function setSources(list) { SITES = (list && list.length ? list : BUILTIN).map(x => { try { return makeSite(x); } catch (e) { return null; } }).filter(Boolean); return SITES; }
  // مواقع غير معروفة: تخمين عام
  const GENERIC = {
    id: 'generic', name: 'عام',
    chapterRe: '(chapter|/ch[-_/]?[0-9]|/reader/|/read/|%D9%81%D8%B5%D9%84|فصل)',
    imgRe: '',
    isChapter: u => /(chapter|\/ch[-_/]?\d|\/reader\/|\/read\/|فصل)/i.test(decodeURIComponent(u.pathname)),
    mangaUrl: () => null,
    chapterUrl: () => null,
  };

  function siteFor(url) {
    try { const u = new URL(url); return SITES.find(s => s.ad ? s.ad.owns(url) : s.host.test(u.hostname)) || GENERIC; } catch (e) { return GENERIC; }
  }
  function kind(url) { try { const s = siteFor(url); return (s.ad ? s.ad.isChapter(url) : s.isChapter(new URL(url))) ? 'chapter' : 'manga'; } catch (e) { return 'manga'; } }
  function mangaUrlOf(chapterUrl) { try { const s = siteFor(chapterUrl); return s.ad ? s.ad.mangaOf(chapterUrl) : s.mangaUrl(new URL(chapterUrl)); } catch (e) { return null; } }
  function chapterUrlFor(mangaUrl, n) { try { return siteFor(mangaUrl).chapterUrl(mangaUrl, n); } catch (e) { return null; } }
  function numOf(url) {
    try { const m = decodeURIComponent(new URL(url).pathname).match(/([0-9]+(?:\.[0-9]+)?)(?!.*[0-9])/); return m ? parseFloat(m[1]) : null; } catch (e) { return null; }
  }

  // ---------- السكربت الذي يعمل داخل صفحة الموقع ----------
  // مكتفٍ ذاتيًا (يُحوَّل إلى نص)، لا يستعمل أي متغير من خارجه.

  // ---------- استخراج نص الفصل (يعمل في التطبيق وداخل صفحة الموقع؛ مكتفٍ ذاتيًا) ----------
  // يعيد {paras:[فقرات], title}. يُحقَن في الصفحة عبر toString() فلا يستعمل أي متغير من خارجه.
  function EXTRACT_TEXT(doc) {
    // منقول من Apk-reader-epub (extractChapter): محددات الحاوية، حذف عناصر الإعلانات والواجهة، تنقية الأسطر، وحاوية احتياطية بأكبر نص مباشر
    var SELS = ['.reading-content .text-left', '#readerarea', '.entry-content', '.reading-content', '.chapter-content', '#chapter-content', '#chr-content', '.chapter-body', '[itemprop="articleBody"]', '.epcontent', '.post-content', 'article'];
    var JUNK_RE = new RegExp([
      'حمّ?ل\\s*(ال)?تطبيق', 'تحمل\\s*التطبيق', 'تطبيق\\s*ملوك', 'play\\.google', 'الشعلة', 'شراء\\s*الشعل', 'بدون\\s*إعلانات', 'اشترك\\s*(الآن|الان)', 'الإعلانات\\s*مزعجة',
      'إ?نـ?تـ?هـ?ـ*ي\\s*الـ?فـ?صـ?ـ*ل', 'أفضل\\s*منصة\\s*لقراءة', 'هذا\\s*المحتوى\\s*ترفيهي', 'لا\\s*تجعلوا\\s*القراءة\\s*تلهيكم', 'ترجمة\\s*ورفع\\s*الفصل', 'ترجمة\\s*موقع',
      '^(المشاهدات|معلومات\\s*الاتصال|الفصول|الفهرس|KINGS\\s*OF\\s*NOVELS|ملوك\\s*الروايات).{0,6}$', '^نشر\\s*في\\s*تاريخ', '^(TL|TLC|ED|PR|QC|TLC)\\s*[:：]', '^\\s*[◉㊎✦★☆•\\-–—_=~*#\\s]+.{0,30}[◉㊎✦★☆]+\\s*$', 'KINGS\\s*OF\\s*NOVELS',
      'عالم\\s*الروايات', 'ادعم\\s*الرواية', '^PDF\\b', 'حقوق\\s*(الطبع|النشر|الترجمة|محفوظة)', 'سرقة\\s*(الفصول|المحتوى|الترجمة|الأعمال)', 'يمنع\\s*(النسخ|السرقة)', '^تم$', '^[^\\u0600-\\u06FFa-zA-Z0-9]{3,}$'
    ].join('|'), 'i');
    var NOISE = /^(السابق|التالي|استماع|الفصل السابق|الفصل التالي|فهرس|قائمة الفصول|Aa|\d+\s*\/\s*\d+|advertisement|ads?|إعلان|إعلانات|sponsored|share|مشاركة)$/i;
    var clean = function (t) { return String(t || '').replace(/[ \t ​]+/g, ' ').replace(/\s+/g, ' ').trim(); };
    var root = (doc.body || doc.documentElement).cloneNode(true);
    // مواقع ووردبريس (kolnovel…) تحشو الفصل بفقرات مخفية بصنف عشوائي معرَّف في <style> داخل المقال: تُحذف (منقول من lnreader)
    try { var css = ''; Array.prototype.forEach.call(root.querySelectorAll('article > style, .entry-content style, .epcontent style'), function (st) { css += st.textContent + '\n'; }); (css.match(/\.[\w-]+(?=\s*[,{])/g) || []).forEach(function (c) { Array.prototype.forEach.call(root.querySelectorAll('p' + c), function (p) { p.remove(); }); }); } catch (e) { }
    Array.prototype.forEach.call(root.querySelectorAll('script,style,noscript,nav,header,footer,button,form,aside,svg,iframe,select,ins,[class*="comment"],[id*="comment"],[class*="adsbygoogle"],[class*="setting"],[id*="setting"],[class*="toolbar"],[class*="breadcrumb"],[class*="share"],[class*="donat"],[class*="widget"],.code-block,.sharedaddy,.wp-manga-nav,.nav-links,.chapter-nav'), function (e) { e.remove(); });
    // نصوص وهمية مخبّأة داخل الفصل ضد النسخ (مثل cenele: span شفاف بموضع ثابت، أو role=presentation): تُحذف (منقول من lnreader customJs)
    try { Array.prototype.forEach.call(root.querySelectorAll('[role="presentation"],[style*="opacity"],[style*="visibility"],[style*="font-size"],[style*="display"]'), function (e) { var st = (e.getAttribute('style') || '').replace(/\s+/g, '').toLowerCase(); if (e.getAttribute('role') === 'presentation' || /opacity:0(;|$|!)/.test(st) || /visibility:hidden/.test(st) || /font-size:0(px|;|$)/.test(st) || /display:none/.test(st)) e.parentNode && e.parentNode.removeChild(e); }); } catch (e) { }
    // تقسيم كتلة إلى فقرات (بالأسطر ووسوم الكتل) دون تنفيذ أي شيء: التحليل في مستند خامل
    var split = function (e) {
      var raw = e.innerHTML.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h[1-6]|blockquote|section|tr)>/gi, '\n');
      var t = new DOMParser().parseFromString(raw, 'text/html').body.textContent || '';
      return t.split(/\n+/).map(clean).filter(Boolean);
    };
    var ownedLen = function (e) { var n = 0; for (var i = 0; i < e.childNodes.length; i++) { var c = e.childNodes[i]; if (c.nodeType === 3) n += c.data.trim().length; else if (c.nodeType === 1 && /^(P|LI|BLOCKQUOTE|H[1-6]|SPAN|B|I|EM|STRONG|A)$/.test(c.tagName)) n += c.textContent.trim().length; } return n; };
    var h1 = root.querySelector('h1'), h2 = root.querySelector('h2');
    var title = clean((h2 && /الفصل|chapter/i.test(h2.textContent) ? h2 : h1 || h2 || {}).textContent);
    var paras = [], sel = 'weak';
    for (var i = 0; i < SELS.length && !paras.length; i++) {
      var e = root.querySelector(SELS[i]);
      if (e && e.textContent.trim().length > 200) { var ps = split(e); if (ps.length >= 3) { paras = ps; sel = SELS[i]; } }
    }
    if (!paras.length) {
      var best = null, bl = 0, all = root.querySelectorAll('div,section,article,main'); 
      Array.prototype.forEach.call(all, function (e) { var n = ownedLen(e); if (n > bl) { bl = n; best = e; } });
      if (!best) best = root;
      if (best && (bl > 80 || best === root)) { paras = split(best); sel = 'fallback'; }
    }
    paras = paras.filter(function (t) { return t && !NOISE.test(t) && !(t.length < 160 && JUNK_RE.test(t)); });
    var nz = function (t) { return t.replace(/[\s\d٠-٩:：\-–—()\[\]]/g, ''); }, nt = nz(title);
    if (nt) paras = paras.filter(function (t, i) { return !(i < 4 && t.length < title.length + 40 && (nz(t) === nt || (nt.length > 6 && nz(t).indexOf(nt) >= 0))); });
    var out = [];
    paras.forEach(function (t) { if (out[out.length - 1] !== t) out.push(t); });
    return { paras: out, title: title, sel: sel };
  }
  var NAV_NEXT = 'a.next_page, .nav-next a, a.ch-next-btn, a[rel=next], .next-chap a, a.next-chapter';
  var NAV_PREV = 'a.prev_page, .nav-previous a, a.ch-prev-btn, a[rel=prev], .prev-chap a, a.prev-chapter';

  function PAGE_SCRIPT(o) {
    if (window.__mfId === o.id) return;
    window.__mfId = o.id;
    var post = function (m) { try { NovelOut.post(o.id, JSON.stringify(m)); } catch (e) { } };
    var IMG_EXT = /\.(jpe?g|png|webp|avif|gif)(\?|#|$)/i;
    var BAD = /(logo|avatar|favicon|icon[s]?[\/._-]|banner|sprite|emoji|loading|loader|placeholder|blank\.|pixel|\/ads?\/|advert|discord|facebook|twitter|telegram|gravatar|flag)/i;
    var imgRe = o.imgRe ? new RegExp(o.imgRe, 'i') : null;
    var chRe = o.chapterRe ? new RegExp(o.chapterRe, 'i') : null;
    var abs = function (u) { try { return new URL(String(u).trim(), location.href).href; } catch (e) { return null; } };
    var challenge = function () {
      var t = document.title || '';
      return /just a moment|checking your browser|un instant|einen moment|لحظة|please wait/i.test(t) ||
        !!document.querySelector('#challenge-form,#cf-challenge-running,#challenge-running,#challenge-stage,.cf-turnstile,#turnstile-wrapper,iframe[src*="challenges.cloudflare.com"]');
    };
    var blocked = function () {
      if (document.querySelector('#cf-error-details,.cf-error-details,#cf-wrapper .cf-error-type')) return true;
      var b = (document.body && document.body.innerText || '').slice(0, 3000);
      return /you have been blocked|unable to access|error 1020|access denied|error 1010|error 1015/i.test(b + ' ' + document.title);
    };
    var ATTRS = ['data-src', 'data-lazy-src', 'data-original', 'data-url', 'data-cfsrc', 'data-full', 'data-image', 'src'];

    function chapter() {
      var ex = window.__nvExtract(document), paras = ex.paras;
      var q = function (sel) { var e = document.querySelector(sel); return e ? abs(e.getAttribute('href')) : null; };
      var next = q(o.navNext), prev = q(o.navPrev);
      if (!next || !prev) {
        var as = document.querySelectorAll('a[href]');
        for (var j = 0; j < as.length; j++) {
          var a2 = as[j], h = abs(a2.getAttribute('href'));
          if (!h || h.split('#')[0] === location.href.split('#')[0]) continue;
          if (chRe && !chRe.test(h)) continue;
          var lab = ((a2.getAttribute('rel') || '') + ' ' + (a2.getAttribute('aria-label') || '') + ' ' + (a2.className || '') + ' ' + (a2.textContent || '')).toLowerCase();
          if (!next && /next|التالي|القادم/.test(lab)) next = h;
          else if (!prev && /prev|السابق/.test(lab)) prev = h;
        }
      }
      var title = (document.querySelector('#chapter-heading, h1.entry-title, h1') || {}).textContent || document.title || '';
      var chars = paras.join('').length;
      return { url: location.href, title: title.trim().slice(0, 200), paras: paras, next: next, prev: prev, count: Math.floor(chars / 50), fast: chars >= 400, diag: { sel: ex.sel, paras: paras.length, chars: chars } };
    }

    function manga() {
      var meta = function (p) { var e = document.querySelector('meta[property="' + p + '"],meta[name="' + p + '"]'); return e ? e.getAttribute('content') : ''; };
      var BAD = /^\s*(access denied|forbidden|just a moment|attention required|blocked|error\b|403\b|404\b|not found)/i;
      var title = '';
      var cands = document.querySelectorAll('.post-title h1, .post-title h3, h1.entry-title, .entry-title, h1');
      for (var ci = 0; ci < cands.length && !title; ci++) {
        var cc = cands[ci].cloneNode(true);
        Array.prototype.forEach.call(cc.querySelectorAll('span,small,i,em,script,style'), function (x) { x.remove(); });
        var ct = (cc.textContent || cands[ci].textContent || '').replace(/\s+/g, ' ').trim();
        if (ct && !BAD.test(ct)) title = ct;
      }
      if (!title) { var og = meta('og:title'); if (og && !BAD.test(og)) title = og.replace(/\s*[-–|»]\s*[^-–|»]*$/, '') || og; }
      var cimg = document.querySelector('.summary_image img, .thumb img, .seriestucon img');
      var cover = (cimg && (cimg.getAttribute('data-src') || cimg.getAttribute('data-lazy-src') || cimg.getAttribute('src'))) || meta('og:image') || '';
      var chs = [], seen = {};
      var as = document.querySelectorAll('li.wp-manga-chapter a, #chapterlist li a');
      var strict = as.length > 0;
      if (!strict) as = document.querySelectorAll('a[href]');
      for (var i = 0; i < as.length; i++) {
        var h = abs(as[i].getAttribute('href'));
        if (!h) continue;
        var k = h.split('#')[0];
        if (seen[k]) continue;
        try { if (new URL(k).hostname !== location.hostname) continue; } catch (e) { continue; }
        if (!strict && !(chRe ? chRe.test(k) : /(chapter|\/ch[-_]?\d|\/reader\/|فصل)/i.test(decodeURIComponent(k)))) continue;
        if (k.split('#')[0].replace(/\/$/, '') === location.href.split('#')[0].replace(/\/$/, '')) continue;
        seen[k] = 1;
        var t = (as[i].innerText || as[i].textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120);
        if (!t) continue;
        var mm = decodeURIComponent(new URL(k).pathname).match(/([0-9]+(?:\.[0-9]+)?)(?!.*[0-9])/);
        chs.push({ url: k, title: t, num: mm ? parseFloat(mm[1]) : null });
      }
      if (chs.length && chs.every(function (c) { return c.num !== null; })) chs.sort(function (a, b) { return b.num - a.num; });
      return { url: location.href, title: title.slice(0, 200), cover: cover ? abs(cover) : '', chapters: chs, count: chs.length, fast: strict };
    }

    // قائمة فصول تُحمَّل بالنقر (novltime): نضغط تبويب «الفصول» ثم «تحميل المزيد» مرارًا ونعيد نص كل عنصر فصل
    var tabbed = false, noMore = 0, nClicks = 0;
    function chlist() {
      var rows = [], seen = {}, as = document.querySelectorAll('a[href]'), rre = o.rowRe ? new RegExp(o.rowRe, 'i') : chRe;
      for (var i = 0; i < as.length; i++) {
        var h = abs(as[i].getAttribute('href')); if (!h) continue;
        var k = h.split('#')[0].split('?')[0];
        if (seen[k] || !(rre ? rre.test(k) : /\/chapter\//i.test(k))) continue;
        if (as[i].closest && as[i].closest('header,footer,nav')) continue;
        var lv = Array.prototype.filter.call(as[i].querySelectorAll('*'), function (e) { return !e.children.length; }).map(function (e) { return (e.textContent || '').trim(); }).filter(Boolean);
        var tx = lv.length ? lv.join('\n') : (as[i].textContent || '').trim();
        if (!o.rowRe && !/\d/.test(tx)) continue;
        var row = { url: k, text: tx };
        if (o.rowRe) {
          var card = as[i].closest('article,li,[class*=card]') || as[i], hd = as[i].querySelector('h1,h2,h3,h4,h5') || card.querySelector('h1,h2,h3,h4,h5'), im = as[i].querySelector('img') || card.querySelector('img');
          row.h = hd ? (hd.textContent || '').trim() : '';
          row.img = im ? (im.currentSrc || im.getAttribute('src') || im.getAttribute('data-src') || '') : '';
          row.alt = im ? (im.getAttribute('alt') || '') : '';
        }
        seen[k] = 1; rows.push(row);
      }
      return { url: location.href, chapters: rows, count: rows.length, fast: false, req: (window.__mfReq || []).slice(0, 40) };
    }
    function chStep() {
      var clicked = false;
      if (!tabbed && o.tab) {
        var ts = document.querySelectorAll('[role=tab],button,a'), tre = new RegExp(o.tab);
        for (var i = 0; i < ts.length && !tabbed; i++) {
          var t = (ts[i].textContent || '').replace(/\s+/g, ' ').trim();
          if (t.length < 30 && tre.test(t) && !/\/chapter\//.test(ts[i].getAttribute('href') || '')) { try { ts[i].click(); } catch (e) { } tabbed = true; clicked = true; }
        }
      }
      if (o.more) {
        var bs = document.querySelectorAll('button,[role=button]'), mre = new RegExp(o.more, 'i');
        for (var j = 0; j < bs.length; j++) {
          var b = bs[j], bt = (b.textContent || '').replace(/\s+/g, ' ').trim();
          if (bt.length < 40 && mre.test(bt) && !b.disabled && b.offsetParent !== null && !(o.clicks && nClicks >= o.clicks)) { nClicks++; try { b.scrollIntoView({ block: 'center' }); b.click(); } catch (e) { } clicked = true; break; }
        }
      }
      noMore = clicked ? 0 : noMore + 1;
    }

    // صفحة قائمة أعمال (الأحدث / البحث): بطاقات = رابط عمل + صورة + عنوان
    function typeQuery(Q) {
      var inp = null, tries = 0;
      var go = function () {
        inp = Array.prototype.slice.call(document.querySelectorAll('input')).filter(function (x) { return !/hidden|checkbox|radio|submit|button|file|password/.test(x.type || 'text'); })[0];
        if (!inp) { if (++tries < 20) setTimeout(go, 300); else window.__nvTypedAt = Date.now(); return; }
        try { inp.focus(); } catch (e) { }
        var set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        set.call(inp, ''); inp.dispatchEvent(new Event('input', { bubbles: true })); set.call(inp, Q);
        inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true }));
        ['keydown', 'keypress', 'keyup'].forEach(function (ty) { inp.dispatchEvent(new KeyboardEvent(ty, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true })); });
        var f = inp.form; if (f) { try { f.requestSubmit ? f.requestSubmit() : f.submit(); } catch (e) { } }
        window.__nvTypedAt = Date.now();
      };
      go();
    }
    function listing() {
      if (o.query) {
        if (!window.__nvTyped) { window.__nvTyped = 1; typeQuery(o.query); }
        if (!window.__nvTypedAt || Date.now() - window.__nvTypedAt < 1200) return { url: location.href, items: [], count: 0, fast: false };
      }
      var mre = o.mangaRe ? new RegExp(o.mangaRe, 'i') : /\/(manga|series|comics?|webtoon)\/[^\/?#]+\/?$/i;
      var imgOf = function (img) {
        if (!img) return '';
        var ATT = ['data-src', 'data-lazy-src', 'data-original', 'data-cfsrc', 'data-wpfc-original-src', 'data-lazy', 'data-image', 'src'];
        var bad = function (v) { return !v || /^(data|blob):/i.test(v) || /placeholder|blank|pixel|spacer|loading|lazy\.(gif|png|svg)|1x1/i.test(v); };
        for (var a = 0; a < ATT.length; a++) { var v = (img.getAttribute(ATT[a]) || '').trim(); if (!bad(v)) return abs(v); }
        var ss = img.getAttribute('data-srcset') || img.getAttribute('srcset');
        if (ss) { var sv = ss.split(',')[0].trim().split(/\s+/)[0]; if (!bad(sv)) return abs(sv); }
        for (var j = 0; j < img.attributes.length; j++) { var at = img.attributes[j]; if (/^data-/.test(at.name) && /\.(jpe?g|png|webp|avif)(\?|$)/i.test(at.value) && !bad(at.value)) return abs(at.value.trim()); }
        return img.currentSrc && !bad(img.currentSrc) ? img.currentSrc : '';
      };
      var items = [], by = {}, here = location.href.split('#')[0].split('?')[0].replace(/\/$/, '');
      var as = document.querySelectorAll('a[href]');
      for (var i = 0; i < as.length; i++) {
        var a = as[i], h = abs(a.getAttribute('href'));
        if (!h) continue;
        var k = h.split('#')[0].split('?')[0], u;
        try { u = new URL(k); } catch (e) { continue; }
        if (u.hostname !== location.hostname || !mre.test(u.pathname) || k.replace(/\/$/, '') === here) continue;
        var it = by[k];
        if (!it) { it = by[k] = { url: k, title: '', cover: '', alt: true }; items.push(it); }
        var img = a.querySelector('img');
        if (!img) {
          var p = a.parentElement;
          for (var up = 0; up < 3 && p && !img; up++, p = p.parentElement) { var ims = p.querySelectorAll('img'); if (ims.length === 1) img = ims[0]; else if (ims.length > 1) break; }
        }
        if (img && !it.cover) it.cover = imgOf(img);
        var t = (a.textContent || '').replace(/\s+/g, ' ').trim();
        if (t && t.length < 150 && (it.alt || t.length > it.title.length)) { it.title = t; it.alt = false; }
        else if (!it.title) it.title = ((img && img.getAttribute('alt')) || a.getAttribute('title') || '').trim();
      }
      items = items.filter(function (x) { return x.title; }).map(function (x) { return { url: x.url, title: x.title.slice(0, 150), cover: x.cover }; });
      var nx = document.querySelector('a.nextpostslink, .nav-previous a, a.next.page-numbers, .pagination a[rel=next], a[rel=next], link[rel=next]');
      if (o.query && Date.now() - window.__nvTypedAt < 13000) {
        // انتظر ظهور نتيجة عنوانها يحوي الكلمة (النتائج تُرسم بالجافاسكربت)، حتى 13 ث — كما في epub (wvScript)
        var nrm = function (t) { return String(t || '').toLowerCase().replace(/[\u064B-\u065F\u0670\u0640]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/\s+/g, ' ').trim(); };
        var key = (nrm(o.query).split(' ').filter(function (x) { return x.length > 1; })[0] || '').replace(/^ال/, '');
        if (key && !items.some(function (x) { return nrm(x.title).indexOf(key) >= 0; })) return { url: location.href, items: [], count: 0, fast: false };
      }
      return { url: location.href, items: items, next: nx ? abs(nx.getAttribute('href')) : null, count: items.length, fast: true };
    }

    var clicked = {};
    var expand = function () {
      var bs = document.querySelectorAll('button, [role=button]');
      for (var i = 0; i < bs.length; i++) {
        var t = (bs[i].textContent || '').trim();
        if (t.length < 40 && !clicked[t] && /(عرض|تحميل|إظهار|اظهار)\s*(المزيد|الكل|كل الفصول|جميع الفصول)|show more|load more|all chapters|view all/i.test(t)) { clicked[t] = 1; try { bs[i].click(); } catch (e) { } }
      }
    };

    var last = -1, lastH = -1, stable = 0, t0 = Date.now(), tFirst = 0, wasCh = false, atEnd = false;
    var tick = function () {
      if (window.__mfId !== o.id) return;
      if (blocked()) { post({ type: 'blocked' }); return; }
      if (challenge()) {
        if (!wasCh) post({ type: 'challenge' });
        wasCh = true; t0 = Date.now(); return setTimeout(tick, 1000);
      }
      if (o.mode === 'warm') { post({ type: 'done', data: { count: 1 } }); return; }
      var data;
      try { data = o.mode === 'chapter' ? chapter() : o.mode === 'list' ? listing() : o.mode === 'chlist' ? chlist() : manga(); } catch (e) { data = { error: String(e), count: 0 }; }
      var n = data.count;
      var se = document.scrollingElement || document.documentElement;
      var H = se.scrollHeight;
      if (n > 0 && !tFirst) tFirst = Date.now();
      if (n > 0 && n === last && H === lastH) stable++; else stable = 0;
      last = n; lastH = H;
      post({ type: 'progress', count: n });
      // تمرير الصفحة لتشغيل التحميل الكسول (وإيقاظ العناصر واحدًا تلو الآخر)
      if (se.scrollTop + window.innerHeight >= H - 50) atEnd = true;
      else { atEnd = false; window.scrollBy(0, Math.max(400, window.innerHeight * 1.5)); }
      try { window.dispatchEvent(new Event('scroll')); } catch (e) { }
      if (o.mode === 'manga') expand();
      if (o.mode === 'chlist') chStep();
      var minWait = o.mode === 'chapter' ? 2500 : 2000;
      var done = data.fast
        ? n > 0 && stable >= 2 && Date.now() - tFirst > 1200
        : n > 0 && stable >= o.stable && (atEnd || stable >= o.stable * 3) && Date.now() - tFirst > minWait;
      if (o.mode === 'chlist') done = (o.expect && n >= o.expect) || ((tabbed || !o.tab) && stable >= 10 && noMore >= 10 && !(o.clicks && nClicks < o.clicks && Date.now() - t0 < o.timeout - 2000));
      if (done || Date.now() - t0 > o.timeout) { try { window.scrollTo(0, 0); } catch (e) { } post({ type: 'done', data: data }); return; }
      setTimeout(tick, o.mode === 'chlist' ? 250 : 700);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tick); else tick();
  }

  // يعمل قبل سكربتات الموقع (document-start): يلتقط ردود fetch/XHR، ويجعل التحميل الكسول يعمل فورًا
  function EARLY_SCRIPT() {
    if (window.__mfEarly) return; window.__mfEarly = 1;
    var net = window.__mfNet = [];
    try { performance.setResourceTimingBufferSize(5000); } catch (e) { }
    var grab = function (t) { try { if (typeof t === 'string' && t.length < 8e6 && /\.(jpe?g|png|webp|avif|gif)/i.test(t)) net.push(t); } catch (e) { } };
    var of = window.fetch;
    window.__mfOrigFetch = of;
    var rq = window.__mfReq = [];
    var logReq = function (u) { try { u = String(u && u.url || u); if (rq.length < 60 && !/\.(jpe?g|png|webp|avif|gif|svg|css|woff2?)(\?|$)/i.test(u)) rq.push(u.slice(0, 200)); } catch (e) { } };
    if (of) window.fetch = function () {
      logReq(arguments[0]);
      return of.apply(this, arguments).then(function (r) {
        try { var ct = (r.headers.get('content-type') || ''); if (/json|text|javascript|component/i.test(ct)) r.clone().text().then(grab, function () { }); } catch (e) { }
        return r;
      });
    };
    var XO = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (m, u) { logReq(u); return XO.apply(this, arguments); };
    var XS = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function () {
      this.addEventListener('load', function () {
        try { if (!this.responseType || this.responseType === 'text') grab(this.responseText); else if (this.responseType === 'json') grab(JSON.stringify(this.response)); } catch (e) { }
      });
      return XS.apply(this, arguments);
    };
    var IO = window.IntersectionObserver;
    if (IO) {
      var W = function (cb, opt) {
        var io = new IO(cb, opt), ob = io.observe.bind(io);
        io.observe = function (el) {
          ob(el);
          setTimeout(function () {
            try { var r = el.getBoundingClientRect(); cb([{ target: el, isIntersecting: true, intersectionRatio: 1, boundingClientRect: r, intersectionRect: r, rootBounds: null, time: performance.now() }], io); } catch (e) { }
          }, 30);
        };
        return io;
      };
      W.prototype = IO.prototype;
      window.IntersectionObserver = W;
    }
  }

  // ---------- الجانب الخاص بالتطبيق ----------
  let cur = null;          // الطلب الجاري
  let seq = 0;
  const cache = new Map(); // url -> نتيجة (للرجوع السريع)

  function available() { return !!global.NovelNative; }
  let earlySet = false;
  function setEarly() {
    if (earlySet) return; earlySet = true;
    try { NovelNative.setEarly('(' + EARLY_SCRIPT.toString() + ')();'); } catch (e) { }
  }

  function run(url, mode, opts) {
    opts = opts || {};
    if (!available()) return Promise.reject(new Error('هذه الميزة تعمل داخل تطبيق أندرويد فقط'));
    if (!opts.force && cache.has(mode + '|' + url)) return Promise.resolve(cache.get(mode + '|' + url));
    // طلب جارٍ للرابط نفسه (مثلًا تحميل مسبق للفصل التالي): انضم إليه بدل البدء من جديد
    if (cur && cur.url === url && cur.mode === mode && !opts.force) {
      if (!opts.quiet) { cur.quiet = false; cur.st = opts.onStatus || cur.st; cur.st({ type: 'progress', count: 0 }); }
      return cur.promise;
    }
    if (opts.quiet && cur) { const e = new Error('busy'); e.quiet = true; return Promise.reject(e); }
    cancel();
    setEarly();
    const site = siteFor(url);
    const id = 'r' + Date.now() + '_' + (++seq);
    const o = { id, mode, query: opts.query || '', navNext: NAV_NEXT, navPrev: NAV_PREV, imgRe: site.imgRe, chapterRe: site.chapterRe, mangaRe: opts.mangaRe || site.mangaRe, tab: opts.tab || '', more: opts.more || '', expect: opts.expect || 0, rowRe: opts.rowRe || '', clicks: opts.clicks || 0, stable: mode === 'chapter' ? 4 : 4, timeout: opts.timeout || 40000 };
    const js = 'window.__nvExtract=' + EXTRACT_TEXT.toString() + ';(' + PAGE_SCRIPT.toString() + ')(' + JSON.stringify(o) + ');';
    let promise;
    return promise = new Promise((resolve, reject) => {
      let shownForChallenge = false, sawChallenge = false;
      const started = Date.now();
      const hardLimit = setInterval(() => {
        if (Date.now() - started > (sawChallenge ? 300000 : Math.max(90000, (opts.timeout || 0) + 10000))) finish(new Error('انتهت المهلة دون العثور على شيء'));
      }, 2000);
      const finish = (err, data) => {
        if (!cur || cur.id !== id) return;
        clearInterval(hardLimit);
        cur = null;
        try { NovelNative.stop(); } catch (e) { }
        if (err) reject(err); else resolve(data);
      };
      cur = {
        id, finish, url, mode, quiet: !!opts.quiet, st: opts.onStatus || function () { },
        get promise() { return promise; },
        on(m) {
          const st = cur.st;
          if (m.type === 'blocked') {
            showBrowser(false);
            const e = new Error('blocked'); e.blocked = true;
            return finish(e);
          }
          if (m.type === 'challenge' && cur.quiet) {
            const e = new Error('challenge'); e.quiet = true; return finish(e);
          }
          if (m.type === 'challenge') {
            sawChallenge = true;
            if (!shownForChallenge) { shownForChallenge = true; showBrowser(true, 'أكمل التحقق، وسيتابع التطبيق تلقائيًا عند نجاحه.'); }
          } else if (m.type === 'progress' && sawChallenge && shownForChallenge) {
            showBrowser(false); sawChallenge = false;
          } else if (m.type === 'loadError') {
            if (m.code === -2 || m.code === -6 || m.code === -8) return finish(new Error('تعذّر الاتصال بالموقع (' + m.desc + ')'));
          } else if (m.type === 'page') {
            setTimeout(() => { try { NovelNative.reinject(); } catch (e) { } }, 1500);
          } else if (m.type === 'done') {
            const d = m.data || {};
            if (d.error) return finish(new Error(d.error));
            if (mode === 'warm') return finish(null, d);
            if (mode === 'chapter') {
              if (!d.paras || !d.paras.length) return finish(new Error('لم يُعثر على نص في هذه الصفحة'));
              d.url = url;
            } else if (mode === 'list') {
              if (!d.items || !d.items.length) return finish(new Error('لم يُعثر على أعمال في هذه الصفحة'));
            } else {
              d.url = url;
            }
            cache.set(mode + '|' + url, d);
            return finish(null, d);
          }
          st(m);
        },
      };
      cur.st({ type: 'loading', url });
      NovelNative.load(id, url, js);
    });
  }

  // جرّب هويات متصفح مختلفة إن حظر Cloudflare الطلب، واحفظ التي نجحت لكل موقع
  const UA_MODES = [0, 1, 2];
  function hostOf(u) { try { return new URL(u).hostname; } catch (e) { return ''; } }
  function uaGet(h) { try { return +(localStorage.getItem('mf.ua.' + h) || 0); } catch (e) { return 0; } }
  function uaPut(h, m) { try { localStorage.setItem('mf.ua.' + h, String(m)); } catch (e) { } }
  async function runUa(url, mode, opts) {
    opts = opts || {};
    const h = hostOf(url), first = uaGet(h);
    const order = [first].concat(UA_MODES.filter(m => m !== first));
    let lastErr;
    for (const m of order) {
      try { NovelNative.setUa(m); } catch (e) { }
      try {
        const d = await run(url, mode, Object.assign({}, opts, { force: opts.force || m !== first }));
        if (m !== first) uaPut(h, m);
        return d;
      } catch (e) {
        lastErr = e;
        if (!e || !e.blocked || opts.quiet) throw e;
        if (opts.onStatus) opts.onStatus({ type: 'retry', ua: m });
      }
    }
    const e = new Error('حظر Cloudflare هذا الجهاز/الاتصال من الموقع. افتح الموقع في Chrome: إن حُظر هناك أيضًا فالحظر على عنوان IP (جرّب شبكة أخرى أو أوقف VPN).');
    e.blocked = true;
    throw e;
  }

  function cancel() {
    if (cur) { const c = cur; c.finish(new Error('cancelled')); }
  }
  function showBrowser(on, text) { try { NovelNative.show(!!on, text || ''); } catch (e) { } }

  function imgSrc(url, referer, keep) {
    if (!available() || !url) return url;
    let r = referer || '';
    try { if (!r) r = new URL(url).origin + '/'; } catch (e) { }
    return '/__mimg?u=' + encodeURIComponent(url) + '&r=' + encodeURIComponent(r) + (keep ? '&k=1' : '');
  }


  // صورة عبر جلسة المتصفح الخفي (نفس الأصل وكوكيز Cloudflare) -> data URL. حلّ للصور المحمية التي يرفضها الوسيط الأصلي.
  const imgQ = []; let imgBusy = 0; const imgMemo = {};
  function imgData(url) {
    if (!available() || !url) return Promise.resolve('');
    if (imgMemo[url]) return imgMemo[url];
    return imgMemo[url] = new Promise(res => { imgQ.push({ url, res }); pumpImg(); });
  }
  async function pumpImg() {
    if (imgBusy >= 3 || !imgQ.length) return;
    const j = imgQ.shift(); imgBusy++;
    let out = '';
    try {
      const origin = new URL(j.url).origin;
      if (parked !== origin && !cur) { try { await ensureSession(origin); } catch (e) { } }
      if (parked === origin) {
        out = await new Promise(resolve => {
          const id = 'i' + (++hseq);
          const t = setTimeout(() => { delete pend[id]; resolve(''); }, 25000);
          pend[id] = v => { clearTimeout(t); resolve(v && v.data && /^data:image\//.test(v.data) ? v.data : ''); };
          const js = '(function(){var f=window.__mfOrigFetch||fetch,id=' + JSON.stringify(id) + ';f(' + JSON.stringify(j.url) + ',{credentials:"include"}).then(function(r){if(!r.ok)throw 0;return r.blob()}).then(function(b){' +
            'var fr=new FileReader();fr.onload=function(){NovelOut.reply(id,JSON.stringify({data:fr.result}))};fr.readAsDataURL(b)}).catch(function(){NovelOut.reply(id,"{}")})})()';
          try { NovelNative.eval(js); } catch (e) { clearTimeout(t); delete pend[id]; resolve(''); }
        });
      }
    } catch (e) { }
    if (!out) delete imgMemo[j.url];
    j.res(out); imgBusy--; pumpImg();
  }

  // ================= المسار السريع =================
  // نجتاز Cloudflare مرة واحدة بفتح الصفحة الرئيسية، ثم نركن المتصفح على robots.txt من الموقع نفسه
  // وننفّذ كل الطلبات كـ fetch من داخله (نفس الأصل، نفس الكوكيز)، ونحلّل HTML هنا.
  const pend = {};
  let hseq = 0;
  const warming = {};
  let parked = '';

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  function where() { try { return NovelNative.where() || ''; } catch (e) { return ''; } }

  async function ensureSession(origin, opts) {
    if (parked === origin && where().indexOf(origin + '/robots.txt') === 0) return;
    if (warming[origin]) return warming[origin];
    warming[origin] = (async () => {
      parked = '';
      const st = opts && opts.onStatus;
      // لا نزعج المستخدم بتحميل الصفحة الرئيسية؛ فقط بالتحقق إن ظهر
      await runUa(origin + '/', 'warm', { force: true, timeout: 30000, onStatus: m => { if (st && (m.type === 'challenge' || m.type === 'retry')) st(m); } });
      try { NovelNative.park(origin + '/robots.txt'); } catch (e) { }
      for (let i = 0; i < 60; i++) { await sleep(150); if (where().indexOf(origin + '/robots.txt') === 0) break; }
      parked = origin;
    })();
    try { await warming[origin]; } finally { delete warming[origin]; }
  }

  function http(url, o) {
    o = o || {};
    return new Promise((resolve, reject) => {
      const id = 'h' + (++hseq);
      const t = setTimeout(() => { delete pend[id]; reject(new Error('انتهت مهلة الطلب')); }, o.timeout || 20000);
      pend[id] = v => { clearTimeout(t); resolve(v); };
      const hd = Object.assign({}, o.headers || {});
      delete hd.Referer; delete hd.referer; delete hd.Cookie;
      let same = true; try { same = new URL(url).origin === (o.via || new URL(url).origin); } catch (e) { }
      const init = { method: o.method || 'GET', credentials: same ? 'include' : 'same-origin', headers: hd };
      if (o.body != null) init.body = o.body;
      const ck = o.cookie ? 'try{document.cookie=' + JSON.stringify(o.cookie + ';path=/') + '}catch(e){}' : '';
      const js = '(function(){' + ck + 'var f=window.__mfOrigFetch||fetch,id=' + JSON.stringify(id) + ';' +
        'f(' + JSON.stringify(url) + ',' + JSON.stringify(init) + ').then(function(r){return r.text().then(function(t){' +
        'NovelOut.reply(id,JSON.stringify({status:r.status,url:r.url,text:t,cf:r.headers.get("cf-mitigated")||""}))})})' +
        '.catch(function(e){NovelOut.reply(id,JSON.stringify({error:String(e)}))})})()';
      try { NovelNative.eval(js); } catch (e) { clearTimeout(t); delete pend[id]; reject(e); }
    });
  }
  const isChallenge = r => r.cf === 'challenge' || ((r.status === 403 || r.status === 503) && /challenge-platform|Just a moment|cf-chl|cf_chl_opt/i.test(r.text || ''));

  async function fastGet(url, o) {
    o = o || {};
    const origin = new URL(url).origin;
    for (let attempt = 0; attempt < 2; attempt++) {
      await ensureSession(origin, o);
      let r;
      try { r = await http(url, o); } catch (e) { parked = ''; if (attempt) throw e; continue; }
      if (r.error) { parked = ''; if (attempt) throw new Error(r.error); continue; }
      if (isChallenge(r)) { parked = ''; if (attempt) throw new Error('حماية Cloudflare'); continue; }
      if (r.status >= 400) { const e = new Error('HTTP ' + r.status); e.status = r.status; throw e; }
      const doc = new DOMParser().parseFromString(r.text, 'text/html');
      if (isDeniedDoc(doc, r.text)) { parked = ''; if (attempt) throw new Error('الموقع رفض الطلب (Access Denied)'); continue; }
      return { doc, url: r.url || url, text: r.text };
    }
  }

  // ---------- الطلبات الأصلية (NovelNative.http) ----------
  const hasNative = () => { try { return !!(global.NovelNative && global.NovelNative.http); } catch (e) { return false; } };
  let NAT; try { NAT = JSON.parse(localStorage.getItem('mf.nat')) || {}; } catch (e) { NAT = {}; }
  // 'wv' (احتاج المتصفح بسبب Cloudflare) لا يدوم إلا 30 دقيقة: بعد التحقق مرة يكون cf_clearance محفوظًا،
  // والطلب الأصلي يرسله مع نفس الـUser-Agent، فنعيد تجربة المسار السريع بدل البقاء على المتصفح 3 أيام
  const natGet = h => { const x = NAT[h]; if (!x) return ''; const ttl = x.m === 'wv' ? 30 * 6e4 : 3 * 864e5; return Date.now() - x.t < ttl ? x.m : ''; };
  function natPut(h, m) { if (NAT[h] && NAT[h].m === m) return; NAT[h] = { m, t: Date.now() }; try { localStorage.setItem('mf.nat', JSON.stringify(NAT)); } catch (e) { } }
  const LIM = {}, DOWN = {};
  async function limitWait(host) {
    const L = LIM[host] || (LIM[host] = { next: 0, back: 0 });
    const now = Date.now();
    const at = Math.max(now, L.next, L.until || 0);
    L.next = at + 120;
    if (at > now) await new Promise(r => setTimeout(r, at - now));
    return Math.max(0, at - now);
  }
  // سجل التشخيص (NovelLog) — آمن إن لم يُحمَّل
  const LG = (tag, msg, x) => { try { global.NovelLog && global.NovelLog.add(tag, msg, x); } catch (e) { } };
  const shortU = u => { try { const x = new URL(u); return x.hostname + x.pathname + x.search; } catch (e) { return String(u).slice(0, 120); } };
  function limitNote(host, status) {
    const L = LIM[host] || (LIM[host] = { next: 0, back: 0 });
    if (status === 429 || status === 503) { L.back = Math.min((L.back || 1500) * 2, 20000); L.until = Date.now() + L.back; }
    else if (status && status < 400) L.back = 0;
  }
  async function nativeHttp(url, o) {
    let host = ''; try { host = new URL(url).hostname; } catch (e) { }
    // موقع معطّل (5xx من Cloudflare مثل 522/524 أو مهلة طويلة): نتجاوزه ساعة بدل انتظار 20s في كل بحث
    if (host && DOWN[host] > Date.now()) { const e = new Error('الموقع متوقف حاليًا'); e.status = 522; e.down = true; throw e; }
    const w = host ? await limitWait(host) : 0;
    const t1 = Date.now();
    let r;
    try { r = await nativeHttp0(url, o); }
    catch (e) { LG('net', 'ERR ' + shortU(url), { err: String(e && e.message || e), wait: w, ms: Date.now() - t1 }); throw e; }
    if (host && r) limitNote(host, r.status);
    if (host && r && (r.status >= 520 && r.status <= 530 || (Date.now() - t1 > 15000 && !(r.status < 400)))) { DOWN[host] = Date.now() + 36e5; LG('net', host + ' معطّل — يُتجاوز ساعة', { st: r.status }); }
    const lim = LIM[host];
    LG('net', (o.method || 'GET') + ' ' + shortU(url), { st: r && r.status, wait: w, ms: Date.now() - t1, h: r && r.h, b: r && r.b, hops: r && r.hops, len: r && r.text ? r.text.length : 0, cf: (r && r.cf) || undefined, err: (r && r.error) || undefined, back: lim && lim.until > Date.now() ? Math.round(lim.until - Date.now()) : undefined });
    return r;
  }
  function nativeHttp0(url, o) {
    return new Promise((resolve, reject) => {
      const id = 'n' + (++hseq);
      const t = setTimeout(() => { delete pend[id]; reject(new Error('انتهت مهلة الطلب')); }, o.timeout || 25000);
      pend[id] = v => { clearTimeout(t); resolve(v); };
      try { NovelNative.http(id, url, o.method || 'GET', JSON.stringify(o.headers || {}), o.body == null ? null : String(o.body)); }
      catch (e) { clearTimeout(t); delete pend[id]; reject(e); }
    });
  }

  // طلب عام عبر جلسة الموقع (via = أصل الموقع الذي نجتاز حمايته)
  async function req(url, o) {
    o = o || {};
    if (!available()) {
      // خارج التطبيق (اختبار): fetch مباشر
      const f = global.__mfOrigFetch || fetch;
      const r = await f(url, { method: o.method || 'GET', headers: o.headers || {}, body: o.body });
      return { status: r.status, url: r.url || url, text: await r.text() };
    }
    const via = o.via || new URL(url).origin;
    // طلب أصلي متوازٍ بلا متصفح: أسرع، ويُستعمل أولًا للمواقع غير المحمية
    const host = new URL(via).hostname;
    if (hasNative() && !o.cookie && (o.native === 'only' || (natGet(host) !== 'wv' && parked !== via))) {
      let r = null;
      try { r = await nativeHttp(url, o); } catch (e) { r = { error: String(e.message || e) }; }
      const bad = !r || r.error || isChallenge(r) || (r.status === 403 && /cloudflare|cf-ray|challenge|blocked/i.test(r.text || '')) ||
        (o.html && r.status < 400 && /access denied|attention required|you have been blocked/i.test((r.text || '').slice(0, 3000)) && (r.text || '').length < 20000);
      if (!bad) { if (NAT[host] && NAT[host].m === 'wv') LG('cf', host + ' عاد للطلب الأصلي بالكوكيز المحفوظ'); natPut(host, 'ok'); return r; }
      LG('mode', host + ' native rejected', { st: r && r.status, cf: r && r.cf, err: r && r.error, challenge: !!(r && isChallenge(r)) });
      if (r && !r.error) { if (natGet(host) !== 'wv') LG('mode', host + ' -> wv (30 دقيقة)'); natPut(host, 'wv'); }
      if (o.native === 'only') { const e = new Error(r && r.error ? 'تعذّر الاتصال' : 'محمي بـ Cloudflare'); e.prot = !(r && r.error); throw e; }
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      const tS = Date.now();
      await ensureSession(via, o);
      const tH = Date.now();
      let r;
      try { r = await http(url, Object.assign({}, o, { via })); } catch (e) { LG('net', 'ERR WV ' + shortU(url), { err: String(e && e.message || e), session: tH - tS, ms: Date.now() - tH, attempt }); parked = ''; if (attempt) throw e; continue; }
      LG('net', 'WV ' + (o.method || 'GET') + ' ' + shortU(url), { st: r && r.status, session: tH - tS, ms: Date.now() - tH, len: r && r.text ? r.text.length : 0, attempt });
      if (r.error) { parked = ''; if (attempt) throw new Error(/Failed to fetch|NetworkError|Load failed/i.test(r.error) ? 'تعذّر الاتصال بالموقع' : r.error); continue; }
      if (isChallenge(r)) { parked = ''; if (attempt) throw new Error('حماية Cloudflare'); continue; }
      if (o.html && r.status < 400 && /access denied|attention required|you have been blocked/i.test((r.text || '').slice(0, 3000)) && (r.text || '').length < 20000) {
        parked = ''; if (attempt) throw new Error('الموقع رفض الطلب (Access Denied)'); continue;
      }
      return r;
    }
  }

  // ---------- محلّلات HTML ----------
  const absU = (h, base) => { try { return h ? new URL(String(h).trim(), base).href : null; } catch (e) { return null; } };
  const IMG_ATTRS = ['data-src', 'data-lazy-src', 'data-original', 'data-cfsrc', 'data-url', 'src'];
  function imgUrl(el, base) {
    if (!el) return '';
    for (const a of IMG_ATTRS) { const v = el.getAttribute(a); if (v && !/^(data|blob):/.test(v.trim())) return absU(v, base); }
    const ss = el.getAttribute('data-srcset') || el.getAttribute('srcset');
    if (!ss) return '';
    const parts = ss.split(',').map(x => x.trim().split(/\s+/)).filter(x => x[0]);
    parts.sort((a, b) => (parseFloat(b[1]) || 0) - (parseFloat(a[1]) || 0));
    return parts[0] ? absU(parts[0][0], base) : '';
  }
  const txt = e => (e && e.textContent || '').replace(/\s+/g, ' ').trim();

  // عناوين لا يمكن أن تكون اسم عمل (صفحات حظر/خطأ تظهر أحيانًا داخل الصفحة)
  const BAD_TITLE = /^\s*(access denied|forbidden|just a moment|attention required|blocked|error\b|403\b|404\b|not found|رفض الوصول|محظور)/i;
  const badTitle = t => !t || BAD_TITLE.test(t);
  function pickTitle(doc, meta) {
    const clean = el => {
      const c = el.cloneNode(true);
      c.querySelectorAll('span,small,i,em,script,style').forEach(x => x.remove());
      return txt(c) || txt(el);
    };
    const sels = ['.post-title h1', '.post-title h3', 'h1.entry-title', '.entry-title', 'h1'];
    for (const sel of sels) {
      for (const el of doc.querySelectorAll(sel)) { const t = clean(el); if (!badTitle(t)) return t; }
    }
    const strip = t => String(t || '').replace(/\s*[-–|»]\s*[^-–|»]*$/, '').trim();
    const og = meta('og:title'); if (!badTitle(og)) return strip(og) || og;
    const dt = txt(doc.querySelector('title')); if (!badTitle(dt)) return strip(dt) || dt;
    return '';
  }
  // صفحة حظر كاملة وليست صفحة عمل
  function isDeniedDoc(doc, text) {
    const t = txt(doc.querySelector('title'));
    if (!/access denied|attention required|you have been blocked|error 10\d\d|just a moment/i.test(t)) return false;
    // صفحة حقيقية تحوي محتوى الموقع ليست صفحة حظر حتى لو ذُكرت العبارة فيها
    return !/wp-manga|reading-content|manga-chapters|page-item-detail|c-tabs-item|readerarea|listupd/i.test(text || '');
  }

  function parseChapterDoc(doc, url) {
    const ex = EXTRACT_TEXT(doc);
    if (!ex.paras.length || ex.paras.join('').length < 400) return null;
    const q = sel => { const e = doc.querySelector(sel); return e ? absU(e.getAttribute('href'), url) : null; };
    return {
      url, paras: ex.paras, title: txt(doc.querySelector('#chapter-heading, h1.entry-title, h1')) || '',
      next: q(NAV_NEXT), prev: q(NAV_PREV),
      diag: { fast: true, sel: ex.sel, paras: ex.paras.length },
    };
  }

  function chaptersFrom(doc, base) {
    const out = [], seen = new Set();
    doc.querySelectorAll('li.wp-manga-chapter a, #chapterlist li a, .eplister li a').forEach(a => {
      const u = absU(a.getAttribute('href'), base);
      if (!u || seen.has(u) || /#/.test(a.getAttribute('href') || '')) return;
      const t = txt(a.querySelector('.chapternum')) || txt(a);
      if (!t) return;
      seen.add(u);
      const date = txt(a.parentElement && a.parentElement.querySelector('.chapter-release-date, .chapterdate'));
      out.push({ url: u, title: t.slice(0, 120), num: numOf(u) ?? (t.match(/[0-9]+(?:\.[0-9]+)?/) ? parseFloat(t.match(/[0-9]+(?:\.[0-9]+)?/)[0]) : null), date });
    });
    if (out.length && out.every(c => c.num != null)) out.sort((a, b) => b.num - a.num);
    return out;
  }

  async function parseWorkDoc(doc, url, o) {
    const meta = p => { const e = doc.querySelector('meta[property="' + p + '"],meta[name="' + p + '"]'); return e ? e.getAttribute('content') : ''; };
    const title = pickTitle(doc, meta);
    const cover = imgUrl(doc.querySelector('.summary_image img, .thumb img, .seriestucon img'), url) || absU(meta('og:image'), url) || '';
    const summary = txt(doc.querySelector('.summary__content, .description-summary, .entry-content[itemprop=description], .seriestuhead .entry-content')).slice(0, 1500);
    const genres = Array.from(doc.querySelectorAll('.genres-content a, .mgen a, .seriestugenre a')).map(txt).filter(Boolean).slice(0, 12);
    let chapters = chaptersFrom(doc, url);
    // Madara الحديث: قائمة الفصول عبر ajax
    if (!chapters.length && /wp-manga|manga-chapters-holder|c-page__content/.test(doc.documentElement.innerHTML)) {
      const mu = url.replace(/[?#].*$/, '').replace(/\/?$/, '/');
      const hdr = { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' };
      try {
        const r = await fastGet(mu + 'ajax/chapters/', { method: 'POST', body: '', headers: hdr });
        chapters = chaptersFrom(r.doc, url);
      } catch (e) { }
      if (!chapters.length) {
        const holder = doc.querySelector('#manga-chapters-holder[data-id], .rating-post-id, [data-post-id]');
        const id = holder && (holder.getAttribute('data-id') || holder.getAttribute('value') || holder.getAttribute('data-post-id'));
        if (id) try {
          const r = await fastGet(new URL(url).origin + '/wp-admin/admin-ajax.php', { method: 'POST', body: 'action=manga_get_chapters&manga=' + encodeURIComponent(id), headers: hdr });
          chapters = chaptersFrom(r.doc, url);
        } catch (e) { }
      }
    }
    if (!chapters.length && !title) return null;
    return { url, title, cover, summary, genres, chapters, count: chapters.length };
  }

  function parseListDoc(doc, url, site) {
    const items = [], seen = new Set();
    const cards = doc.querySelectorAll('.page-item-detail, .c-tabs-item__content, .manga-item, .bs .bsx, .listupd .bs');
    cards.forEach(c => {
      const a = c.querySelector('.post-title a, h3 a, h4 a, .tt a') || c.querySelector('a[href]');
      const u = a && absU(a.getAttribute('href'), url);
      if (!u || seen.has(u)) return;
      const t = txt(c.querySelector('.post-title, h3, h4, .tt')) || (a.getAttribute('title') || '').trim() || txt(a);
      if (!t) return;
      seen.add(u);
      const latest = txt(c.querySelector('.chapter-item .chapter a, span.chapter a, .epxs, .adds .epxs'));
      const rating = txt(c.querySelector('.score, .numscore'));
      items.push({ url: u, title: t.slice(0, 150), cover: imgUrl(c.querySelector('img'), url), latest: latest.slice(0, 40), rating });
    });
    // بديل عام: روابط صفحات الأعمال
    if (!items.length && site) {
      const re = new RegExp(site.mangaRe, 'i');
      doc.querySelectorAll('a[href]').forEach(a => {
        const u = absU(a.getAttribute('href'), url);
        if (!u || seen.has(u)) return;
        let p; try { p = new URL(u); } catch (e) { return; }
        if (!re.test(p.pathname)) return;
        const im = a.querySelector('img');
        const t = txt(a) || (im && im.getAttribute('alt')) || a.getAttribute('title') || '';
        if (!t) return;
        seen.add(u);
        items.push({ url: u, title: t.slice(0, 150), cover: imgUrl(im, url), latest: '' });
      });
    }
    const nx = doc.querySelector('a.nextpostslink, .nav-previous a, a.next.page-numbers, .pagination a[rel=next], .hpage a.r, link[rel=next]');
    return { url, items, next: nx ? absU(nx.getAttribute('href'), url) : null, count: items.length };
  }

  // ---------- الواجهة: سريع أولًا ثم المسار البطيء ----------
  const inflight = new Map();
  function once(key, fn) {
    if (cache.has(key)) return Promise.resolve(cache.get(key));
    if (inflight.has(key)) return inflight.get(key);
    const p = fn().then(d => { cache.set(key, d); inflight.delete(key); return d; }, e => { inflight.delete(key); throw e; });
    inflight.set(key, p);
    return p;
  }
  function smart(mode, parse) {
    return (url, o) => {
      o = o || {};
      if (!available()) return run(url, mode, o);
      if (o.force) { cache.delete(mode + '|' + url); }
      return once(mode + '|' + url, async () => {
        try {
          const r = await fastGet(url, o);
          const d = await parse(r.doc, r.url, o);
          if (d) { d.url = url; return d; }
        } catch (e) {
          if (e && e.status === 404) throw new Error('الصفحة غير موجودة (404)');
        }
        if (o.quiet) { const e = new Error('slow'); e.quiet = true; throw e; }
        parked = '';
        return runUa(url, mode, Object.assign({}, o, { force: true }));
      });
    };
  }
  const getChapterF = smart('chapter', (doc, url) => parseChapterDoc(doc, url));
  const getWorkF = smart('manga', (doc, url, o) => parseWorkDoc(doc, url, o));
  const getListF = smart('list', (doc, url) => { const d = parseListDoc(doc, url, siteFor(url)); return d.items.length ? d : null; });

  // ================= المحوّلات (manga-sources.js) =================
  const htmlTpl = site => site.ad && /^(madara|mangathemesia|generic)$/.test(site.ad.tpl) || site.id === 'novltime' || site.id === 'riwayatarab' || site.id === 'seanovel' || site.id === 'sunovels';
  function getWorkA(url, o) {
    o = o || {};
    const site = siteFor(url);
    if (!site.ad) return getWorkF(url, o);
    if (o.force) cache.delete('manga|' + url);
    return once('manga|' + url, async () => {
      try {
        const d = await site.ad.manga(url);
        d.url = url; d.chapters = (d.chapters || []).filter(c => c && c.url); d.count = d.chapters.length;
        if (badTitle(d.title)) d.title = '';
        return d;
      } catch (e) {
        if (e && e.status === 404) throw new Error('الصفحة غير موجودة (404)');
        if (htmlTpl(site) && available()) { parked = ''; return runUa(url, 'manga', Object.assign({}, o, { force: true })); }
        throw e;
      }
    });
  }
  function getChapterA(url, o) {
    o = o || {};
    const site = siteFor(url);
    if (!site.ad) return getChapterF(url, o);
    if (o.force) cache.delete('chapter|' + url);
    return once('chapter|' + url, async () => {
      if (site.ad.chapter) {
        try {
          const d = await site.ad.chapter(url);
          if (d && d.paras && d.paras.length) return { url, title: d.title || '', paras: d.paras, next: d.next || null, prev: d.prev || null, diag: { source: site.id } };
          if (!htmlTpl(site)) throw new Error('لم يُعثر على نص في هذا الفصل');
        } catch (e) {
          if (e && e.status === 404) throw new Error('الصفحة غير موجودة (404)');
          if (!htmlTpl(site)) throw e;
        }
      }
      if (o.quiet) { const e = new Error('slow'); e.quiet = true; throw e; }
      parked = '';
      return runUa(url, 'chapter', Object.assign({}, o, { force: true }));
    });
  }
  function browse(siteId, a, o) {
    o = o || {};
    const site = SITES.find(x => x.id === siteId);
    if (!site || !site.ad) return Promise.reject(new Error('مصدر غير معروف'));
    a = Object.assign({ page: 1, q: '', listing: '', f: {} }, a);
    const key = 'list|' + siteId + '|' + JSON.stringify(a);
    if (o.force) cache.delete(key);
    return once(key, async () => {
      const r = await site.ad.list(a);
      r.items = (r.items || []).filter(x => x && x.url && x.title);
      return r;
    });
  }
  // البحث في كل المصادر: محوّلات مستقلة تستعمل الطلبات الأصلية فقط (متوازية)
  const searchAds = {};
  function searchSource(siteId, q, o) {
    o = o || {};
    const site = SITES.find(x => x.id === siteId);
    if (!site || !site.ad) return Promise.reject(new Error('مصدر غير معروف'));
    let ad = site.ad;
    if (hasNative() && !o.session) ad = searchAds[siteId] || (searchAds[siteId] = global.NovelSources.build(site.src, { native: 'only' }));
    const key = 'gs|' + siteId + '|' + (o.session ? 's|' : '') + q;
    return once(key, async () => {
      const r = await ad.list({ page: 1, q, listing: '', f: {} });
      r.items = (r.items || []).filter(x => x && x.url && x.title);
      return r;
    });
  }
  async function genres(siteId) {
    const site = SITES.find(x => x.id === siteId);
    if (!site || !site.ad || !site.ad.genres) return null;
    const k = 'mf.genres.' + siteId;
    try { const c = JSON.parse(localStorage.getItem(k)); if (c && Date.now() - c.t < 7 * 864e5) return c.d; } catch (e) { }
    const d = await site.ad.genres();
    try { localStorage.setItem(k, JSON.stringify({ t: Date.now(), d })); } catch (e) { }
    return d;
  }

  global.NovelFetch = {
    get SITES() { return SITES; }, BUILTIN, setSources, makeSite, siteFor, kind, mangaUrlOf, chapterUrlFor, numOf, available,
    scrape: (url, opts) => available() ? runUa(url, 'chlist', Object.assign({ force: true }, opts)) : Promise.reject(new Error('يلزم تطبيق أندرويد')),
    getWork: getWorkA, getList: getListF, getChapter: getChapterA, extractText: EXTRACT_TEXT, NAV_NEXT, NAV_PREV, browse, genres, req, searchSource, hasNative,
    // لا نركن المتصفح على الموقع إن كان الطلب الأصلي يعمل معه: الركن يحوّل كل طلباته إلى مسار المتصفح الأبطأ والتسلسلي
    warm: origin => { let h = ''; try { h = new URL(origin).hostname; } catch (e) { } return available() && !(h && natGet(h) === 'ok') ? ensureSession(origin).catch(() => { }) : Promise.resolve(); },
    prefetch: url => { if (!url || !available()) return; getChapterA(url, { quiet: true }).catch(() => { }); },
    forget: url => { ['manga|', 'chapter|', 'list|'].forEach(k => cache.delete(k + url)); },
    // للتحقق من مصدر جديد يضيفه المستخدم: يعيد أول قائمة أعمال ويستنتج مقطع الروابط
    probe: async home => {
      home = String(home).trim().replace(/\/+$/, '');
      if (!/^https?:\/\//i.test(home)) home = 'https://' + home;
      home = new URL(home).origin;
      const r = await fastGet(home + '/');
      const html = r.text || '';
      const madara = /wp-manga|madara/i.test(html), themesia = !madara && /listupd|bsx|themesia|mangastream|\/series\//i.test(html);
      const cnt = {};
      r.doc.querySelectorAll('a[href]').forEach(a => { const u = absU(a.getAttribute('href'), home); if (!u || u.indexOf(home) !== 0) return; const m = new URL(u).pathname.match(/^\/([^/]+)\/[^/]+\/?$/); if (m) cnt[m[1]] = (cnt[m[1]] || 0) + 1; });
      const base = Object.keys(cnt).filter(k => !/^(page|tag|category|genre|genres|author|wp-content|feed)$/i.test(k)).sort((a, b) => cnt[b] - cnt[a])[0] || 'novel';
      const title = (r.doc.querySelector('meta[property="og:site_name"]') || {}).content || txt(r.doc.querySelector('title')).split(/[-|–]/)[0].trim();
      return { home, base, type: themesia ? 'mangathemesia' : 'madara', name: title || new URL(home).hostname };
    },
    cancel, showBrowser, imgSrc, imgData, badTitle,
    // استدعاء دالة أصلية تردّ عبر _onReply (مثل ghText)
    nat: (fn, ...args) => new Promise((res, rej) => { const id = 'g' + (++hseq); pend[id] = res; try { NovelNative[fn](id, ...args); } catch (e) { delete pend[id]; rej(e); } }),
    _onReply(id, json) {
      const f = pend[id]; if (!f) return; delete pend[id];
      let v; try { v = JSON.parse(json); } catch (e) { v = { error: 'bad reply' }; }
      f(v);
    },
    _onNative(id, json) {
      let m; try { m = JSON.parse(json); } catch (e) { return; }
      if (m.type === 'hidden') { if (cur && cur.on) cur.on(m); return; }
      if (cur && cur.id === id) cur.on(m);
    },
  };
})(window);
