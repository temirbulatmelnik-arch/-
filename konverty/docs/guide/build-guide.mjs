// Сборка PDF-инструкции «Сортировка конвертов»: HTML + CSS (A4) → PDF через Chromium (Playwright).
// Скриншоты — из демо-версии приложения с вымышленными людьми (shots/, meta.json с координатами выносок).
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const { chromium } = (await import(process.env.PW_PATH || 'playwright')).default;   // PW_PATH — путь к playwright/index.js, если он установлен глобально
const META = JSON.parse(fs.readFileSync(path.join(ROOT, 'shots/meta.json'), 'utf8'));
const NM = path.join(ROOT, '../../node_modules');
const ICONS = path.join(NM, 'lucide-static/icons');
const icon = (n, cls = '') => fs.readFileSync(path.join(ICONS, n + '.svg'), 'utf8').replace(/<!--[\s\S]*?-->/g, '')
  .replace('<svg', `<svg class="ico ${cls}" aria-hidden="true"`).replace(/\s(width|height)="24"/g, '');
const kbd = k => `<kbd>${k}</kbd>`;
const POSTMARK = `<svg viewBox="0 0 120 120" aria-hidden="true"><defs><path id="pmC" d="M60,60 m-43,0 a43,43 0 1,1 86,0 a43,43 0 1,1 -86,0"/></defs><circle cx="60" cy="60" r="56" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="60" cy="60" r="33" fill="none" stroke="currentColor" stroke-width="1.5"/><text style="font:700 10.5px 'Golos Text';letter-spacing:.08em" fill="currentColor"><textPath href="#pmC" textLength="268" lengthAdjust="spacingAndGlyphs">СОРТИРОВКА КОНВЕРТОВ <tspan style="font-family:'DejaVu Sans'">★</tspan> САНКТ-ПЕТЕРБУРГ <tspan style="font-family:'DejaVu Sans'">★</tspan></textPath></text><path d="M44 50h32v22H44z M44 51l16 12 16-12" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/></svg>`;

// Снимок экрана с выносками: красная рамка вокруг элемента и номер.
// at — где стоит номер у рамки: tl (на левом верхнем углу, по умолчанию), tr, tc (на верхней кромке), l / r (снаружи слева / справа),
//   b / bc (под рамкой: слева / по центру), itr / ir (внутри у правого края), to / tlo / tro (над рамкой: по центру / у левого / у правого края);
// nums — какие номера показать (по умолчанию 1, 2, 3…); boxes — заменить рамки из meta.json своими.
function fig(name, { w = '100%', labels = [], cap = '', side = false, at = [], nums = null, boxes = null, img = name, cls = '' } = {}) {
  const m = META[name] || { callouts: [] };
  const n = i => (nums ? nums[i] : i + 1);
  const marks = (boxes || m.callouts).map((c, i) =>
    `<span class="hl a-${at[i] || 'tl'}" style="left:${c.x}%;top:${c.y}%;width:${c.w}%;height:${c.h}%"><i>${n(i)}</i></span>`).join('');
  const legend = labels.length ? `<ol class="legend">${labels.map((t, i) => `<li><i>${n(i)}</i><span>${t}</span></li>`).join('')}</ol>` : '';
  const f = `<figure class="shot${cls ? ' ' + cls : ''}" style="width:${w}"><div class="shot-in"><img src="shots/${img}.png" alt="">${marks}</div>${cap ? `<figcaption>${cap}</figcaption>` : ''}</figure>`;
  return side ? `<div class="duo">${f}<div class="duo-t">${legend}</div></div>` : f + legend;
}
const step = (n, title, body = '') => `<div class="step"><div class="step-n">${n}</div><div class="step-b"><p class="step-t">${title}</p>${body}</div></div>`;
const note = (kind, ic, title, body) => `<div class="note ${kind}">${icon(ic)}<div><b>${title}</b>${body ? ' ' + body : ''}</div></div>`;
const SECTIONS = [];
const sec = (id, title, body, opts = {}) => { SECTIONS.push({ id, title }); return `<section class="sec${opts.flow ? ' flow' : ''}" id="${id}"><div class="sec-head"><span class="sec-num">${SECTIONS.length}</span><h1>${title}</h1></div>${body}</section>`; };

