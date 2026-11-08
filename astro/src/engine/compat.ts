// Ведическая совместимость по Лунам (без деления на «жениха и невесту»: только симметричные куты и обе Тары).
import { nakOf, sidereal, NAKSHATRAS, SIGN_LORD, GRAHA_RU, type Graha } from './vedic';
import type { Chart } from './chart';

const GANA = ['Дэва', 'Манушья', 'Ракшаса'];
const GANA_OF = [0, 1, 2, 1, 0, 1, 0, 0, 2, 2, 1, 1, 0, 2, 0, 2, 0, 2, 2, 1, 1, 0, 2, 2, 1, 1, 0];
const NADI = ['Ади (Вата)', 'Мадхья (Питта)', 'Антья (Капха)'];
const NADI_OF = [0, 1, 2, 2, 1, 0, 0, 1, 2, 2, 1, 0, 0, 1, 2, 2, 1, 0, 0, 1, 2, 2, 1, 0, 0, 1, 2];
const YONI = ['лошадь', 'слон', 'овца', 'змея', 'змея', 'собака', 'кошка', 'овца', 'кошка', 'крыса', 'крыса', 'корова', 'буйвол', 'тигр', 'буйвол', 'тигр', 'олень', 'олень', 'собака', 'обезьяна', 'мангуст', 'обезьяна', 'лев', 'лошадь', 'лев', 'корова', 'слон'];
const YONI_ENEMY = [['корова', 'тигр'], ['слон', 'лев'], ['лошадь', 'буйвол'], ['собака', 'олень'], ['змея', 'мангуст'], ['обезьяна', 'овца'], ['кошка', 'крыса']];
const TARA = ['Джанма', 'Сампат', 'Випат', 'Кшема', 'Пратьяк', 'Садхана', 'Вадха', 'Митра', 'Ати-митра'];
const TARA_GOOD = [true, true, false, true, false, true, false, true, true];
const FRIENDS: Record<string, { f: Graha[]; e: Graha[] }> = {
  sun: { f: ['moon', 'mars', 'jupiter'], e: ['venus', 'saturn'] }, moon: { f: ['sun', 'mercury'], e: [] },
  mars: { f: ['sun', 'moon', 'jupiter'], e: ['mercury'] }, mercury: { f: ['sun', 'venus'], e: ['moon'] },
  jupiter: { f: ['sun', 'moon', 'mars'], e: ['mercury', 'venus'] }, venus: { f: ['mercury', 'saturn'], e: ['sun', 'moon'] },
  saturn: { f: ['mercury', 'venus'], e: ['sun', 'moon', 'mars'] },
};
const rel = (a: Graha, b: Graha) => (a === b ? 'тот же' : FRIENDS[a].f.includes(b) ? 'друг' : FRIENDS[a].e.includes(b) ? 'враг' : 'нейтрал');

export interface CompatRow { name: string; value: string; verdict: 'good' | 'mixed' | 'hard'; note: string }

