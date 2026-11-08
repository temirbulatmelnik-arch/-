import { AnimatePresence, motion } from 'motion/react';
import { useMemo } from 'react';
import { useApp, type ChartView } from '../store';
import { charts } from '../engine/day';
import { askEvents, useAsync } from '../astro';
import { ASPECT, aspectsWithin, natalOrb, synastryOrb } from '../engine/aspects';
import { fmtLon, fmtOrb, type PointId } from '../engine/core';
import { PL_NOM } from '../engine/events';
import { GRAHA_RU, NAKSHATRAS, SIGN_LORD, vedicChart, type Graha } from '../engine/vedic';
import { fmtDay } from '../engine/time';
import { natalControls, transitControls, pinControls, type ControlRow } from '../engine/controls';
import type { Chart } from '../engine/chart';
import { natureOf } from '../content/compose';
import { PORTRAIT_DIMA, PORTRAIT_ME, placementLine } from '../content/natalText';
import { ChartWheel } from '../components/ChartWheel';
import { SouthIndian } from '../components/SouthIndian';
import { Section, Segmented } from '../components/ui';
import { ASPECT_COLOR, GLYPH, PCOLOR, isTextGlyph } from '../components/glyphs';
import { spring } from '../components/motion';

const VIEWS: { id: ChartView; label: string }[] = [{ id: 'me', label: 'Я' }, { id: 'dima', label: 'Дима' }, { id: 'syn', label: 'Би' }, { id: 'comp', label: 'Композ.' }, { id: 'vedic', label: 'Ведика' }];
const TABLE_PTS: PointId[] = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto', 'node', 'snode', 'chiron', 'lilith', 'asc', 'mc', 'vertex', 'fortune', 'spirit'];
const SIGNS_RU = ['Овен', 'Телец', 'Близнецы', 'Рак', 'Лев', 'Дева', 'Весы', 'Скорпион', 'Стрелец', 'Козерог', 'Водолей', 'Рыбы'];

const RULE: Record<string, number[]> = { sun: [4], moon: [3], mercury: [2, 5], venus: [1, 6], mars: [0, 7], jupiter: [8, 11], saturn: [9, 10], uranus: [10], neptune: [11], pluto: [7] };
const EXALT: Record<string, number> = { sun: 0, moon: 1, mercury: 5, venus: 11, mars: 9, jupiter: 3, saturn: 6 };
function dignity(id: string, sign: number): string {
  if (RULE[id]?.includes(sign)) return 'обитель';
  if (EXALT[id] === sign) return 'экзальтация';
  if (RULE[id]?.some(s => (s + 6) % 12 === sign)) return 'изгнание';
  if (EXALT[id] !== undefined && (EXALT[id] + 6) % 12 === sign) return 'падение';
  return '';
}