const CSS = `
@font-face{font-family:"Golos Text";font-weight:400;src:url(../../node_modules/@fontsource/golos-text/files/golos-text-cyrillic-400-normal.woff2) format("woff2");unicode-range:U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116}
@font-face{font-family:"Golos Text";font-weight:400;src:url(../../node_modules/@fontsource/golos-text/files/golos-text-latin-400-normal.woff2) format("woff2");unicode-range:U+0000-00FF,U+2000-206F,U+20AC,U+2122,U+2190-21FF,U+2212}
@font-face{font-family:"Golos Text";font-weight:500;src:url(../../node_modules/@fontsource/golos-text/files/golos-text-cyrillic-500-normal.woff2) format("woff2");unicode-range:U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116}
@font-face{font-family:"Golos Text";font-weight:500;src:url(../../node_modules/@fontsource/golos-text/files/golos-text-latin-500-normal.woff2) format("woff2");unicode-range:U+0000-00FF,U+2000-206F,U+20AC,U+2122,U+2190-21FF,U+2212}
@font-face{font-family:"Golos Text";font-weight:600;src:url(../../node_modules/@fontsource/golos-text/files/golos-text-cyrillic-600-normal.woff2) format("woff2");unicode-range:U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116}
@font-face{font-family:"Golos Text";font-weight:600;src:url(../../node_modules/@fontsource/golos-text/files/golos-text-latin-600-normal.woff2) format("woff2");unicode-range:U+0000-00FF,U+2000-206F,U+20AC,U+2122,U+2190-21FF,U+2212}
@font-face{font-family:"Golos Text";font-weight:700;src:url(../../node_modules/@fontsource/golos-text/files/golos-text-cyrillic-700-normal.woff2) format("woff2");unicode-range:U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116}
@font-face{font-family:"Golos Text";font-weight:700;src:url(../../node_modules/@fontsource/golos-text/files/golos-text-latin-700-normal.woff2) format("woff2");unicode-range:U+0000-00FF,U+2000-206F,U+20AC,U+2122,U+2190-21FF,U+2212}
@font-face{font-family:"PT Sans Narrow";font-weight:400;src:url(../../node_modules/@fontsource/pt-sans-narrow/files/pt-sans-narrow-cyrillic-400-normal.woff2) format("woff2");unicode-range:U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116}
@font-face{font-family:"PT Sans Narrow";font-weight:400;src:url(../../node_modules/@fontsource/pt-sans-narrow/files/pt-sans-narrow-latin-400-normal.woff2) format("woff2");unicode-range:U+0000-00FF,U+2000-206F,U+20AC,U+2122,U+2212}
@font-face{font-family:"PT Sans Narrow";font-weight:700;src:url(../../node_modules/@fontsource/pt-sans-narrow/files/pt-sans-narrow-cyrillic-700-normal.woff2) format("woff2");unicode-range:U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116}
@font-face{font-family:"PT Sans Narrow";font-weight:700;src:url(../../node_modules/@fontsource/pt-sans-narrow/files/pt-sans-narrow-latin-700-normal.woff2) format("woff2");unicode-range:U+0000-00FF,U+2000-206F,U+20AC,U+2122,U+2212}
/* Без размытых теней и полупрозрачности: в PDF они становятся «мягкими масками», а часть просмотрщиков
   рисует на их месте серые прямоугольники. Глубину дают только непрозрачные рамки и «бортики». */
/* Цвета приложения: фиолетовые «почтовые» чернила, авиа-кант; выноски — красные, чтобы не сливаться с кнопками */
:root{--ink:#1C1D2E;--ink2:#555870;--ink3:#8A8DA3;--paper:#F4F4F8;--rule:#DADBE5;--stamp:#4A4EA8;--stamp-soft:#ECEDF9;
  --ok:#1F7A4D;--ok-soft:#E4F3EA;--warn:#A8650F;--warn-soft:#FBF0DD;--err:#B53A35;--err-soft:#F9E5E3;--call:#D7372F;--air:#C8473F}
@page{size:A4;margin:15mm 16mm 17mm 16mm;
  @bottom-left{content:"Сортировка конвертов · инструкция для сотрудников";font:400 7.5pt "Golos Text";color:#8A8DA3;vertical-align:top;padding-top:5mm}
  @bottom-right{content:"стр. " counter(page) " из " counter(pages);font:600 8pt "Golos Text";color:#4A4EA8;vertical-align:top;padding-top:5mm}}
@page cover{margin:0;@bottom-left{content:none}@bottom-right{content:none}}
*{box-sizing:border-box}
html{font:400 10.6pt/1.5 "Golos Text",Arial,sans-serif;color:var(--ink);-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0}
p{margin:0 0 2.4mm}
b,strong{font-weight:600}
.ico{width:1em;height:1em;flex:none;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
h1,h2,h3{font-family:"PT Sans Narrow","Golos Text",sans-serif;font-weight:700;line-height:1.08;margin:0;text-wrap:balance}
h2{font-size:17pt;margin:6mm 0 2.5mm;color:var(--ink);break-after:avoid}
h2:first-child{margin-top:0}
h3{font-size:13pt;margin:4mm 0 1.5mm;break-after:avoid}
kbd{display:inline-block;font:600 8.6pt/1.45 "Golos Text";padding:0 1.6mm;border:1px solid #B7BACB;border-bottom-width:2px;border-radius:4px;background:#fff;color:var(--ink);white-space:nowrap}
.q{font-weight:600;color:var(--stamp)}
/* ---------- Обложка ---------- */
.cover{page:cover;width:210mm;height:297mm;position:relative;display:flex;flex-direction:column;background:#fff;overflow:hidden}
.air{height:9mm;flex:none;background:repeating-linear-gradient(-45deg,var(--stamp) 0 9mm,#fff 9mm 13mm,var(--air) 13mm 22mm,#fff 22mm 26mm)}
.cover-in{flex:1;padding:24mm 22mm 0;display:flex;flex-direction:column;
  background:repeating-linear-gradient(-45deg,#fff 0 5.5mm,#F1F1F6 5.5mm 5.8mm)}
.cover-mark{width:42mm;height:42mm;color:var(--stamp);transform:rotate(-8deg);margin-bottom:12mm}
.cover-mark svg{width:100%;height:100%}
.kicker{font:600 11pt "Golos Text";letter-spacing:.06em;text-transform:uppercase;color:var(--stamp);margin-bottom:5mm}
.cover h1{font-size:56pt;line-height:.95;margin-bottom:8mm}
.cover-lead{font-size:14.5pt;line-height:1.4;color:var(--ink2);max-width:150mm;margin-bottom:14mm}
.cover-three{display:grid;grid-template-columns:repeat(3,1fr);gap:5mm;max-width:166mm}
.c3{background:#fff;border:1px solid var(--rule);border-radius:12px;padding:5mm 5mm 4.5mm;box-shadow:0 1.2mm 0 #E4E5EE}
.c3 .ico{width:9mm;height:9mm;color:var(--stamp);margin-bottom:3mm}
.c3 b{display:block;font:700 13.5pt "PT Sans Narrow";margin-bottom:1mm}
.c3 span{font-size:9.6pt;color:var(--ink2);line-height:1.4;display:block}
.cover-foot{padding:0 22mm 10mm;display:flex;justify-content:space-between;gap:10mm;font-size:9pt;color:var(--ink2);margin-top:auto}
.cover-foot .ico{width:4.2mm;height:4.2mm;color:var(--ok);vertical-align:-0.8mm;margin-right:1.5mm}
/* ---------- Разделы ---------- */
.sec{break-before:page}
.sec.flow{break-before:auto;break-inside:avoid;margin-top:10mm}
.keep{break-inside:avoid}
.sec-head{display:flex;align-items:center;gap:4mm;margin-bottom:5mm;padding-bottom:3.5mm;border-bottom:2px solid var(--stamp-soft)}
.sec-num{width:11mm;height:11mm;flex:none;border-radius:50%;background:var(--stamp);color:#fff;display:grid;place-items:center;font:700 15pt "PT Sans Narrow"}
.sec-head h1{font-size:26pt;color:var(--ink)}
.lead{font-size:12pt;line-height:1.5;color:var(--ink2);margin-bottom:5mm}
#about .lead{font-size:11.4pt;margin-bottom:4mm}
/* ---------- Шаги ---------- */
.step{display:grid;grid-template-columns:10mm 1fr;gap:4mm;margin:0 0 4.5mm;break-inside:avoid}
.step-n{width:10mm;height:10mm;border-radius:50%;border:2.2px solid var(--stamp);color:var(--stamp);display:grid;place-items:center;font:700 14pt "PT Sans Narrow";background:#fff}
.step-t{font-weight:600;font-size:11.6pt;line-height:1.35;margin:1.6mm 0 1.2mm}
.step-b p:not(.step-t){color:var(--ink2)}
/* ---------- Снимки и выноски ---------- */
.shot{margin:2.5mm 0 3mm;break-inside:avoid}
.shot-in{position:relative;border-radius:9px;box-shadow:0 0 0 1px #D5D7E2;background:#fff}
.shot img{display:block;width:100%;border-radius:9px}
.shot figcaption{font-size:8.8pt;color:var(--ink3);margin-top:2mm}
.hl{position:absolute;border:2.4px solid var(--call);border-radius:7px;box-shadow:0 0 0 1.2px #fff}
.hl i{position:absolute;left:-3.4mm;top:-3.4mm;width:6.4mm;height:6.4mm;border-radius:50%;background:var(--call);color:#fff;font:700 10pt/6.4mm "Golos Text";text-align:center;font-style:normal;box-shadow:0 0 0 .6mm #fff}
.hl.a-tr i{left:auto;right:-3.4mm}
.hl.a-l i{left:-8.2mm;top:calc(50% - 3.2mm)}
.hl.a-r i{left:calc(100% + 1.8mm);top:calc(50% - 3.2mm)}
.hl.a-tc i{left:calc(50% - 3.2mm)}
.hl.a-b i{left:-1mm;top:calc(100% + 1.4mm)}
.hl.a-bc i{left:calc(50% - 3.2mm);top:calc(100% + 1.4mm)}
.hl.a-itr i{left:auto;right:1.2mm;top:1.2mm}
.hl.a-ir i{left:auto;right:1.2mm;top:calc(50% - 3.2mm)}
.hl.a-to i{left:calc(50% - 3.2mm);top:-8.2mm}
.hl.a-tlo i{left:-3.2mm;top:-8.2mm}
.hl.a-tro i{left:auto;right:-3.2mm;top:-8.2mm}
.shot.mt{padding-top:8.5mm}
/* Chromium при печати обрезает всё, что выходит за поле страницы, — снимкам у края даём место под номера */
.shot.pl{padding-left:8mm}
.shot.pr{padding-right:8mm}
.grid2{display:grid;grid-template-columns:1fr 1fr;column-gap:6mm;align-items:start}
.legend{list-style:none;margin:2mm 0 4mm;padding:0;display:grid;gap:1.8mm}
.legend li{display:grid;grid-template-columns:6.4mm 1fr;gap:2.6mm;align-items:start;font-size:10.2pt;line-height:1.4;break-inside:avoid}
.legend i{width:6.4mm;height:6.4mm;border-radius:50%;background:var(--call);color:#fff;font:700 9.6pt/6.4mm "Golos Text";text-align:center;font-style:normal}
.legend.cols{grid-template-columns:1fr 1fr;column-gap:6mm}
.duo{display:grid;grid-template-columns:auto 1fr;gap:7mm;align-items:start;break-inside:avoid;margin:2mm 0 4mm}
.duo .shot{margin:0}
.duo-t .legend{margin-top:0}
.duo-t .note{margin-top:3mm}
.row2{display:grid;grid-template-columns:1fr 1fr;gap:6mm;align-items:start}
/* ---------- Плашки ---------- */
.note{display:grid;grid-template-columns:6mm 1fr;gap:3mm;padding:3.4mm 4mm;border-radius:9px;background:var(--stamp-soft);margin:3mm 0;break-inside:avoid;font-size:10.1pt;line-height:1.45}
.note>.ico{width:6mm;height:6mm;color:var(--stamp);margin-top:.2mm}
.note.ok{background:var(--ok-soft)}.note.ok>.ico{color:var(--ok)}
.note.warn{background:var(--warn-soft)}.note.warn>.ico{color:var(--warn)}
.note.err{background:var(--err-soft)}.note.err>.ico{color:var(--err)}
/* ---------- Защита: плитки ---------- */
.tiles{display:grid;grid-template-columns:1fr 1fr;gap:3mm}
.tile{display:grid;grid-template-columns:11mm 1fr;gap:3.2mm;padding:3.2mm 3.8mm;border:1px solid var(--rule);border-radius:10px;break-inside:avoid;background:#fff}
.tile .ic{width:11mm;height:11mm;display:grid;place-items:center}
.tile .ic .ico{width:7mm;height:7mm;color:var(--stamp)}
.tile b{display:block;font:700 12.6pt/1.15 "PT Sans Narrow";margin:.6mm 0 1mm}
.tile span{font-size:9.2pt;line-height:1.42;color:var(--ink2);display:block}
.fine{font-size:8.2pt;color:var(--ink3);line-height:1.4;margin-top:2.6mm}
.pd-band{display:grid;grid-template-columns:14mm 1fr;gap:4mm;align-items:center;padding:4mm 5mm;border-radius:11px;background:var(--stamp);color:#fff;margin:1mm 0 4.5mm}
.pd-band .ico{width:12mm;height:12mm;color:#fff}
.pd-band b{display:block;font:700 15pt/1.15 "PT Sans Narrow";margin-bottom:1mm}
.pd-band span{font-size:10pt;line-height:1.45;color:#EEEFFB}
/* ---------- Что где лежит ---------- */
.where{display:grid;grid-template-columns:1fr 1fr;gap:6mm;margin:3mm 0 5mm}
.box{border:1.5px solid var(--rule);border-radius:12px;padding:4mm;break-inside:avoid;background:#fff}
.box-h{display:flex;align-items:center;gap:2.6mm;font:700 13.5pt "PT Sans Narrow";margin-bottom:3mm}
.box-h .ico{width:7.5mm;height:7.5mm;color:var(--stamp)}
.file{display:grid;grid-template-columns:8mm 1fr;gap:2.6mm;align-items:center;padding:2.4mm 3mm;border-radius:8px;background:#fff;border:1px solid var(--rule);margin-top:2mm}
.file .ico{width:6mm;height:6mm;color:var(--stamp)}
.file b{font-size:9.6pt;display:block;line-height:1.25;word-break:break-word}
.file span{font-size:8.6pt;color:var(--ink2)}
.box.after{max-width:118mm;margin-top:5mm}
.more{font-size:9.8pt;color:var(--ink2);margin:1mm 0 2mm}
.box-note{font-size:9.6pt;color:var(--ink2);margin:3mm 0 0}
.need{display:grid;grid-template-columns:repeat(4,1fr);gap:3mm;margin:2mm 0 4mm}
.need div{border:1px solid var(--rule);border-radius:10px;padding:3.2mm;text-align:center;font-size:9.4pt;line-height:1.35;color:var(--ink2);break-inside:avoid}
.need .ico{width:8mm;height:8mm;color:var(--stamp);display:block;margin:0 auto 1.6mm}
.need b{display:block;color:var(--ink);font-size:10pt}
.gl{display:grid;grid-template-columns:31mm 1fr;gap:2.4mm 4mm;margin:2mm 0;font-size:10.2pt}
.gl dt{font-weight:600;color:var(--stamp)}
.gl dd{margin:0;color:var(--ink2)}
/* ---------- Оглавление ---------- */
.toc{list-style:none;margin:2mm 0 0;padding:0;counter-reset:t}
.toc li{display:flex;align-items:baseline;gap:3mm;padding:1.25mm 0;border-bottom:1px dashed var(--rule);font-size:11pt}
.toc .n{width:7mm;height:7mm;border-radius:50%;background:var(--stamp-soft);color:var(--stamp);font:700 10.5pt/7mm "PT Sans Narrow";text-align:center;flex:none;align-self:center}
.toc .t{flex:1;color:inherit;text-decoration:none}
.toc .p{font-weight:600;color:var(--stamp);font-variant-numeric:tabular-nums}
.fast{display:grid;grid-template-columns:repeat(4,1fr);gap:3mm;margin-top:2mm}
.fast div{border-radius:10px;background:var(--paper);padding:3mm 3.2mm;font-size:9.4pt;line-height:1.36;break-inside:avoid}
.fast i{display:block;font:700 16pt "PT Sans Narrow";color:var(--stamp);font-style:normal;margin-bottom:.8mm}
/* ---------- Таблицы, вопросы ---------- */
table{width:100%;border-collapse:collapse;font-size:10.2pt;break-inside:avoid}
td,th{padding:2.3mm 3mm;border-bottom:1px solid var(--rule);text-align:left;vertical-align:top}
th{font:700 11pt "PT Sans Narrow";color:var(--ink2)}
.faq{break-inside:avoid;border-left:3px solid var(--stamp-soft);padding:0 0 0 4mm;margin:0 0 4.5mm}
.faq-q{display:flex;gap:2.4mm;align-items:flex-start;font-weight:600;font-size:11pt;margin-bottom:1.2mm}
.faq-q .ico{width:5mm;height:5mm;color:var(--stamp);margin-top:.5mm}
.faq p{color:var(--ink2);margin-bottom:1.6mm}
.faq .shot{margin:2mm 0 0}
.rules{list-style:none;margin:0;padding:0;display:grid;gap:2.6mm;counter-reset:r}
.rules li{display:grid;grid-template-columns:8mm 1fr;gap:3mm;align-items:start;break-inside:avoid;font-size:10.4pt}
.rules li::before{counter-increment:r;content:counter(r);width:8mm;height:8mm;border-radius:50%;background:var(--stamp);color:#fff;font:700 12pt/8mm "PT Sans Narrow";text-align:center}
.rules b{display:block}
.rules span{color:var(--ink2)}
.state{display:inline-flex;align-items:center;gap:1.6mm;font-weight:600}
.state::before{content:"";width:2.4mm;height:2.4mm;border-radius:50%;background:currentColor}
.green{color:var(--ok)}.orange{color:var(--warn)}.red{color:var(--err)}
`;

