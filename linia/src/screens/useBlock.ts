// Всё о блоке на сегодня: уровень, занятие, ступень, неделя, готовность к переходу, замеры.
import { useMemo } from 'react';
import type { BlockId } from '../engine/exercises';
import { blockPlan } from '../engine/plan';
import { sessionItems, type SessionKind, type SessionOptions } from '../engine/program';
import { checkPlan, readiness, todayDone, weekDone } from '../engine/stats';
import { buildTimeline } from '../engine/timeline';
import { jawAllowed, useStore } from '../store/store';

export function useSessionOptions(): SessionOptions {
  const safety = useStore(s => s.safety);
  const jawMode = useStore(s => s.settings.jawMode);
  const cheeks = useStore(s => s.settings.cheeks);
  const jawCleared = useStore(s => s.settings.jawCleared);
  return useMemo(() => ({ jaw: jawAllowed({ safety, settings: { jawCleared } }), jawMode, cheeks }), [safety, jawMode, cheeks, jawCleared]);
}

export function useBlock(block: BlockId) {
  const bs = useStore(s => s.blocks[block]);
  const history = useStore(s => s.history);
  const checks = useStore(s => s.checks);
  const opts = useSessionOptions();
  const plan = useMemo(() => blockPlan(block, bs, history), [block, bs, history]);
  const items = useMemo(() => sessionItems(plan.training, 'core', opts), [plan.training, opts]);
  const timeline = useMemo(() => buildTimeline(items, { stage: plan.stage }), [items, plan.stage]);
  const extras = useMemo(() => plan.training.extras
    .map(kind => ({ kind, items: sessionItems(plan.training, kind, opts) }))
    .filter(x => x.items.length)
    .map(x => ({ ...x, total: buildTimeline(x.items).total })), [plan.training, opts]);
  return {
    bs, plan, items, timeline, extras, opts,
    week: weekDone(history, block),
    today: todayDone(history, block, 'core'),
    todayOf: (kind: SessionKind) => todayDone(history, block, kind),
    ready: readiness(history, block, bs.levelId, { since: bs.levelSince, techAt: bs.techAt }),
    checkPlan: checkPlan(checks, block, bs.started),
  };
}
