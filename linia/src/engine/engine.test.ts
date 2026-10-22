import { describe, expect, it } from 'vitest';
import { EXERCISES } from './exercises';
import { MUSCLES } from './muscles';
import { FACE, LEVELS, POSTURE, sessionItems, type Item } from './program';
import { amountAt, at, buildTimeline, demoTimeline, locate, nextItemStart, speechSeconds, stepEnd } from './timeline';
import { checkPlan, readiness, regressSignal, stageOf, trend, weekDone, type CheckRecord, type SessionRecord } from './stats';
import { blockPlan } from './plan';

const all = { jaw: true, jawMode: 'chew' as const, cheeks: true };
const sum = (tl: ReturnType<typeof buildTimeline>) => tl.steps.reduce((a, s) => a + s.duration, 0);

describe('программа', () => {
  it('шесть уровней осанки и четыре уровня лица, сроки и мышцы из каталога', () => {
    expect(POSTURE.map(l => l.id)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(FACE.map(l => l.id)).toEqual([1, 2, 3, 4]);
    expect(POSTURE.map(l => l.minDays)).toEqual([7, 14, 14, 14, 28, 0]);
    expect(FACE.map(l => l.minDays)).toEqual([14, 14, 28, 0]);
    for (const e of Object.values(EXERCISES)) {
      for (const m of [...e.muscles.work, ...(e.muscles.also ?? []), ...(e.muscles.stretch ?? []), ...(e.muscles.quiet ?? [])]) expect(MUSCLES[m], `${e.id}: ${m}`).toBeDefined();
      expect(e.guide.steps.length).toBeGreaterThan(1);
    }
  });

  it('каждое занятие собирается и укладывается в разумное время', () => {
    for (const block of ['posture', 'face'] as const) for (const l of LEVELS[block]) for (const stage of [0, 5]) {
      const tl = buildTimeline(sessionItems(l, 'core', all), { stage });
      expect(tl.total).toBeCloseTo(sum(tl));
      expect(tl.total / 60).toBeLessThan(block === 'posture' ? 30 : 14);
      expect(tl.total / 60).toBeGreaterThan(block === 'posture' ? 10 : 2);
      expect(tl.steps.every(s => s.duration > 0)).toBe(true);
    }
  });

  it('челюсть и улыбка — только по опроснику и настройке', () => {
    const f3 = FACE[2];
    expect(sessionItems(f3, 'core', all).map(i => i.ex)).toContain('jaw_open');
    expect(sessionItems(f3, 'core', { ...all, jaw: false }).map(i => i.ex)).not.toContain('jaw_open');
    expect(sessionItems(f3, 'core', { ...all, cheeks: false }).map(i => i.ex)).not.toContain('smile_resist');
    expect(sessionItems(f3, 'jaw', { ...all, jaw: false })).toEqual([]);
    expect(sessionItems(f3, 'jaw', { ...all, jawMode: 'clench' })[0].ex).toBe('clench');
    expect(sessionItems(FACE[1], 'jaw', all)[0].time).toBe(300);
    expect(sessionItems(f3, 'jaw', all)[0].time).toBe(480);
  });
});

describe('лента шагов', () => {
  it('удержание: шаг удержания, отдых не короче удержания, тики', () => {
    const tl = buildTimeline([{ ex: 'nod_supine', reps: 3, hold: 10, rest: 10 }]);
    const holds = tl.steps.filter(s => s.phase === 'hold');
    expect(holds).toHaveLength(3);
    expect(holds.every(s => s.duration === 10 && s.tick && s.counted)).toBe(true);
    expect(tl.steps.filter(s => s.phase === 'rest').map(s => s.duration)).toEqual([10, 10, 3]);
    expect(tl.reps).toBe(3);
  });

  it('темп: вверх, пауза, вниз, счёт голосом', () => {
    const tl = buildTimeline([{ ex: 'prone_t', reps: 3, tempo: [1, 3, 1] }], { blocksOnly: true });
    expect(tl.steps.map(s => s.phase)).toEqual(['up', 'hold', 'down', 'up', 'hold', 'down', 'up', 'hold', 'down']);
    expect(tl.steps.filter(s => s.phase === 'up').map(s => s.speak)).toEqual(['Раз', 'Два', 'Три']);
    expect(tl.total).toBe(15);
  });

  it('упражнения на одну сторону: обе стороны, смена стороны между ними', () => {
    const tl = buildTimeline([{ ex: 'er_side', sets: 2, reps: 2, tempo: [1, 1, 1] }], { blocksOnly: true });
    expect(tl.steps.filter(s => s.phase === 'switch')).toHaveLength(2);
    expect(tl.steps.filter(s => s.phase === 'up').map(s => s.side)).toEqual(['l', 'l', 'r', 'r', 'l', 'l', 'r', 'r']);
    expect(tl.steps.filter(s => s.phase === 'rest' && s.label === 'Отдых')).toHaveLength(1);
  });

  it('кивок против ладони — сторона меняется на каждом повторе', () => {
    const tl = buildTimeline([{ ex: 'nod_resisted', reps: 4, hold: 10, rest: 10, alternate: true }], { blocksOnly: true });
    expect(tl.steps.filter(s => s.phase === 'hold').map(s => s.side)).toEqual(['r', 'l', 'r', 'l']);
    expect(tl.steps.some(s => s.phase === 'switch')).toBe(false);
  });

  it('круг Y–T–W: три упражнения в каждом круге', () => {
    const item: Item = { ex: 'prone_y', circuit: ['prone_y', 'prone_t', 'prone_w'], sets: 2, reps: 1, hold: [20, 30], tempo: [2, 0, 2], setRest: 30 };
    const tl = buildTimeline([item], { stage: 1, blocksOnly: true });
    expect(tl.steps.filter(s => s.phase === 'hold').map(s => s.ex)).toEqual(['prone_y', 'prone_t', 'prone_w', 'prone_y', 'prone_t', 'prone_w']);
    expect(tl.steps.filter(s => s.phase === 'hold').every(s => s.duration === 30)).toBe(true);
    expect(tl.steps.filter(s => s.phase === 'up').map(s => s.anim)).toEqual(['proneY', 'proneT', 'proneW', 'proneY', 'proneT', 'proneW']);
  });

  it('ступени внутри уровня', () => {
    expect(at([5, 10, 20, 30], 0)).toBe(5);
    expect(at([5, 10, 20, 30], 2)).toBe(20);
    expect(at([5, 10, 20, 30], 9)).toBe(30);
    expect(at(8, 3)).toBe(8);
    const lift = (stage: number) => buildTimeline([POSTURE[3].items[0]], { stage, blocksOnly: true }).steps.find(s => s.phase === 'hold')!.duration;
    expect([0, 1, 2, 3, 4].map(lift)).toEqual([5, 10, 20, 30, 30]);
  });

  it('жевание: сторона меняется по сигналу, растяжка трапеции подсказывает вторую позицию', () => {
    const chew = buildTimeline([{ ex: 'chew', time: 300, switchEvery: 45 }], { blocksOnly: true });
    expect(chew.total).toBeCloseTo(300);
    expect(chew.steps.length).toBe(7);
    expect(chew.steps[1].speak).toBe('Другая сторона');
    const trap = buildTimeline([{ ex: 'trap_stretch', time: 30 }], { blocksOnly: true });
    expect(trap.steps.filter(s => s.phase === 'hold').map(s => s.says?.[0][1])).toEqual(['Теперь нос к подмышке', 'Теперь нос к подмышке']);
  });

  it('удержание до отказа отмечено и не тикает', () => {
    const tl = buildTimeline([POSTURE[4].items[0]], { blocksOnly: true });
    const f = tl.steps.filter(s => s.failure);
    expect(f).toHaveLength(3);
    expect(f.every(s => s.duration === 60 && !s.tick)).toBe(true);
    const i = tl.steps.indexOf(f[0]);
    expect(stepEnd(tl, tl.starts[i] + 12)).toBe(tl.starts[i] + 60);
  });

  it('поиск шага, плавность и пропуск упражнения', () => {
    const tl = buildTimeline(sessionItems(POSTURE[0], 'core', all));
    expect(locate(tl, 0).index).toBe(0);
    expect(locate(tl, tl.total + 1).done).toBe(true);
    const hold = tl.steps.findIndex(s => s.phase === 'hold');
    expect(amountAt(tl, hold, 0)).toBe(0);
    expect(amountAt(tl, hold, 5)).toBe(1);
    expect(nextItemStart(tl, 1)).toBe(tl.items[1].start);
    expect(nextItemStart(tl, tl.items[5].start + 1)).toBe(tl.total);
  });

  it('отжимание «плюс»: старт и пауза сверху на прямых руках, повтор — вниз, выжать и «плюс»', () => {
    const tl = buildTimeline([{ ex: 'pushup_table', sets: 2, reps: 2, tempo: [1.5, 1, 1.5], setRest: 25 }]);
    expect(tl.steps[0]).toMatchObject({ phase: 'prep', amount: 0 });
    const rep = tl.steps.slice(1, 4);
    expect(rep.map(s => [s.phase, s.amount])).toEqual([['down', -1], ['up', 1], ['hold', 1]]);
    expect(rep[1].counted).toBe(true);
    expect(tl.steps.find(s => s.label === 'Отдых')!.amount).toBe(0);
    expect(tl.reps).toBe(4);
    // в демонстрации после «плюса» — возврат наверх, круг замыкается без рывка
    const demo = demoTimeline('pushup_full');
    expect(demo.steps[demo.steps.length - 1]).toMatchObject({ phase: 'rest', amount: 0 });
  });

  it('с голосом перед упражнением звучит техника, и пауза длится, пока она звучит', () => {
    const items: Item[] = [{ ex: 'nod_supine', reps: 3, hold: 10 }, { ex: 'pushup_knee', sets: 2, reps: 5, tempo: [1.5, 1, 1.5], setRest: 30 }];
    const quiet = buildTimeline(items), loud = buildTimeline(items, { voice: true });
    const preps = loud.steps.filter(s => s.phase === 'prep');
    expect(preps[1].speak).toContain(EXERCISES.pushup_knee.brief);
    expect(preps[1].speak).toContain('Упор лёжа с колен');
    for (const p of preps) expect(p.duration).toBeGreaterThanOrEqual(speechSeconds(p.speak!));
    // без голоса лента прежняя
    expect(quiet.steps.filter(s => s.phase === 'prep').map(s => s.duration)).toEqual([8, 9]);
    // отдых между подходами: напоминание техники заканчивается до отсчёта последних секунд
    const rest = loud.steps.find(s => s.label === 'Отдых')!;
    const [[at, text]] = rest.says!;
    expect(text).toContain('Дальше подход 2');
    expect(at + speechSeconds(text)).toBeLessThanOrEqual(rest.duration - 3);
    // в названиях для голоса нет латиницы и цифр, в технике — цифр и значков, которые синтезатор читает плохо
    for (const e of Object.values(EXERCISES)) {
      expect(e.brief, e.id).not.toMatch(/[0-9%≈°]/);
      expect(e.say ?? e.title, e.id).not.toMatch(/[A-Za-z0-9]/);
    }
  });

  it('демонстрация собирается для каждого упражнения', () => {
    for (const id of Object.keys(EXERCISES) as (keyof typeof EXERCISES)[]) {
      const tl = demoTimeline(id);
      expect(tl.total, id).toBeGreaterThan(2);
      expect(tl.steps.some(s => s.amount > 0), id).toBe(true);
    }
  });
});

const day = (d: number, h = 12) => new Date(2026, 0, d, h).toISOString();
const rec = (d: number, p: Partial<SessionRecord> = {}): SessionRecord => ({
  id: String(d), at: day(d), block: 'posture', kind: 'core', levelId: 2, duration: 900, planned: 900, completed: true, reps: 100, ...p,
});

describe('статистика', () => {
  it('ступень растёт с каждым занятием «с запасом» на уровне', () => {
    const h = [rec(2, { rating: 'easy' }), rec(4, { rating: 'ok' }), rec(6, { rating: 'easy' }), rec(7, { rating: 'easy', levelId: 1 })];
    expect(stageOf(h, 'posture', 2, day(1))).toBe(2);
    expect(stageOf(h, 'posture', 2, day(5))).toBe(1);
  });

  it('переход: 3 «с запасом» подряд, срок уровня, проверка техники, без боли', () => {
    const since = day(1);
    const h = [rec(3, { rating: 'easy' }), rec(5, { rating: 'easy' }), rec(8, { rating: 'easy' })];
    const now = new Date(2026, 0, 16);
    expect(readiness(h, 'posture', 2, { since, techAt: day(9), now }).ready).toBe(true);
    expect(readiness(h, 'posture', 2, { since, now }).ready).toBe(false);
    expect(readiness(h, 'posture', 2, { since, techAt: day(9), now: new Date(2026, 0, 10) }).ready).toBe(false);
    expect(readiness([...h, rec(9, { rating: 'ok' })], 'posture', 2, { since, techAt: day(9), now }).streak).toBe(0);
    expect(readiness([...h.slice(0, 2), rec(8, { rating: 'easy', discomfort: true })], 'posture', 2, { since, techAt: day(9), now }).ready).toBe(false);
    expect(readiness(h, 'posture', 6, { since, techAt: day(9), now }).last).toBe(true);
  });

  it('занятия за неделю считаются с понедельника', () => {
    // 5 января 2026 — понедельник
    const h = [rec(4), rec(5), rec(7), rec(7, { kind: 'break' }), rec(8, { block: 'face' })];
    expect(weekDone(h, 'posture', 'core', new Date(2026, 0, 9))).toBe(2);
    expect(weekDone(h, 'face', 'core', new Date(2026, 0, 9))).toBe(1);
  });

  it('замеры: старт, 4, 8, 12 недель, потом раз в месяц', () => {
    const started = day(1);
    const c = (d: number, cva = 48): CheckRecord => ({ id: String(d), at: day(d), kind: 'cva', values: { cva } });
    expect(checkPlan([], 'posture', started, new Date(2026, 0, 1)).due).toBe(true);
    const p1 = checkPlan([c(1)], 'posture', started, new Date(2026, 0, 10));
    expect(p1.week).toBe(4);
    expect(p1.due).toBe(false);
    expect(checkPlan([c(1)], 'posture', started, new Date(2026, 0, 27)).due).toBe(true);
    const p4 = checkPlan([c(1), c(29), c(57), c(85)], 'posture', started, new Date(2026, 3, 1));
    expect(p4.week).toBe(16);
  });

  it('сигнал возврата: угол падает три замера подряд или выносливость хуже на 10 с', () => {
    const c = (d: number, v: Partial<CheckRecord['values']>, kind: CheckRecord['kind'] = 'cva'): CheckRecord => ({ id: String(d), at: day(d), kind, values: v });
    expect(regressSignal([c(1, { cva: 52 }), c(2, { cva: 51 }), c(3, { cva: 50 }), c(4, { cva: 49 })])).toBe('cva');
    expect(regressSignal([c(1, { cva: 52 }), c(2, { cva: 53 }), c(3, { cva: 50 }), c(4, { cva: 49 })])).toBe(null);
    expect(regressSignal([c(1, { seconds: 45 }, 'dnf'), c(2, { seconds: 34 }, 'dnf')])).toBe('dnf');
    expect(regressSignal([c(1, { seconds: 45 }, 'dnf'), c(2, { seconds: 38 }, 'dnf')])).toBe(null);
  });

  it('тренд угла: меньше 5° — в пределах погрешности', () => {
    expect(trend([48, 50])).toBe('noise');
    expect(trend([48, 49, 50])).toBe('up');
    expect(trend([48, 54])).toBe('up');
    expect(trend([50])).toBe(null);
  });

  it('возврат в поддержке: две недели уровня «Выносливость»', () => {
    const bs = { levelId: 6, levelSince: day(1), started: day(1), boost: day(10) };
    expect(blockPlan('posture', bs, [], new Date(2026, 0, 15)).training.id).toBe(4);
    expect(blockPlan('posture', bs, [], new Date(2026, 0, 30)).training.id).toBe(6);
  });
});
