// Генератор текстов конвертов и шумов распознавания
let seed = 12345;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const pick = a => a[Math.floor(rnd() * a.length)];
const setSeed = s => { seed = s; };
const tc = s => String(s || '').toLowerCase().replace(/(^|[\s\-])([а-яё])/g, (m, p, c) => p + c.toUpperCase());
const CONS = 'бвгджзклмнпрстфхцчшщ';

function datSurname(f, fem) {
  return f.split('-').map(w => {
    const l = w.toLowerCase();
    if (fem) {
      if (/(ов|ев|ёв|ин|ын)а$/.test(l)) return w.slice(0, -1) + 'ой';
      if (/(ск|цк)ая$/.test(l)) return w.slice(0, -2) + 'ой';
      if (/ая$/.test(l)) return w.slice(0, -2) + 'ой';
      if (/яя$/.test(l)) return w.slice(0, -2) + 'ей';
      if (/ия$/.test(l)) return w.slice(0, -1) + 'и';
      if (/[ая]$/.test(l)) return w.slice(0, -1) + 'е';
      return w;
    }
    if (/(ск|цк|к|г|х)ий$/.test(l)) return w.slice(0, -2) + 'ому';
    if (/(ый|ой)$/.test(l)) return w.slice(0, -2) + 'ому';
    if (/ий$/.test(l)) return w.slice(0, -2) + 'ему';
    if (/(их|ых)$/.test(l)) return w;
    if (/[ьй]$/.test(l)) return w.slice(0, -1) + 'ю';
    if (/[ая]$/.test(l)) return w.slice(0, -1) + 'е';
    if (CONS.includes(l[l.length - 1])) return w + 'у';
    return w;
  }).join('-');
}
function datName(n, fem) {
  const l = n.toLowerCase();
  if (fem) {
    if (/ия$/.test(l)) return n.slice(0, -1) + 'и';
    if (/[ая]$/.test(l)) return n.slice(0, -1) + 'е';
    if (/ь$/.test(l)) return n.slice(0, -1) + 'и';
    return n;
  }
  if (/ий$/.test(l)) return n.slice(0, -1) + 'ю';
  if (/[йь]$/.test(l)) return n.slice(0, -1) + 'ю';
  if (/[ая]$/.test(l)) return n.slice(0, -1) + 'е';
  if (CONS.includes(l[l.length - 1])) return n + 'у';
  return n;
}
function datPatr(p, fem) {
  const l = p.toLowerCase();
  if (fem && /на$/.test(l)) return p.slice(0, -1) + 'е';
  if (!fem && /ич$/.test(l)) return p + 'у';
  return p;
}

// Типичные путаницы Tesseract для кириллицы
const CONF = { о: ['0', 'с', 'а'], е: ['с', 'ё', 'о'], с: ['е', 'о'], и: ['н', 'й', 'п'], н: ['и', 'п', 'к'], п: ['н', 'л', 'и'],
  л: ['п', 'д'], ш: ['щ', 'ц'], щ: ['ш'], ц: ['щ', 'и'], б: ['6', 'в'], з: ['3', 'э'], ч: ['4', 'у'], т: ['г', 'п'], г: ['т', 'r'],
  ь: ['ъ', 'ы', 'b'], ы: ['ь1', 'м'], в: ['8', 'б'], а: ['д', 'о'], к: ['х', 'н'], м: ['н', 'ш'], у: ['ч', 'y'], д: ['а', 'л'],
  я: ['а', 'R'], ю: ['ю', 'ю'], р: ['p', 'о'], х: ['к', 'x'], ж: ['х', 'ж'], й: ['и'], э: ['з', 'е'],
  '1': ['l', '7', 'I'], '7': ['1', 'т'], '3': ['8', 'з'], '8': ['3', 'в'], '0': ['о', 'О'], '5': ['6', 'S'], '6': ['б', '5'], '9': ['8', 'д'] };
function noisy(text, p) {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i], lo = ch.toLowerCase();
    const r = rnd();
    if (ch === ' ' && r < p / 2) continue;                 // слипание слов
    if (r < p && CONF[lo]) { let c = pick(CONF[lo]); if (ch !== lo) c = c.toUpperCase(); out += c; continue; }
    if (r < p * 1.3 && /[а-яё]/i.test(ch)) continue;          // выпавшая буква
    if (r < p * 1.45 && /[а-яё]/i.test(ch)) { out += ch + ' '; continue; } // лишний пробел
    out += ch;
  }
  return out;
}
function korpText(k) {
  if (!k) return '';
  const m = String(k).match(/^(\d+)?\s*(?:ЛИТЕРА\s*([А-ЯA-Z]))?$/i);
  if (!m) return 'корп. ' + k.toLowerCase();
  return [m[1] ? 'корп. ' + m[1] : '', m[2] ? 'лит. ' + m[2] : ''].filter(Boolean).join(', ');
}
// Конверт: opts = {dat, layout, sender, greet, noApt, noHouse, noIdx, onlyName, noName, initials}
function envelope(row, fem, rec, o) {
  o = o || {};
  const [, fam, im, ot, idx, town, np, street, house, korp, apt] = row;
  let F = tc(fam), I = tc(im), P = tc(ot);
  if (o.dat) { F = datSurname(F, fem); I = im ? datName(I, fem) : ''; P = ot ? datPatr(P, fem) : ''; }
  if (o.initials) { I = I ? I[0] + '.' : ''; P = P ? P[0] + '.' : ''; }
  const name = [F, I, P].filter(Boolean).join(' ');
  const st = rec.addrShort.split(', ').filter(x => !/^(д\.|корп\.|лит\.)/.test(x)).join(', ');
  const parts = [st];
  if (!o.noHouse && house) parts.push('д. ' + String(house).toLowerCase());
  const kt = korpText(korp); if (kt && !o.noHouse) parts.push(kt);
  if (!o.noApt && apt) parts.push('кв. ' + String(apt).toLowerCase());
  const addr = parts.join(', ');
  const lines = [];
  if (o.sender) lines.push('От кого: Администрация Губернатора', 'Санкт-Петербурга', 'Куда: Смольный проезд, д. 1', '191060');
  if (o.greet) lines.push('Уважаем' + (fem ? 'ая ' : 'ый ') + tc(im) + ' ' + tc(ot) + '!');
  if (!o.noName) {
    if (o.layout === 'wrap') { lines.push('Кому: ' + F + ' ' + I); if (P) lines.push(P); }
    else lines.push('Кому: ' + name);
  }
  if (!o.onlyName) {
    lines.push('Куда: ' + addr);
    if (!o.noIdx && idx) lines.push(idx + ' Санкт-Петербург'); else lines.push('Санкт-Петербург');
  }
  return lines.join('\n');
}
module.exports = { rnd, pick, setSeed, noisy, envelope, datSurname, datName, datPatr, tc };