// ===================== Содержание документа =====================
const cover = `<section class="cover">
<div class="air"></div>
<div class="cover-in">
  <div class="cover-mark">${POSTMARK}</div>
  <div class="kicker">Инструкция для сотрудников</div>
  <h1>Сортировка <br>конвертов</h1>
  <p class="cover-lead">Как с помощью веб-камеры быстро и без ошибок разложить конверты ветеранам по районам Санкт-Петербурга — шаг за шагом, с картинками.</p>
  <div class="cover-three">
    <div class="c3">${icon('usb')}<b>Флешка с ключом</b><span>Открывает приложение. Без неё данные не прочитать.</span></div>
    <div class="c3">${icon('camera')}<b>Веб-камера</b><span>Читает адрес на конверте и говорит, в какую стопку его положить.</span></div>
    <div class="c3">${icon('file-check')}<b>Файл прогресса</b><span>Сам запоминает, какие конверты уже разложены.</span></div>
  </div>
</div>
<div class="cover-foot"><span>${icon('shield-check')}На всех снимках экрана — вымышленные люди и адреса</span><span>Версия приложения: октябрь 2026</span></div>
<div class="air"></div>
</section>`;

const tocPlaceholder = `<section class="sec" id="toc"><div class="sec-head"><h1>Содержание</h1></div><ol class="toc">%TOC%</ol>
<h2 style="margin-top:6mm">Весь день работы — за 8 шагов</h2>
<div class="fast">
  <div><i>1</i>Вставьте флешку с ключом в компьютер.</div>
  <div><i>2</i>Откройте файл приложения в Яндекс Браузере.</div>
  <div><i>3</i>Нажмите «Войти по ключу».</div>
  <div><i>4</i>Нажмите «Продолжить с файлом…». В первый день — «Создать новый файл прогресса».</div>
  <div><i>5</i>Нажмите «Включить камеру».</div>
  <div><i>6</i>Поднесите конверт адресом к камере и нажмите ${kbd('Пробел')}.</div>
  <div><i>7</i>Положите конверт в стопку района, который показан крупными буквами.</div>
  <div><i>8</i>Закончили — нажмите «Сохранить прогресс» и выньте флешку.</div>
</div></section>`;

