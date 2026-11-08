import { AnimatePresence, motion, type PanInfo } from 'motion/react';
import { useEffect, useState } from 'react';
import { useApp, SLOT_HOUR, type Slot } from '../store';
import { askToday, prefetchToday, useAsync } from '../astro';
import { charts } from '../engine/day';
import { fmtDay, fmtTime, fmtWeekday, mskDay, fmtRange } from '../engine/time';
import { fmtLon, SIGNS_PREP, SIGNS_GEN, SIGNS, SIGN_GLYPH } from '../engine/core';
import { PL_NOM, pointRu } from '../engine/events';
import { ASPECT } from '../engine/aspects';
import { GRAHA_GEN } from '../engine/vedic';
import { MOON_HOUSE, MOON_SIGN, PROFECTION_LORD } from '../content/interpretations';
import { retroText } from '../content/compose';
import { Astrolabe } from '../components/Astrolabe';
import { MoonDisc } from '../components/MoonDisc';
import { TransitCardView } from '../components/TransitCard';
import { DayStrip } from '../components/DayStrip';
import { SphereOrbs } from '../components/SphereOrbs';
import { LinkCard } from '../components/LinkCard';
import { RevealTitle } from '../components/Reveal';
import { Tilt } from '../components/Tilt';
import { InstallBanner } from '../components/InstallBanner';
import { NuanceList } from '../components/NuanceList';
import { Segmented, Tap } from '../components/ui';
import { GLYPH, PCOLOR } from '../components/glyphs';
import { spring } from '../components/motion';

const SLOTS: { id: Slot; label: string }[] = [{ id: 'morning', label: '☀︎ Утро' }, { id: 'day', label: '◐ День' }, { id: 'evening', label: '☾ Вечер' }];
const ELEMENT = ['огня', 'земли', 'воздуха', 'воды'];

function Head({ children, sub }: { children: string; sub?: string }) {
  return (
    <div className="mt-10 mb-3 px-1">
      <div className="ornament text-[13px]"><span className="glyph">✧</span></div>
      <h2 className="serif mt-2 text-center text-[30px] leading-tight font-semibold">{children}</h2>
      {sub && <p className="mt-1 text-center text-[14.5px] text-faint">{sub}</p>}
    </div>
  );
}

