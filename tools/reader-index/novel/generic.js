'use strict';
/* sources/generic.js — قالب عام لمواقع غير ووردبريس (novltime، riwayatarab) */
NovelKit.add('generic', K => {
  const global = window;
  const { X, sel1, selA, sameHost, httpErr, textChapter } = K;
  // ---------- عام: مواقع مخصّصة (ليست ووردبريس) — تُقرأ الروابط من الصفحات مباشرة ----------
  // منطق الاستخراج منقول من تطبيق Apk-reader-epub (scanNovel / expandChapters / findStart / findCover).
  // إعدادات المصدر: novelPath مقطع روابط الأعمال (مثلًا 'ar/novel')، lists {latest, popular} مسارات القوائم،
  // search قالب البحث ('/search?q={q}')، pageParam اسم معامل الصفحة إن وُجد.
  function generic(S, p) {
    p = Object.assign({ novelPath: 'novel' }, p || {});
    const H = S.home, origin = new URL(H).origin, lists = S.lists || {};
    const bs = String(p.novelPath).replace(/^\/+|\/+$/g, '').split('/').filter(Boolean), base = '/' + bs.join('/');
    const raw = u => { try { return new URL(u).pathname.split('/').filter(Boolean); } catch (e) { return []; } };
    const under = u => { const s = raw(u); return bs.every((b, i) => s[i] === b) ? s.slice(bs.length) : null; };
    const full = path => /^https?:/.test(path) ? path : origin + path;
    const host = u => sameHost(u, H);
    const normAr = t => String(t || '').toLowerCase().replace(/[ً-ٰٟـ]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
    const CH_TXT = /(الفصل|فصل|chapter)/i, FIRST_TXT = /(ابدأ\s*القراءة|ابدا\s*القراءة|الفصل\s*(الأول|الاول|1)\b|فصل\s*(1|الأول)\b|chapter\s*(1|one)\b|first\s*chapter|start\s*reading|read\s*first)/i;
    const numUrl = /^(.*?)(\d+)\/?$/;   // مقدمة الرابط + رقم الفصل في آخره

    const findCover = X.findCover;

    const ad = {
      listings: S.listings.length ? S.listings : [['latest', 'الأحدث']],
      isChapter: u => { const r = under(u); if (!r || r.length < 2) return false; try { if (!S.chapterRe) return true; const pn = new URL(u).pathname, re = new RegExp(S.chapterRe, 'i'); let dp = pn; try { dp = decodeURIComponent(pn); } catch (e) { } return re.test(pn) || re.test(dp); } catch (e) { return true; } },
      mangaOf: u => { const r = under(u); return r && r.length >= 1 ? origin + base + '/' + r[0] + '/' : null; },
      async list(a) {
        if (a.q) {
          const tpl = p.search || S.search || '/search?q={q}';
          const items = await X.siteSearch(S, a.q, [full(tpl.replace('{q}', encodeURIComponent(a.q)))]);
          return { items, hasNext: false };
        }
        let url = full(lists[a.listing] || lists.latest || '/');
        if (a.page > 1) { if (!p.pageParam) return { items: [], hasNext: false }; url += (url.indexOf('?') >= 0 ? '&' : '?') + p.pageParam + '=' + a.page; }
        let items = [];
        try { items = this.items(await X.html(url)); } catch (e) { if (!global.NovelFetch.hasNative()) throw e; }
        if (!items.length && global.NovelFetch.hasNative()) {
          // القائمة تُرسم بالجافاسكربت (مثل الأكثر مشاهدة في riwayatarab): نفتحها في المتصفح الخفي
          const r = await global.NovelFetch.getList(url, { force: true });
          items = (r.items || []).filter(x => { const q = under(x.url); return q && q.length === 1; }).map(x => ({ url: x.url, title: x.title, cover: x.cover || '', latest: '' }));
        }
        return { items, hasNext: !!p.pageParam && items.length > 0 };
      },
      items(d) {
        const out = [];
        selA(d, 'a[href]').forEach(a => {
          const u = X.abs(a.getAttribute('href'), d.__url);
          if (!u || !host(u)) return;
          const r = under(u); if (!r || r.length !== 1) return;
          const card = a.closest('article,li,.card,[class*=card],[class*=item]') || a.parentElement;
          const imgs = selA(a, 'img').concat(card ? selA(card, 'img') : []);
          const img = imgs.find(i => X.img(i, d.__url)) || imgs[0];
          const h = card && card.querySelector('h1,h2,h3,h4,h5');
          const t = X.t(h) || a.getAttribute('title') || a.getAttribute('aria-label') || (img && img.getAttribute('alt')) || X.t(a);
          if (!t || t.length < 2) return;
          // آخر فصل ظاهر في البطاقة
          let latest = ''; for (let e = a, i = 0; i < 4 && e && !latest; i++, e = e.parentElement) { const c = selA(e, 'a[href]').find(x => /\/chapter\//i.test(x.getAttribute('href') || '') || /(الفصل|chapter)\s*\d+/i.test(X.t(x))); if (c) latest = X.t(c).slice(0, 40); }
          out.push({ url: origin + base + '/' + r[0] + '/', title: t.slice(0, 150), cover: X.img(img, d.__url), latest });
        });
        return X.uniqBy(out, 'url');
      },
      async manga(url) {
        const d = await X.html(url);
        const meta = n => ((d.querySelector('meta[property="' + n + '"],meta[name="' + n + '"]') || {}).content || '').replace(/\s+/g, ' ').trim();
        // العنوان الرئيسي h1 أولًا (og:title في riwayatarab: «الاسم - الكاتب - رواية عربية مجانية | رواياتعرب»)
        let title = X.t(d.querySelector('h1'));
        if (!title || title.length < 2 || title.length > 150) {
          title = meta('og:title') || X.t(d.querySelector('title'));
          title = title.split(/\s+[|–—]\s+/)[0].split(/\s+-\s+/)[0].trim() || title;
        }
        const me = under(url), slug = me && me[0];
        const links = {}; let prefix = null; const loose = [];
        const scan = (doc, at) => selA(doc, 'a[href]').forEach(a => {
          const u = X.abs(a.getAttribute('href'), at); if (!u || !host(u)) return;
          const clean = u.split('#')[0].split('?')[0], t = X.t(a), r = under(clean);
          if (r && r[0] === slug && r.length >= 2) {
            const m = clean.match(numUrl);
            if (m) { if (prefix == null) prefix = m[1]; if (m[1] === prefix) links[+m[2]] = links[+m[2]] || t; }
            if (t && t.length <= 120) loose.push({ u: clean, t });
          } else if (t && t.length <= 120 && t && CH_TXT.test(t) && clean !== url.split('#')[0].split('?')[0] && !(r && r.length === 1) && !/\/(tag|genre|category|page|author|wp-|login|register|feed|search|latest|explore)\b/i.test(clean) && new URL(clean).pathname !== '/') loose.push({ u: clean, t });
        });
        scan(d, url);
        const AN = t => String(t || '').replace(/[٠-٩]/g, c => '٠١٢٣٤٥٦٧٨٩'.indexOf(c));
        const countOf = doc => { const tx = AN(doc.body.textContent || ''); const a = Array.from(tx.matchAll(/(\d[\d,]*)\s*(?:فصل|chapters)/gi)).map(m => +m[1].replace(/,/g, '')); const b = Array.from(tx.matchAll(/(?:فصول|الفصول|chapters)\s*[:：(]\s*(\d[\d,]*)/gi)).map(m => +m[1].replace(/,/g, '')); return Math.max(0, ...a.concat(b).filter(n => n < 100000)) || 0; };
        const moreOf = doc => { const m = AN(doc.body.textContent || '').match(/و\s*(\d[\d,]*)\s*فصلاً\s*آخر/); return m ? +m[1].replace(/,/g, '') : 0; };
        let count = countOf(d);
        { const mo = moreOf(d); if (mo) count = Math.max(count, Object.keys(links).length + mo); }   // «و148 فصلاً آخر»: الظاهر + الباقي
        if (p.chaptersPage) {   // صفحة فهرس الفصول المستقلة (مثل riwayatarab: /novel/slug/chapters، 50 فصلًا بالصفحة)
          try { const cu = url.split('#')[0].split('?')[0].replace(/\/?$/, '/') + p.chaptersPage, cd = await X.html(cu); scan(cd, cu); count = Math.max(count, countOf(cd)); } catch (e) { }
        }
        // قائمة الفصول مقتطعة في الصفحة: تتبّع رابط «عرض كل الفصول» (حتى 6 صفحات)
        const idsOf = () => Object.keys(links).map(Number).sort((x, y) => x - y);
        const needMore = () => count && idsOf().length < count - 1;
        const i0 = idsOf(), contig0 = i0.length >= 5 && i0.length === i0[i0.length - 1] - i0[0] + 1;
        if (prefix != null && needMore() && !contig0) {
          const all = selA(d, 'a[href]').find(a => /(عرض|جميع|كل|all|view).{0,20}(الفصول|chapters)/i.test(X.t(a)) || /\/(chapters|chapter-list|toc)\/?$/i.test(a.getAttribute('href') || ''));
          let next = all ? X.abs(all.getAttribute('href'), url) : null; const seen = new Set([url]); let pages = 0;
          while (next && !seen.has(next) && pages < 6) {
            seen.add(next); pages++;
            let pd; try { pd = await X.html(next); } catch (e) { break; }
            scan(pd, next);
            if (!needMore()) break;
            const nx = pd.querySelector('a[rel~="next"][href]') || selA(pd, 'a[href]').find(a => /^(التالي|›|»|next)$/i.test(X.t(a)));
            next = nx ? X.abs(nx.getAttribute('href'), next) : null;
          }
        }
        // عناوين مضمّنة في بيانات الصفحة (Next.js ونحوه): "title":"…","slug":"…","order":N
        const emb = {};
        try { const raw = d.documentElement.outerHTML.replace(/\\\\?"/g, '"'); for (const m of raw.matchAll(/"title":"([^"]{1,150})","slug":"[^"]+","order":(\d+)/g)) emb[+m[2]] = emb[+m[2]] || m[1]; } catch (e) { }
        let chapters = [];
        const ids = idsOf();
        if (prefix != null && ids.length) {
          let min = ids[0], max = ids[ids.length - 1];
          const contiguous = ids.length === max - min + 1;
          // التعبئة بالأرقام تصح فقط حين تكون الأرقام المرئية متقاربة (تسلسل فصول). أرقام متباعدة جدًا
          // (معرّفات عامة للموقع، أو روابط جانبية) تعني أن الأرقام ليست ترقيم فصول: نكتفي بالروابط الظاهرة.
          const near = S.fill !== false && (max - min + 1 <= Math.max(ids.length * 2, ids.length + 50) || (count >= 20 && count < 20000 && max - min + 1 >= count * 0.9 && max - min + 1 <= count * 1.1 && min <= 5));   // أو: النطاق يطابق العدد المعلن (الظاهر أول الفصول وآخرها)
          if (near && count && count < 20000 && max - min + 1 < count && (contiguous || ids.length >= 5)) max = min + count - 1;   // نفترض تسلسلًا متصلًا
          if (near && (contiguous || max - min + 1 > ids.length && ids.length >= 5)) for (let i = min; i <= max; i++) chapters.push({ url: prefix + i, title: links[i] || emb[i] || ('الفصل ' + i), num: i, date: '' });
          else ids.forEach(i => chapters.push({ url: prefix + i, title: links[i] || emb[i] || ('الفصل ' + i), num: i, date: '' }));
        } else {
          chapters = X.uniqBy(loose.map(c => ({ url: c.u, title: c.t, num: X.num(c.t) != null ? X.num(c.t) : X.num(c.u.split('/').pop()), date: '' })), 'url');
          if (!chapters.length) {
            // لا قائمة ظاهرة: زر «ابدأ القراءة» أو أول فصل (يُكمَل القراءة بروابط «التالي»)
            const st = selA(d, 'a[href]').find(a => FIRST_TXT.test(X.t(a)) && X.abs(a.getAttribute('href'), url) !== url && !/#chapters?$/.test(a.getAttribute('href') || ''));
            let first = st ? X.abs(st.getAttribute('href'), url) : '';
            if (!first) { try { const d2 = await X.html(url.split('#')[0] + (url.indexOf('?') >= 0 ? '&' : '?') + 'chapter_order=oldest'); const c = selA(d2, 'a[href]').map(a => ({ u: X.abs(a.getAttribute('href'), url), t: X.t(a) })).find(x => x.u && host(x.u) && x.t && CH_TXT.test(x.t) && x.u !== url); first = c ? c.u : ''; } catch (e) { } }
            if (first) chapters = [{ url: first, title: 'الفصل 1', num: 1, date: '' }];
          }
        }
        if (chapters.length && chapters.every(c => c.num != null)) chapters.sort((x, y) => y.num - x.num);
        return { url, title: title.slice(0, 200), cover: (() => { try { const e = S.coverSel && d.querySelector(S.coverSel); return (e && X.img(e, url)) || findCover(d, url, title); } catch (x) { return findCover(d, url, title); } })(), summary: meta('og:description') || meta('description'), genres: [], status: '', chapters };
      },
      async chapter(url) {
        const r = await X.req(url, { html: true });
        if (r.status >= 400) throw httpErr(r, url);
        return textChapter(X.parse(r.text, url), url);
      },
    };
    return ad;
  }
  return generic;
});