const body = [
sec('about', 'Коротко о приложении', `
<p class="lead">«Сортировка конвертов» помогает разложить конверты ветеранам по районам Санкт-Петербурга. Вы подносите конверт к веб-камере — приложение читает адрес, находит человека в базе и крупно показывает район: это стопка, куда положить конверт. Каждый разложенный конверт отмечается, а в конце базу можно выгрузить в Excel — разложенные будут залиты жёлтым.</p>
<div class="pd-band">${icon('shield-check')}<div><b>Работа ведётся с персональными данными</b><span>В базе — фамилии, имена, отчества, адреса и даты рождения ветеранов. Это персональные данные, их охраняет закон № 152-ФЗ «О персональных данных». Работа с ними защищена на каждом шаге: база зашифрована, открывается только ключом с флешки и не покидает компьютер.</span></div></div>
<h2>Как защищены данные</h2>
<div class="tiles">
  <div class="tile"><div class="ic">${icon('lock')}</div><div><b>Шифрование AES-256</b><span>База хранится внутри файла приложения в зашифрованном виде — так же шифруют данные банки. Без ключа файл — набор бессмысленных символов.</span></div></div>
  <div class="tile"><div class="ic">${icon('usb')}</div><div><b>Ключ — только на флешке</b><span>Открыть базу можно только файлом-ключом с флешки. Вынули флешку — через пару секунд приложение заблокируется.</span></div></div>
  <div class="tile"><div class="ic">${icon('wifi-off')}</div><div><b>Работает без интернета</b><span>Приложению запрещено выходить в сеть. Конверт распознаётся прямо на компьютере — снимки и данные никуда не уходят.</span></div></div>
  <div class="tile"><div class="ic">${icon('timer')}</div><div><b>Автоблокировка</b><span>Если никто не работает 15 минут, приложение закрывается само. Заблокировать сразу — ${kbd('Ctrl')} + ${kbd('L')} или значок замка.</span></div></div>
  <div class="tile"><div class="ic">${icon('eye-off')}</div><div><b>Минимум данных на экране</b><span>Показываются фамилия с инициалами и адрес без квартиры. Полные данные включаются только в настройках.</span></div></div>
  <div class="tile"><div class="ic">${icon('file-check')}</div><div><b>В файле прогресса нет ФИО</b><span>Там хранятся только номера отмеченных записей и время. Даже потерянный файл прогресса не раскроет персональные данные.</span></div></div>
  <div class="tile"><div class="ic">${icon('monitor')}</div><div><b>Только одно окно</b><span>Приложение нельзя открыть во втором окне: так отметки не перепутаются и не пропадут.</span></div></div>
  <div class="tile"><div class="ic">${icon('trash-2')}</div><div><b>Стирание с компьютера</b><span>Когда работа закончена, одной кнопкой удаляются все отметки и настройки, сохранённые в браузере.</span></div></div>
</div>
<p class="fine">Для специалистов: шифрование AES-256-GCM, ключ 256 бит — в отдельном файле; сетевые подключения запрещены политикой безопасности страницы (Content-Security-Policy); каждая отметка сразу записывается на диск. Используется открытый стандарт шифрования; приложение не является сертифицированным средством криптографической защиты информации (СКЗИ).</p>
`),
sec('need', 'Что понадобится', `
<div class="need">
  <div>${icon('monitor')}<b>Компьютер</b>с Windows</div>
  <div>${icon('globe')}<b>Яндекс Браузер</b>или Chrome, Edge</div>
  <div>${icon('camera')}<b>Веб-камера</b>встроенная или на подставке</div>
  <div>${icon('usb')}<b>Флешка</b>с ключом</div>
</div>
<h2>Что где лежит</h2>
<div class="where">
  <div class="box"><div class="box-h">${icon('monitor')}На компьютере</div>
    <div class="file">${icon('mail')}<div><b>Сортировка конвертов (защищено).html</b><span>само приложение с зашифрованной базой</span></div></div></div>
  <div class="box"><div class="box-h">${icon('usb')}На флешке</div>
    <div class="file">${icon('key-round')}<div><b>Ключ сортировки конвертов.key</b><span>ключ — «открывает» приложение</span></div></div>
    <div class="file">${icon('file-check')}<div><b>Прогресс раскладки.json</b><span>какие конверты уже разложены (появится в первый день)</span></div></div></div>
</div>
${note('warn', 'triangle-alert', 'Ключ и файл приложения храните отдельно.', 'Не пересылайте их вместе — ни по почте, ни в мессенджерах. Флешку не оставляйте без присмотра.')}
<h2>Главные слова</h2>
<dl class="gl">
  <dt>Ключ</dt><dd>файл на флешке, который открывает приложение. Как ключ от двери.</dd>
  <dt>Файл прогресса</dt><dd>файл на флешке, где приложение записывает, какие конверты уже разложены.</dd>
  <dt>Отметка</dt><dd>запись «этот конверт разложен». Ставится сама, когда приложение узнало конверт.</dd>
  <dt>Стопка</dt><dd>район Санкт-Петербурга. Всего 19 стопок: 18 районов и «Комитет».</dd>
  <dt>Сканировать</dt><dd>попросить приложение прочитать конверт перед камерой (клавиша ${kbd('Пробел')}).</dd>
</dl>
`, { flow: false }),
sec('first', 'Первый запуск', `
<p class="lead">Делается один раз — в самый первый день работы.</p>
${step(1, 'Вставьте флешку с ключом в компьютер.')}
${step(2, 'Откройте файл приложения в Яндекс Браузере.', `<p>Нажмите на файл «Сортировка конвертов (защищено).html» <b>правой кнопкой мыши</b> → «Открыть с помощью» → «Яндекс Браузер». Если появится вопрос о доступе к камере или к файлам — нажмите «Разрешить».</p>`)}
<div class="keep">${step(3, 'Нажмите синюю кнопку «Войти по ключу» и выберите на флешке файл «Ключ сортировки конвертов.key».', `<p>Его можно и просто перетащить мышкой в окно приложения.</p>`)}
${fig('lock-key', { w: '74mm', side: true, labels: ['Подсказка: вставьте флешку с ключом.', 'Нажмите <span class="q">«Войти по ключу»</span>.'] })}</div>
<div class="keep">${step(4, 'Нажмите «Создать новый файл прогресса».', `<p>Откроется обычное окно сохранения. Выберите <b>флешку</b> — ту же папку, где лежит ключ. Имя оставьте как есть: «Прогресс раскладки.json». Нажмите «Сохранить». Если браузер спросит, можно ли изменять файл, — разрешите.</p>`)}
${fig('lock-prog-first', { w: '74mm', side: true, at: ['tl', 'tl', 'l'], labels: ['<span class="q">«Создать новый файл прогресса»</span> — нажмите в первый день.', '«У меня уже есть файл прогресса» — если файл уже есть на флешке (например, работали на другом компьютере).', '«Продолжить без файла» — можно, но отметки тогда хранятся только в этом браузере.'] })}</div>
${note('ok', 'lightbulb', 'Готово!', 'Откроется главный экран. С этой минуты каждая отметка сама сохраняется в файл прогресса на флешке.')}
<div class="box after"><div class="box-h">${icon('usb')}Теперь на флешке два файла</div>
  <div class="file">${icon('key-round')}<div><b>Ключ сортировки конвертов.key</b><span>открывает приложение</span></div></div>
  <div class="file">${icon('file-check')}<div><b>Прогресс раскладки.json</b><span>помнит, какие конверты уже разложены</span></div></div>
  <p class="box-note">Каждый день берите эту флешку с собой и вставляйте её перед началом работы.</p></div>
`),
sec('daily', 'Вход в обычный день', `
${step(1, 'Вставьте флешку и откройте файл приложения в Яндекс Браузере.')}
${step(2, 'Нажмите «Войти по ключу».', `<p>Если браузер ещё помнит ключ, приложение откроется само, как только вы вставите флешку.</p>`)}
<div class="keep">${step(3, 'Нажмите «Продолжить с файлом».', `<p>Под надписью на кнопке — имя вашего файла прогресса. Если браузер спросит, можно ли изменять файл, — разрешите. Приложение загрузит все отметки, сделанные раньше.</p>`)}
${fig('lock-prog-next', { w: '74mm', side: true, labels: ['<span class="q">«Продолжить с файлом…»</span> — обычный вход каждый день.', '«Выбрать другой файл прогресса» — если файл лежит в другом месте.'] })}</div>
${note('', 'lightbulb', 'Работаете на другом компьютере?', 'Возьмите ту же флешку и тот же файл приложения. На втором шаге нажмите «У меня уже есть файл прогресса» и выберите файл на флешке — все отметки перенесутся.')}
`),
sec('main', 'Главный экран: что где', `
${fig('main', { cls: 'mt pl', at: ['itr', 'l', 'bc', 'itr', 'ir', 'l', 'l', 'to', 'to', 'tlo', 'to'] })}
<ol class="legend cols">
<li><i>1</i><span><b>Камера.</b> Сюда подносите конверт адресом к камере.</span></li>
<li><i>7</i><span><b>Стопки.</b> Сколько конвертов разложено в каждом районе.</span></li>
<li><i>2</i><span><b>«Сканировать».</b> То же, что клавиша ${kbd('Пробел')}.</span></li>
<li><i>8</i><span><b>«Сохранить прогресс»</b> и надпись «Сохранено в …» — когда сохранено в последний раз.</span></li>
<li><i>3</i><span><b>Режим:</b> «По пробелу» или «Непрерывно».</span></li>
<li><i>9</i><span><b>Отчёт по районам</b> и выгрузка в Excel.</span></li>
<li><i>4</i><span><b>Результат.</b> Крупно — район, то есть стопка.</span></li>
<li><i>10</i><span><b>Настройки.</b></span></li>
<li><i>5</i><span><b>Поиск вручную</b> по фамилии или улице.</span></li>
<li><i>11</i><span><b>Замок</b> — заблокировать приложение.</span></li>
<li><i>6</i><span><b>Журнал</b> — последние разложенные конверты.</span></li>
</ol>
<h3>Верхняя панель — крупно</h3>
${fig('header', { cls: 'pl', nums: [8, 9, 10, 11], cap: 'Номера те же, что на большом снимке.' })}
`),
sec('scan', 'Раскладываем конверты', `
<p class="lead">Основной режим — «По пробелу»: поднесли конверт, нажали ${kbd('Пробел')}, положили в стопку.</p>
<div class="grid2">
${step(1, 'Нажмите «Включить камеру».', `<p>Обычно один раз за день: дальше камера включается сама.</p>`)}
${step(2, 'Поднесите конверт адресом к камере.', `<p>Адрес должен попасть между белыми уголками. Слева вверху загорится зелёная точка «Готов — нажмите пробел».</p>`)}
<div>${fig('cam-off', { at: ['l'], labels: ['Кнопка <span class="q">«Включить камеру»</span>.'] })}</div>
<div>${fig('scan-ready', { at: ['r', 'tl'], labels: ['«Готов — нажмите пробел»: камера работает.', 'Нажмите <span class="q">«Сканировать»</span> или клавишу ' + kbd('Пробел') + '.'] })}</div>
</div>
<div class="keep">${step(3, 'Нажмите ' + kbd('Пробел') + '. Через полсекунды появится ответ.', `<p>Приложение ещё и назовёт район вслух — можно не смотреть на экран.</p>`)}
${fig('verdict-ok', { w: '98mm', cls: 'pl', side: true, at: ['l', 'l', 'r'], labels: ['<b>Район крупными буквами — это стопка</b>, в которую кладём конверт.', 'Кому письмо: сверьте фамилию с конвертом.', 'Штемпель «Отмечено»: конверт засчитан и сохранён.'] })}</div>
<div class="keep">${step(4, 'Положите конверт в стопку этого района и возьмите следующий.', `<p>Внизу экрана подсвечивается стопка, куда ушёл конверт, и счётчик района растёт.</p>`)}
${fig('cabinet', { cls: 'mt', at: ['to'], labels: ['Стопка, в которую только что ушёл конверт: подсвечена зелёным, счётчик вырос.'] })}</div>
<h2>Как держать конверт, чтобы приложение читало быстро</h2>
<div class="tiles">
  <div class="tile"><div class="ic">${icon('mail')}</div><div><b>Адресом к камере</b><span>Весь адрес — внутри белых уголков рамки.</span></div></div>
  <div class="tile"><div class="ic">${icon('lightbulb')}</div><div><b>Светло и без бликов</b><span>Если на экране написано «Блик на плёнке» — чуть наклоните конверт.</span></div></div>
  <div class="tile"><div class="ic">${icon('scan-line')}</div><div><b>Не слишком далеко</b><span>Примерно 20–40 см. Подсказка «Текст мелкий» — поднесите ближе.</span></div></div>
  <div class="tile"><div class="ic">${icon('hand')}</div><div><b>Держите ровно секунду</b><span>Не двигайте конверт, пока не появится район.</span></div></div>
</div>
`),
sec('modes', 'Режим «Непрерывно» и распознавание по фото', `
${fig('modes', { cls: 'mt', at: ['to', 'to', 'to'], labels: ['<b>«По пробелу»</b> — сканирует, только когда вы нажимаете ' + kbd('Пробел') + '. Самый спокойный режим.', '<b>«Непрерывно»</b> — пробел не нужен: поднесли конверт — он засчитан. Чтобы взять следующий, уберите конверт из кадра.', 'Кнопка с картинкой — распознать <b>фотографию</b> конверта, если камеры нет.'] })}
${note('', 'lightbulb', 'Совет.', 'Начните с режима «По пробелу». Когда освоитесь — включите «Непрерывно», так быстрее.')}
`, { flow: true }),
sec('unsure', 'Если приложение не уверено', `
<p class="lead">Иногда адрес на конверте неполный (например, только инициалы и без квартиры) — и приложение честно говорит, что не уверено. Оно ничего не отмечает само и предлагает выбрать.</p>
<div class="row2">
<div>
<h3>Выберите из списка похожих</h3>
${fig('candidates', { cls: 'pl', at: ['tl', 'l'], labels: ['Знак вопроса: приложение не уверено.', 'Нажмите на <b>нужного человека</b> — сверьте фамилию, инициалы и адрес с конвертом.'] })}
</div>
<div>
<h3>Или найдите вручную</h3>
${fig('search', { cls: 'pr', at: ['r', 'r'], labels: ['Просто начните печатать фамилию — даже без щелчка по полю.', 'Выберите строку стрелками ' + kbd('↑') + ' ' + kbd('↓') + ' и нажмите ' + kbd('Enter') + '.'] })}
</div>
</div>
${note('ok', 'keyboard', 'Набрали в английской раскладке?', 'Не страшно: «bdfyjdf» само превратится в «иванова».')}
${note('warn', 'triangle-alert', 'Конверт совсем не читается?', 'Найдите человека вручную через поиск — так же быстро.')}
`),
sec('mistakes', 'Повтор и ошибки', `
<div class="row2">
<div>
<h3>«Уже отмечен ранее»</h3>
<p>Если этот конверт уже разложен, приложение покажет жёлтую карточку и время первой отметки. Счётчик не растёт. Проверьте: возможно, это второй конверт тому же человеку.</p>
${fig('dup', { at: ['r', 'r'], labels: ['«Уже отмечен ранее» и время.', 'Штемпель «Повтор».'] })}
</div>
<div>
<h3>Отметили не того — отмените</h3>
<p>Нажмите ${kbd('Ctrl')} + ${kbd('Z')} — отменится последняя отметка. Или наведите мышь на строку в журнале справа и нажмите «Отменить».</p>
${fig('ledger', { w: '58mm', at: ['r', 'r'], labels: ['«Отменить» у любой записи журнала.', '«Отменить последнее» (' + kbd('Ctrl') + ' + ' + kbd('Z') + ').'] })}
</div>
</div>
`),
sec('save', 'Сохранение прогресса', `
<p class="lead">Отметки сохраняются <b>сами</b>: через секунду после каждого конверта — в файл прогресса на флешке, и сразу — в браузере. Кнопку можно нажимать для спокойствия в любой момент.</p>
${fig('save-ok', { cls: 'pl', labels: ['<span class="state green">Сохранено в 10:00</span> — всё в порядке, время последнего сохранения.', 'Кнопка <span class="q">«Сохранить прогресс»</span> (или ' + kbd('Ctrl') + ' + ' + kbd('S') + ').'] })}
${fig('save-warn', { cls: 'pl', labels: ['<span class="state orange">Не сохранено в файл</span> — файл прогресса не выбран, отметки только в браузере.', 'Кнопка выделена: нажмите её и сохраните файл на флешку.'] })}
<table>
<tr><th style="width:58mm">Надпись в шапке</th><th>Что делать</th></tr>
<tr><td><span class="state green">Сохранено в …</span></td><td>Ничего, всё сохраняется само.</td></tr>
<tr><td><span class="state orange">Не сохранено в файл</span></td><td>Нажмите «Сохранить прогресс» и выберите флешку.</td></tr>
<tr><td><span class="state red">Нужно разрешить запись</span></td><td>Нажмите «Сохранить прогресс» и разрешите браузеру изменять файл.</td></tr>
<tr><td><span class="state red">Файл прогресса недоступен</span></td><td>Проверьте, вставлена ли флешка, и нажмите «Сохранить прогресс».</td></tr>
</table>
`),
sec('report', 'Отчёт и выгрузка в Excel', `
${step(1, 'Нажмите «Отчёт по районам» (значок списка вверху справа).')}
${fig('report', { cls: 'mt pl', at: ['l', 'to', 'to', 'to'], labels: ['Районы и сколько в каждом разложено.', 'Показать: «Не отмечены», «Все» или «Отмечены».', '<span class="q">«База Excel с отметками»</span> — ваш исходный файл базы.', '«Сводка» — только цифры по районам, без ФИО.'] })}
${step(2, 'Нажмите «База Excel с отметками», затем «Сохранить файл».', `<p>Приложение напомнит, что в файле есть персональные данные. Файл появится в папке «Загрузки».</p>`)}
${fig('report-confirm', { cls: 'pl', at: ['l'], labels: ['Подтверждение — нажмите <span class="q">«Сохранить файл»</span>.'] })}
<h3>Что будет в файле</h3>
<p>Это ваш исходный файл базы <b>без единого изменения</b>: те же строки, столбцы и оформление. Только строки разложенных конвертов залиты <b>жёлтым</b>.</p>
${fig('excel', { cap: 'Пример выгрузки (вымышленные люди): жёлтые строки — конверты разложены, белые — ещё нет.' })}
${note('warn', 'triangle-alert', 'В выгрузке — персональные данные.', 'Храните её только на рабочем компьютере, не пересылайте без необходимости и удаляйте ненужные копии.')}
`),
sec('settings', 'Настройки и защита', `
${fig('settings', { w: '80mm', cls: 'pl', side: true, at: ['l', 'l', 'l', 'l'], labels: ['Показывать полные ФИО и квартиру. Обычно выключено — так безопаснее.', 'Через сколько минут бездействия блокировать: 5, 10, 15 или 30.', '<b>«Сделать новый ключ…»</b> — если флешка могла попасть в чужие руки. Скачаются новый ключ и новый файл приложения.', '<b>«Стереть данные с этого компьютера…»</b> — когда вся работа закончена.'] })}
<h2>Голос и прогресс</h2>
<div class="grid2">
<div>${fig('set-voice', { cls: 'pl', at: ['l', 'l', 'l'], labels: ['Голос: мужской или женский.', 'Громкость. Голос мешает — сдвиньте ползунок влево до конца.', '«Проверить голос» — послушать, как звучит.'] })}</div>
<div>${fig('set-progress', { at: ['r', 'r', 'r'], labels: ['«Сохранить прогресс» — то же, что кнопка вверху экрана.', '«Добавить отметки из файла» — перенести отметки из другого файла прогресса, например с другого компьютера.', '«Сбросить все отметки…» — снять все отметки. Только по указанию ответственного!'] })}</div>
</div>
<p class="more">Ещё в настройках: <b>«Камера»</b> — выбрать камеру, если их несколько; <b>«Обработка изображения»</b> — если мешают блики, выберите «Порог — лучше при бликах»; <b>«База адресатов»</b> — только по указанию ответственного.</p>
`),
sec('end', 'Перерыв и конец работы', `
<p class="lead">Отметки сохраняются сами, поэтому закончить можно в любой момент. Главное — не оставлять приложение открытым без присмотра.</p>
<div class="keep">${step(1, 'Уходите ненадолго — нажмите ' + kbd('Ctrl') + ' + ' + kbd('L') + ' или значок замка.', `<p>Чтобы вернуться, нажмите «Войти по ключу».</p>`)}
${fig('header', { cls: 'pl', boxes: [META.header.callouts[3]], labels: ['Значок замка — вверху справа.'] })}</div>
<div class="keep">${step(2, 'Конец дня — нажмите «Сохранить прогресс» и выньте флешку.', `<p>Приложение само заблокируется через пару секунд. Флешку уберите в надёжное место.</p>`)}
${fig('lock-removed', { w: '62mm', side: true, at: ['r', 'tl'], labels: ['Так выглядит экран, когда флешку вынули.', 'Чтобы продолжить: вставьте флешку и нажмите «Войти по ключу».'] })}</div>
${step(3, 'Вся работа закончена — сотрите данные.', `<p>Настройки → «Стереть данные с этого компьютера…». Затем удалите выгрузки из папки «Загрузки».</p>`)}
`),
sec('faq', 'Что делать, если…', `
<div class="faq"><div class="faq-q">${icon('circle-help')}Нажимаю «Войти по ключу» — ничего не происходит</div><p>Файл открыт не в браузере, а в программе просмотра. Откройте его правой кнопкой → «Открыть с помощью» → «Яндекс Браузер».</p></div>
<div class="faq"><div class="faq-q">${icon('circle-help')}Пишет «Ключ не найден»</div><p>Вставьте флешку. Если не помогло — нажмите «Выбрать файл ключа вручную…» и укажите ключ на флешке.</p></div>
<div class="row2">
<div class="faq"><div class="faq-q">${icon('circle-help')}Пишет «Этот ключ от другого файла приложения»</div><p>Ключ и файл приложения выдаются парой. Возьмите ключ, который выдали вместе с этим файлом.</p>${fig('err-wrongkey', { w: '62mm', at: ['r'] })}</div>
<div class="faq"><div class="faq-q">${icon('circle-help')}Пишет «Приложение уже открыто в другом окне»</div><p>Закройте лишнюю вкладку или окно и работайте в одном.</p>${fig('err-othertab', { w: '62mm', at: ['r'] })}</div>
</div>
<div class="faq"><div class="faq-q">${icon('circle-help')}Камера не включается или «Камера отключилась»</div><p>Проверьте провод камеры. Закройте программы видеосвязи — они занимают камеру. В адресной строке браузера нажмите на значок камеры и разрешите доступ. Потом нажмите «Включить камеру».</p>${fig('cam-lost', { w: '84mm', at: ['l', 'l'] })}</div>
<div class="faq"><div class="faq-q">${icon('circle-help')}Конверт долго не распознаётся</div><p>Поднесите ближе, уберите блик, включите свет. Или найдите человека вручную через поиск. Если блики мешают постоянно — в настройках, в разделе «Обработка изображения», выберите «Порог — лучше при бликах».</p></div>
<div class="faq"><div class="faq-q">${icon('circle-help')}Пишет «Фамилия с конверта в базе не найдена», «Совпала только фамилия» или «ФИО совпадает не полностью»</div><p>Скорее всего, конверт не из этого списка — например, остался с прошлого месяца. Отложите его. Если уверены, что конверт из списка, найдите человека вручную через поиск.</p></div>
<div class="faq"><div class="faq-q">${icon('circle-help')}Пишет «ФИО как у ветерана из базы, но адрес на конверте другой»</div><p>Это может быть тёзка — человек с такими же фамилией, именем и отчеством, но не из этого списка. Сравните адрес на конверте с адресом в списке «Похожие адресаты». Адрес совпадает — нажмите на человека, чтобы отметить. Не совпадает — отложите конверт.</p></div>
<div class="faq"><div class="faq-q">${icon('circle-help')}Пишет «Файл прогресса не найден»</div><p>Проверьте, вставлена ли флешка. Нажмите «Выбрать другой файл прогресса» и выберите «Прогресс раскладки.json» на флешке.</p></div>
<div class="faq"><div class="faq-q">${icon('circle-help')}Случайно закрыл браузер или выключился свет</div><p>Ничего не потерялось: каждая отметка сразу сохраняется. Откройте приложение и войдите как обычно.</p></div>
`),
sec('keys', 'Горячие клавиши и правила безопасности', `
<table>
<tr><th style="width:44mm">Клавиши</th><th>Что делают</th></tr>
<tr><td>${kbd('Пробел')}</td><td>сканировать конверт</td></tr>
<tr><td>буквы</td><td>начать поиск по фамилии</td></tr>
<tr><td>${kbd('↑')} ${kbd('↓')} ${kbd('Enter')}</td><td>выбрать человека в списке и отметить</td></tr>
<tr><td>${kbd('Esc')}</td><td>очистить поиск, остановить сканирование, закрыть окно</td></tr>
<tr><td>${kbd('Ctrl')} + ${kbd('Z')}</td><td>отменить последнюю отметку</td></tr>
<tr><td>${kbd('Ctrl')} + ${kbd('S')}</td><td>сохранить прогресс в файл</td></tr>
<tr><td>${kbd('Ctrl')} + ${kbd('L')}</td><td>заблокировать приложение</td></tr>
</table>
<h2>10 правил безопасности</h2>
<ol class="rules">
<li><div><b>Флешку с ключом держите при себе.</b><span>В конце дня — в сейф или запираемый ящик.</span></div></li>
<li><div><b>Уходите от компьютера — блокируйте.</b><span>${kbd('Ctrl')} + ${kbd('L')} или выньте флешку.</span></div></li>
<li><div><b>Не пересылайте ключ вместе с файлом приложения.</b><span>Ни по почте, ни в мессенджерах.</span></div></li>
<li><div><b>Работайте только в обычном окне браузера.</b><span>Не в режиме «Инкогнито» и не очищайте историю браузера во время работы.</span></div></li>
<li><div><b>Одно окно приложения.</b><span>Вторая вкладка не откроется — это нормально.</span></div></li>
<li><div><b>Не фотографируйте экран на телефон.</b><span>На экране — персональные данные.</span></div></li>
<li><div><b>Выгрузку Excel храните только на рабочем компьютере.</b><span>Ненужные копии удаляйте.</span></div></li>
<li><div><b>Потеряли флешку — сразу сообщите ответственному.</b><span>Он сделает новый ключ, и старый перестанет подходить.</span></div></li>
<li><div><b>Не устанавливайте расширения и программы «для удобства».</b><span>Приложению не нужно ничего, кроме браузера.</span></div></li>
<li><div><b>Работа закончена — сотрите данные.</b><span>Настройки → «Стереть данные с этого компьютера…».</span></div></li>
</ol>
`),
];

