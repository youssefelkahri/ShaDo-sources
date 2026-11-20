'use strict';
/* sources/known.js — قاعدة معرفة المواقع: ملف بيانات فقط (لا كود). مفتاحها نطاق الموقع.
 * تُستخرج من إضافات المجتمع (lnreader-plugins، lightnovel-crawler، QuickNovel، Shosetsu…) وتُقرأ بقالب «api» العام،
 * والمولّد يطبّقها تلقائياً حين يتعرّف على النطاق. القيم المركّبة a||b.c = أول مسار غير فارغ. {slug} {n} {page} {q} متغيّرات. */
window.NOVEL_KNOWN = {
  'rewayat.club': { // مصدر: lnreader-plugins/plugins/arabic/rewayatclub.ts
    name: 'نادي الروايات', src: 'lnreader-plugins + shosetsu',
    listings: [['latest', 'الأحدث'], ['popular', 'الأكثر فصولًا']],
    list: {
      latest: 'https://rewayat.club/api/chapters/weekly/list/?page={page}',
      popular: 'https://api.rewayat.club/api/novels/?type=0&ordering=-num_chapters&page={page}',
      search: 'https://api.rewayat.club/api/novels/?type=0&ordering=-num_chapters&page={page}&search={q}'
    },
    listRes: 'results', listNext: 'next',
    item: { slug: 'slug||novel.slug', title: 'arabic||novel.arabic||english||novel.english', cover: 'poster_url||novel.poster_url', latest: 'number' },
    coverBase: 'https://api.rewayat.club/',
    workUrl: 'https://rewayat.club/novel/{slug}', chapterUrl: 'https://rewayat.club/novel/{slug}/{n}',
    slugRe: '^/novel/([^/]+)', chapRe: '^/novel/[^/]+/(\\d+)/?$',
    chapters: { all: 'https://api.rewayat.club/api/chapters/{slug}/all', url: 'https://api.rewayat.club/api/chapters/{slug}/?ordering=number&page={page}', per: 24, count: 'count', res: 'results', num: 'number', title: 'title', date: 'date', side: 90000 },
    workApi: { url: 'https://api.rewayat.club/api/novels/{slug}/', title: 'arabic||english', summary: 'about', cover: 'poster_url', complete: 'complete', status: 'get_novel_status' },
    content: { url: 'https://api.rewayat.club/api/chapters/{slug}/{n}/', path: 'content', title: 'title' },
    work: { title: 'h1.primary--text span', summary: 'div.text-pre-line span', status: 'div.v-slide-group__content span.v-chip__content', genres: '.v-slide-group__content a', coverRe: 'poster_url:"([^"]+)"' },
    fixLam: true
  }
};

// ملاحظات مواقع معروفة لا يغطيها قالب «api» بعد (تظهر في تقرير التشخيص وتحدّد القالب الناقص)
window.NOVEL_NOTES = {
  'mknov.com': 'API: /api/works و /api/works/{id}/chapters؛ نص الفصل مشفّر بخط/شيفرة تُحدَّد من الصفحة (lnreader: mknov.ts)',
  'galaxynovels.com': 'ووردبريس + إضافة قارئ؛ البحث من wp-content/uploads/wor-reader-cache/search/manifest.json؛ النص عبر content_api (lnreader: galaxynovels.ts)',
  'rewayatfans.com': 'ووردبريس REST: /wp-json/wp/v2/pages (الفصول صفحات: slug وcontent) (lnreader: rewayatfans.ts)',
  'rewayahfans.net': 'ووردبريس REST مثل rewayatfans (lnreader: rewayahfans.ts)',
  'mtlarabic.com': 'API/JSON مخصص (lnreader: mtlarabic.ts)',
  'azorafly.com': 'قالب ووردبريس مخصص؛ بحث ?s= لا يعمل فيُطابَق محلياً مع الفهرس (lnreader: azorafly.ts)',
  'markazriwayat.com': 'معطّل في lnreader (broken)'
};
