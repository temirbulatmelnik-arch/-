// «Знания»: как устроена программа, что реально работает, чего ждать, мифы с 3D-разбором, образ жизни, безопасность.
import { ChevronRight, ScanEye } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { MuscleList } from '../components/Exercise';
import { Figure } from '../components/Figure';
import type { FigureMotion } from '../components/figureTypes';
import { Chip, ScreenHeader, SectionTitle, Sheet } from '../components/ui';
import { EXPECT, JAW_FLAGS, LIFESTYLE, METHODS, NECK_FLAGS, RULES, SOURCES, STOP_SIGNS } from '../engine/content';
import { EXCLUDED, type BlockId } from '../engine/exercises';
import { BLOCKS } from '../engine/program';

const LEVEL_TONE: Record<string, string> = { A: 'bg-gold-grad text-on-accent', B: 'bg-gold/20 text-ink', C: 'bg-surface-2 text-ink', D: 'bg-surface-2 text-muted', '✕': 'bg-warn/15 text-warn' };

function Myth({ m }: { m: (typeof EXCLUDED)[number] }) {
  const motion = useRef<FigureMotion>({ anim: m.anim, amount: 0, phase: 'hold' });
  // движение мифа повторяется по кругу
  useEffect(() => {
    const t0 = performance.now();
    let raf = 0;
    const loop = () => {
      const t = (performance.now() - t0) / 1000;
      motion.current = { anim: m.anim, amount: 0.5 - 0.5 * Math.cos(t * 1.6), phase: 'hold' };
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [m]);
  return (
    <div>
      <div className="bg-face relative overflow-hidden rounded-[28px]">
        <Figure motion={motion} pose="sitting" view="face" xray muscles={m.muscles} autoRotate className="aspect-square w-full" />
      </div>
      <p className="mt-5 text-[15px] leading-relaxed">{m.why}</p>
      <div className="mt-5"><MuscleList muscles={m.muscles} /></div>
    </div>
  );
}

export function Learn() {
  const [myth, setMyth] = useState<(typeof EXCLUDED)[number] | null>(null);
  const [block, setBlock] = useState<BlockId>('face');
  return (
    <div className="pb-6">
      <ScreenHeader overline="Знания" title="Что работает на самом деле" subtitle="Методика собрана по мета-анализам, испытаниям и ЭМГ. Без обещаний, которых наука не даёт." />

      <SectionTitle>Как устроена программа</SectionTitle>
      <div className="space-y-2.5 px-4">
        {RULES.map((r, i) => (
          <div key={r.title} className="card flex gap-4 p-5">
            <span className="font-display text-[30px] leading-none text-gold">{String(i + 1).padStart(2, '0')}</span>
            <div><div className="text-[15.5px] font-semibold">{r.title}</div><p className="mt-1 text-[14px] leading-relaxed text-muted">{r.text}</p></div>
          </div>
        ))}
      </div>

      <SectionTitle>Шкала доказательности</SectionTitle>
      <div className="mb-3 flex gap-2 px-4">
        {(['face', 'posture'] as const).map(b => (
          <button key={b} type="button" onClick={() => setBlock(b)} aria-pressed={block === b}
            className={`rounded-full px-4 py-2 text-[13.5px] font-medium transition ${block === b ? 'bg-ink text-bg' : 'hairline bg-surface text-muted'}`}>{BLOCKS[b].title}</button>
        ))}
      </div>
      <div className="card mx-4 divide-y divide-line">
        {METHODS.filter(m => m.block === block).map(m => (
          <div key={m.name} className="flex gap-3.5 px-5 py-4">
            <span className={`font-display grid size-9 shrink-0 place-items-center rounded-full text-[18px] ${LEVEL_TONE[m.level]}`}>{m.level}</span>
            <div className="min-w-0">
              <div className="text-[15px] font-semibold">{m.name}</div>
              <p className="mt-0.5 text-[13.5px] leading-snug text-muted">{m.shown}</p>
              <div className="mt-1.5 text-[12.5px] font-semibold tracking-wide text-gold">{m.decision}</div>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2 px-6 text-[12.5px] leading-snug text-faint">A — мета-анализы, B — испытания, C — механизм (ЭМГ, УЗИ), D — клинический опыт, ✕ — исключено.</p>

      <SectionTitle>Чего ждать</SectionTitle>
      <div className="no-scrollbar flex snap-x gap-3 overflow-x-auto px-4 pb-2">
        {EXPECT.map(r => (
          <div key={r.goal} className="card w-[270px] shrink-0 snap-start p-5">
            <Chip tone={r.block === 'face' ? 'rose' : 'pearl'}>{BLOCKS[r.block].title}</Chip>
            <div className="font-display mt-3 text-[23px] leading-tight">{r.goal}</div>
            <p className="mt-2 text-[14px] leading-snug">{r.real}</p>
            <p className="mt-2 text-[13px] text-gold">{r.when}</p>
            <p className="mt-2 text-[13px] leading-snug text-muted"><span className="overline mr-1 text-warn">Не будет</span>{r.not}</p>
          </div>
        ))}
      </div>

      <SectionTitle>Мифы</SectionTitle>
      <p className="-mt-1 mb-3 px-6 text-[14px] leading-snug text-muted">Чего нет в программе — и какую мышцу эти упражнения нагружают на самом деле.</p>
      <div className="card mx-4 divide-y divide-line">
        {EXCLUDED.map(m => (
          <button key={m.id} type="button" onClick={() => setMyth(m)} className="flex w-full items-center gap-3.5 px-5 py-4 text-left">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-warn/12 text-warn"><ScanEye size={17} /></span>
            <span className="min-w-0 flex-1"><span className="block text-[15px] font-medium">{m.title}</span><span className="line-clamp-1 block text-[13px] text-muted">{m.why}</span></span>
            <ChevronRight size={17} className="text-faint" />
          </button>
        ))}
      </div>

      <SectionTitle>Образ жизни</SectionTitle>
      <div className="card mx-4 divide-y divide-line">
        {LIFESTYLE.map(l => (
          <details key={l.title} className="group px-5 py-4">
            <summary className="flex cursor-pointer list-none items-center justify-between text-[15px] font-medium">{l.title}<ChevronRight size={16} className="text-faint transition group-open:rotate-90" /></summary>
            <p className="mt-2 text-[14px] leading-relaxed text-muted">{l.text}</p>
          </details>
        ))}
      </div>

      <SectionTitle>Безопасность</SectionTitle>
      <div className="space-y-2.5 px-4">
        <div className="card p-5">
          <div className="font-display text-[22px]">Шея: сначала к врачу, если есть</div>
          <ul className="mt-2 space-y-1 text-[14px] leading-snug text-muted">{NECK_FLAGS.map(f => <li key={f.id}>— {f.text}</li>)}</ul>
        </div>
        <div className="card p-5">
          <div className="font-display text-[22px]">Челюсть: модуль выключен, если есть</div>
          <ul className="mt-2 space-y-1 text-[14px] leading-snug text-muted">{JAW_FLAGS.map(f => <li key={f.id}>— {f.text}</li>)}</ul>
        </div>
        <div className="rounded-[22px] bg-warn/8 p-5">
          <div className="overline mb-2 text-warn">Остановите занятие</div>
          <ul className="space-y-1 text-[14px] leading-snug">{[...STOP_SIGNS.posture, ...STOP_SIGNS.face].map(s => <li key={s}>— {s}</li>)}</ul>
        </div>
      </div>

      <SectionTitle>Источники</SectionTitle>
      <ul className="space-y-1.5 px-6 text-[13px] leading-snug text-muted">{SOURCES.map(s => <li key={s}>{s}</li>)}</ul>
      <p className="mt-4 px-6 text-[12.5px] leading-snug text-faint">Полный отчёт с цитатами — в репозитории: «Осанка шеи и упражнения для лица». Приложение не заменяет врача.</p>

      <Sheet open={!!myth} onClose={() => setMyth(null)} title={myth?.title ?? ''}>
        {myth && <Myth key={myth.id} m={myth} />}
      </Sheet>
    </div>
  );
}
