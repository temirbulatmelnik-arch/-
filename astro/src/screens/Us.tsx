import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { askPair, useAsync } from '../astro';
import { useApp, SLOT_HOUR } from '../store';
import { charts } from '../engine/day';
import { mskDay, fmtDay } from '../engine/time';
import { ASPECT, aspectsWithin, synastryOrb, natalOrb } from '../engine/aspects';
import { fmtLon, fmtOrb, type PointId } from '../engine/core';
import { houseOf } from '../engine/houses';
import { PL_NOM, pointRu } from '../engine/events';
import { PAIR_SCALES } from '../engine/scores';
import { GRAHA_RU } from '../engine/vedic';
import { vedicCompat } from '../engine/compat';
import { COMPOSITE_NOTES, OVERLAY_HIS_IN_MY, OVERLAY_MY_IN_HIS, PAIR_CORE, PAIR_PORTRAIT, GROUP_SUMMARY, synGroup } from '../content/pair';
import { RevealTitle } from '../components/Reveal';
import { NuanceList } from '../components/NuanceList';
import { Composer, natureOf } from '../content/compose';
import { DASHA_LORD } from '../content/interpretations';
import { BinaryOrbit } from '../components/BinaryOrbit';
import { Scale } from '../components/Scale';
import { TransitCardView } from '../components/TransitCard';
import { Section, Segmented, Chip } from '../components/ui';
import { ASPECT_COLOR, GLYPH, PCOLOR, isTextGlyph } from '../components/glyphs';
import { spring } from '../components/motion';

const SYN_POINTS: PointId[] = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto', 'node', 'chiron', 'lilith', 'asc', 'mc', 'vertex'];
const GROUPS = [{ id: 'bond', label: 'Связи' }, { id: 'friction', label: 'Трения' }, { id: 'karma', label: 'Карма' }] as const;

