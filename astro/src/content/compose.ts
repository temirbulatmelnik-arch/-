// Сборка толкований из базы: транзиты дня, события «Дат», синастрия. Без повторов между карточками.
import { ASPECT, type AspectId } from '../engine/aspects';
import type { PointId } from '../engine/core';
import { fmtDay, fmtRange } from '../engine/time';
import type { Transit } from '../engine/transits';
import type { AstroEvent } from '../engine/events';
import { PL_NOM, pointRu } from '../engine/events';
import { HOUSES, NOTES_DIMA, NOTES_ME, RETRO, TRANSIT_PLANET, DASHA_LORD, PROG_MOON_SIGN, type Nature } from './interpretations';
import { ROLE, SYN } from './pair';

const BENEFIC: Partial<Record<PointId, number>> = { venus: 1, jupiter: 1, sun: 0.5, moon: 0.3, mercury: 0.2, node: 0.3, mars: -0.4, saturn: -0.8, uranus: -0.4, neptune: -0.4, pluto: -0.6, chiron: -0.4 };

export function natureOf(a: AspectId): Nature {
  if (a === 'conj') return 'conj';
  return ASPECT[a].nature > 0 ? 'soft' : 'hard';
}
/** знак влияния: +1 гармония, −1 напряжение; соединение — по характеру планеты */
export function valence(a: AspectId, t: PointId): number {
  if (a === 'conj') return BENEFIC[t] ?? 0;
  if (a === 'quintile') return 0.7;
  if (a === 'semisext') return 0.5;
  return ASPECT[a].nature;
}

const hash = (s: string) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); };

export class Composer {
  used = new Set<string>();
  usedPoints = new Map<string, number>();
  private pick(list: string[], seed: string): string | null {
    const ok = list.filter(x => x && !this.used.has(x));
    if (!ok.length) return null;
    const v = ok[hash(seed) % ok.length];
    this.used.add(v);
    return v;
  }

  transit(tr: Transit, who: 'me' | 'dima', houseOfTransit?: number): string[] {
    const nat = natureOf(tr.aspect);
    const notes = who === 'me' ? NOTES_ME : NOTES_DIMA;
    const out: string[] = [];
    const plan = this.pick(TRANSIT_PLANET[tr.t]?.[nat] ?? [], tr.t + tr.n + tr.aspect);
    if (plan) out.push(plan);
    const n = tr.n === 'dsc' || tr.n === 'ic' || tr.n === 'snode' ? tr.n : tr.n;
    const note = notes[n];
    const times = this.usedPoints.get(who + n) ?? 0;
    this.usedPoints.set(who + n, times + 1);
    if (note) {
      const list = note[nat].length && note[nat][0] ? note[nat] : note.conj;
      const v = times === 0 ? this.pick(list, tr.t + n) : null;
      if (v) out.push(v);
      else if (tr.t !== 'moon' || out.length === 0) out.push(`Точка карты: ${note.theme.split(':')[0]}.`);
    }
    if (houseOfTransit && ['jupiter', 'saturn', 'uranus', 'neptune', 'pluto', 'chiron'].includes(tr.t)) {
      const h = `${PL_NOM[tr.t]} идёт по ${who === 'me' ? 'вашему' : 'его'} ${houseOfTransit}-му дому — ${HOUSES[houseOfTransit - 1]}.`;
      if (!this.used.has(h)) { this.used.add(h); out.push(h); }
    }
    if (tr.t === 'moon') return out.slice(0, 2);
    return out.slice(0, 3);
  }

