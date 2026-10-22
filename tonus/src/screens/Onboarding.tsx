import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, Check, Clock, Lock, Volume2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { PelvisDiagram } from '../components/PelvisDiagram';
import { PrimaryButton } from '../components/ui';
import { DEFAULT_START, STARTS } from '../engine/program';

/** Заставка: три золотых кольца-«безеля» дышат, как мышца — сжатие вверх и внутрь, затем покой */
function Hero() {
  return (
    <div className="relative mx-auto size-60">
      <svg viewBox="0 0 240 240" className="absolute inset-0 size-full overflow-visible" aria-hidden>
        <defs>
          <linearGradient id="heroGold" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#f1d9a7" />
            <stop offset="0.5" stopColor="#c9a466" />
            <stop offset="1" stopColor="#7d5c2e" />
          </linearGradient>
          <radialGradient id="heroGlow">
            <stop offset="0" stopColor="#d6b67e" stopOpacity="0.28" />
            <stop offset="1" stopColor="#d6b67e" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="120" cy="120" r="118" fill="url(#heroGlow)" />
        {/* шкала, как на циферблате */}
        <g style={{ transformOrigin: '120px 120px' }}>
          <motion.g style={{ transformOrigin: '120px 120px' }} animate={{ rotate: 360 }} transition={{ duration: 120, repeat: Infinity, ease: 'linear' }}>
            {Array.from({ length: 60 }, (_, k) => (
              <line key={k} x1="120" y1="4" x2="120" y2={k % 5 ? 9 : 14} stroke="var(--gold)" strokeWidth={k % 5 ? 0.8 : 1.4}
                opacity={k % 5 ? 0.45 : 0.9} transform={`rotate(${k * 6} 120 120)`} />
            ))}
          </motion.g>
        </g>
        {[0, 1, 2].map(i => (
          <motion.circle
            key={i}
            cx="120" cy="120" r={86 - i * 22}
            fill="none" stroke="url(#heroGold)" strokeWidth={7 - i * 1.5}
            style={{ transformOrigin: '120px 120px' }}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1 - i * 0.18, scale: [1, 0.84, 1], y: [0, -8, 0] }}
            transition={{ opacity: { duration: 1.2, delay: 0.2 + i * 0.15 }, scale: { duration: 5.5, repeat: Infinity, ease: 'easeInOut', delay: i * 0.18 }, y: { duration: 5.5, repeat: Infinity, ease: 'easeInOut', delay: i * 0.18 } }}
          />
        ))}
        <circle cx="120" cy="120" r="3" fill="var(--gold)" />
      </svg>
    </div>
  );
}