function html(toc) {
  const tocHtml = SECTIONS.map((s, i) => `<li><span class="n">${i + 1}</span><a class="t" href="#${s.id}">${s.title}</a><span class="p">${toc[s.id] || ''}</span></li>`).join('');
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Сортировка конвертов — инструкция для сотрудников</title>
<meta name="author" content="Сортировка конвертов"><style>${CSS}</style></head><body>${cover}${body[0]}${tocPlaceholder.replace('%TOC%', tocHtml)}${body.slice(1).join('\n')}</body></html>`;
}
const OUT = process.argv[2] || path.join(ROOT, 'Инструкция — Сортировка конвертов.pdf');
async function render(toc) {
  fs.writeFileSync(path.join(ROOT, 'guide.html'), html(toc));
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const p = await b.newPage();
  await p.goto('file://' + path.join(ROOT, 'guide.html'));
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(300);
  await p.pdf({ path: OUT, preferCSSPageSize: true, printBackground: true, outline: true, tagged: true });
  await b.close();
}
// Проход 1 — узнаём по закладкам PDF, на какой странице начинается каждый раздел; проход 2 — оглавление с номерами страниц.
// pdfpost.py заодно чинит названия закладок (см. комментарий в нём).
const post = () => JSON.parse(execSync(`python3 -I "${path.join(ROOT, 'pdfpost.py')}" "${OUT}" '${JSON.stringify(['Сортировка конвертов', 'Содержание', ...SECTIONS.map(s => s.title)])}'`).toString());
await render({});
const marks = post();
const toc = {};
for (const s of SECTIONS) { if (!marks[s.title]) throw new Error('Нет закладки для раздела: ' + s.title); toc[s.id] = marks[s.title]; }
await render(toc);
const fin = post();
const pages = +execSync(`pdfinfo "${OUT}" | sed -n 's/^Pages: *//p'`).toString().trim();
if (SECTIONS.some(s => fin[s.title] !== toc[s.id])) throw new Error('Оглавление разошлось со страницами: ' + JSON.stringify(fin));
console.log('Готово:', OUT, '| страниц:', pages, '| оглавление:', JSON.stringify(toc));
