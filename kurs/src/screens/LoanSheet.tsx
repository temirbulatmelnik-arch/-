// «В долг»: всё про заёмные деньги в одном месте — сколько взято по мосту, сколько из этого на этой неделе и сверх
// лимита, долг по карте с процентами, план по неделям и когда вернуть. Открывается из сосуда «В долг» на «Сегодня».
import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Money, Row, SecondaryButton, Sheet } from '../components/ui';
import { activeBridge, bridgeState, weekMoney, weekParts } from '../domain/bridge';
import { addDays, ddmm, ddmmyyyy, weekStart } from '../domain/dates';
import { useStore } from '../store/store';
import { useToday, useUi } from '../store/ui';
import { useLedger } from './Checkup';

export function LoanSheet() {
  const open = useUi(s => s.loan);
  const set = useUi(s => s.set);
  return (
    <Sheet open={open} onClose={() => set({ loan: false })} title="В долг" subtitle="Заёмные деньги: мост на кредитке">
      {open && <Body />}
    </Sheet>
  );
}

function Body() {
  const now = useToday();
  const set = useUi(s => s.set);
  const [expenses, debts, overrides, bridge] = useStore(useShallow(s => [s.expenses, s.debts, s.weeklyOverrides, s.bridge] as const));
  const led = useLedger();
  const st = useMemo(() => (activeBridge(bridge) ? bridgeState(expenses, bridge) : null), [expenses, bridge]);
  const week = useMemo(() => weekMoney(expenses, debts, overrides, bridge, weekStart(now)), [expenses, debts, overrides, bridge, now]);
  const parts = weekParts(week);
  const card = st ? debts.find(d => d.id === st.bridge.card) : led.creditCard;

  return (
    <div className="space-y-4 pt-1">
      {/* сколько взято: сиреневая штриховка — чужие деньги */}
      <section className="relative overflow-hidden rounded-[26px] px-5 py-5 text-white" style={{ background: 'linear-gradient(165deg, #8f58e2 0%, #6a3fc0 55%, #432a86 100%)', boxShadow: '0 22px 44px -28px rgba(70, 40, 140, .8)' }}>
        <span aria-hidden="true" className="absolute inset-0 opacity-25" style={{ background: 'repeating-linear-gradient(135deg, rgba(255,255,255,.5) 0 2px, transparent 2px 12px)' }} />
        <div className="relative text-[13px] text-white/80">{st ? 'Взято в долг по мосту' : 'В долг в этом месяце'}</div>
        <div className="figure relative mt-1 text-[40px] leading-none"><Money value={st ? st.used : week.spentCredit} /></div>
        {st && (
          <>
            <div className="relative mt-4 h-2.5 overflow-hidden rounded-full bg-white/20">
              <div className="h-full rounded-full bg-white/90 transition-[width] duration-700" style={{ width: `${Math.min(100, (st.used / Math.max(1, st.bridge.cap)) * 100)}%` }} />
            </div>
            <div className="relative mt-2 flex justify-between text-[12.5px] text-white/80">
              <span>из <Money value={st.bridge.cap} className="text-white" /></span>
              <span>{st.left >= 0 ? <>ещё можно <Money value={st.left} className="text-white" /></> : <>сверх моста <Money value={-st.left} className="text-white" /></>}</span>
            </div>
          </>
        )}
      </section>

      <section className="card px-4 py-1.5">
        <div className="divide-hair">
          <Row label="На этой неделе в долг"><Money value={week.spentCredit} /></Row>
          {parts.over > 0 && <Row label="из них сверх лимита недели"><span className="text-neg"><Money value={parts.over} /></span></Row>}
          {card && led.credit != null && <Row label={`Долг по карте ${card.short}`}><Money value={led.credit} /></Row>}
          {led.creditInterest > 0 && <Row label="из них проценты с последней сверки"><Money value={led.creditInterest} /></Row>}
          {st?.bridge.repayBy && <Row label="Вернуть мост до">{ddmmyyyy(st.bridge.repayBy)}</Row>}
        </div>
      </section>

      {st && (
        <section className="card px-4 py-3">
          <div className="text-[14px] font-medium">План моста по неделям</div>
          <div className="divide-hair mt-1">
            {st.weeks.map(w => (
              <div key={w.monday} className="grid grid-cols-[72px_1fr_auto] items-center gap-3 py-2 text-[13px]">
                <span>{ddmm(w.monday)}–{ddmm(addDays(w.monday, 6))}</span>
                <span className="h-1.5 overflow-hidden rounded-full bg-line">
                  <span className="block h-full rounded-full" style={{ width: `${Math.min(100, (w.used / Math.max(1, w.fromCredit)) * 100)}%`, background: w.used > w.fromCredit ? 'var(--over-hatch)' : 'var(--loan-hatch)' }} />
                </span>
                <span className={`text-[12.5px] ${w.used > w.fromCredit ? 'text-neg' : 'text-muted'}`}><Money value={w.used} /> из <Money value={w.fromCredit} /></span>
              </div>
            ))}
          </div>
          {st.bridge.repayNote && <p className="mt-2 text-[12.5px] leading-snug text-muted first-letter:uppercase">{st.bridge.repayNote}.</p>}
        </section>
      )}

      <p className="px-1 text-[12.5px] leading-snug text-muted">
        {st ? 'Мост — только покупки картой, без переводов и снятия. Всё, что сверх лимита недели, — уже не мост, а новый долг.' : 'Моста сейчас нет: кредитки только гасим. Трата с кредитки записывается как нарушение плана.'}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {card && <SecondaryButton onClick={() => set({ loan: false, debt: card.id })}>Карта {card.short}</SecondaryButton>}
        <SecondaryButton onClick={() => { set({ loan: false }); useUi.getState().setTab('plan'); }} className={card ? '' : 'col-span-2'}>Все долги</SecondaryButton>
      </div>
    </div>
  );
}
