// Прогресс: графики замеров с полосой погрешности, фото «до и после», календарь занятий и итоги.
import { Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Actions } from '../App';
import { Chip, ScreenHeader, SectionTitle, Sheet, plural } from '../components/ui';
import type { BlockId } from '../engine/exercises';
import { BLOCKS, SESSION_TITLE } from '../engine/program';
import { addDays, dayKey, mondayOf, PHOTO_ERROR, streak, totals, trend, type CheckKind, type CheckRecord } from '../engine/stats';
import { formatDuration } from '../engine/timeline';
import { useStore } from '../store/store';

const SERIES: Record<BlockId, { kind: CheckKind; key: keyof CheckRecord['values']; title: string; unit: string; band?: [number, number]; better: 'up' | 'down'; note: string }[]> = {
  posture: [
    { kind: 'cva', key: 'cva', title: 'Угол шеи', unit: '°', band: [50, 53], better: 'up', note: '≥ 50–53° — типичный диапазон' },
    { kind: 'cva', key: 'shoulder', title: 'Угол плеча', unit: '°', band: [47, 59], better: 'up', note: 'норма 53 ± 6°' },
    { kind: 'dnf', key: 'seconds', title: 'Выносливость шеи', unit: ' с', band: [19, 59], better: 'up', note: 'норма мужчин 38,9 ± 20,1 с' },
  ],
  face: [
    { kind: 'profile', key: 'angle', title: 'Шейно-подбородочный угол', unit: '°', band: [90, 120], better: 'down', note: 'меньше — чётче угол; важен тренд' },
    { kind: 'body', key: 'weight', title: 'Масса тела', unit: ' кг', better: 'down', note: 'первая заметная цель — около −5 кг' },
    { kind: 'body', key: 'neck', title: 'Окружность шеи', unit: ' см', better: 'down', note: 'вместе с массой — косвенный показатель жира' },
  ],
};