function StartPicker({ value, onChange }: { value: number; onChange: (id: number) => void }) {
  return (
    <div className="space-y-2.5 text-left" role="radiogroup" aria-label="Подготовка">
      {STARTS.map(s => {
        const on = s.levelId === value;
        return (
          <button key={s.levelId} type="button" role="radio" aria-checked={on} onClick={() => onChange(s.levelId)}
            className={`card flex w-full items-start gap-3.5 p-4 text-left transition ${on ? 'border-gold/70 ring-1 ring-gold/50' : ''}`}>
            <span className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border ${on ? 'bg-gold-grad border-transparent text-on-accent' : 'border-gold/40'}`}>
              {on && <Check size={13} strokeWidth={3} />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-2"><span className="font-display text-[20px] leading-tight">{s.title}</span><span className="eyebrow shrink-0 text-gold">Уровень {s.levelId}</span></span>
              <span className="mt-0.5 block text-[14px] leading-snug text-muted">{s.text}</span>
            </span>
          </button>
        );
      })}
      <p className="pt-1 text-center text-[13px] text-muted">Уровень можно сменить в любой момент на вкладке «Программа».</p>
    </div>
  );
}

type Slide = { eyebrow: string; title: string; body: ReactNode | 'start'; visual: ReactNode };

const SLIDES: Slide[] = [
  {
    eyebrow: 'Тренер тазового дна',
    title: 'Тонус',
    body: (
      <>
        <p className="text-[16.5px] leading-relaxed text-muted">Тренер мышц тазового дна и анального сфинктера. Одна основная тренировка в день, лёгкие — по желанию. Через 4–8 недель — лучше контроль, через 3–6 месяцев — сила.</p>
        <ul className="mt-7 space-y-3.5 border-t border-gold/25 pt-6 text-left text-[15px]">
          <li className="flex items-center gap-3"><Clock size={20} className="shrink-0 text-gold" strokeWidth={1.5} /> 3–12 минут в день, 8 уровней и поддержка</li>
          <li className="flex items-center gap-3"><Volume2 size={20} className="shrink-0 text-gold" strokeWidth={1.5} /> Подсказки звуком, голосом и вибрацией</li>
          <li className="flex items-center gap-3"><Lock size={20} className="shrink-0 text-gold" strokeWidth={1.5} /> Без регистрации, данные только на телефоне</li>
        </ul>
      </>
    ),
    visual: <Hero />,
  },
  {
    eyebrow: 'Шаг первый',
    title: 'Найдите нужные мышцы',
    body: (
      <p className="text-[16px] leading-relaxed text-muted">
        Представьте, что сдерживаете газы. Сожмите кольцо вокруг заднего прохода и подтяните его <b className="text-ink">вверх и внутрь</b>.
        Ягодицы, бёдра и живот расслаблены, дыхание свободное. Потом <b className="text-ink">полностью отпустите</b>.
        Перед первой тренировкой приложение попросит проверить технику у зеркала.
      </p>
    ),
    visual: <div className="mx-auto w-full max-w-xs"><PelvisDiagram /></div>,
  },
  { eyebrow: 'Шаг второй', title: 'Ваша подготовка', body: 'start', visual: null },
  {
    eyebrow: 'Прежде чем начать',
    title: 'Безопасность',
    body: (
      <ul className="space-y-3 text-left text-[15px] leading-snug">
        <li className="flex gap-3"><AlertTriangle size={19} strokeWidth={1.5} className="mt-0.5 shrink-0 text-gold" /> Упражнения не должны вызывать боль. Если больно — остановитесь.</li>
        <li className="flex gap-3"><AlertTriangle size={19} strokeWidth={1.5} className="mt-0.5 shrink-0 text-gold" /> При трещине, остром геморрое, после операций на прямой кишке или простате — сначала к врачу.</li>
        <li className="flex gap-3"><AlertTriangle size={19} strokeWidth={1.5} className="mt-0.5 shrink-0 text-gold" /> Кровь в стуле, боль, изменение стула — повод обследоваться, а не тренироваться.</li>
        <li className="flex gap-3"><AlertTriangle size={19} strokeWidth={1.5} className="mt-0.5 shrink-0 text-gold" /> Боль при семяизвержении, в промежности или яичках после тренировок, мышца «не отпускается» — только расслабление и к специалисту.</li>
        <li className="flex gap-3"><AlertTriangle size={19} strokeWidth={1.5} className="mt-0.5 shrink-0 text-gold" /> Расслабление так же важно, как сжатие. Поэтому в каждой тренировке есть блок расслабления.</li>
      </ul>
    ),
    visual: null,
  },
];

export function Onboarding({ onDone }: { onDone: (levelId: number) => void }) {
  const [i, setI] = useState(0);
  const [start, setStart] = useState(DEFAULT_START);
  const slide = SLIDES[i];
  const last = i === SLIDES.length - 1;

  return (
    <div className="pt-safe pb-safe mx-auto flex min-h-dvh w-full max-w-md flex-col px-6">
      <div className="flex justify-end pt-4">
        {!last && <button type="button" onClick={() => onDone(start)} className="eyebrow px-2 py-2 text-muted">Пропустить</button>}
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key={i}
          initial={{ opacity: 0, x: 28, filter: 'blur(6px)' }}
          animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
          exit={{ opacity: 0, x: -28, filter: 'blur(6px)' }}
          transition={{ duration: 0.4, ease: [0.2, 0.7, 0.2, 1] }}
          className="flex flex-1 flex-col justify-center py-6 text-center"
        >
          {slide.visual && <div className="mb-9">{slide.visual}</div>}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08, duration: 0.5 }} className="eyebrow mb-3 text-gold">{slide.eyebrow}</motion.div>
          <motion.h1 initial={{ opacity: 0, y: 12, letterSpacing: '0.04em' }} animate={{ opacity: 1, y: 0, letterSpacing: '-0.015em' }} transition={{ delay: 0.12, duration: 0.7, ease: [0.2, 0.7, 0.2, 1] }}
            className={`font-display mb-5 leading-[1.02] ${i === 0 ? 'text-[64px] italic' : 'text-[38px]'}`}>{slide.title}</motion.h1>
          {slide.body === 'start' ? <StartPicker value={start} onChange={setStart} /> : slide.body}
        </motion.div>
      </AnimatePresence>
      <div className="pb-6">
        <div className="mb-5 flex justify-center gap-2" aria-hidden>
          {SLIDES.map((_, k) => (
            <motion.span key={k} className="bg-gold-grad h-[3px] rounded-full" animate={{ width: k === i ? 28 : 10, opacity: k === i ? 1 : 0.3 }} />
          ))}
        </div>
        <PrimaryButton onClick={() => (last ? onDone(start) : setI(i + 1))}>{last ? 'Понятно, начинаем' : 'Далее'}</PrimaryButton>
      </div>
    </div>
  );
}
