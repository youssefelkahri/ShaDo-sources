'use strict';
/* sources/api.js — قالب «api» العام: مصدر JSON يُوصَف ببيانات فقط (profile من known.js أو S.api).
 * يستبدل كتابة ملف لكل موقع: القائمة، البحث، الفصول المقسّمة لصفحات، نص الفصل، الغلاف. */
NovelKit.add('api', K => {
  const { X, sel1, selA } = K;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const log = (m, o) => { try { window.NovelLog && window.NovelLog.add('api', m, o); } catch (e) { } };
  const get = (o, path) => { for (const p of String(path || '').split('||')) { let v = o; for (const k of p.trim().split('.')) { v = v == null ? v : v[k]; } if (v != null && v !== '') return v; } return ''; };
  const fill = (t, v) => String(t).replace(/\{(\w+)\}/g, (m, k) => v[k] == null ? '' : (k === 'q' ? encodeURIComponent(v[k]) : v[k]));
  const fixLam = x => String(x).replace(/ا([إأآ])ل/g, (m, h) => 'ال' + h).replace(/جاللة/g, 'جلالة').replace(/جاللت/g, 'جلالت').replace(/(^|[\s"«(])ال(?=[\s".,!؟،:»)]|$)/g, '$1لا');
  const maxOf = {};
  const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; } };

  function api(S) {
    const P = S.api || (window.NOVEL_KNOWN || {})[S.known || host(S.home)];
    if (!P) throw new Error('لا ملف معرفة لهذا الموقع');
    const cover = c => c ? (/^https?:/.test(c) ? c : (P.coverBase || '') + String(c).replace(/^\/+/, '')) : '';
    const re = new RegExp(P.slugRe || '^/novel/([^/]+)'), cre = new RegExp(P.chapRe || '^/novel/[^/]+/(\\d+)/?$');
    const path = u => { try { return new URL(u).pathname; } catch (e) { return ''; } };
    const slugOf = u => { const m = path(u).match(re); return m ? m[1] : null; };
    const numOf = u => { const m = path(u).match(cre); return m ? +m[1] : null; };
    const workUrl = slug => fill(P.workUrl, { slug });
    const chUrl = (slug, n) => fill(P.chapterUrl, { slug, n });
    const side = P.chapters && P.chapters.side || 1e12;
    const parse = data => {
      const seen = new Set(), items = [];
      (get(data, P.listRes || 'results') || (Array.isArray(data) ? data : [])).forEach(r => {
        const slug = get(r, P.item.slug); if (!slug || seen.has(slug)) return; seen.add(slug);
        const lt = P.item.latest ? get(r, P.item.latest) : '';
        items.push({ url: workUrl(slug) + '/', title: String(get(r, P.item.title) || slug), cover: cover(get(r, P.item.cover)), latest: lt ? 'الفصل ' + lt : '' });
      });
      return items;
    };
    return {
      listings: P.listings || [['latest', 'الأحدث']],
      isChapter: u => numOf(u) != null,
      mangaOf: u => { const s = slugOf(u); return s ? workUrl(s) + '/' : null; },
      async list(a) {
        const page = a.page || 1;
        const t = a.q ? P.list.search : (P.list[a.listing] || P.list.latest);
        if (!t) return { items: [], hasNext: false };
        const data = await X.json(fill(t, { page, q: a.q }));
        return { items: parse(data), hasNext: !!get(data, P.listNext || 'next') };
      },
      async manga(url) {
        const slug = slugOf(url); if (!slug) throw new Error('رابط عمل غير صالح');
        const C = P.chapters;
        let allRows = null;   // نقطة «كل الفصول» دفعة واحدة (مأخوذة من إضافة Shosetsu): أسرع من عشرات الصفحات
        if (C.all) { try { const aj = await X.json(fill(C.all, { slug })); const al = Array.isArray(aj) ? aj : (get(aj, C.res) || []); if (al.length) allRows = al; } catch (e) { log('نقطة all فشلت', { err: String(e && e.message || e) }); } }
        const first = allRows ? { [C.res || 'results']: allRows, [(C.count || 'count').split('.')[0]]: allRows.length } : await X.json(fill(C.url, { slug, page: 1 }));
        const total = allRows ? allRows.length : (+get(first, C.count) || 0), per = C.per || (get(first, C.res) || []).length || 24, pages = allRows ? 1 : Math.max(1, Math.ceil(total / per));
        const row = c => { const n = +get(c, C.num); return { url: chUrl(slug, n), title: String(get(c, C.title) || 'الفصل ' + n), num: n, date: get(c, C.date) ? String(get(c, C.date)).slice(0, 10) : '', o: n, sp: n >= side ? 1 : 0 }; };
        const note = c => { const n = +get(c, C.num); if (n < side) maxOf[slug] = Math.max(maxOf[slug] || 0, n); };
        const list0 = get(first, C.res) || []; list0.forEach(note);
        const rows0 = list0.map(row);
        let title = '', summary = '', cov = '', genres = [], status = '';
        if (P.workApi) { try { const wj = await X.json(fill(P.workApi.url, { slug })); title = String(get(wj, P.workApi.title) || ''); summary = String(get(wj, P.workApi.summary) || ''); cov = cover(get(wj, P.workApi.cover)); if (P.workApi.status && get(wj, P.workApi.status)) status = String(get(wj, P.workApi.status)); else if (P.workApi.complete && get(wj, P.workApi.complete) === true) status = 'مكتملة'; } catch (e) { log('واجهة العمل فشلت', { err: String(e && e.message || e) }); } }
        if (!title || !cov || !summary) try {
          const W = P.work || {}, d = await X.html(workUrl(slug));
          title = title || X.t(sel1(d, W.title || 'h1')); summary = summary || (W.summary ? X.t(sel1(d, W.summary)) : '');
          if (W.status && !status) status = selA(d, W.status).map(e => X.t(e)).find(x => /مكتملة|متوقفة|مستمرة|ongoing|completed/i.test(x)) || '';
          if (W.genres) genres = selA(d, W.genres).map(e => X.t(e)).filter(Boolean);
          if (W.coverRe && !cov) { const sc = selA(d, 'script').map(s => s.textContent).find(t => new RegExp(W.coverRe).test(t)) || ''; const m = sc.match(new RegExp(W.coverRe)); if (m) cov = cover(m[1].replace(/\\u002F/g, '/')); }
          if (!cov) { const og = sel1(d, 'meta[property="og:image"]'); if (og && og.content) cov = og.content; }
        } catch (e) { log('صفحة العمل فشلت', { err: String(e && e.message || e) }); }
        if (!cov && P.list.search) { try { const s = await X.json(fill(P.list.search, { page: 1, q: title || slug.replace(/-/g, ' ') })); const f = parse(s).find(i => i.url.indexOf('/' + slug + '/') >= 0); if (f) cov = f.cover; } catch (e) { } }
        const res = { url, start: rows0[0] ? rows0[0].url : '', total, cancel() { res._c = true; }, title: (title || slug).slice(0, 200), cover: cov, summary, genres, status: X.status(status) || status, chapters: rows0 };
        if (pages <= 1) return res;
        res.more = async function (o) {
          o = o || {};
          const have = new Set(rows0.map(c => c.url)); (o.have || []).forEach(u => have.add(u));
          let got = have.size;
          if (total && got >= total) return { got, total, failed: [], skipped: true, contig: o.start || 1 };
          const failed = []; let fails = 0, n = Math.max(2, o.start || 2), contig = n - 1, reason = 'done';
          const fetchPage = async p => { for (let t = 0; t < 3; t++) { if (res._c) return null; try { const j = await X.json(fill(C.url, { slug, page: p })); const l = get(j, C.res) || []; l.forEach(note); return l.map(row); } catch (e) { await sleep(700 * (t + 1)); } } return null; };
          const take = rows => { const f = rows.filter(c => !have.has(c.url)); f.forEach(c => have.add(c.url)); got = have.size; return f; };
          for (; n <= pages; n++) {
            if (res._c) { reason = 'cancelled'; break; }
            await sleep(200);
            const rows = await fetchPage(n);
            if (!rows) { if (res._c) { reason = 'cancelled'; break; } failed.push(n); if (++fails >= 3) { reason = 'failures'; break; } continue; }
            fails = 0; const f = take(rows);
            if (!failed.length && n === contig + 1) contig = n;
            if (o.onBatch) { try { o.onBatch(f, { got, total, page: n, contig }); } catch (e) { } }
          }
          for (const fp of failed.slice()) { if (res._c) break; await sleep(800); const rows = await fetchPage(fp); if (rows) { const f = take(rows); failed.splice(failed.indexOf(fp), 1); if (o.onBatch) { try { o.onBatch(f, { got, total, page: fp, contig }); } catch (e) { } } } }
          log('انتهى جلب الفصول', { reason, got, total, pages });
          return { got, total, failed, cancelled: !!res._c, contig, reason };
        };
        return res;
      },
      async chapter(url) {
        const slug = slugOf(url), n = numOf(url); if (!slug || n == null) throw new Error('رابط فصل غير صالح');
        const j = await X.json(fill(P.content.url, { slug, n }));
        const html = [].concat(get(j, P.content.path) || []).flat(Infinity).join('<br>');
        const d = X.parse('<html><body><div id="c">' + html + '</div></body></html>', url);
        let paras = selA(d, '#c p').map(p => X.t(p)).filter(Boolean);
        if (paras.length < 2) paras = html.split(/<br\s*\/?>|<\/p>|\n/i).map(s => X.t(X.parse('<html><body>' + s + '</body></html>', url).body)).filter(Boolean);
        if (P.fixLam) paras = paras.map(fixLam);
        if (!paras.length) throw new Error('لم يُعثر على نص في هذا الفصل');
        const lim = maxOf[slug] || 0;
        return {
          paras, title: String(get(j, P.content.title) || 'الفصل ' + n),
          next: (n >= side || !lim || n < lim) ? chUrl(slug, n + 1) : null,
          prev: n > 1 && n !== side + 1 ? chUrl(slug, n - 1) : null
        };
      }
    };
  }
  return api;
});
