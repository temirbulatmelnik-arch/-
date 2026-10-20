// Что делать сегодня в блоке: уровень с учётом «возврата» в поддержке, ступень роста, нужные занятия.
import type { BlockId } from './exercises';
import { levelById, sessionItems, type Level, type SessionKind, type SessionOptions } from './program';
import { daysBetween, stageOf, type SessionRecord } from './stats';
import type { BlockState } from '../store/store';

/** В поддержке осанки при падении результатов — 2 недели уровня «Выносливость» */
export const BOOST_DAYS = 14;
export const BOOST_LEVEL = 4;

export interface BlockPlan {
  level: Level;
  /** уровень, по которому идут занятия (в «возврате» — «Выносливость») */
  training: Level;
  stage: number;
  boostDay?: number;
}

export function blockPlan(block: BlockId, bs: BlockState, history: SessionRecord[], now = new Date()): BlockPlan {
  const level = levelById(block, bs.levelId);
  const stage = stageOf(history, block, level.id, bs.levelSince);
  if (block === 'posture' && level.maintenance && bs.boost) {
    const day = daysBetween(bs.boost, now) + 1;
    if (day <= BOOST_DAYS) return { level, training: levelById(block, BOOST_LEVEL), stage: 3, boostDay: day };
  }
  return { level, training: level, stage };
}

export const planItems = (p: BlockPlan, kind: SessionKind, o: SessionOptions) => sessionItems(p.training, kind, o);