export function Today() {
  const { offset, setOffset, slot, setSlot, setElement } = useApp();
  const [all, setAll] = useState(false);
  const base = new Date();
  const moment = mskDay(base, offset, SLOT_HOUR[slot]);
  const t = moment.getTime();
  const { data, busy } = useAsync('t' + t, () => askToday(t));
  useEffect(() => { if (data) setElement(data.element); }, [data, setElement]);
  useEffect(() => {
    // заранее считается только следующий день и только когда пользователь задержался на экране
    const id = setTimeout(() => prefetchToday([mskDay(base, offset + 1, SLOT_HOUR[slot]).getTime()]), 2500);
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
      <InstallBanner />
      <header className="flex items-end justify-between px-1">
        <div>
          <p className="text-[15px] text-dim first-letter:uppercase">{fmtWeekday(moment)}{offset === 0 ? ' · сегодня' : ''}</p>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.p key={fmtDay(moment)} initial={{ opacity: 0, y: 10, filter: 'blur(4px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} exit={{ opacity: 0, y: -10, filter: 'blur(4px)' }} transition={spring}
              className="serif text-[42px] leading-[1.02] font-semibold">{fmtDay(moment)}</motion.p>
          </AnimatePresence>
        </div>
        <AnimatePresence>{offset !== 0 && (
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={spring}>
            <Tap onClick={() => setOffset(0)} className="mb-1 rounded-full bg-[color:var(--brass-soft)] px-3 py-2 text-[15px] font-semibold text-brass">К сегодня</Tap>
          </motion.div>
        )}</AnimatePresence>
      </header>
      <DayStrip offset={offset} onPick={setOffset} />
      <Segmented id="slot" value={slot} options={SLOTS} onChange={setSlot} small />

      <motion.div className="relative mt-3 touch-pan-y" drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={0.16} onDragEnd={onDragEnd}>
        <Tilt>
          {data ? <Astrolabe natal={natal} sky={data.sky} transits={data.transits.concat(data.long).sort((a, b) => b.strength - a.strength)} moonPhase={data.moon.phaseAngle} dateKey={String(t)} /> : <div className="aspect-square w-full" />}
        </Tilt>
        <AnimatePresence>{busy && <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="aura-dot absolute top-2 right-2 size-2.5 rounded-full" />}</AnimatePresence>
      </motion.div>

      {data && (
        <div key={t}>
          <div className="mt-1 px-1 text-center">
            <p className="text-[13.5px] text-faint">Луна в знаке {ELEMENT[data.element]} · {SIGNS_PREP[data.moon.sign]} · {fmtTime(moment)} МСК</p>
            <RevealTitle text={data.synth.title} className="serif aura-text mt-2 text-[40px] leading-[1.05] font-semibold" />
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} className="mx-auto mt-2 max-w-[34ch] text-[15px] leading-snug text-dim">{data.synth.subtitle}</motion.p>
          </div>

          <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.35 }} className="halo halo-live oracle mt-6 rounded-[28px] p-5">
            <h2 className="serif text-[26px] font-semibold">Рецензия дня</h2>
            <p className="serif mt-2 text-[22px] leading-snug">{data.review.headline}</p>
            <div className="mt-3 space-y-2 text-[16.5px] leading-relaxed text-dim">{data.review.mood.map((x, i) => <p key={i}>{x}</p>)}</div>

            <h3 className="mt-5 text-[17px] font-semibold text-brass">Главное сегодня</h3>
            <div className="mt-2 space-y-3 text-[16.5px] leading-relaxed">{data.review.main.map((x, i) => <p key={i}>{x}</p>)}</div>

            <h3 className="mt-5 text-[17px] font-semibold text-brass">Как пройдёт день</h3>
            <div className="relative mt-3 space-y-3 pl-5">
              <span className="absolute top-1 bottom-1 left-[5px] w-px" style={{ background: 'linear-gradient(var(--aura3), var(--aura1))' }} />
              {data.review.flow.map(f => (
                <div key={f.slot} className="relative">
                  <span className="absolute top-[7px] -left-5 size-[11px] rounded-full" style={{ background: f.score >= 0.4 ? 'var(--good)' : f.score <= -0.4 ? 'var(--bad)' : 'var(--brass)', boxShadow: '0 0 10px currentColor' }} />
                  <p className="text-[16px] leading-relaxed"><span className="font-semibold">{f.slot}. </span><span className="text-dim">{f.text}</span></p>
                </div>
              ))}
            </div>

            <div className="mt-5 grid gap-2.5">
              <p className="rounded-[18px] bg-[color:var(--line)] p-3.5 text-[15.5px] leading-relaxed"><span className="font-semibold text-good">Легко. </span>{data.review.easy}</p>
              <p className="rounded-[18px] bg-[color:var(--line)] p-3.5 text-[15.5px] leading-relaxed"><span className="font-semibold text-bad">Трудно. </span>{data.review.hard}</p>
            </div>

            <h3 className="mt-5 text-[17px] font-semibold text-brass">План на день</h3>
            <ul className="mt-2 space-y-1.5 text-[16px] leading-snug">
              {data.review.plan.do.map(x => <li key={x} className="flex gap-2"><span className="text-good">✓</span><span>{x}</span></li>)}
              {data.review.plan.avoid.map(x => <li key={x} className="flex gap-2"><span className="text-bad">✕</span><span>{x}</span></li>)}
            </ul>
            {(data.review.plan.best || data.review.plan.tricky) && (
              <div className="mt-3 grid gap-2 text-[15px]">
                {data.review.plan.best && <p className="rounded-[16px] border p-3 hair"><span className="font-semibold text-good">Лучшее время: </span><span className="text-dim">{data.review.plan.best}</span></p>}
                {data.review.plan.tricky && <p className="rounded-[16px] border p-3 hair"><span className="font-semibold text-bad">Осторожно: </span><span className="text-dim">{data.review.plan.tricky}</span></p>}
              </div>
            )}
          </motion.section>

          <details className="oracle mt-3 rounded-[22px] p-4">
            <summary className="cursor-pointer text-[15.5px] font-semibold text-brass">Как это посчитано</summary>
            <div className="mt-2 space-y-2 text-[15px] leading-relaxed text-dim">{data.synth.overview.map((x, i) => <p key={i}>{x}</p>)}</div>
          </details>

          <Head sub="Как сегодняшние влияния ложатся на каждую сферу">Сферы жизни</Head>
          <SphereOrbs notes={data.synth.spheres} slots={data.slots} />

          {data.synth.links.length > 0 && (<>
            <Head sub="Где влияния сходятся в одну историю и что из этого выходит">Как всё связано</Head>
            <div className="space-y-3">{data.synth.links.map((l, i) => <LinkCard key={l.config.id} link={l} i={i} />)}</div>
          </>)}
          {data.synth.triggers.length > 0 && (
            <div className="oracle mt-3 rounded-[24px] p-4">
              <p className="flex items-center gap-2 text-[16px] font-semibold"><span className="text-[20px]" style={{ color: 'var(--aura3)' }}>ϟ</span>Спусковые крючки дня</p>
              <ul className="mt-2 space-y-2 text-[15.5px] leading-relaxed text-dim">{data.synth.triggers.map(x => <li key={x}>{x}</li>)}</ul>
            </div>
          )}

          {data.nuance.length > 0 && (<>
            <Head sub="Что учтено сверх списка аспектов: хозяева времени, секта, состояние планет, рецепции, фигуры, смягчение и усиление">Тонкости дня</Head>
            <NuanceList notes={data.nuance} />
          </>)}

          <Head>Луна</Head>
          <section className="oracle relative overflow-hidden rounded-[28px] p-5">
            <div className="absolute -top-10 -right-10 opacity-60"><MoonDisc phase={data.moon.phaseAngle} size={170} /></div>
            <div className="relative max-w-[62%]">
              <p className="serif text-[28px] leading-tight font-semibold">Луна в {SIGNS_PREP[data.moon.sign]}</p>
              <p className="mt-1 text-[15px] text-dim">{data.moon.phaseName}, {Math.round(data.moon.illum * 100)}%</p>
              <p className="text-[15px] text-dim">{data.moon.lunarDay}-й лунный день{data.moon.nextLunarDay ? `, следующий с ${fmtTime(data.moon.nextLunarDay)}` : ''}</p>
            </div>
            <p className="relative mt-4 text-[16px] leading-relaxed">{MOON_SIGN[data.moon.sign]}</p>
            <p className="relative mt-1 text-[16px] leading-relaxed text-dim">{MOON_HOUSE[data.moonHouse - 1]}</p>
            <div className="relative mt-4 grid grid-cols-2 gap-2 text-[14.5px]">
              <div className="rounded-[16px] bg-[color:var(--line)] p-3"><p className="text-faint">Смена знака</p><p className="font-semibold"><span className="glyph">{SIGN_GLYPH[data.moon.nextSign]}</span> {SIGNS[data.moon.nextSign]} с {fmtTime(data.moon.ingress)}</p><p className="text-faint">{fmtDay(data.moon.ingress)}</p></div>
              <div className={`rounded-[16px] p-3 ${data.moon.vocNow ? 'bg-[color:var(--bad)]/15' : 'bg-[color:var(--line)]'}`}><p className="text-faint">Без курса</p>{data.moon.voc ? <><p className="font-semibold">{data.moon.vocNow ? 'сейчас' : fmtTime(data.moon.voc.start)}–{fmtTime(data.moon.voc.end)}</p><p className="text-faint">{fmtDay(data.moon.voc.start)}</p></> : <p className="font-semibold">не в эти сутки</p>}</div>
            </div>
          </section>

          {data.long.length > 0 && (<>
            <Head sub="Сатурн, Уран, Нептун и Плутон к вашей карте — недели и месяцы">Долгий фон</Head>
            <div className="space-y-2.5">
              {data.long.map(tr => {
                const frac = Math.min(1, Math.max(0, (t - tr.window[0]) / (tr.window[1] - tr.window[0])));
                return (
                  <div key={tr.t + tr.aspect + tr.n} className="oracle rounded-[22px] p-4">
                    <p className="flex items-center gap-2 text-[16.5px] font-semibold"><span className="glyph text-[22px]" style={{ color: PCOLOR[tr.t] }}>{GLYPH[tr.t]}</span>{PL_NOM[tr.t]}{tr.retro ? ' R' : ''} <span className="glyph font-normal text-brass">{ASPECT[tr.aspect].glyph}</span> {pointRu(tr.n, 'me')}</p>
                    <p className="mt-1 text-[15px] leading-relaxed text-dim">{tr.text[0]} {tr.text[1] ?? ''}</p>
                    <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-[color:var(--line)]"><motion.div className="h-full rounded-full" style={{ background: 'linear-gradient(90deg, var(--aura1), var(--aura3))' }} initial={{ width: 0 }} animate={{ width: `${frac * 100}%` }} transition={{ duration: 1 }} /></div>
                    <p className="mt-1 text-[13px] text-faint">{fmtRange(tr.window[0], tr.window[1])}{tr.passes.length > 1 ? ` · проходов: ${tr.passes.length}` : ''}</p>
                  </div>
                );
              })}
            </div>
          </>)}

          <Head sub="Каждый аспект отдельно — с толкованием, окном и проходами">Все транзиты дня</Head>
          <div className="space-y-3">
            {(all ? data.transits : data.transits.slice(0, 4)).map(tr => <TransitCardView key={tr.t + tr.aspect + tr.n} tr={tr} now={t} />)}
          </div>
          {data.transits.length > 4 && <Tap onClick={() => setAll(a => !a)} className="oracle mt-3 w-full rounded-full py-3 text-[15.5px] font-semibold text-brass">{all ? 'Свернуть' : `Показать все ${data.transits.length}`}</Tap>}

          <Head>Ретроградные</Head>
          {data.retro.length === 0 ? <p className="text-center text-dim">Все планеты идут прямо — время начинать.</p> : (
            <div className="no-scrollbar -mx-4 flex snap-x gap-2.5 overflow-x-auto px-4 pb-1">
              {data.retro.map(r => (
                <div key={r.id} className="oracle w-[250px] shrink-0 snap-start rounded-[22px] p-4">
                  <p className="flex items-center gap-2 font-semibold"><span className="glyph text-[24px]" style={{ color: PCOLOR[r.id] }}>{GLYPH[r.id]}</span>{PL_NOM[r.id]} {r.station ? 'стоит' : 'R'}<span className="ml-auto text-[12.5px] font-normal text-faint">{fmtLon(r.lon)}</span></p>
                  <p className="mt-1.5 text-[14.5px] leading-snug text-dim">{retroText(r.id)}</p>
                </div>
              ))}
            </div>
          )}

          <Head>Большие циклы</Head>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="oracle rounded-[20px] p-3"><p className="text-[12.5px] text-faint">Даша</p><p className="serif text-[19px] leading-tight font-semibold">{GRAHA_GEN[data.context.md as 'sun']} — {GRAHA_GEN[data.context.ad as 'sun']}</p><p className="text-[12px] text-faint">до {fmtDay(data.context.adEnd, true)}</p></div>
            <div className="oracle rounded-[20px] p-3"><p className="text-[12.5px] text-faint">Профекция</p><p className="serif text-[19px] leading-tight font-semibold">{data.context.prof.age}-й год, {SIGNS_GEN[data.context.prof.sign]}</p><p className="text-[12px] text-faint">{PROFECTION_LORD[data.context.prof.lord].split(' — ')[0]}</p></div>
            <div className="oracle rounded-[20px] p-3"><p className="text-[12.5px] text-faint">Прогр. Луна</p><p className="serif text-[19px] leading-tight font-semibold">{fmtLon(data.context.progMoon)}</p></div>
          </div>
        </div>
      )}
    </div>
  );
}
