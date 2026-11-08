import { AnimatePresence, motion, type PanInfo } from 'motion/react';
import { useEffect } from 'react';
import { useApp, SLOT_HOUR, type Slot } from '../store';
import { askToday, prefetchToday, useAsync } from '../astro';
import { charts } from '../engine/day';
import { fmtDay, fmtTime, fmtWeekday, mskDay, fmtDateTime } from '../engine/time';
import { fmtLon, SIGNS_PREP, SIGNS_GEN, SIGNS, SIGN_GLYPH } from '../engine/core';
import { PL_NOM } from '../engine/events';
import { SPHERES } from '../engine/scores';
import { GRAHA_GEN } from '../engine/vedic';
import { MOON_HOUSE, MOON_SIGN, PROFECTION_LORD } from '../content/interpretations';
import { retroText } from '../content/compose';
import { Astrolabe } from '../components/Astrolabe';
import { MoonDisc } from '../components/MoonDisc';
import { Scale } from '../components/Scale';
import { TransitCardView } from '../components/TransitCard';
import { Section, Segmented, Tap, Chip } from '../components/ui';
import { GLYPH, PCOLOR } from '../components/glyphs';
import { fling, spring } from '../components/motion';

const SLOTS: { id: Slot; label: string }[] = [{ id: 'morning', label: 'Утро' }, { id: 'day', label: 'День' }, { id: 'evening', label: 'Вечер' }];

