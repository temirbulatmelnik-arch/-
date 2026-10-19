import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, Clock, Lock, Volume2 } from 'lucide-react';
import { useState } from 'react';
import { PelvisDiagram } from '../components/PelvisDiagram';
import { PrimaryButton } from '../components/ui';

function Hero() {
  return (
    <div className="relative mx-auto size-56">
      {[0, 1, 2].map(i => (
        <motion.span
          key={i}
          className="absolute inset-0 rounded-full border-[10px]"
          style={{ borderColor: i === 2 ? 'var(--squeeze)' : 'var(--calm)', opacity: 1 - i * 0.25 }}
          animate={{ scale: [1 - i * 0.22, 0.78 - i * 0.2, 1 - i * 0.22], y: [0, -10, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut', delay: i * 0.12 }}
        />
      ))}
    </div>
  );
}

const SLIDES = [
  {
    title: 'Тонус',
    body: (
      <>
        <p className="text-[17px] leading-relaxed text-muted">Тренер мышц тазового дна и анального сфинктера. Три короткие тренировки в день — и мышцы становятся сильнее и послушнее.</p>
        <ul className="mt-6 space-y-3 text-left text-[15px]">
          <li className="flex items-center gap-3"><Clock size={20} className="shrink-0 text-calm" /> 3–10 минут, 8 уровней сложности</li>
          <li className="flex items-center gap-3"><Volume2 size={20} className="shrink-0 text-calm" /> Подсказки звуком, голосом и вибрацией</li>
          <li className="flex items-center gap-3"><Lock size={20} className="shrink-0 text-calm" /> Без регистрации, данные только на телефоне</li>
        </ul>
      </>
    ),
    visual: <Hero />,
  },
  {
    title: 'Найдите нужные мышцы',
    body: (
      <p className="text-[16px] leading-relaxed text-muted">
        Представьте, что сдерживаете газы. Сожмите кольцо вокруг заднего прохода и подтяните его <b className="text-ink">вверх и внутрь</b>.
        Ягодицы, бёдра и живот расслаблены, дыхание свободное. Потом <b className="text-ink">полностью отпустите</b>.
      </p>
    ),
    visual: <div className="mx-auto w-full max-w-xs"><PelvisDiagram /></div>,
  },
  {
    title: 'Безопасность',
    body: (
      <ul className="space-y-3 text-left text-[15px] leading-snug">
        <li className="flex gap-3"><AlertTriangle size={20} className="mt-0.5 shrink-0 text-gold" /> Упражнения не должны вызывать боль. Если больно — остановитесь.</li>
        <li className="flex gap-3"><AlertTriangle size={20} className="mt-0.5 shrink-0 text-gold" /> При трещине, остром геморрое, после операций на прямой кишке или простате — сначала к врачу.</li>
        <li className="flex gap-3"><AlertTriangle size={20} className="mt-0.5 shrink-0 text-gold" /> Кровь в стуле, боль, изменение стула — повод обследоваться, а не тренироваться.</li>
        <li className="flex gap-3"><AlertTriangle size={20} className="mt-0.5 shrink-0 text-gold" /> Расслабление так же важно, как сжатие. Поэтому в каждой тренировке есть блок расслабления.</li>
      </ul>
    ),
    visual: null,
  },
];

export function Onboarding({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0);
  const slide = SLIDES[i];
  const last = i === SLIDES.length - 1;

  return (
    <div className="pt-safe pb-safe mx-auto flex min-h-dvh w-full max-w-md flex-col px-6">
      <div className="flex justify-end pt-4">
        {!last && <button type="button" onClick={onDone} className="px-2 py-2 text-[15px] text-muted">Пропустить</button>}
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key={i}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ duration: 0.25 }}
          className="flex flex-1 flex-col justify-center py-6 text-center"
        >
          {slide.visual && <div className="mb-8">{slide.visual}</div>}
          <h1 className="mb-4 text-[30px] leading-tight font-semibold tracking-tight">{slide.title}</h1>
          {slide.body}
        </motion.div>
      </AnimatePresence>
      <div className="pb-6">
        <div className="mb-5 flex justify-center gap-2" aria-hidden>
          {SLIDES.map((_, k) => (
            <motion.span key={k} className="h-2 rounded-full bg-calm" animate={{ width: k === i ? 24 : 8, opacity: k === i ? 1 : 0.3 }} />
          ))}
        </div>
        <PrimaryButton onClick={() => (last ? onDone() : setI(i + 1))}>{last ? 'Понятно, начинаем' : 'Далее'}</PrimaryButton>
      </div>
    </div>
  );
}
