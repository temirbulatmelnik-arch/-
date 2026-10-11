// Сборка офлайн-версии «Сортировки конвертов»:
//  - встраивает модуль распознавания, русский словарь, модуль Excel и шрифты (сеть не нужна);
//  - шифрует базу адресатов случайным 256-битным ключом (AES-256-GCM); ключ сохраняется в отдельный файл для флешки.
// Запуск: node build.mjs --data путь/к/base.json --out dist/konverty.html --key dist/ключ.key
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { webcrypto as crypto } from 'node:crypto';

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
].join('\n'));
put('<!--VAULT-->', `<script id="vault" type="application/json">${JSON.stringify(vault)}</script>`);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html);
fs.mkdirSync(path.dirname(KEYOUT), { recursive: true });
fs.writeFileSync(KEYOUT, `KONVERTY-KEY-1\n${B(raw)}\n`, { mode: 0o600 });
console.log(`Готово: ${OUT} — ${(html.length / 1048576).toFixed(1)} МБ, ${data.rows.length} адресатов; ключ: ${KEYOUT}`);
