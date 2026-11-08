// «Календарь ключевых периодов»: что идёт сейчас, годы жизни и лента периодов на 36 месяцев с объяснениями.
import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { askEvents, useAsync } from '../astro';
import { useApp } from '../store';
import { buildPeriods, buildYears, type Period } from '../engine/periods';
import { fmtDay, fmtMonth, mskParts } from '../engine/time';
import { SPHERES } from '../engine/scores';
import { Segmented, Tap } from '../components/ui';
import { GLYPH, PCOLOR } from '../components/glyphs';
import { spring } from '../components/motion';
import { EventList } from './Dates';

const TONE: Record<Period['tone'], { c: string; w: string }> = { pos: { c: 'var(--asp-soft)', w: 'возможности' }, neg: { c: 'var(--asp-hard)', w: 'испытание' }, deep: { c: '#c99bff', w: 'перерождение' } };
const WHO = { me: 'я', dima: 'Дима', pair: 'пара' } as const;
const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const short = (t: number) => { const p = mskParts(t); return `${MONTHS_SHORT[p.m - 1]} ${p.y}`; };

function PeriodCard({ p, now, i }: { p: Period; now: number; i: number }) {
  const [open, setOpen] = useState(false);
  const tone = TONE[p.tone];
  const active = p.start <= now && now <= p.end;
  const frac = Math.min(1, Math.max(0, (now - p.start) / (p.end - p.start)));
  const months = Math.max(1, Math.round((p.end - p.start) / (30.4 * 864e5)));
  return (
    <motion.article layout initial={{ opacity: 0, x: 18 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, margin: '-30px' }} transition={{ ...spring, delay: Math.min(i, 4) * 0.04 }}
      onClick={() => setOpen(o => !o)} className={`oracle relative cursor-pointer overflow-hidden rounded-[24px] p-4 ${active ? 'halo' : ''}`}>
      <div className="flex items-start gap-3">
        <div className="relative grid size-12 shrink-0 place-items-center rounded-full" style={{ background: `radial-gradient(circle, ${PCOLOR[p.tp]} 0%, transparent 70%)` }}>
          <span className="glyph text-[24px]" style={{ color: 'var(--ink)' }}>{GLYPH[p.tp]}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] font-semibold" style={{ color: tone.c }}>{tone.w} · {WHO[p.who]} · {months} мес.</p>
          <h3 className="serif text-[22px] leading-tight font-semibold">{p.title}</h3>
          <p className="mt-0.5 text-[14px] text-dim">{fmtDay(p.start, true)} — {fmtDay(p.end, true)}</p>
        </div>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[color:var(--line)]">
        <motion.div className="h-full rounded-full" style={{ background: `linear-gradient(90deg, ${tone.c}, var(--aura3))` }} initial={{ width: 0 }} whileInView={{ width: active ? `${frac * 100}%` : now > p.end ? '100%' : '0%' }} viewport={{ once: true }} transition={{ duration: 1 }} />
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {p.spheres.map(s => { const sp = SPHERES.find(x => x.id === s)!; return <span key={s} className="rounded-full border px-2 py-0.5 text-[12.5px] hair" style={{ color: sp.color }}>{sp.name}</span>; })}
        {p.peaks.length > 0 && <span className="rounded-full border px-2 py-0.5 text-[12.5px] text-faint hair">пиков: {p.peaks.length}</span>}
      </div>
      <p className="mt-2.5 text-[15.5px] leading-relaxed">{p.text[0]}</p>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={spring} className="overflow-hidden">
            <div className="mt-2 space-y-2 text-[15.5px] leading-relaxed text-dim">
              {p.text.slice(1).map(x => <p key={x}>{x}</p>)}
              <p className="text-[14.5px] text-faint">{p.aspects.join(' · ')}</p>
              <div className="grid grid-cols-2 gap-2 pt-1 text-[14.5px]">
                <div className="rounded-[16px] bg-[color:var(--line)] p-3"><p className="font-semibold text-good">Что делать</p><p>{p.do}</p></div>
                <div className="rounded-[16px] bg-[color:var(--line)] p-3"><p className="font-semibold text-bad">Чего избегать</p><p>{p.avoid}</p></div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {!open && p.text.length > 1 && <p className="mt-1 text-[13.5px] text-brass">Подробнее</p>}
    </motion.article>
  );
}

