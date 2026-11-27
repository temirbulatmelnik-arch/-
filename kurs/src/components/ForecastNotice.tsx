import { ArrowUpRight, TriangleAlert } from 'lucide-react';
import type { Coverage, Scenario } from '../domain/coverage';
import { dayMonth } from '../domain/dates';
import { SCENARIO_LABEL } from '../domain/financialView';
import { Money } from './ui';

export function ForecastNotice({ cov, scenario, verified, onOpen }: { cov: Coverage; scenario: Scenario; verified: boolean; onOpen: () => void }) {
  const gap = cov.shortage;
  const risk = cov.accountRisk;
  const need = !verified || risk?.reason === 'unverified' || risk?.reason === 'unassigned';
  const tone = gap ? 'bg-neg/10 text-neg' : need || risk ? 'bg-warn/12 text-warn' : 'bg-pos/10 text-pos';
  return <button type="button" onClick={onOpen} className={'flex w-full min-h-11 items-center gap-2.5 rounded-2xl px-3.5 py-2.5 text-left ' + tone}>
    {(gap || need || risk) && <TriangleAlert size={17} strokeWidth={1.8} aria-hidden="true" className="shrink-0" />}
    <span className="min-w-0 flex-1">
      <span className="block text-[11.5px] font-medium">{SCENARIO_LABEL[scenario]} прогноз</span>
      <span className="block text-[13px] font-medium">
        {gap ? <>Первый разрыв {dayMonth(gap.date)} · <Money value={gap.amount} kopecks /></> : need ? 'Нужна сверка для прогноза'
          : risk ? 'Денег на счёте недостаточно' : <>По сценарию хватает до {dayMonth(cov.to)}</>}
      </span>
      {gap && <span className="block break-words text-[12px]">{gap.title}{need ? ' · после сверки оценка уточнится' : ''}</span>}
      {!gap && risk && <span className="block text-[12px]">{risk.title}</span>}
    </span>
    <ArrowUpRight size={16} aria-hidden="true" className="shrink-0" />
  </button>;
}
