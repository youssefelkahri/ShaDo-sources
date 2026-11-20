'use strict';
/* sources/madara.js — قالب Madara (ووردبريس WP-Manga) لروايات نصية */
NovelKit.add('madara', K => {
  const global = window;
  const { X, sel1, selA, httpErr, textChapter } = K;
  // MD5 (لفك حماية Madara: CryptoJS AES بمفتاح EVP_BytesToKey)
  function md5(bytes) {
    const K = [], S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
    for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0;
    const n = bytes.length, len = ((n + 8) >>> 6 << 6) + 64, m = new Uint8Array(len);
    m.set(bytes); m[n] = 0x80;
    const bits = n * 8; for (let i = 0; i < 8; i++) m[len - 8 + i] = Math.floor(bits / Math.pow(2, 8 * i)) & 255;
    let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
    const w = new Uint32Array(16);
    for (let off = 0; off < len; off += 64) {
      for (let i = 0; i < 16; i++) w[i] = m[off + i * 4] | (m[off + i * 4 + 1] << 8) | (m[off + i * 4 + 2] << 16) | (m[off + i * 4 + 3] << 24);
      let A = a0, B = b0, C = c0, D = d0;
      for (let i = 0; i < 64; i++) {
        let F, g;
        if (i < 16) { F = (B & C) | (~B & D); g = i; } else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
        else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; } else { F = C ^ (B | ~D); g = (7 * i) % 16; }
        F = (F + A + K[i] + w[g]) >>> 0; A = D; D = C; C = B;
        B = (B + ((F << S[i]) | (F >>> (32 - S[i])))) >>> 0;
      }
      a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
    }
    const out = new Uint8Array(16);
    [a0, b0, c0, d0].forEach((v, i) => { for (let j = 0; j < 4; j++) out[i * 4 + j] = (v >>> (8 * j)) & 255; });
    return out;
  }
  const b64 = s => Uint8Array.from(atob(String(s).trim()), c => c.charCodeAt(0));
  const hexb = h => Uint8Array.from((h.match(/../g) || []).map(x => parseInt(x, 16)));
  const utf8 = s => new TextEncoder().encode(s);
  const cat = (...a) => { const r = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let o = 0; a.forEach(x => { r.set(x, o); o += x.length; }); return r; };
  async function cryptoJsDecrypt(ctB64, saltHex, pass) {
    const p = utf8(pass), salt = hexb(saltHex);
    let d = new Uint8Array(0), prev = new Uint8Array(0);
    while (d.length < 48) { prev = md5(cat(prev, p, salt)); d = cat(d, prev); }
    const key = await crypto.subtle.importKey('raw', d.slice(0, 32), 'AES-CBC', false, ['decrypt']);
    const out = await crypto.subtle.decrypt({ name: 'AES-CBC', iv: d.slice(32, 48) }, key, b64(ctB64));
    return new TextDecoder().decode(out);
  }

  // ---------- Madara ----------
  function madara(S, p) {
    p = Object.assign({
      base: 'manga',
      item: 'div.c-tabs-item__content, .manga__item, .page-item-detail, .am-search-card, .am-manga-card',
      itemLink: 'div.post-title a, .post-title a, .am-search-card__title a, .am-manga-card__title a',
      title: '.post-title h1, .post-title h3, #manga-title > h1',
      cover: 'div.summary_image img',
      desc: 'div.description-summary div.summary__content, div.summary_content div.post-content_item > h5 + div, div.summary_content div.manga-excerpt, div.manga-excerpt',
      tags: 'div.genres-content a',
      chapter: 'li.wp-manga-chapter',
      date: 'span.chapter-release-date',
      pages: 'div.page-break img, li.blocks-gallery-item img, .reading-content img, img.wp-manga-chapter-img',
    }, p || {});
    const H = S.home;
    let loadMore = null;
    const segs = u => X.segs(u);
    const ad = {
      listings: S.listings.length ? S.listings : [['latest', 'الأحدث'], ['popular', 'الأكثر مشاهدة']],
      isChapter: u => { const s = segs(u); return s[0] === p.base && s.length >= 3; },
      mangaOf: u => { const s = segs(u); return s[0] === p.base && s.length >= 2 ? H + '/' + p.base + '/' + s[1] + '/' : null; },
      async genres() {
        const d = await X.html(H + '/?s=genre&post_type=wp-manga');
        const o = [], v = [];
        selA(d, 'div.checkbox-group div.checkbox').forEach(c => { const l = X.t(c.querySelector('label')), i = c.querySelector('input'); if (l && i) { o.push(l); v.push(i.value); } });
        return o.length ? { id: 'genre[]', t: 'm', n: 'التصنيفات', o, v, g: 1 } : null;
      },
      async list(a) {
        const f = a.f || {};
        let order = f.m_orderby;
        if (order == null || order === '') order = a.q ? '' : (a.listing === 'popular' ? 'views' : 'latest');
        const q = 's=' + encodeURIComponent(a.q || '') + '&' + X.qs({ post_type: 'wp-manga', m_orderby: order, op: f.op, 'genre[]': f['genre[]'], 'status[]': f['status[]'] });
        if (loadMore && a.page > 1) {
          const vars = { action: 'madara_load_more', page: a.page - 1, template: 'madara-core/content/content-search', 'vars[paged]': 1, 'vars[template]': 'archive', 'vars[sidebar]': 'right', 'vars[post_type]': 'wp-manga', 'vars[post_status]': 'publish', 'vars[manga_archives_item_layout]': 'big_thumbnail' };
          if (a.q) vars['vars[s]'] = a.q;
          const om = { latest: ['meta_value_num', '_latest_update'], views: ['meta_value_num', '_wp_manga_views'], trending: ['meta_value_num', '_wp_manga_week_views_value'], 'new-manga': ['date'], alphabet: ['post_title'] }[order];
          if (om) { vars['vars[orderby]'] = om[0]; if (om[1]) vars['vars[meta_key]'] = om[1]; vars['vars[order]'] = order === 'alphabet' ? 'ASC' : 'DESC'; }
          const r = await X.postForm(H + '/wp-admin/admin-ajax.php', vars);
          const items = this.items(X.parse(r.text, H + '/'));
          return { items, hasNext: items.length > 0 };
        }
        const d = await X.html(H + '/' + (a.page > 1 ? 'page/' + a.page + '/' : '') + '?' + q);
        if (loadMore == null) loadMore = !!d.querySelector('nav.navigation-ajax');
        const items = this.items(d);
        return { items, hasNext: !!d.querySelector('div.nav-previous, nav.navigation-ajax, a.nextpostslink, .wp-pagenavi a.next, a.next.page-numbers') };
      },
      items(d) {
        const out = [];
        selA(d, p.item).forEach(c => {
          const a = sel1(c, p.itemLink) || c.querySelector('a[href]');
          const u = a && X.abs(a.getAttribute('href'), d.__url);
          if (!u) return;
          const t = X.t(a) || a.getAttribute('title') || (c.querySelector('img') || {}).alt || '';
          if (!t) return;
          const latest = X.t(c.querySelector('.chapter-item .chapter a, span.chapter a, .latest-chap .chapter a, .chapter a'));
          out.push({ url: u, title: t.slice(0, 150), cover: X.img(c.querySelector('img'), d.__url), latest: latest.slice(0, 40), rating: X.t(c.querySelector('.score, .post-total-rating .score, .numscore')).replace(/[^\d.]/g, '').slice(0, 4) });
        });
        return X.uniqBy(out, 'url');
      },
      async manga(url) {
        const d = await X.html(url);
        const title = X.t(sel1(d, p.title)) || (d.querySelector('meta[property="og:title"]') || {}).content || '';
        const stEl = X.byText(d, 'div.summary-heading, .am-manga-meta td', ['Status', 'الحالة'])[0];
        const r = {
          url, title: title.replace(/\s*(HOT|NEW)\s*$/i, '').trim(),
          cover: X.img(sel1(d, p.cover), url) || (d.querySelector('meta[property="og:image"]') || {}).content || '',
          summary: X.t(sel1(d, p.desc)).slice(0, 2000),
          genres: selA(d, p.tags).map(X.t).filter(Boolean),
          status: X.status(stEl ? X.t(stEl.nextElementSibling) : ''),
        };
        let els = selA(d, p.chapter);
        const mu = url.replace(/[?#].*$/, '').replace(/\/?$/, '/');
        // الصفحة قد تعرض قائمة جزئية فقط (آخر الفصول)؛ نقطة ajax/chapters تُرجع الكاملة (خيار useNewChapterEndpoint في lnreader)
        const RUL = (window.NOVEL_RULES || {})[(() => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return ''; } })()] || {};
        const partial = els.length > 0 && (p.paginated || RUL.newCh || els.length <= 30);
        if (!els.length || partial) {
          if (p.paginated) {
            const all = [];
            for (let pg = 1; pg < 60; pg++) {
              const x = await X.postForm(mu + 'ajax/chapters/?t=' + pg, '');
              if (x.status === 404) break;
              const got = selA(X.parse(x.text, url), p.chapter);
              if (!got.length) break;
              const last = got[got.length - 1].querySelector('a');
              if (all.length && last && all[all.length - 1].querySelector('a').href === last.href) break;
              all.push(...got);
            }
            if (all.length > els.length) els = all;
          } else {
            let got = [];
            const x = await X.postForm(mu + 'ajax/chapters/', '').catch(() => null);
            if (x && x.status < 400) got = selA(X.parse(x.text, url), p.chapter);
            if (!got.length) {
              const holder = d.querySelector('[id^=manga-chapters-holder][data-id], #manga-chapters-holder');
              const id = holder && holder.getAttribute('data-id');
              if (id) {
                const y = await X.postForm(H + '/wp-admin/admin-ajax.php', { action: 'manga_get_chapters', manga: id }).catch(() => null);
                if (y) got = selA(X.parse(y.text, url), p.chapter);
              }
            }
            if (got.length > els.length) els = got;
          }
        }
        r.chapters = X.uniqBy(els.map(li => {
          const a = li.querySelector('a[href]'); if (!a) return null;
          const cu = X.abs(a.getAttribute('href'), url), t = X.t(a);
          const de = sel1(li, p.date);
          const date = de ? (X.t(de) || ((de.querySelector('a[title]') || {}).title || '')) : '';
          return { url: cu, title: t, num: X.num(t) != null ? X.num(t) : X.num(X.segs(cu).pop()), date };
        }).filter(Boolean), 'url');
        try { r.start = X.findStart(d, url); } catch (e) { }
        return r;
      },
      async chapter(url) {
        const r = await X.req(url, { html: true });
        if (r.status >= 400) throw httpErr(r, url);
        let d = X.parse(r.text, url);
        const prot = d.querySelector('#chapter-protector-data');
        if (prot) {
          let js = prot.textContent || '';
          const src = prot.getAttribute('src') || '';
          if (src.indexOf('data:text/javascript;base64,') === 0) js = atob(src.slice(28));
          const pass = X.between(js, "wpmangaprotectornonce='", "';");
          const data = JSON.parse((X.between(js, "chapter_data='", "';") || '{}').replace(/\\\//g, '/'));
          let plain = await cryptoJsDecrypt(data.ct, data.s, pass);
          try { const v = JSON.parse(plain); if (typeof v === 'string') plain = v; } catch (e) { }
          d = X.parse('<div class="reading-content"><div class="text-left">' + plain + '</div></div>', url);
        }
        return textChapter(d, url);
      },
    };
    return ad;
  }
  return madara;
});