function PointTable({ c, houses = true }: { c: Chart; houses?: boolean }) {
  return (
    <div className="oracle overflow-hidden rounded-[22px]">
      <table className="w-full text-[15px]">
        <tbody>
          {TABLE_PTS.map(p => {
            const pt = c.points[p];
            const d = dignity(p, pt.sign);
            return (
              <tr key={p} className="border-b last:border-0 hair">
                <td className="w-9 py-2 pl-3"><span className={isTextGlyph(p) ? 'text-[12px] font-bold' : 'glyph text-[19px]'} style={{ color: PCOLOR[p] }}>{GLYPH[p]}</span></td>
                <td className="py-2">{PL_NOM[p]}{pt.retro ? <span className="text-bad"> R</span> : ''}{pt.station ? <span className="text-brass"> ст.</span> : ''}{p === 'chiron' ? <span className="text-faint"> ≈±1°</span> : ''}</td>
                <td className="num py-2 text-right text-[17px]">{fmtLon(pt.lon)}</td>
                {houses && <td className="w-10 py-2 pr-3 text-right text-dim">{pt.house}</td>}
                <td className="hidden py-2 pr-3 text-right text-[13px] text-faint min-[400px]:table-cell">{d}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const ELEM = [{ n: 'Огонь', c: '#ff8a5c' }, { n: 'Земля', c: '#7fd18b' }, { n: 'Воздух', c: '#9db7ff' }, { n: 'Вода', c: '#4fd1c5' }];
const CROSS = ['Кардинальный', 'Фиксированный', 'Мутабельный'];
const BAL_PTS: PointId[] = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto', 'asc', 'mc'];

function Portrait({ c, who }: { c: Chart; who: 'me' | 'dima' }) {
  const secs = who === 'me' ? PORTRAIT_ME : PORTRAIT_DIMA;
  const el = [0, 0, 0, 0], cr = [0, 0, 0];
  for (const p of BAL_PTS) { const w = p === 'sun' || p === 'moon' || p === 'asc' ? 2 : 1; el[c.points[p].sign % 4] += w; cr[c.points[p].sign % 3] += w; }
  const max = Math.max(...el);
  return (
    <>
      <Section title="Портрет карты">
        <div className="space-y-2.5">
          {secs.map((sct, i) => (
            <motion.div key={sct.title} initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-30px' }} transition={{ ...spring, delay: Math.min(i, 3) * 0.04 }} className={`oracle rounded-[24px] p-4 ${i === 0 ? 'halo' : ''}`}>
              <div className="flex items-center gap-3">
                <span className="halo glyph grid size-11 shrink-0 place-items-center rounded-full text-[20px] text-brass">{sct.icon}</span>
                <div className="min-w-0">
                  <h3 className="serif text-[22px] leading-tight font-semibold">{sct.title}</h3>
                  {sct.points.length > 0 && <p className="flex gap-1.5">{sct.points.map(p => <span key={p} className={isTextGlyph(p) ? 'text-[12px] font-bold' : 'glyph text-[16px]'} style={{ color: PCOLOR[p] }}>{GLYPH[p]}</span>)}</p>}
                </div>
              </div>
              <div className="mt-2 space-y-2 text-[15.5px] leading-relaxed text-dim">{sct.text.map((x, k) => <p key={k} className={k === 0 ? 'text-ink' : ''}>{x}</p>)}</div>
            </motion.div>
          ))}
        </div>
      </Section>
      <Section title="Стихии и кресты">
        <div className="oracle rounded-[24px] p-4">
          {ELEM.map((e, i) => (
            <div key={e.n} className="flex items-center gap-3 py-1">
              <span className="w-20 text-[15px]">{e.n}</span>
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[color:var(--line)]"><motion.div className="h-full rounded-full" style={{ background: e.c, boxShadow: `0 0 10px ${e.c}` }} initial={{ width: 0 }} whileInView={{ width: `${(el[i] / max) * 100}%` }} viewport={{ once: true }} transition={{ duration: 0.9, delay: i * 0.08 }} /></div>
              <span className="num w-6 text-right text-[17px]">{el[i]}</span>
            </div>
          ))}
          <p className="mt-2 text-[14px] text-faint">{CROSS.map((x, i) => `${x}: ${cr[i]}`).join(' · ')}. Солнце, Луна и Асцендент считаются за два.</p>
        </div>
      </Section>
      <Section title="Планеты в знаках и домах">
        <div className="space-y-2">
          {TABLE_PTS.filter(p => !['snode', 'mc', 'asc', 'spirit'].includes(p)).map(p => {
            const pt = c.points[p];
            return (
              <div key={p} className="oracle flex gap-3 rounded-[20px] p-3.5">
                <span className={isTextGlyph(p) ? 'w-8 shrink-0 pt-1 text-center text-[12px] font-bold' : 'glyph w-8 shrink-0 text-center text-[24px]'} style={{ color: PCOLOR[p] }}>{GLYPH[p]}</span>
                <div className="min-w-0">
                  <p className="text-[15.5px] font-semibold">{PL_NOM[p]}{pt.retro ? ' R' : ''} · <span className="num text-[17px] font-medium">{fmtLon(pt.lon)}</span> · {pt.house}-й дом{dignity(p, pt.sign) ? <span className="text-brass"> · {dignity(p, pt.sign)}</span> : ''}</p>
                  <p className="text-[14.5px] leading-snug text-dim">{placementLine(p, pt.sign, pt.house)}</p>
                </div>
              </div>
            );
          })}
        </div>
      </Section>
    </>
  );
}

function AspectList({ a, b, syn }: { a: Chart; b?: Chart; syn?: boolean }) {
  const hits = useMemo(() => (b ? aspectsWithin(a.points, b.points, synastryOrb, false) : aspectsWithin(a.points, a.points, natalOrb, true)), [a, b]);
  return (
    <div className="oracle grid grid-cols-1 gap-x-4 rounded-[22px] p-3 min-[420px]:grid-cols-2">
      {hits.map(h => (
        <p key={h.a + h.b + h.aspect} className="flex items-center gap-1.5 border-b py-1.5 text-[15px] hair">
          <span className={isTextGlyph(h.a) ? 'text-[11px] font-bold' : 'glyph text-[17px]'} style={{ color: PCOLOR[h.a] }}>{GLYPH[h.a]}</span>
          <span className="glyph" style={{ color: ASPECT_COLOR[natureOf(h.aspect)] }}>{ASPECT[h.aspect].glyph}</span>
          <span className={isTextGlyph(h.b) ? 'text-[11px] font-bold' : 'glyph text-[17px]'} style={{ color: PCOLOR[h.b] }}>{GLYPH[h.b]}</span>
          <span className="truncate text-dim">{syn ? 'мой ' : ''}{PL_NOM[h.a]} — {syn ? 'его ' : ''}{PL_NOM[h.b]}</span>
          <span className="ml-auto shrink-0 text-faint">{fmtOrb(h.orb)}</span>
        </p>
      ))}
    </div>
  );
}

function Vedic({ c, title }: { c: Chart; title: string }) {
  const v = useMemo(() => vedicChart(c), [c]);
  const { dashMe, dashDima } = charts();
  const ds = c.person?.id === 'me' ? dashMe : dashDima;
  const now = Date.now();
  return (
    <div className="mt-4">
      <SouthIndian v={v} title={title} />
      <div className="oracle mt-3 rounded-[22px] p-4 text-[15px] leading-relaxed">
        <p><span className="text-brass">Лагна:</span> {SIGNS_RU[v.lagnaSign]} {fmtLon(v.lagna).split(' ')[0]} ({NAKSHATRAS[v.lagnaNak]}), управитель — {GRAHA_RU[SIGN_LORD[v.lagnaSign]]}</p>
        <p><span className="text-brass">Атмакарака:</span> {GRAHA_RU[v.ak]}; <span className="text-brass">даракарака:</span> {GRAHA_RU[v.dk]}</p>
        <table className="mt-2 w-full text-[14.5px]">
          <tbody>
            {(Object.keys(v.grahas) as Graha[]).map(g => {
              const x = v.grahas[g];
              return <tr key={g} className="border-b last:border-0 hair"><td className="py-1">{GRAHA_RU[g]}</td><td className="py-1 whitespace-nowrap">{SIGNS_RU[x.sign]} {Math.floor(x.deg)}°{String(Math.round((x.deg % 1) * 60)).padStart(2, '0')}′</td><td className="py-1 px-2 whitespace-nowrap text-dim">{x.bhava} бх.</td><td className="py-1 text-right text-dim">{NAKSHATRAS[x.nak]}/{x.pada}</td></tr>;
            })}
          </tbody>
        </table>
        <ul className="mt-3 space-y-1.5">{v.yogas.map(y => <li key={y} className="text-dim">✦ {y}</li>)}</ul>
        <p className="mt-3 font-semibold">Вимшоттари</p>
        {ds.filter(d => d.end.getTime() > now - 3e11 && d.start.getUTCFullYear() < 2062).slice(0, 4).map(d => (
          <div key={d.lord + d.start.getTime()} className="mt-1">
            <p className={d.start.getTime() <= now && now < d.end.getTime() ? 'text-brass' : 'text-dim'}>{GRAHA_RU[d.lord]}: {fmtDay(d.start, true)} — {fmtDay(d.end, true)}</p>
            {d.start.getTime() <= now && now < d.end.getTime() && (
              <div className="mt-1 ml-3 text-[14px] text-faint">{d.sub.filter(s => s.end.getTime() > now - 2e10).slice(0, 4).map(s => <p key={s.lord} className={s.start.getTime() <= now && now < s.end.getTime() ? 'text-ink' : ''}>{GRAHA_RU[d.lord]} — {GRAHA_RU[s.lord]}: {fmtDay(s.start, true)} — {fmtDay(s.end, true)}</p>)}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Controls() {
  const from = useMemo(() => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d.getTime(); }, []);
  const { data } = useAsync('ev' + from, () => askEvents(from));
  const rows: ControlRow[] = useMemo(() => [...natalControls(), ...transitControls(), ...(data ? pinControls(data) : [])], [data]);
  const groups = [...new Set(rows.map(r => r.group))];
  const n = { ok: rows.filter(r => r.status === 'ok').length, typo: rows.filter(r => r.status === 'typo').length, fail: rows.filter(r => r.status === 'fail').length };
  return (
    <Section title="Сверка расчёта">
      <p className="mb-3 px-1 text-[15px] leading-relaxed text-dim">Контрольные значения задания против расчёта на телефоне. Сходится: {n.ok}; расхождений из-за опечаток контроля: {n.typo}; не сходится: {n.fail}.</p>
      {groups.map(g => (
        <div key={g} className="oracle mb-3 rounded-[22px] p-3">
          <p className="mb-1 px-1 font-semibold">{g}</p>
          {rows.filter(r => r.group === g).map(r => (
            <div key={r.label} className="border-b px-1 py-1.5 text-[14px] last:border-0 hair">
              <p className="flex gap-2"><span className={r.status === 'ok' ? 'text-good' : r.status === 'typo' ? 'text-brass' : 'text-bad'}>{r.status === 'ok' ? '✓' : r.status === 'typo' ? '≠' : '✗'}</span><span className="flex-1">{r.label}</span><span className="text-faint">{r.delta}</span></p>
              <p className="ml-5 text-faint">контроль {r.expected} · расчёт {r.actual}</p>
              {r.note && <p className="ml-5 text-dim">{r.note}</p>}
            </div>
          ))}
        </div>
      ))}
      {!data && <p className="px-1 text-faint">Даты считаются…</p>}
    </Section>
  );
}

export function Charts() {
  const { chart, setChart } = useApp();
  const { me, dima, comp } = charts();
  return (
    <div>
      <header className="px-1 text-center">
        <p className="text-[15px] text-dim">Тропик, Плацидус · ведика — Лахири</p>
        <h1 className="serif aura-text text-[40px] leading-[1.05] font-semibold">Натальные карты</h1>
      </header>
      <div className="mt-3"><Segmented id="chart" value={chart} options={VIEWS} onChange={setChart} small /></div>
      <AnimatePresence mode="wait">
        <motion.div key={chart} initial={{ opacity: 0, scale: 0.97, filter: 'blur(6px)' }} animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }} exit={{ opacity: 0, scale: 1.02, filter: 'blur(6px)' }} transition={spring} className="mt-4">
          {chart === 'me' && (<><ChartWheel inner={me} id="me" /><p className="mt-1 text-center text-[13px] text-faint">25.04.1997, 01:15 (UTC+4), Десногорск</p><Portrait c={me} who="me" /><Section title="Таблица точек"><PointTable c={me} /></Section><Section title="Все аспекты"><AspectList a={me} /></Section></>)}
          {chart === 'dima' && (<><ChartWheel inner={dima} id="dima" /><p className="mt-1 text-center text-[13px] text-faint">16.11.1998, 22:05 (UTC+3), Сосновый Бор</p><Portrait c={dima} who="dima" /><Section title="Таблица точек"><PointTable c={dima} /></Section><Section title="Все аспекты"><AspectList a={dima} /></Section></>)}
          {chart === 'syn' && (<><ChartWheel inner={me} outer={dima} id="syn" /><p className="mt-1 text-center text-[13px] text-faint">Внутри — моя карта, снаружи — планеты Димы</p><Section title="Аспекты синастрии"><AspectList a={me} b={dima} syn /></Section></>)}
          {chart === 'comp' && (<><ChartWheel inner={comp} id="comp" /><p className="mt-1 text-center text-[13px] text-faint">Композит по средним точкам; дома — равные от средней точки Асцендентов</p><Section title="Точки композита"><PointTable c={comp} /></Section><Section title="Аспекты композита"><AspectList a={comp} /></Section></>)}
          {chart === 'vedic' && (<><Vedic c={me} title="Темирбулат" /><Vedic c={dima} title="Дима" /></>)}
        </motion.div>
      </AnimatePresence>
      <Controls />
      <p className="mt-6 text-center text-[13px] text-faint">Планеты — astronomy-engine, Хирон — оскулирующие элементы (≈±1°), дома — Плацидус. Время — московское. Версия {__APP_VERSION__}.</p>
    </div>
  );
}
