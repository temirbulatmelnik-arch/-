// Знакомство: два блока, честное обещание, опросники безопасности шеи и челюсти, стартовый уровень.
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, Check } from 'lucide-react';
import { useState } from 'react';
import { FaceArt, Mark, PostureArt } from '../components/Art';
import { IconButton, PrimaryButton } from '../components/ui';
import { JAW_FLAGS, NECK_FLAGS } from '../engine/content';
import type { BlockId } from '../engine/exercises';
import { BLOCKS, DEFAULT_START, LEVELS } from '../engine/program';
import { useStore } from '../store/store';

export function SafetyList({ title, flags, value, onChange }: { title?: string; flags: { id: string; text: string }[]; value: string[]; onChange: (v: string[]) => void }) {
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter(v => v !== id) : [...value, id]);
  return (
    <div>
      {title && <div className="font-display mb-2 text-[22px]">{title}</div>}
      <div className="space-y-2">
        {flags.map(f => {
          const on = value.includes(f.id);
          return (
            <button key={f.id} type="button" onClick={() => toggle(f.id)} aria-pressed={on}
              className={`flex w-full items-center gap-3.5 rounded-[20px] border px-4 py-3 text-left transition ${on ? 'border-warn/60 bg-warn/8' : 'border-line bg-surface'}`}>
              <span className={`grid size-6 shrink-0 place-items-center rounded-full border transition ${on ? 'border-warn bg-warn text-white' : 'border-gold/45'}`}>{on && <Check size={14} strokeWidth={3} />}</span>
              <span className="text-[14.5px] leading-snug">{f.text}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const slide = { initial: { opacity: 0, x: 30 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: -30 }, transition: { duration: 0.28 } };

export function Onboarding() {
  const finish = useStore(s => s.finishOnboarding);
  const [step, setStep] = useState(0);
  const [neck, setNeck] = useState<string[]>([]);
  const [jaw, setJaw] = useState<string[]>([]);
  const [start, setStart] = useState<Record<BlockId, number>>({ ...DEFAULT_START });
  const next = () => setStep(s => s + 1);

  if (step === 0) return (
    <div className="pt-safe pb-safe relative flex min-h-dvh flex-col overflow-hidden bg-bg">
      <div className="bg-face pointer-events-none absolute -top-40 -right-40 size-[460px] rounded-full opacity-70 blur-3xl" />
      <div className="bg-posture pointer-events-none absolute -bottom-48 -left-40 size-[460px] rounded-full opacity-60 blur-3xl" />
      <div className="relative mx-auto flex w-full max-w-md flex-1 flex-col px-7 pt-16">
        <Mark className="size-14 text-ink" />
        <h1 className="font-display mt-8 text-[84px] leading-[0.85]">Линия</h1>
        <p className="font-display mt-5 text-[28px] leading-tight italic">Ровная шея.<br />Чёткий овал.</p>
        <p className="mt-6 max-w-[32ch] text-[15.5px] leading-relaxed text-muted">Два ритуала с поэтапной нагрузкой: фейс-лифтинг нижней трети лица и осанка шеи и плеч. Голос ведёт, 3D-анатомия показывает, какие мышцы работают.</p>
        <div className="mt-auto pb-8">
          <PrimaryButton onClick={next}>Начать</PrimaryButton>
          <p className="mt-3 text-center text-[12.5px] text-faint">Всё хранится только на телефоне</p>
        </div>
      </div>
    </div>
  );

  const pages = [
    {
      title: 'Два блока',
      body: (
        <div className="space-y-3">
          {(['face', 'posture'] as const).map(b => {
            const Art = b === 'face' ? FaceArt : PostureArt;
            return (
              <div key={b} className={`text-card relative overflow-hidden rounded-[28px] p-5 ${b === 'face' ? 'bg-face' : 'bg-posture'}`}>
                <Art className="absolute -top-2 -right-4 h-[170px] w-auto opacity-70" />
                <div className="relative max-w-[62%]">
                  <div className="font-display text-[32px] leading-none">{BLOCKS[b].title}</div>
                  <div className="mt-1.5 text-[13px] font-medium opacity-70">{BLOCKS[b].tagline}</div>
                  <p className="mt-3 text-[14px] leading-snug opacity-85">{b === 'face' ? 'Мышцы под подбородком, язык и по желанию челюсть — 5 дней в неделю по 3–12 минут.' : 'Глубокие мышцы шеи, лопатки, грудной отдел — 3 занятия в неделю и минутные паузы.'}</p>
                </div>
              </div>
            );
          })}
          <p className="pt-2 text-[14px] leading-relaxed text-muted">Честно: шея выпрямляется на 2–4° за 8–12 недель. Второй подбородок — в первую очередь жир и поза головы, поэтому рядом с упражнениями — образ жизни и замеры по фото.</p>
        </div>
      ),
      cta: 'Дальше',
    },
    {
      title: 'Шея: есть ли что-то из этого?',
      body: (
        <>
          <p className="mb-4 text-[15px] text-muted">Отметьте, если есть. Перед упражнениями для шеи нужно исключить серьёзные причины — так требует клиническое руководство по боли в шее.</p>
          <SafetyList flags={NECK_FLAGS} value={neck} onChange={setNeck} />
          {neck.length > 0 && <p className="mt-4 rounded-[20px] bg-warn/10 p-4 text-[14px] leading-snug">Сначала покажитесь врачу. Блок «Осанка» будет доступен, но с предупреждением, пока вы не отметите в настройках, что врач разрешил.</p>}
        </>
      ),
      cta: neck.length ? 'Понятно' : 'Ничего из этого',
    },
    {
      title: 'Челюсть: есть ли что-то из этого?',
      body: (
        <>
          <p className="mb-4 text-[15px] text-muted">От ответа зависит, включать ли жевание, сжатие зубов и открывание рта против сопротивления.</p>
          <SafetyList flags={JAW_FLAGS} value={jaw} onChange={setJaw} />
          {jaw.length > 0 && <p className="mt-4 rounded-[20px] bg-gold/12 p-4 text-[14px] leading-snug">Модуль челюсти будет выключен. Подбородок и язык — без ограничений. Включить можно в настройках, если стоматолог разрешит.</p>}
        </>
      ),
      cta: jaw.length ? 'Понятно' : 'Ничего из этого',
    },
    {
      title: 'С какого уровня начать',
      body: (
        <div className="space-y-6">
          <p className="text-[15px] text-muted">Вы тренируетесь — поэтому по умолчанию второй уровень. Если упражнения для шеи и языка совсем новые, начните с первого.</p>
          {(['face', 'posture'] as const).map(b => (
            <div key={b}>
              <div className="eyebrow mb-2 text-gold">{BLOCKS[b].title}</div>
              <div className="grid grid-cols-2 gap-2">
                {LEVELS[b].slice(0, 2).map(l => (
                  <button key={l.id} type="button" onClick={() => setStart({ ...start, [b]: l.id })} aria-pressed={start[b] === l.id}
                    className={`rounded-[22px] border p-4 text-left transition ${start[b] === l.id ? 'border-gold bg-gold/10' : 'border-line bg-surface'}`}>
                    <div className="font-display text-[34px] leading-none text-gold">{l.id}</div>
                    <div className="mt-2 text-[15px] font-semibold">{l.name}</div>
                    <div className="mt-0.5 text-[12.5px] leading-snug text-muted">{l.subtitle}</div>
                    {l.id === DEFAULT_START[b] && <div className="mt-2 text-[11px] font-semibold tracking-wide text-gold uppercase">рекомендуем</div>}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ),
      cta: 'Войти в «Линию»',
    },
  ];
  const page = pages[step - 1];
  const last = step === pages.length;

  return (
    <div className="pt-safe pb-safe flex min-h-dvh flex-col bg-bg">
      <div className="mx-auto flex w-full max-w-md items-center gap-3 px-5 pt-3">
        <IconButton label="Назад" onClick={() => setStep(step - 1)} className="hairline bg-surface"><ArrowLeft size={19} /></IconButton>
        <div className="flex flex-1 justify-center gap-1.5">
          {pages.map((_, i) => <span key={i} className={`h-[3px] w-8 rounded-full ${i < step ? 'bg-gold' : 'bg-line'}`} />)}
        </div>
        <span className="size-11" />
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={step} {...slide} className="mx-auto w-full max-w-md flex-1 px-6 pt-6 pb-4">
          <h1 className="font-display mb-5 text-[40px] leading-[1.02]">{page.title}</h1>
          {page.body}
        </motion.div>
      </AnimatePresence>
      <div className="mx-auto w-full max-w-md px-6 pb-6">
        <PrimaryButton onClick={() => (last ? finish(start, { neck, jaw }) : next())}>{page.cta}</PrimaryButton>
      </div>
    </div>
  );
}
