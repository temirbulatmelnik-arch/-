// Сборка офлайн-версии «Сортировки конвертов»:
//  - встраивает модуль распознавания, русский словарь, модуль Excel и шрифты (сеть не нужна);
//  - шифрует базу адресатов случайным 256-битным ключом (AES-256-GCM); ключ сохраняется в отдельный файл для флешки.
//  - встраивает исходный Excel базы (тоже зашифрованным), чтобы выгружать его с жёлтой заливкой разложенных.
// Запуск: node build.mjs --data base.json --xlsx база.xlsx --xlsx-name "База ветеранов.xlsx" --out dist/konverty.html --key dist/ключ.key
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { webcrypto as crypto } from 'node:crypto';
import { createRequire } from 'node:module';
const XLSX = createRequire(import.meta.url)('xlsx');

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const DATA = arg('data'), OUT = arg('out', 'dist/Сортировка конвертов (защищено).html');
const KEYOUT = arg('key', 'dist/Ключ сортировки конвертов.key');
if (!DATA) throw new Error('Укажите --data base.json (формат: {districts, rows, source})');

const nm = p => path.join('node_modules', p);
const b64 = p => fs.readFileSync(nm(p)).toString('base64');
const lib = (id, p) => `<script id="${id}" type="text/plain">${b64(p)}</script>`;

// Шрифты: кириллица и латиница
const face = (fam, file, w, range) => `@font-face{font-family:"${fam}";font-style:normal;font-weight:${w};font-display:swap;src:url(data:font/woff2;base64,${b64(file)}) format("woff2");unicode-range:${range}}`;
const CYR = 'U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116';
const LAT = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';
const fonts = [];
for (const w of [400, 500, 600, 700]) for (const [sub, r] of [['cyrillic', CYR], ['latin', LAT]])
  fonts.push(face('Golos Text', `@fontsource/golos-text/files/golos-text-${sub}-${w}-normal.woff2`, w, r));
for (const w of [400, 700]) for (const [sub, r] of [['cyrillic', CYR], ['latin', LAT]])
  fonts.push(face('PT Sans Narrow', `@fontsource/pt-sans-narrow/files/pt-sans-narrow-${sub}-${w}-normal.woff2`, w, r));

// Шифрование базы
const data = JSON.parse(fs.readFileSync(DATA, 'utf8'));
if (!Array.isArray(data.rows) || !Array.isArray(data.districts)) throw new Error('В файле базы нет rows/districts');

// Исходный Excel: для каждой записи базы находим её строку в файле (фамилия, имя, отчество, квартира;
// номер дома не сравниваем — Excel превращает «9/5» в дату)
const XFILE = arg('xlsx');
if (XFILE) {
  const buf = fs.readFileSync(XFILE), wb = XLSX.read(buf);
  const norm = x => String(x == null ? '' : x).trim().toUpperCase().replace(/Ё/g, 'Е').replace(/\s+/g, ' ');
  const pool = new Map();
  wb.SheetNames.forEach((n, si) => {
    const ws = wb.Sheets[n]; if (!ws['!ref']) return;
    const r0 = XLSX.utils.decode_range(ws['!ref']).s.r;
    const all = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', blankrows: true });
    const h = all.findIndex(r => r.some(c => /фамил/i.test(String(c)))); if (h < 0) return;
    const hdr = all[h].map(c => String(c).trim().toLowerCase());
    const ix = re => hdr.findIndex(t => re.test(t));
    const c = { fam: ix(/^фамил/), im: ix(/^имя$/), ot: ix(/^отчеств/), apt: ix(/^кварт/) };
    all.slice(h + 1).forEach((r, i) => {
      const k = [r[c.fam], r[c.im], r[c.ot], r[c.apt]].map(norm).join('|');
      if (!pool.has(k)) pool.set(k, []); pool.get(k).push([si, r0 + h + 1 + i + 1]);
    });
  });
  const ref = data.rows.map(r => { const q = pool.get([r[1], r[2], r[3], r[10]].map(norm).join('|')); return q && q.length ? q.shift() : null; });
  const miss = ref.filter(x => !x).length;
  if (miss) throw new Error(`В Excel не найдено ${miss} записей базы — проверьте, что это тот же файл`);
  data.xbook = { name: arg('xlsx-name', path.basename(XFILE)), b64: buf.toString('base64'), sheets: wb.SheetNames, ref };
  console.log(`Excel: ${ref.length} записей сопоставлены со строками файла`);
}
const raw = crypto.getRandomValues(new Uint8Array(32)), iv = crypto.getRandomValues(new Uint8Array(12));
const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt']);
const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, zlib.gzipSync(Buffer.from(JSON.stringify(data)))));
const B = u => Buffer.from(u).toString('base64');
const kid = B(new Uint8Array(await crypto.subtle.digest('SHA-256', raw)).subarray(0, 9));
const vault = { v: 2, kind: 'keyfile', kid, iv: B(iv), ct: B(ct) };

let html = fs.readFileSync('src/app.html', 'utf8');
const put = (mark, text) => { if (!html.includes(mark)) throw new Error('нет метки ' + mark); html = html.replace(mark, () => text); };
put('<!--FONTS-->', `<style>${fonts.join('\n')}</style>`);
put('<!--LIBS-->', [
  lib('lib-tess', 'tesseract.js/dist/tesseract.min.js'),
  lib('lib-worker', 'tesseract.js/dist/worker.min.js'),
  lib('lib-core', 'tesseract.js-core/tesseract-core-simd-lstm.wasm.js'),
  lib('lib-rus', '@tesseract.js-data/rus/4.0.0_best_int/rus.traineddata.gz'),
  lib('lib-xlsx', 'xlsx/dist/xlsx.full.min.js'),
  lib('lib-fflate', 'fflate/umd/index.js'),
].join('\n'));
put('<!--XLSXMARK-->', `<script>\n${fs.readFileSync('src/xlsxmark.js', 'utf8')}</script>`);
put('<!--VAULT-->', `<script id="vault" type="application/json">${JSON.stringify(vault)}</script>`);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html);
fs.mkdirSync(path.dirname(KEYOUT), { recursive: true });
fs.writeFileSync(KEYOUT, `KONVERTY-KEY-1\n${B(raw)}\n`, { mode: 0o600 });
console.log(`Готово: ${OUT} — ${(html.length / 1048576).toFixed(1)} МБ, ${data.rows.length} адресатов; ключ: ${KEYOUT}`);