export function Us() {
  const { offset } = useApp();
  const [when, setWhen] = useState<'day' | 'evening'>('day');
  const [group, setGroup] = useState<'bond' | 'friction' | 'karma'>('bond');
  const base = new Date();
  const day = mskDay(base, offset, SLOT_HOUR.day).getTime();
  const eve = mskDay(base, offset, SLOT_HOUR.evening).getTime();
  const { data } = useAsync('p' + day, () => askPair(day, eve));
  const { me, dima, comp } = charts();
  const syn = useMemo(() => {
    const c = new Composer();
    return aspectsWithin(me.points, dima.points, synastryOrb, false)
      .filter(h => SYN_POINTS.includes(h.a) && SYN_POINTS.includes(h.b))
      .filter(h => !(['uranus', 'neptune', 'pluto'].includes(h.a) && h.a === h.b && h.aspect !== 'conj'))
      .filter(h => ASPECT[h.aspect].major || h.aspect === 'quincunx' || h.orb <= 0.5)
      .map(h => ({ ...h, group: synGroup(h.a, h.b, h.aspect), text: c.synastry(h.a, h.b, h.aspect) }));
  }, [me, dima]);
  const compAsp = useMemo(() => aspectsWithin(comp.points, comp.points, natalOrb, true).filter(h => SYN_POINTS.includes(h.a) && SYN_POINTS.includes(h.b) && ASPECT[h.aspect].major).slice(0, 12), [comp]);
  const vc = useMemo(() => vedicCompat(me, dima), [me, dima]);
  const scores = data ? (when === 'day' ? data.scores : data.evening) : null;
  return (
    <div>
      <header className="px-1 text-center">
        <p className="text-[15px] text-dim">Темирбулат и Дима · {fmtDay(day)}</p>
        <p className="serif text-[22px] text-brass">{PAIR_CORE.formula}</p>
      </header>
      <div className="mt-1"><BinaryOrbit tender={scores?.tender ?? 0} conflict={scores?.conflict ?? 0} passion={scores?.passion ?? 0} /></div>
      {data && <RevealTitle text={data.synth.title} className="serif aura-text -mt-2 text-center text-[38px] leading-[1.05] font-semibold" />}
      <section className="oracle mt-5 rounded-[28px] p-5">
        <Segmented id="pair-when" value={when} options={[{ id: 'day', label: 'Сегодня' }, { id: 'evening', label: 'Вечер' }]} onChange={setWhen} small />
        <div className="mt-3">
          {PAIR_SCALES.map(s => <Scale key={s.id} label={s.name} value={scores?.[s.id] ?? 0} color={s.color} min={s.id === 'conflict' ? 0 : -2} invert={s.id === 'conflict'} hint={data?.synth.scaleNotes[s.id]} />)}
        </div>
      </section>

      {data && (
        <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={spring} className="halo oracle mt-4 rounded-[28px] p-5">
          <h2 className="serif text-[24px] font-semibold">Вывод дня для пары</h2>
          <div className="mt-2 space-y-2 text-[16.5px] leading-relaxed">{data.synth.summary.map((x, i) => <p key={i} className={i ? 'text-dim' : ''}>{x}</p>)}</div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-[15px]">
            <div className="rounded-[18px] bg-[color:var(--line)] p-3"><p className="font-semibold text-good">Вместе</p><ul className="mt-1 space-y-1 text-dim">{data.synth.doList.map(x => <li key={x}>{x}</li>)}</ul></div>
            <div className="rounded-[18px] bg-[color:var(--line)] p-3"><p className="font-semibold text-bad">Избегать</p><ul className="mt-1 space-y-1 text-dim">{data.synth.avoidList.map(x => <li key={x}>{x}</li>)}</ul></div>
          </div>
        </motion.section>
      )}

      {data && data.shared.some(s => s.hits.length) && (
        <Section title="Задевает обоих">
          <div className="space-y-3">
            {data.shared.filter(s => s.hits.length).map(s => (
              <div key={s.name} className="oracle rounded-[22px] p-4">
                <p className="font-semibold">{s.name}</p>
                <p className="text-[15px] text-dim">{s.note}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">{s.hits.map(h => <Chip key={h.t + h.aspect} tone="brass">{PL_NOM[h.t]} {ASPECT[h.aspect].glyph}</Chip>)}</div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {data && (
        <Section title="Как сегодня Дима">
          <div className="oracle mb-3 rounded-[24px] p-4 text-[16px] leading-relaxed">
            {data.synth.dima.map(x => <p key={x} className="text-dim">{x}</p>)}
            <p className="mt-2 font-semibold" style={{ color: 'var(--aura3)' }}>{data.synth.need}</p>
          </div>
          {data.nuanceDima.length > 0 && <div className="mb-3"><NuanceList notes={data.nuanceDima} max={3} /></div>}
          <div className="space-y-3">
            {data.his.filter(t => t.t !== 'moon' || t.strength > 0.3).slice(0, 4).map(tr => <TransitCardView key={tr.t + tr.aspect + tr.n} tr={tr} who="dima" now={day} />)}
          </div>
        </Section>
      )}

      {data && data.comp.length > 0 && (
        <Section title="Композит сегодня">
          <div className="oracle flex flex-wrap gap-2 rounded-[22px] p-4">
            {data.comp.slice(0, 8).map(t => (
              <span key={t.t + t.aspect + t.n} className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[15px] hair">
                <span className="glyph" style={{ color: PCOLOR[t.t] }}>{GLYPH[t.t]}</span>
                <span className="glyph" style={{ color: ASPECT_COLOR[natureOf(t.aspect)] }}>{ASPECT[t.aspect].glyph}</span>
                <span className={isTextGlyph(t.n) ? 'text-[13px] font-bold' : 'glyph'} style={{ color: PCOLOR[t.n] }}>{GLYPH[t.n]}</span>
                <span className="ml-1 text-dim">композита</span>
              </span>
            ))}
          </div>
        </Section>
      )}

      {data && (
        <Section title="Периоды (даши)">
          <div className="grid grid-cols-2 gap-3">
            {[['Я', data.dashMe], ['Дима', data.dashDima]].map(([n, d]) => {
              const x = d as typeof data.dashMe;
              return (
                <div key={n as string} className="oracle rounded-[22px] p-4">
                  <p className="text-[14px] text-faint">{n as string}</p>
                  <p className="serif text-[22px] leading-tight font-semibold">{GRAHA_RU[x.md as 'sun']} — {GRAHA_RU[x.ad as 'sun']}</p>
                  <p className="mt-1 text-[14px] text-dim">до {fmtDay(x.adEnd, true)}</p>
                  <p className="mt-1 text-[14px] leading-snug text-dim">{DASHA_LORD[x.ad]}</p>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      <Section title="Портрет пары">
        <div className="space-y-2.5">
          {PAIR_PORTRAIT.map((p, i) => (
            <motion.div key={p.title} initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ ...spring, delay: i * 0.05 }} className="oracle flex gap-3 rounded-[24px] p-4">
              <span className="halo grid size-11 shrink-0 place-items-center rounded-full text-[20px] text-brass">{p.icon}</span>
              <div><h3 className="serif text-[22px] font-semibold">{p.title}</h3><p className="mt-1 text-[15.5px] leading-relaxed text-dim">{p.text}</p></div>
            </motion.div>
          ))}
        </div>
      </Section>

      <Section title="Наша синастрия">
        <div className="oracle rounded-[26px] p-5 text-[16px] leading-relaxed">
          <p>{PAIR_CORE.main}</p>
          <p className="mt-1.5 text-dim">{PAIR_CORE.risk}</p>
        </div>
        <div className="mt-3"><Segmented id="syn-group" value={group} options={GROUPS.map(g => ({ id: g.id, label: `${g.label} ${syn.filter(s => s.group === g.id).length}` }))} onChange={setGroup} small /></div>
        <AnimatePresence mode="wait">
          <motion.div key={group} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={spring} className="mt-3 space-y-2.5">
            <p className="px-1 text-[15px] leading-relaxed text-dim">{GROUP_SUMMARY[group]}</p>
            {syn.filter(s => s.group === group).map(s => (
              <div key={s.a + s.b + s.aspect} className="oracle rounded-[20px] p-4">
                <p className="flex items-center gap-2 font-semibold">
                  <span className={isTextGlyph(s.a) ? 'text-[14px]' : 'glyph text-[20px]'} style={{ color: PCOLOR[s.a] }}>{GLYPH[s.a]}</span>
                  <span className="glyph" style={{ color: ASPECT_COLOR[natureOf(s.aspect)] }}>{ASPECT[s.aspect].glyph}</span>
                  <span className={isTextGlyph(s.b) ? 'text-[14px]' : 'glyph text-[20px]'} style={{ color: PCOLOR[s.b] }}>{GLYPH[s.b]}</span>
                  <span className="text-[16px]">{pointRu(s.a, 'me')} — {pointRu(s.b, 'dima')}</span>
                  <span className="ml-auto text-[14px] font-normal text-faint">{fmtOrb(s.orb)}</span>
                </p>
                <p className="mt-1.5 text-[15.5px] leading-relaxed text-dim">{s.text}</p>
              </div>
            ))}
          </motion.div>
        </AnimatePresence>
      </Section>

      <Section title="Наложение домов">
        <div className="oracle rounded-[26px] p-5 text-[15.5px] leading-relaxed">
          <p className="mb-2 font-semibold text-brass">Его планеты в моих домах</p>
          {(['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'pluto', 'node', 'chiron', 'lilith'] as PointId[]).map(p => {
            const h = houseOf(dima.points[p].lon, me.houses.cusps);
            return <p key={p} className="flex gap-2 py-0.5"><span className="glyph w-5 shrink-0 text-center" style={{ color: PCOLOR[p] }}>{GLYPH[p]}</span><span><span className="text-ink">{PL_NOM[p]}</span> <span className="text-dim">{OVERLAY_HIS_IN_MY[h - 1]}</span></span></p>;
          })}
          <p className="mt-4 mb-2 font-semibold text-brass">Мои планеты в его домах</p>
          {(['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto', 'node', 'chiron'] as PointId[]).map(p => {
            const h = houseOf(me.points[p].lon, dima.houses.cusps);
            return <p key={p} className="flex gap-2 py-0.5"><span className="glyph w-5 shrink-0 text-center" style={{ color: PCOLOR[p] }}>{GLYPH[p]}</span><span><span className="text-ink">{PL_NOM[p]}</span> <span className="text-dim">{OVERLAY_MY_IN_HIS[h - 1]}</span></span></p>;
          })}
        </div>
      </Section>

      <Section title="Композит">
        <div className="oracle rounded-[26px] p-5 text-[15.5px] leading-relaxed">
          {COMPOSITE_NOTES.map(n => <p key={n} className="mb-2">{n}</p>)}
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[15px]">
            {(['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto', 'asc', 'mc'] as PointId[]).map(p => (
              <p key={p} className="flex items-center gap-2"><span className={isTextGlyph(p) ? 'w-6 text-[12px] font-bold' : 'glyph w-6'} style={{ color: PCOLOR[p] }}>{GLYPH[p]}</span><span className="text-dim">{fmtLon(comp.points[p].lon)}</span></p>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {compAsp.map(h => <Chip key={h.a + h.b + h.aspect}><span className="glyph" style={{ color: PCOLOR[h.a] }}>{GLYPH[h.a]}</span><span className="glyph mx-1" style={{ color: ASPECT_COLOR[natureOf(h.aspect)] }}>{ASPECT[h.aspect].glyph}</span><span className={isTextGlyph(h.b) ? 'text-[12px]' : 'glyph'} style={{ color: PCOLOR[h.b] }}>{GLYPH[h.b]}</span></Chip>)}
          </div>
        </div>
      </Section>

      <Section title="Ведическая совместимость">
        <div className="oracle rounded-[26px] p-5">
          {vc.special.map(s => <p key={s} className="mb-3 text-[16px] leading-relaxed text-brass">{s}</p>)}
          <div className="divide-y [&>*]:border-[color:var(--line)]">
            {vc.rows.map(r => (
              <div key={r.name} className="py-2.5">
                <p className="flex items-baseline justify-between gap-2"><span className="font-semibold">{r.name}</span><span className={`text-[14px] ${r.verdict === 'good' ? 'text-good' : r.verdict === 'hard' ? 'text-bad' : 'text-dim'}`}>{r.verdict === 'good' ? 'в ладу' : r.verdict === 'hard' ? 'трудно' : 'смешанно'}</span></p>
                <p className="text-[15px] text-dim">{r.value}</p>
                <p className="text-[15px] leading-relaxed text-faint">{r.note}</p>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[14px] leading-relaxed text-faint">Лунные куты описывают ритм быта, а не силу любви: у вас она держится на редкой связи Луна–Венера и на Сатурне — времени и обязательствах.</p>
        </div>
      </Section>
    </div>
  );
}