export function Today() {
  const { offset, setOffset, slot, setSlot } = useApp();
  const base = new Date();
  const moment = mskDay(base, offset, SLOT_HOUR[slot]);
  const t = moment.getTime();
  const { data, busy } = useAsync('t' + t, () => askToday(t));
  useEffect(() => {
    const id = setTimeout(() => prefetchToday([mskDay(base, offset + 1, SLOT_HOUR[slot]).getTime(), mskDay(base, offset - 1, SLOT_HOUR[slot]).getTime()]), 600);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offset, slot]);
  const natal = charts().me;
  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x < -60 || info.velocity.x < -400) setOffset(offset + 1);
    else if (info.offset.x > 60 || info.velocity.x > 400) setOffset(offset - 1);
  };
  return (
    <div>
      <header className="flex items-start justify-between gap-3 px-1">
        <div>
          <p className="text-[15px] text-dim first-letter:uppercase">{fmtWeekday(moment)}{offset === 0 ? ', сегодня' : offset === 1 ? ', завтра' : offset === -1 ? ', вчера' : ''}</p>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.h1 key={fmtDay(moment)} initial={{ opacity: 0, y: 10, filter: 'blur(4px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} exit={{ opacity: 0, y: -10, filter: 'blur(4px)' }} transition={spring}
              className="serif text-[40px] leading-[1.05] font-semibold">{fmtDay(moment)}</motion.h1>
          </AnimatePresence>
        </div>
        <div className="flex items-center gap-2 pt-1">
          <Tap aria-label="Предыдущий день" onClick={() => setOffset(offset - 1)} className="glass grid size-11 place-items-center rounded-full text-[20px] text-dim">‹</Tap>
          <Tap aria-label="Следующий день" onClick={() => setOffset(offset + 1)} className="glass grid size-11 place-items-center rounded-full text-[20px] text-dim">›</Tap>
        </div>
      </header>
      <div className="mt-3 flex items-center gap-2">
        <div className="flex-1"><Segmented id="slot" value={slot} options={SLOTS} onChange={setSlot} /></div>
        <AnimatePresence>{offset !== 0 && (
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={spring}>
            <Tap onClick={() => setOffset(0)} className="rounded-full bg-[color:var(--brass-soft)] px-3 py-2 text-[15px] font-semibold text-brass">Сегодня</Tap>
          </motion.div>
        )}</AnimatePresence>
      </div>

      <motion.div className="relative mt-4 touch-pan-y" drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={0.18} dragTransition={{ bounceStiffness: 400, bounceDamping: 30 }} onDragEnd={onDragEnd} transition={fling}>
        {data ? <Astrolabe natal={natal} sky={data.sky} transits={data.transits.concat(data.long).sort((a, b) => b.strength - a.strength)} moonPhase={data.moon.phaseAngle} dateKey={String(t)} /> : <div className="aspect-square w-full" />}
        <AnimatePresence>{busy && <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute top-2 right-2 size-2 rounded-full bg-brass shadow-[0_0_12px_var(--brass)]" />}</AnimatePresence>
        <p className="mt-1 text-center text-[13px] text-faint">Небо {fmtDateTime(moment)} по Москве поверх вашей карты · листайте вбок</p>
      </motion.div>

      {data && (
        <motion.div key={t} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.35 }}>
          <section className="glass mt-5 rounded-[26px] p-5">
            <h2 className="serif shimmer-text text-[28px] leading-tight font-semibold">Главное</h2>
            <p className="mt-2 text-[17px] leading-relaxed"><span className="text-good">Совет.</span> {data.head.advice}</p>
            <p className="mt-1.5 text-[17px] leading-relaxed"><span className="text-bad">Избегать.</span> {data.head.avoid}</p>
            {data.head.extra && <p className="mt-1.5 text-[16px] leading-relaxed text-dim">{data.head.extra}</p>}
          </section>

          <Section title="Сферы дня">
            <div className="glass rounded-[26px] px-5 py-3">
              {SPHERES.map(s => <Scale key={s.id} label={s.name} value={data.scores[s.id]} color={s.color} />)}
            </div>
          </Section>

          <Section title="Луна">
            <div className="glass rounded-[26px] p-5">
              <div className="flex items-center gap-4">
                <MoonDisc phase={data.moon.phaseAngle} size={76} />
                <div>
                  <p className="serif text-[24px] leading-tight font-semibold">Луна в {SIGNS_PREP[data.moon.sign]}</p>
                  <p className="text-[16px] text-dim">{data.moon.phaseName}, {Math.round(data.moon.illum * 100)}% · {data.moon.lunarDay}-й лунный день</p>
                </div>
              </div>
              <p className="mt-3 text-[16px] leading-relaxed">{MOON_SIGN[data.moon.sign]}</p>
              <p className="mt-1 text-[16px] leading-relaxed text-dim">{MOON_HOUSE[data.moonHouse - 1]}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Chip><span className="glyph mr-1">{SIGN_GLYPH[data.moon.nextSign]}</span>{SIGNS[data.moon.nextSign]} с {fmtTime(data.moon.ingress)}{fmtDay(data.moon.ingress) !== fmtDay(moment) ? `, ${fmtDay(data.moon.ingress)}` : ''}</Chip>
                {data.moon.nextLunarDay && <Chip>{data.moon.lunarDay + 1}-й лунный день с {fmtTime(data.moon.nextLunarDay)}</Chip>}
                {data.moon.voc && <Chip tone={data.moon.vocNow ? 'bad' : 'plain'}>{data.moon.vocNow ? 'без курса сейчас' : 'без курса'}: {fmtTime(data.moon.voc.start)}–{fmtTime(data.moon.voc.end)}{fmtDay(data.moon.voc.start) !== fmtDay(moment) ? `, ${fmtDay(data.moon.voc.start)}` : ''}</Chip>}
              </div>
            </div>
          </Section>

          <Section title="Транзиты дня" aside={<span className="text-[15px] text-faint">{data.transits.length}</span>}>
            <div className="space-y-3">
              {data.transits.map((tr, i) => (
                <motion.div key={tr.t + tr.aspect + tr.n} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: Math.min(i, 8) * 0.04 }}>
                  <TransitCardView tr={tr} now={t} />
                </motion.div>
              ))}
              {!data.transits.length && <p className="text-dim">Быстрые планеты сегодня не касаются вашей карты — день держится на долгом фоне.</p>}
            </div>
          </Section>

          {data.long.length > 0 && (
            <Section title="Долгий фон">
              <p className="-mt-1 mb-3 px-1 text-[15px] text-faint">Сатурн, Уран, Нептун и Плутон к вашей карте: что идёт сейчас и до какого числа.</p>
              <div className="space-y-3">{data.long.map(tr => <TransitCardView key={tr.t + tr.aspect + tr.n} tr={tr} now={t} />)}</div>
            </Section>
          )}

          <Section title="Ретроградные">
            <div className="glass divide-y rounded-[26px] px-5 [&>*]:border-[color:var(--line)]">
              {data.retro.length === 0 && <p className="py-4 text-dim">Сегодня все планеты идут прямо — время для новых начинаний.</p>}
              {data.retro.map(r => (
                <div key={r.id} className="py-3.5">
                  <p className="flex items-center gap-2 text-[17px] font-semibold"><span className="glyph text-[22px]" style={{ color: PCOLOR[r.id] }}>{GLYPH[r.id]}</span>{PL_NOM[r.id]} {r.station ? 'стоит (разворот)' : r.id === 'venus' ? 'ретроградная' : 'ретроградный'}<span className="ml-auto text-[14px] font-normal text-faint">{fmtLon(r.lon)}</span></p>
                  <p className="mt-1 text-[16px] leading-relaxed text-dim">{retroText(r.id)}</p>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Контекст">
            <div className="glass space-y-2 rounded-[26px] p-5 text-[16px] leading-relaxed">
              <p><span className="text-brass">Даша:</span> махадаша {GRAHA_GEN[data.context.md as 'sun']}, антардаша {GRAHA_GEN[data.context.ad as 'sun']} — до {fmtDay(data.context.adEnd, true)}.</p>
              <p><span className="text-brass">Профекция:</span> {data.context.prof.age}-й год, {SIGNS_GEN[data.context.prof.sign]} — {PROFECTION_LORD[data.context.prof.lord]}.</p>
              <p><span className="text-brass">Прогр. Луна:</span> {fmtLon(data.context.progMoon)}.</p>
            </div>
          </Section>
        </motion.div>
      )}
    </div>
  );
}
