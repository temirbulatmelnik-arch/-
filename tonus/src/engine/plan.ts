// Что делать сегодня: обычная программа, поддержка или интенсивный блок внутри поддержки.
// Поддержка — 2–3 полные тренировки в неделю и ежедневный «Knack»; раз в 3 месяца или при падении
// самотеста — 4 недели на уровне «Пик» (у Бё сила сохранялась при тренировках хотя бы раз в неделю).
import { levelById, type Level } from './program';
import { addDays, daysBetween, testDrop, type CheckRecord } from './stats';

export const INTENSIVE_DAYS = 28;
export const INTENSIVE_EVERY_DAYS = 90;
/** Уровень, на котором идёт интенсивный блок */
export const INTENSIVE_LEVEL = 8;
/** Полных тренировок в неделю в поддержке: минимум и цель */
export const WEEK_MIN = 2;
export const WEEK_TARGET = 3;

export type Mode = 'training' | 'maintenance' | 'intensive';

export interface DayPlan {
  mode: Mode;
  /** уровень, по которому идут тренировки */
  level: Level;
  /** день интенсивного блока, с 1 */
  day?: number;
  /** пора предложить интенсивный блок: прошло 3 месяца или упали результаты */
  suggest?: 'time' | 'drop';
}

export function dayPlan({ levelId, levelSince, intensive, checks }: {
  levelId: number; levelSince: string; intensive: string | null; checks: CheckRecord[];
}, now = new Date()): DayPlan {
  const level = levelById(levelId);
  if (!level.maintenance) return { mode: 'training', level };
  if (intensive) {
    const day = daysBetween(intensive, now) + 1;
    if (day <= INTENSIVE_DAYS) return { mode: 'intensive', level: levelById(INTENSIVE_LEVEL), day };
  }
  const from = intensive ? addDays(new Date(intensive), INTENSIVE_DAYS) : new Date(levelSince);
  const suggest = testDrop(checks, from) ? 'drop' : daysBetween(from, now) >= INTENSIVE_EVERY_DAYS ? 'time' : undefined;
  return { mode: 'maintenance', level, suggest };
}
