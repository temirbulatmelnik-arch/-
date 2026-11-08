import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { askEvents, useAsync } from '../astro';
import { useApp, type DateFilter } from '../store';
import type { AstroEvent, EventKind } from '../engine/events';
import { fmtMonth, mskParts, fmtTime, fmtDay } from '../engine/time';
import { eventText, windowText, Composer } from '../content/compose';
import { Segmented, Chip } from '../components/ui';
import { spring } from '../components/motion';

const KIND: Record<EventKind, { label: string; color: string }> = {
  eclipse: { label: 'затмение', color: '#ff9e6e' }, lunation: { label: 'лунация', color: '#cdd6ff' }, retro: { label: 'ретро', color: '#9fe3ff' },
  transit: { label: 'транзит', color: '#e2bd72' }, progression: { label: 'прогрессия', color: '#c99bff' }, arc: { label: 'дуга', color: '#f08fb4' },
  dasha: { label: 'даша', color: '#7fe0b8' }, birthday: { label: 'соляр', color: '#ffd27a' },
};
const WD_SHORT = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const WHO: Record<string, string> = { me: 'я', dima: 'Дима', pair: 'пара' };

function EventRow({ e }: { e: AstroEvent }) {
  const [open, setOpen] = useState(false);
  const k = KIND[e.kind];
  const p = mskParts(e.t);
  const text = useMemo(() => (open ? eventText(e, new Composer()) : []), [open, e]);
  return (
    <motion.article layout transition={spring} onClick={() => setOpen(o => !o)} className="oracle relative flex cursor-pointer gap-3 overflow-hidden rounded-[22px] p-4">
      <span className="absolute top-3 bottom-3 left-0 w-[4px] rounded-r-full" style={{ background: k.color, opacity: 0.4 + Math.min(1, e.weight / 3) * 0.6 }} />
      <div className="w-12 shrink-0 text-center">
        <p className="num text-[30px] leading-none font-semibold">{p.d}</p>
        <p className="mt-1 text-[12px] text-faint">{WD_SHORT[mskParts(e.t).wd]}</p>
      </div>
      <div className="min-w-0 flex-1">
        <p className="flex items-start gap-2 text-[16.5px] leading-snug font-semibold">
          {e.important && <span className="mt-0.5 text-brass" aria-label="важное">✦</span>}
          <span>{e.title}</span>
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <Chip><span style={{ color: k.color }}>{k.label}</span></Chip>
          <Chip>{WHO[e.who]}</Chip>
          {(e.kind === 'eclipse' || e.kind === 'lunation' || e.kind === 'birthday') && <Chip>{fmtTime(e.t)}</Chip>}
          {e.kind === 'retro' && e.window && <Chip>до {fmtDay(e.window[1])}</Chip>}
          {e.passIndex && e.passes && e.passes.length > 1 && <Chip tone="brass">проход {e.passIndex}/{e.passes.length}</Chip>}
        </div>
        <AnimatePresence initial={false}>
          {open && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={spring} className="overflow-hidden">
              <div className="mt-2.5 space-y-1.5 text-[15.5px] leading-relaxed text-dim">
                {text.map((x, i) => <p key={i} className={i === 0 ? 'text-ink' : ''}>{x}</p>)}
                {windowText(e) && <p className="text-faint">{windowText(e)}</p>}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.article>
  );
}

const FILTERS: { id: DateFilter; label: string }[] = [{ id: 'important', label: 'Важное' }, { id: 'me', label: 'Я' }, { id: 'dima', label: 'Дима' }, { id: 'pair', label: 'Пара' }];

export function EventList() {
  const { filter, setFilter } = useApp();
  const from = useMemo(() => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d.getTime(); }, []);
  const { data, busy } = useAsync('ev' + from, () => askEvents(from));
  const list = useMemo(() => {
    if (!data) return [];
    return data.filter(e => {
      if (filter === 'important') return e.important && e.kind !== 'lunation';
      if (filter === 'pair') return e.who === 'pair' || e.kind === 'eclipse';
      return e.who === filter;
    });
  }, [data, filter]);
  const months = useMemo(() => {
    const m = new Map<string, AstroEvent[]>();
    for (const e of list) { const k = fmtMonth(e.t); if (!m.has(k)) m.set(k, []); m.get(k)!.push(e); }
    return [...m.entries()];
  }, [list]);
  return (
    <div>
      <div className="mt-3"><Segmented id="dfilter" value={filter} options={FILTERS} onChange={setFilter} small /></div>
      {!data && busy && (
        <div className="mt-16 flex flex-col items-center gap-4 text-dim">
          <motion.div className="relative size-24" animate={{ rotate: 360 }} transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}>
            <span className="absolute inset-0 rounded-full border border-[color:var(--brass)]/40" />
            <span className="absolute -top-1.5 left-1/2 size-3 -translate-x-1/2 rounded-full bg-brass shadow-[0_0_14px_var(--brass)]" />
            <span className="absolute inset-5 rounded-full border border-[color:var(--moon)]/30" />
          </motion.div>
          <p className="text-center text-[16px]">Считаю небо на 36 месяцев:<br />затмения, транзиты, прогрессии, даши…</p>
        </div>
      )}
      <AnimatePresence mode="wait">
        <motion.div key={filter} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
          {months.map(([m, evs]) => (
            <section key={m} className="mt-6">
              <h2 className="serif mb-2 px-1 text-[24px] font-semibold first-letter:uppercase">{m}</h2>
              <div className="space-y-2.5">{evs.map(e => <EventRow key={e.id} e={e} />)}</div>
            </section>
          ))}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
