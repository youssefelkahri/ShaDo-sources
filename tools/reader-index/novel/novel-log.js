/* manga-log.js — سجل تشخيص يُحفظ على الجهاز (آخر ~500 سطر) ويُنسخ من الإعدادات ← البيانات ← «سجل التشخيص».
 * مستقل: NovelLog.add(وسم، رسالة، بيانات؟) · NovelLog.timer(وسم، رسالة) -> دالة تُنهي القياس · NovelLog.text() · NovelLog.clear()
 * لا يسجّل كوكيز ولا محتوى صفحات؛ فقط أسماء النطاقات والمسارات وأزمنة الطلبات والأخطاء.
 */
(function (global) {
  'use strict';
  const KEY = 'shado.log', MAX = 500;
  let buf = [];
  try { buf = JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { buf = []; }
  let saveT = 0, ctx = () => ({});
  function save() {
    clearTimeout(saveT);
    saveT = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(buf.slice(-MAX))); } catch (e) { } }, 1500);
  }
  function add(tag, msg, extra) {
    const e = { t: Date.now(), g: String(tag), m: String(msg == null ? '' : msg).slice(0, 260) };
    if (extra !== undefined) e.x = extra;
    buf.push(e);
    if (buf.length > MAX * 1.2) buf = buf.slice(-MAX);
    save();
  }
  function timer(tag, msg, extra) {
    const t0 = Date.now();
    return function (more) { add(tag, msg, Object.assign({ ms: Date.now() - t0 }, extra || {}, more || {})); };
  }
  const p2 = n => String(n).padStart(2, '0');
  function fmt(e) {
    const d = new Date(e.t);
    let x = '';
    if (e.x !== undefined) { try { x = ' ' + JSON.stringify(e.x); } catch (er) { } }
    return p2(d.getHours()) + ':' + p2(d.getMinutes()) + ':' + p2(d.getSeconds()) + '.' + String(d.getMilliseconds()).padStart(3, '0') + ' [' + e.g + '] ' + e.m + x;
  }
  function header() {
    const h = ['== سجل تشخيص ShaDo epub ==', 'الوقت: ' + new Date().toString()];
    try { h.push('الإصدار: ' + JSON.stringify(global.APP_WEB || {})); } catch (e) { }
    try { h.push('UA: ' + navigator.userAgent); } catch (e) { }
    try { const c = navigator.connection; if (c) h.push('الشبكة: ' + JSON.stringify({ type: c.effectiveType, down: c.downlink, rtt: c.rtt, save: c.saveData })); } catch (e) { }
    try { const n = global.NovelNative; if (n && n.nativeLevel) h.push('المستوى الأصلي: ' + n.nativeLevel()); } catch (e) { }
    try { const c = ctx(); if (c) h.push('الحالة: ' + JSON.stringify(c)); } catch (e) { }
    return h.join('\n');
  }
  global.NovelLog = {
    add, timer,
    setContext: f => { ctx = f; },
    count: () => buf.length,
    clear: () => { buf = []; try { localStorage.removeItem(KEY); } catch (e) { } },
    // الأحدث أولًا ومحدود بـ ~30KB: لصق السجل في المحادثة يقطع النص الطويل من آخره، فنضمن وصول الأحدث
    text: n => {
      const lines = buf.slice(-(n || MAX)).map(fmt).reverse(), out = [];
      let size = 0;
      for (const l of lines) { const x = l.length > 300 ? l.slice(0, 300) + '…' : l; size += x.length + 1; if (size > 30000) { out.push('… (أقدم من هذا محذوف)'); break; } out.push(x); }
      return header() + '\n---- الأحدث أولًا ----\n' + out.join('\n');
    },
  };
  add('app', 'بدء الجلسة');
})(window);