export function vedicCompat(a: Chart, b: Chart): { rows: CompatRow[]; special: string[] } {
  const ma = sidereal(a.points.moon.lon, a.date), mb = sidereal(b.points.moon.lon, b.date);
  const na = nakOf(ma), nb = nakOf(mb);
  const sa = Math.floor(ma / 30), sb = Math.floor(mb / 30);
  const rows: CompatRow[] = [];
  rows.push({ name: 'Накшатры Лун', value: `${NAKSHATRAS[na.nak]} (пада ${na.pada}) — ${NAKSHATRAS[nb.nak]} (пада ${nb.pada})`, verdict: 'mixed', note: 'Основа всех кут.' });
  const ga = GANA_OF[na.nak], gb = GANA_OF[nb.nak];
  const gv = ga === gb ? 'good' : (ga + gb === 2 && ga !== gb) ? 'hard' : 'mixed';
  rows.push({ name: 'Гана (темперамент)', value: `${GANA[ga]} и ${GANA[gb]}`, verdict: gv, note: gv === 'hard' ? 'Разные темпераменты: мягкость и прямота. Не порок, а работа на терпение.' : gv === 'good' ? 'Один темперамент — понимание с полуслова.' : 'Темпераменты совместимы с оговорками.' });
  const nd = NADI_OF[na.nak] === NADI_OF[nb.nak];
  rows.push({ name: 'Нади', value: `${NADI[NADI_OF[na.nak]]} и ${NADI[NADI_OF[nb.nak]]}`, verdict: nd ? 'hard' : 'good', note: nd ? 'Одинаковая нади — «одинаковая природа»: похожие слабые места, важно не усиливать усталость друг друга.' : 'Разная нади — дополняете друг друга.' });
  const d1 = ((sb - sa + 12) % 12) + 1, d2 = ((sa - sb + 12) % 12) + 1;
  const pair = [d1, d2].sort((x, y) => x - y).join('/');
  const bad = ['2/12', '5/9', '6/8'].includes(pair);
  const la = SIGN_LORD[sa], lb = SIGN_LORD[sb];
  rows.push({ name: 'Бхакут (знаки Лун)', value: `${pair}`, verdict: bad ? (rel(la, lb) === 'друг' || la === lb ? 'mixed' : 'hard') : 'good', note: bad ? 'Положение 2/12: разные ритмы денег и быта; смягчается общими целями.' : 'Знаки Лун в ладу.' });
  const r1 = rel(la, lb), r2 = rel(lb, la);
  rows.push({ name: 'Граха-майтри', value: `${GRAHA_RU[la]} ↔ ${GRAHA_RU[lb]}: ${r1} / ${r2}`, verdict: r1 === 'враг' || r2 === 'враг' ? 'hard' : r1 === 'друг' && r2 === 'друг' ? 'good' : 'mixed', note: 'Дружба управителей Лун — как легко договориться умом.' });
  const ya = YONI[na.nak], yb = YONI[nb.nak];
  const enemy = YONI_ENEMY.some(([x, y]) => (x === ya && y === yb) || (x === yb && y === ya));
  rows.push({ name: 'Йони (природа)', value: `${ya} и ${yb}`, verdict: ya === yb ? 'good' : enemy ? 'hard' : 'mixed', note: ya === yb ? 'Одна природа — лёгкость в близости.' : enemy ? 'Природы-антагонисты: в близости нужен общий язык.' : 'Природы разные, но не враждебные.' });
  const t1 = (((nb.nak - na.nak + 27) % 27) + 1) % 9, t2 = (((na.nak - nb.nak + 27) % 27) + 1) % 9;
  const T = (x: number) => TARA[(x + 8) % 9];
  const G = (x: number) => TARA_GOOD[(x + 8) % 9];
  rows.push({ name: 'Тара (в обе стороны)', value: `${T(t1)} / ${T(t2)}`, verdict: G(t1) && G(t2) ? 'good' : G(t1) || G(t2) ? 'mixed' : 'hard', note: 'Как звёзды рождения поддерживают друг друга в повседневности.' });
  // особые связи: Луна одного с Венерой/Солнцем/лагной другого в одной накшатре
  const special: string[] = [];
  const check = (x: Chart, y: Chart, xn: string, yn: string) => {
    const mx = nakOf(sidereal(x.points.moon.lon, x.date));
    for (const [p, name] of [['venus', 'Венера'], ['sun', 'Солнце']] as const) {
      const v = nakOf(sidereal(y.points[p].lon, y.date));
      const who = xn === 'моя' ? `Моя Луна и ${p === 'venus' ? 'его Венера' : 'его Солнце'}` : `Его Луна и ${p === 'venus' ? 'моя Венера' : 'моё Солнце'}`;
      void name; void yn;
      if (v.nak === mx.nak) special.push(`${who} — в одной накшатре (${NAKSHATRAS[v.nak]})${v.pada === mx.pada ? ' и одной паде' : ''}: ${p === 'venus' ? 'редкая нежная связь' : 'свет и чувство едины'}.`);
    }
  };
  check(a, b, 'моя', 'его'); check(b, a, 'его', 'моя');
  return { rows, special };
}