export function Calendar() {
  const { cal, setCal } = useApp();
  const [who, setWho] = useState<'all' | 'me' | 'dima' | 'pair'>('all');
  const from = useMemo(() => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d.getTime(); }, []);
  const now = Date.now();
  const { data, busy } = useAsync('ev' + from, () => askEvents(from));
  const periods = useMemo(() => (data ? buildPeriods(data, from) : []), [data, from]);
  const years = useMemo(() => (data ? buildYears(data, periods, from) : []), [data, periods, from]);
  const list = periods.filter(p => (who === 'all' ? p.intensity >= 1.6 || p.who === 'pair' : p.who === who));
  const activeNow = periods.filter(p => p.start <= now && now <= p.end && p.intensity >= 1.6).sort((a, b) => b.intensity - a.intensity);
  // группировка по году начала
  const byYear = new Map<number, Period[]>();
  for (const p of list) { const y = Math.max(mskParts(p.start).y, mskParts(from).y); if (!byYear.has(y)) byYear.set(y, []); byYear.get(y)!.push(p); }
  return (
    <div>
      <header className="px-1 text-center">
        <p className="text-[15px] text-dim">36 месяцев · расчёт на телефоне</p>
        <h1 className="serif aura-text text-[40px] leading-[1.05] font-semibold">Ключевые периоды</h1>
      </header>
      <div className="mt-3"><Segmented id="cal" value={cal} options={[{ id: 'periods', label: 'Периоды' }, { id: 'events', label: 'Все события' }]} onChange={setCal} /></div>
      {cal === 'events' ? <EventList /> : (
        <>
          {!data && busy && (
            <div className="mt-16 flex flex-col items-center gap-4 text-dim">
              <motion.div className="relative size-24" animate={{ rotate: 360 }} transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}>
                <span className="absolute inset-0 rounded-full border border-[color:var(--brass)]/40" />
                <span className="aura-dot absolute -top-1.5 left-1/2 size-3 -translate-x-1/2 rounded-full" />
              </motion.div>
              <p className="text-center text-[16px]">Считаю небо на 36 месяцев…</p>
            </div>
          )}
          {activeNow.length > 0 && (
            <section className="halo halo-live oracle mt-5 rounded-[28px] p-5">
              <h2 className="serif text-[24px] font-semibold">Что идёт сейчас</h2>
              <div className="mt-3 space-y-3">
                {activeNow.slice(0, 4).map(p => {
                  const frac = (now - p.start) / (p.end - p.start);
                  return (
                    <div key={p.id}>
                      <p className="flex items-center gap-2 text-[16px] font-semibold"><span className="glyph text-[20px]" style={{ color: PCOLOR[p.tp] }}>{GLYPH[p.tp]}</span>{p.title}<span className="ml-auto text-[12.5px] font-normal text-faint">{WHO[p.who]}</span></p>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[color:var(--line)]"><motion.div className="h-full rounded-full" style={{ background: `linear-gradient(90deg, ${TONE[p.tone].c}, var(--aura3))` }} initial={{ width: 0 }} animate={{ width: `${frac * 100}%` }} transition={{ duration: 1.1 }} /></div>
                      <p className="mt-0.5 text-[13px] text-faint">до {fmtDay(p.end, true)}</p>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
          {years.length > 0 && (
            <>
              <h2 className="serif mt-8 mb-2 px-1 text-[26px] font-semibold">Годы</h2>
              <div className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2">
                {years.map(y => (
                  <div key={y.from} className="oracle w-[300px] shrink-0 snap-start rounded-[26px] p-5">
                    <p className="text-[13px] text-faint">{fmtDay(y.from, true)} — {fmtDay(y.to, true)}</p>
                    <p className="serif text-[24px] leading-tight font-semibold">{y.title}</p>
                    <div className="mt-2 space-y-1.5 text-[14.5px] leading-relaxed text-dim">{y.text.map(x => <p key={x}>{x}</p>)}</div>
                    {y.periods.length > 0 && <div className="mt-3 border-t pt-2 hair"><p className="text-[13px] text-faint">Главное в этом году</p><ul className="mt-1 space-y-0.5 text-[14px]">{y.periods.map(x => <li key={x}>✦ {x}</li>)}</ul></div>}
                  </div>
                ))}
              </div>
            </>
          )}
          <div className="mt-6 flex items-center justify-between px-1">
            <h2 className="serif text-[26px] font-semibold">Лента периодов</h2>
          </div>
          <div className="mt-2"><Segmented id="calwho" value={who} options={[{ id: 'all', label: 'Главное' }, { id: 'me', label: 'Я' }, { id: 'dima', label: 'Дима' }, { id: 'pair', label: 'Пара' }]} onChange={setWho} small /></div>
          <div className="relative mt-4 pl-6">
            <span className="absolute top-2 bottom-2 left-[9px] w-px" style={{ background: 'linear-gradient(var(--aura1), var(--aura3), var(--aura2))' }} />
            {[...byYear.entries()].map(([y, ps]) => (
              <div key={y} className="mb-6">
                <div className="relative mb-3 -ml-6 flex items-center gap-3">
                  <span className="halo grid size-[19px] place-items-center rounded-full bg-[color:var(--night)]"><span className="aura-dot size-2 rounded-full" /></span>
                  <span className="serif text-[28px] font-semibold">{y}</span>
                </div>
                <div className="space-y-3">
                  {ps.map((p, i) => (
                    <div key={p.id} className="relative">
                      <span className="absolute top-6 -left-[19px] size-2 rounded-full" style={{ background: TONE[p.tone].c, boxShadow: `0 0 10px ${TONE[p.tone].c}` }} />
                      <p className="mb-1 text-[12.5px] text-faint">{short(p.start)} → {short(p.end)}</p>
                      <PeriodCard p={p} now={now} i={i} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {data && list.length === 0 && <p className="text-dim">Для этого фильтра крупных периодов нет.</p>}
          </div>
          <Tap onClick={() => setCal('events')} className="oracle mt-2 w-full rounded-full py-3 text-[15.5px] font-semibold text-brass">Все события по датам</Tap>
          <p className="mt-3 text-center text-[13px] text-faint">Период — это окно действия долгих транзитов (Юпитер–Плутон) по узлам вашей карты; пики — точные даты. {fmtMonth(from)}.</p>
        </>
      )}
    </div>
  );
}