function Chart({ values, dates, band, unit }: { values: number[]; dates: string[]; band?: [number, number]; unit: string }) {
  const W = 320, H = 130, P = 14;
  const lo = Math.min(...values, ...(band ?? [])) - 2, hi = Math.max(...values, ...(band ?? [])) + 2;
  const x = (i: number) => P + (values.length === 1 ? (W - 2 * P) / 2 : (i * (W - 2 * P)) / (values.length - 1));
  const y = (v: number) => H - P - ((v - lo) / (hi - lo || 1)) * (H - 2 * P);
  const path = values.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Последнее значение ${values[values.length - 1]}${unit}`}>
      {band && <rect x={0} width={W} y={y(band[1])} height={Math.max(0, y(band[0]) - y(band[1]))} fill="var(--gold)" opacity={0.1} rx={8} />}
      <path d={path} fill="none" stroke="var(--gold)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {values.map((v, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(v)} r={4} fill="var(--surface)" stroke="var(--gold)" strokeWidth={2} />
          {(i === values.length - 1 || values.length <= 4) && <text x={x(i)} y={y(v) - 10} textAnchor="middle" fontSize={11} fill="var(--muted)">{Math.round(v * 10) / 10}</text>}
        </g>
      ))}
      <text x={P} y={H - 1} fontSize={10} fill="var(--faint)">{dates[0]}</text>
      {dates.length > 1 && <text x={W - P} y={H - 1} fontSize={10} fill="var(--faint)" textAnchor="end">{dates[dates.length - 1]}</text>}
    </svg>
  );
}

const short = (iso: string) => new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });

function Series({ block, actions }: { block: BlockId; actions: Actions }) {
  const checks = useStore(s => s.checks);
  return (
    <div className="space-y-3 px-4">
      {SERIES[block].map(s => {
        const pts = checks.filter(c => c.kind === s.kind && c.values[s.key] !== undefined);
        const values = pts.map(c => c.values[s.key]!);
        const tr = trend(values);
        const photo = s.kind === 'cva' || s.kind === 'profile';
        return (
          <div key={s.title} className="card p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[15px] font-semibold">{s.title}</div>
                <div className="text-[12.5px] text-muted">{s.note}</div>
              </div>
              {values.length > 0 && <div className="font-display text-[30px] leading-none">{Math.round(values[values.length - 1] * 10) / 10}{s.unit}</div>}
            </div>
            {values.length ? (
              <>
                <div className="mt-3"><Chart values={values} dates={pts.map(c => short(c.at))} band={s.band} unit={s.unit} /></div>
                {tr && (
                  <div className="mt-2">
                    <Chip tone={tr === 'noise' ? 'neutral' : tr === s.better ? 'gold' : 'warn'}>
                      {tr === 'noise' ? (photo ? `В пределах погрешности фото (±${PHOTO_ERROR}°)` : 'Без заметных изменений') : tr === s.better ? 'Тренд в нужную сторону' : 'Тренд в обратную сторону'}
                    </Chip>
                  </div>
                )}
              </>
            ) : (
              <button type="button" onClick={() => actions.check(s.kind)} className="mt-3 text-[14px] font-medium text-gold">Сделать первый замер →</button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Photos({ block }: { block: BlockId }) {
  const checks = useStore(s => s.checks);
  const remove = useStore(s => s.removeCheck);
  const [open, setOpen] = useState<CheckRecord | null>(null);
  const kinds: CheckKind[] = block === 'posture' ? ['cva'] : ['profile', 'front'];
  const photos = checks.filter(c => kinds.includes(c.kind) && c.thumb);
  if (!photos.length) return <p className="px-6 text-[14px] text-muted">Здесь появятся снимки — первый и последний рядом.</p>;
  const pair = photos.length > 1 ? [photos[0], photos[photos.length - 1]] : [photos[0]];
  return (
    <>
      <div className="grid grid-cols-2 gap-2.5 px-4">
        {pair.map((p, i) => (
          <button key={p.id} type="button" onClick={() => setOpen(p)} className="card overflow-hidden text-left">
            <img src={p.thumb} alt="" className="aspect-[3/4] w-full object-cover" />
            <div className="px-3.5 py-2.5"><div className="overline text-gold">{i ? 'Сейчас' : 'Начало'}</div><div className="text-[13px] text-muted">{short(p.at)}</div></div>
          </button>
        ))}
      </div>
      {photos.length > 2 && (
        <div className="no-scrollbar mt-2.5 flex gap-2 overflow-x-auto px-4">
          {photos.map(p => <button key={p.id} type="button" onClick={() => setOpen(p)}><img src={p.thumb} alt="" className="h-20 w-16 rounded-xl object-cover" /></button>)}
        </div>
      )}
      <Sheet open={!!open} onClose={() => setOpen(null)} title={open ? short(open.at) : ''}>
        {open && (
          <div>
            <img src={open.thumb} alt="" className="w-full rounded-[24px]" />
            <button type="button" onClick={() => { remove(open.id); setOpen(null); }} className="mt-4 flex items-center gap-2 text-[14px] text-warn"><Trash2 size={16} /> Удалить замер</button>
          </div>
        )}
      </Sheet>
    </>
  );
}

function Calendar() {
  const history = useStore(s => s.history);
  const days = useMemo(() => {
    const m = new Map<string, Set<BlockId>>();
    for (const s of history) if (s.completed && s.kind === 'core') {
      const k = dayKey(new Date(s.at));
      m.set(k, (m.get(k) ?? new Set()).add(s.block));
    }
    return m;
  }, [history]);
  const today = new Date();
  const start = addDays(mondayOf(today), -77);
  const cells = Array.from({ length: 84 }, (_, i) => addDays(start, i));
  return (
    <div className="card mx-4 p-5">
      <div className="grid grid-flow-col grid-rows-7 gap-1.5">
        {cells.map(d => {
          const set = days.get(dayKey(d));
          const both = set?.size === 2, one = set?.size === 1;
          const color = both ? 'bg-gold-grad' : one ? (set!.has('face') ? 'bg-rose/70' : 'bg-pearl/70') : 'bg-surface-2';
          return <span key={d.toISOString()} title={d.toLocaleDateString('ru-RU')} className={`aspect-square rounded-[4px] ${color} ${d > today ? 'opacity-30' : ''}`} />;
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted">
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-rose/70" />лицо</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-pearl/70" />осанка</span>
        <span className="flex items-center gap-1.5"><span className="bg-gold-grad size-2.5 rounded-sm" />оба блока</span>
      </div>
    </div>
  );
}

export function Progress({ actions }: { actions: Actions }) {
  const history = useStore(s => s.history);
  const [block, setBlock] = useState<BlockId>('face');
  const t = totals(history);
  const st = streak(history);
  const recent = [...history].reverse().slice(0, 12);
  return (
    <div className="pb-6">
      <ScreenHeader overline="Прогресс" title="Ваша линия" subtitle="Тренды важнее отдельных снимков: телефон уверенно видит только изменения больше 5°." />
      <div className="grid grid-cols-3 gap-2 px-4">
        {[[String(t.sessions), plural(t.sessions, 'занятие', 'занятия', 'занятий')], [String(t.minutes), 'минут'], [String(st), plural(st, 'день подряд', 'дня подряд', 'дней подряд')]].map(([v, k]) => (
          <div key={k} className="card px-3 py-4 text-center"><div className="font-display text-[34px] leading-none">{v}</div><div className="mt-1.5 text-[12px] text-muted">{k}</div></div>
        ))}
      </div>

      <div className="mt-7 flex gap-2 px-4">
        {(['face', 'posture'] as const).map(b => (
          <button key={b} type="button" onClick={() => setBlock(b)} aria-pressed={block === b}
            className={`rounded-full px-4 py-2 text-[13.5px] font-medium transition ${block === b ? 'bg-ink text-bg' : 'hairline bg-surface text-muted'}`}>{BLOCKS[b].title}</button>
        ))}
      </div>
      <SectionTitle>Замеры</SectionTitle>
      <Series block={block} actions={actions} />
      <SectionTitle>До и после</SectionTitle>
      <Photos block={block} />

      <SectionTitle>12 недель</SectionTitle>
      <Calendar />

      <SectionTitle>Журнал</SectionTitle>
      {recent.length ? (
        <div className="card mx-4 divide-y divide-line">
          {recent.map(s => (
            <div key={s.id} className="flex items-center gap-3 px-5 py-3.5">
              <span className={`size-2.5 shrink-0 rounded-full ${s.block === 'face' ? 'bg-rose' : 'bg-pearl'}`} />
              <div className="min-w-0 flex-1">
                <div className="text-[14.5px] font-medium">{BLOCKS[s.block].title} · {SESSION_TITLE[s.kind].toLowerCase()}</div>
                <div className="text-[12.5px] text-muted">{new Date(s.at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · {formatDuration(s.duration)}{s.rating ? ` · ${s.rating === 'easy' ? 'с запасом' : s.rating === 'ok' ? 'на пределе' : 'техника ломалась'}` : ''}</div>
              </div>
              {!s.completed && <Chip>частично</Chip>}
            </div>
          ))}
        </div>
      ) : <p className="px-6 text-[14px] text-muted">Пока пусто — первое занятие появится здесь.</p>}
    </div>
  );
}