  synastry(my: string, his: string, aspect: AspectId): string {
    const key = `${my}|${his}|${aspect}`;
    if (SYN[key]) return SYN[key];
    const nat = natureOf(aspect);
    const r1 = ROLE[my] ?? my, r2 = ROLE[his] ?? his;
    const theme = my === his ? `общая тема — ${r1}` : `${r1} у меня и ${r2} у него`;
    const soft = [`${capital(theme)}: здесь пара отдыхает и поддерживает друг друга.`, `${capital(theme)} звучат в лад — опора на трудные дни.`];
    const hard = [`${capital(theme)}: трение, из которого растут оба; помогает договорённость заранее.`, `${capital(theme)} спорят — не бой, а настройка: важно проговаривать ожидания.`];
    const conj = [`${capital(theme)} слиты в одно — сильная и общая тема, в хорошем и в трудном.`];
    const list = nat === 'soft' ? soft : nat === 'hard' ? hard : conj;
    return list[hash(key) % list.length];
  }
}
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** короткая сфера натальной точки для советов */
const DOMAIN_ME: Record<string, string> = { sun: 'дома и денег', moon: 'чувств', mercury: 'договоров', venus: 'любви и карьеры', mars: 'энергии', jupiter: 'денег', saturn: 'документов', uranus: 'перемен', neptune: 'репутации', pluto: 'контроля', node: 'учёбы', snode: 'старых привычек', chiron: 'карьеры', lilith: 'близости', asc: 'самочувствия', mc: 'карьеры', dsc: 'партнёрства', ic: 'дома', vertex: 'встреч', fortune: 'радости', spirit: 'отношений' };
const ADVICE: Record<string, string> = { moon: 'прислушаться к настроению', sun: 'проявиться и взять инициативу', mercury: 'договориться и написать важное', venus: 'встретиться, порадовать себя и близких', mars: 'потратить силы на трудное дело или спорт', jupiter: 'просить больше и соглашаться на рост', saturn: 'закрепить договорённости и планы', uranus: 'попробовать новое', neptune: 'творить и доверять интуиции', pluto: 'глубоко поменять то, что давно просилось', chiron: 'поговорить о трудном бережно', node: 'сделать шаг по своему пути' };
const AVOID: Record<string, string> = { moon: 'решений на эмоциях', sun: 'мериться самолюбием', mercury: 'отправлять, не перечитав', venus: 'импульсивных трат и обид', mars: 'спешки и споров', jupiter: 'обещать лишнего', saturn: 'давить и откладывать', uranus: 'резких решений', neptune: 'верить на слово', pluto: 'борьбы за контроль', chiron: 'расковыривать старые раны', node: 'возвращаться к старому' };

export function headline(trs: (Transit & { score: number })[], moonVoc: boolean): { advice: string; avoid: string; extra?: string } {
  const pos = [...trs].filter(t => t.score > 0).sort((a, b) => b.score - a.score)[0];
  const neg = [...trs].filter(t => t.score < 0).sort((a, b) => a.score - b.score)[0];
  const advice = pos ? `${capital(ADVICE[pos.t] ?? 'действовать')} — в делах ${DOMAIN_ME[pos.n] ?? 'дня'}.` : 'Ровный день: держите обычный ритм и доделывайте начатое.';
  const avoid = neg ? `${capital(AVOID[neg.t] ?? 'резкости')}, особенно в теме ${DOMAIN_ME[neg.n] ?? 'дня'}.` : 'Серьёзных напряжений нет — главное не придумывать их себе.';
  return { advice, avoid, extra: moonVoc ? 'Луна без курса: начатое сейчас может не получить развития — лучше доделывать.' : undefined };
}

export function retroText(id: string): string { return RETRO[id] ?? ''; }

// ── события «Дат» ──
const HOUSE_SHORT_PREP = ['1-м доме (личность)', '2-м доме (деньги)', '3-м доме (слово)', '4-м доме (дом и семья)', '5-м доме (любовь)', '6-м доме (работа и здоровье)', '7-м доме (партнёрство)', '8-м доме (кризис и близость)', '9-м доме (учёба и дорога)', '10-м доме (карьера)', '11-м доме (друзья)', '12-м доме (тайное)'];

