// Проверка движка сопоставления на имитациях распознанного текста.
// Запуск: node test/sim.cjs <base.json> <пол.json|-> [кол-во] [pos|neg|pairs]
// База не хранится в репозитории — путь к ней передаётся аргументом.
const fs = require('fs'), path = require('path'), vm = require('vm');
const html = fs.readFileSync(path.join(__dirname, '../src/app.html'), 'utf8');
const a = html.indexOf('/* Движок сопоставления'), end = "})(typeof window !== 'undefined' ? window : globalThis);";
const E = {}; vm.runInNewContext(html.slice(a, html.indexOf(end, a) + end.length), { module: { exports: null }, globalThis: E, window: undefined, TextDecoder });
const G = require('./gen.cjs');
const D = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const GEN = process.argv[3] && process.argv[3] !== '-' ? JSON.parse(fs.readFileSync(process.argv[3], 'utf8')) : D.rows.map(r => /на$/i.test(r[3]) ? 'Ж' : 'М');
Object.assign(E, E.Engine || {});
const B = new E.Base(D.rows, D.districts);
const N = +process.argv[4] || 300;
const fem = id => GEN[id] === 'Ж';
// Как в приложении: решение по одному кадру, затем по накопленным кадрам (порог 2.5)
function run(frames) {
  let acc = null, t0 = Date.now(), k = 0;
  for (const text of frames) {
    k++;
    const ev = E.evidence(B, E.tokenize(text));
    acc = E.mergeEvidence(acc, ev);
    const rf = E.rank(B, ev);
    let d = E.decide(rf, ev);
    if (!d && k > 1) d = E.decide(E.rank(B, acc), acc, { margin: 2.5 });
    if (d) return { d, k, ms: Date.now() - t0 };
  }
  return { d: null, k, ms: Date.now() - t0 };
}
const sameAddr = (a, b) => a.addrShort === b.addrShort;
function scenario(name, make, nFrames, p) {
  const st = { ok: 0, none: 0, wrongPerson: 0, wrongDistrict: 0, ms: [], ex: [] };
  G.setSeed(777 + name.length * 31);
  for (let i = 0; i < N; i++) {
    const id = Math.floor(G.rnd() * B.recs.length), rec = B.recs[id];
    const base = make(id, rec);
    if (!base) { i--; continue; }
    const frames = []; for (let f = 0; f < nFrames; f++) frames.push(p ? G.noisy(base.text, p) : base.text);
    const r = run(frames); st.ms.push(r.ms / r.k);
    const want = base.expect === undefined ? id : base.expect;   // null => решения быть не должно
    if (!r.d) { st.none++; if (want !== null && st.ex.length < 3 && base.showNone) st.ex.push(['НЕТ', frames[0].replace(/\n/g, ' | ')]); continue; }
    if (want === null) {
      // человек не из базы: любое решение — ложное срабатывание
      st.wrongPerson++; if (r.d.rec.r !== base.district) st.wrongDistrict++;
      if (st.ex.length < 4) st.ex.push(['ЛОЖНО → ' + r.d.rec.fio + ', ' + r.d.rec.addrShort, frames[0].replace(/\n/g, ' | ')]);
      continue;
    }
    if (r.d.rec.id === want) st.ok++;
    else {
      st.wrongPerson++; if (r.d.rec.r !== B.recs[want].r) st.wrongDistrict++;
      if (st.ex.length < 4) st.ex.push(['ЧУЖОЙ → ' + r.d.rec.fio + ', ' + r.d.rec.addrShort + ' (' + r.d.rec.r + ')', 'надо: ' + B.recs[want].fio + ', ' + B.recs[want].addrShort, frames[0].replace(/\n/g, ' | ')]);
    }
  }
  st.ms.sort((a, b) => a - b);
  const pct = x => (100 * x / N).toFixed(1).padStart(5) + '%';
  console.log(`${name.padEnd(44)} верно ${pct(st.ok)}  нет решения ${pct(st.none)}  ЧУЖОЙ ${pct(st.wrongPerson)} (другой район ${st.wrongDistrict})  кадр ~${st.ms[st.ms.length >> 1]}мс, max ${st.ms[st.ms.length - 1]}мс`);
  st.ex.forEach(e => console.log('     ', e.join('\n       ')));
  return st;
}
const env = (id, rec, o) => ({ text: G.envelope(D.rows[id], fem(id), rec, o), district: rec.r });
const mode = process.argv[5] || 'pos';
if (mode === 'pos') {
  for (const [lbl, o] of [['именительный', {}], ['дательный', { dat: 1 }], ['дательный, перенос строки', { dat: 1, layout: 'wrap' }], ['дательный + отправитель + обращение', { dat: 1, sender: 1, greet: 1 }], ['инициалы вместо имени', { dat: 1, initials: 1 }]]) {
    for (const [pl, p, nf] of [['чисто', 0, 1], ['шум 3%', 0.03, 1], ['шум 6%', 0.06, 1], ['шум 10%, 3 кадра', 0.10, 3], ['шум 15%, 5 кадров', 0.15, 5]])
      scenario(lbl + ', ' + pl, (id, rec) => env(id, rec, o), nf, p);
  }
  for (const [lbl, o] of [['без квартиры', { dat: 1, noApt: 1 }], ['без дома и квартиры', { dat: 1, noApt: 1, noHouse: 1 }], ['без индекса', { dat: 1, noIdx: 1 }], ['только ФИО', { dat: 1, onlyName: 1 }], ['только адрес (без ФИО)', { noName: 1 }]])
    scenario(lbl + ', шум 3%', (id, rec) => { const e = env(id, rec, o); if (o.noName) { e.expect = null; } return e; }, 1, 0.03);
}
if (mode === 'neg') {
  // Люди не из базы
  const surnames = 'Пухова Зверева Ласточкина Кобзева Пряникова Лукоянова Сорокопудова Дягилева Брусницына Колыванова Тимирязева Огнева Поддубная Затулина'.split(' ');
  scenario('фамилия не из базы + чужой реальный адрес', (id, rec) => { const row = D.rows[id].slice(); row[1] = G.pick(surnames).toUpperCase(); const e = env(id, rec, { dat: 1 }); e.text = G.envelope(row, fem(id), rec, { dat: 1 }); e.expect = null; return e; }, 1, 0.03);
  scenario('фамилия из базы + чужое имя + чужой адрес', (id, rec) => {
    const a = D.rows[id], b = D.rows[Math.floor(G.rnd() * D.rows.length)], c = Math.floor(G.rnd() * D.rows.length);
    if (!b[2] || b[2] === a[2]) return null;
    const row = D.rows[c].slice(); row[1] = a[1]; row[2] = b[2]; row[3] = b[3];
    if (B.recs.some(r => r.famRaw === a[1] && r.imRaw === b[2] && r.otRaw === b[3])) return null;
    const e = { text: G.envelope(row, fem(c), B.recs[c], { dat: 1 }), district: B.recs[c].r, expect: null }; return e;
  }, 1, 0.03);
  scenario('то же, 3 кадра шум 8%', (id, rec) => {
    const a = D.rows[id], b = D.rows[Math.floor(G.rnd() * D.rows.length)], c = Math.floor(G.rnd() * D.rows.length);
    if (!b[2] || b[2] === a[2]) return null;
    const row = D.rows[c].slice(); row[1] = a[1]; row[2] = b[2]; row[3] = b[3];
    if (B.recs.some(r => r.famRaw === a[1] && r.imRaw === b[2] && r.otRaw === b[3])) return null;
    return { text: G.envelope(row, fem(c), B.recs[c], { dat: 1 }), district: B.recs[c].r, expect: null };
  }, 3, 0.08);
  scenario('настоящее ФИО + чужой адрес (переехал)', (id, rec) => {
    const c = Math.floor(G.rnd() * D.rows.length); if (B.recs[c].r === rec.r) return null;
    const row = D.rows[c].slice(); row[1] = D.rows[id][1]; row[2] = D.rows[id][2]; row[3] = D.rows[id][3];
    return { text: G.envelope(row, fem(id), B.recs[c], { dat: 1 }), district: B.recs[c].r, expect: id, note: 'adr' };
  }, 1, 0.03);
  // Тёзка не из списка: ФИО как у человека из базы, а улица и индекс другие (улицы в базе нет)
  const FAKE = ['ул. Лиственничная', 'пр. Звездочётный', 'ул. Малахитовая', 'пер. Янтарный', 'ул. Брусничная'];
  const far = (a, b) => { let d = 0; for (let i = 0; i < 6; i++) d += a[i] !== b[i]; return d >= 2; };
  scenario('настоящее ФИО + адрес не из базы (тёзка не из списка)', (id, rec) => {
    const row = D.rows[id].slice(); let idx;
    do { idx = '19' + String(Math.floor(G.rnd() * 10000)).padStart(4, '0'); } while (row[4] && !far(idx, row[4]));
    row[4] = idx; row[8] = String(1 + Math.floor(G.rnd() * 120)); row[9] = String(1 + Math.floor(G.rnd() * 4)); row[10] = String(1 + Math.floor(G.rnd() * 300));
    return { text: G.envelope(row, fem(id), { addrShort: G.pick(FAKE) }, { dat: 1 }), district: '', expect: null };
  }, 1, 0.03);
  scenario('та же фамилия и адрес, другое имя (родственник не из базы)', (id, rec) => {
    const b = D.rows[Math.floor(G.rnd() * D.rows.length)]; if (!b[2] || b[2] === D.rows[id][2]) return null;
    const row = D.rows[id].slice(); row[2] = b[2]; row[3] = b[3];
    if (B.recs.some(r => r.famRaw === row[1] && r.imRaw === row[2] && r.otRaw === row[3])) return null;
    return { text: G.envelope(row, fem(id), rec, { dat: 1 }), district: rec.r, expect: null };
  }, 1, 0.03);
  scenario('пустой стол / мусорный текст', () => ({ text: G.noisy('Почта России ООО Ромашка тел. 8 800 555 35 35 www', 0.05), district: '', expect: null }), 1, 0);
}
if (mode === 'pairs') {
  // Супруги/родственники по одному адресу с похожими фамилиями — обе записи в базе
  const key = r => r.addr.toLowerCase();
  const by = new Map(); B.recs.forEach(r => { const k = key(r); if (!by.has(k)) by.set(k, []); by.get(k).push(r); });
  const groups = [...by.values()].filter(g => g.length > 1);
  console.log('адресов, где живут 2+ адресата:', groups.length);
  const ids = groups.flat().map(r => r.id);
  for (const [lbl, p, nf] of [['чисто', 0, 1], ['шум 3%', 0.03, 1], ['шум 6%', 0.06, 1], ['шум 10%, 3 кадра', 0.10, 3]])
    scenario('соседи по адресу, ' + lbl, () => { const id = G.pick(ids); const e = env(id, B.recs[id], { dat: 1 }); e.expect = id; return e; }, nf, p);
  const ns = B.recs.filter(r => r.namesakes > 0).map(r => r.id);
  console.log('полных тёзок в базе:', ns.length);
  for (const [lbl, p] of [['чисто', 0], ['шум 3%', 0.03]]) {
    scenario('тёзки (одинаковое ФИО), ' + lbl, () => { const id = G.pick(ns); const e = env(id, B.recs[id], { dat: 1 }); e.expect = id; return e; }, 1, p);
    scenario('тёзки без адреса (только ФИО), ' + lbl, () => { const id = G.pick(ns); const e = env(id, B.recs[id], { dat: 1, onlyName: 1 }); e.expect = null; return e; }, 1, p);
  }
}