export function eventText(e: AstroEvent, c = new Composer()): string[] {
  const m = e.meta;
  switch (e.kind) {
    case 'lunation': {
      const nm = m.phase === 0;
      return [`${nm ? 'Начало цикла — загадывать и начинать' : 'Кульминация — итоги, эмоции на пике'}: у меня в ${HOUSE_SHORT_PREP[(m.houseMe as number) - 1]}, у Димы в ${HOUSE_SHORT_PREP[(m.houseDima as number) - 1]}.`];
    }
    case 'eclipse': {
      const cs = JSON.parse(m.contacts as string) as { who: 'me' | 'dima'; point: string; aspect: string; orb: number }[];
      const lines = [`Затмение — точка перезапуска на полгода: у меня в ${HOUSE_SHORT_PREP[(m.houseMe as number) - 1]}, у Димы в ${HOUSE_SHORT_PREP[(m.houseDima as number) - 1]}.`];
      if (cs.length) {
        const s = cs.slice(0, 4).map(x => `${ASPECT[x.aspect as AspectId].glyph} ${pointRu(x.point, x.who)}`);
        lines.push(`Контакты ≤3°: ${s.join('; ')}. События этой темы запускаются в ближайшие месяцы.`);
      } else lines.push('Тесных контактов с картами нет — фон, а не личное событие.');
      return lines;
    }
    case 'retro': {
      const p = m.planet as string;
      return [RETRO[p], `Тень: с ${fmtDay(m.pre as number)} до ${fmtDay(m.post as number, true)}. Разворот вперёд — ${fmtDay(m.tD as number)}. У меня в ${HOUSE_SHORT_PREP[(m.houseMe as number) - 1]}.`];
    }
    case 'transit': {
      if (m.approach) return [`Медленный подход к углу карты: ${PL_NOM[m.tp as string]} входит в орбис 2° — тема начинает звучать задолго до точного аспекта.`, ...(c.transit({ t: m.tp, n: m.n, aspect: m.a } as Transit, e.who as 'me' | 'dima').slice(1, 2))];
      const lines = c.transit({ t: m.tp, n: m.n, aspect: m.a } as Transit, e.who as 'me' | 'dima', m.house as number);
      if (m.station) lines.unshift(`Планета останавливается и ${m.turnsRetro ? 'разворачивается назад' : 'разворачивается вперёд'} прямо на точке — эффект как у точного аспекта, растянутый на недели.`);
      else if (e.passes && e.passes.length > 1) lines.push(`Проход ${e.passIndex} из ${e.passes.length}: ${e.passes.map(p => fmtDay(p, true)).join(', ')} — одна история${m.retro ? ', сейчас планета ретроградна' : ''}.`);
      return lines;
    }
    case 'progression': {
      if (String(e.key).startsWith('prog:moonsign')) return [`Внутренний фон на ~2,5 года: ${PROG_MOON_SIGN[m.sign as number]}. ${e.who === 'me' ? `Идёт по ${m.house}-му дому — ${HOUSES[(m.house as number) - 1]}.` : ''}`];
      return [`Вторичная прогрессия — медленное внутреннее созревание: ${ROLE[m.pid as string]} встречается с темой «${ROLE[m.n as string]}». Действует около года вокруг даты.`];
    }
    case 'arc': return [`Солнечная дуга — жизненный поворот: ${ROLE[m.dp as string]} касается точки «${ROLE[m.n as string]}». Событие, которое запоминается.`];
    case 'dasha': return [`Ведический период: ${DASHA_LORD[m.lord as string]}.${m.end ? ` До ${fmtDay(m.end as number, true)}.` : ''}`];
    case 'birthday': return [`Соляр на Санкт-Петербург: Асцендент года в ${['Овне', 'Тельце', 'Близнецах', 'Раке', 'Льве', 'Деве', 'Весах', 'Скорпионе', 'Стрельце', 'Козероге', 'Водолее', 'Рыбах'][m.ascSign as number]}, Луна в ${m.moonH}-м доме соляра, Юпитер в ${m.jupH}-м — ${HOUSES[(m.jupH as number) - 1]} обещает рост.`];
  }
  return [];
}

export const windowText = (e: AstroEvent) => (e.window ? `Окно: ${fmtRange(e.window[0], e.window[1])}` : '');
export { pointRu };
