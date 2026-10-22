// Контроль: проверка техники (зеркало, пальпация, ладонь) и самотест силы.
// Приложение не видит мышцу, поэтому проверку делает сам пользователь по признакам из исследований:
// при правильном сжатии у мужчин основание пениса втягивается, яички поднимаются, промежность уходит вверх,
// задний проход втягивается. Натуживание вместо сжатия встречается у четверти людей, обученных только устно.
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, ClipboardCheck, Timer, X, Zap } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { SphincterRing } from '../components/SphincterRing';
import { IconButton, PrimaryButton, SecondaryButton } from '../components/ui';
import { keepAwake, playCue, speak, stopSpeech, unlockAudio } from '../engine/cues';
import type { CheckRecord } from '../engine/stats';
import { useStore } from '../store/store';

const QUESTIONS = [
  { title: 'Спереди', text: 'Встаньте перед зеркалом и сожмитесь. Основание пениса слегка втягивается, а яички подтягиваются вверх?' },
  { title: 'Промежность', text: 'Два пальца на промежности за мошонкой. При сжатии она уходит вверх и внутрь, а не выпячивается наружу?' },
  { title: 'Задний проход', text: 'Кончиком пальца у заднего прохода, можно через бельё. При сжатии он втягивается внутрь и закрывается?' },
  { title: 'Ягодицы и дыхание', text: 'Ладонь на ягодицах. Они остаются мягкими, а дыхание не задерживается?' },
  { title: 'Расслабление', text: 'После сжатия всё возвращается: промежность опускается на место, напряжение уходит полностью?' },
];

/** Самотест: удержание не дольше минуты, быстрых — не больше 50 */
const HOLD_MAX = 60;
const QUICK_MAX = 50;
const REST = 30;

type Stage = 'intro' | 'technique' | 'advice' | 'hold' | 'rest' | 'quick' | 'result';

export function Check({ onClose }: { onClose: () => void }) {
  const settings = useStore(s => s.settings);
  const checks = useStore(s => s.checks);
  const addCheck = useStore(s => s.addCheck);
  const [stage, setStage] = useState<Stage>('intro');
  const [answers, setAnswers] = useState<(boolean | null)[]>(QUESTIONS.map(() => null));
  const [hold, setHold] = useState<number>();
  const [quick, setQuick] = useState<number>();

  const technique = answers.slice(0, 4).every(Boolean);
  const relaxes = answers[4] === true;
  const prev = [...checks].reverse().find(c => c.hold !== undefined || c.quick !== undefined);

  useEffect(() => () => { stopSpeech(); void keepAwake(false); }, []);

  const save = () => {
    const rec: CheckRecord = { id: `${Date.now()}`, at: new Date().toISOString(), technique, relaxes, hold, quick };
    addCheck(rec);
    onClose();
  };

  const afterTechnique = () => setStage(technique && relaxes ? 'hold' : 'advice');

  return (
    <div className="pt-safe pb-safe fixed inset-0 z-40 flex flex-col bg-bg">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col overflow-y-auto px-5">
        <div className="flex items-center gap-2 pt-3">
          <IconButton label="Закрыть" onClick={onClose} className="hairline bg-surface"><X size={19} strokeWidth={1.6} /></IconButton>
          <div className="eyebrow flex-1 text-center text-gold">Контроль</div>
          <div className="size-11" />
        </div>

        <AnimatePresence mode="wait">
          <motion.div key={stage} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.2 }} className="flex flex-1 flex-col py-5">
            {stage === 'intro' && (
              <Step icon={<ClipboardCheck size={26} />} title="Проверка техники и самотест"
                footer={<PrimaryButton onClick={() => setStage('technique')}>Начать</PrimaryButton>}>
                <p>3–4 минуты. Удобнее в уединённом месте, без белья или в тонком белье, рядом — зеркало.</p>
                <ol className="mt-4 space-y-2">
                  <li><b>1. Техника.</b> Пять признаков правильного сжатия — сверяетесь с зеркалом и ладонью.</li>
                  <li><b>2. Удержание.</b> Сколько секунд сжатие держится в полную силу.</li>
                  <li><b>3. Быстрые.</b> Сколько чётких быстрых сокращений подряд.</li>
                </ol>
                <p className="mt-4 text-muted">Повторяйте контроль каждые 3 недели, в поддержке — раз в месяц. Результаты появятся на вкладке «Прогресс».</p>
              </Step>
            )}

            {stage === 'technique' && (
              <Step title="Техника" footer={<PrimaryButton onClick={afterTechnique} disabled={answers.includes(null)}>Дальше</PrimaryButton>}>
                <p className="text-muted">Сожмитесь как на тренировке: «удержите газы», вверх и внутрь. Ответьте честно — от этого зависит, когда переходить дальше.</p>
                <ul className="mt-4 space-y-2.5">
                  {QUESTIONS.map((q, i) => (
                    <li key={q.title} className="card p-4">
                      <div className="font-display text-[19px] leading-tight">{q.title}</div>
                      <p className="mt-1 text-[14px] leading-snug text-muted">{q.text}</p>
                      <div className="mt-3 grid grid-cols-2 gap-2" role="radiogroup" aria-label={q.title}>
                        {([true, false] as const).map(v => (
                          <button key={String(v)} type="button" role="radio" aria-checked={answers[i] === v}
                            onClick={() => setAnswers(a => a.map((x, k) => (k === i ? v : x)))}
                            className={`rounded-full border py-2 text-[13px] font-medium tracking-[0.1em] uppercase transition ${answers[i] === v ? (v ? 'border-transparent bg-calm text-on-accent' : 'border-transparent bg-squeeze text-on-accent') : 'border-line text-muted'}`}>
                            {v ? 'Да' : 'Нет'}
                          </button>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              </Step>
            )}

            {stage === 'advice' && (
              !relaxes ? (
                <Step icon={<AlertTriangle size={26} />} tone="gold" title="Мышца не отпускается полностью"
                  footer={<PrimaryButton onClick={save}>Сохранить</PrimaryButton>}>
                  <p>Это признак перенапряжения тазового дна. Его лечат расслаблением, а не укреплением.</p>
                  <ul className="mt-3 list-disc space-y-1.5 pl-5">
                    <li>Пока делайте только расслабление — кнопка появится на главном экране.</li>
                    <li>Покажитесь специалисту по тазовому дну или урологу, особенно если есть боль в промежности, яичках, при семяизвержении или после тренировок.</li>
                    <li>Повторите проверку через несколько дней.</li>
                  </ul>
                </Step>
              ) : (
                <Step icon={<AlertTriangle size={26} />} tone="gold" title="Сжатие пока не совсем точное"
                  footer={<div className="grid gap-2"><PrimaryButton onClick={() => setStage('hold')}>Всё равно пройти самотест</PrimaryButton><SecondaryButton onClick={save}>Сохранить и закончить</SecondaryButton></div>}>
                  <p>Так бывает часто: после устного объяснения многие сжимают не те мышцы или тужатся. Попробуйте:</p>
                  <ul className="mt-3 list-disc space-y-1.5 pl-5">
                    <li>сзади: «удержите газы», «втяните задний проход»;</li>
                    <li>спереди: «укоротите пенис», «подтяните яички»;</li>
                    <li>сидя на твёрдом стуле: промежность должна чуть отрываться от сиденья вверх;</li>
                    <li>сжимайте слабее — тогда легче не включать ягодицы и живот.</li>
                  </ul>
                  <p className="mt-3">Пока техника не проверена, приложение не предложит следующий уровень. Повторите проверку через пару дней. Если не получается — специалист по тазовому дну проверит сжатие пальпацией или датчиком (БОС).</p>
                </Step>
              )
            )}

            {stage === 'hold' && <HoldTest onDone={s => { setHold(s); setStage('rest'); }} settings={settings} />}
            {stage === 'rest' && <RestStep onDone={() => setStage('quick')} />}
            {stage === 'quick' && <QuickTest onDone={n => { setQuick(n); setStage('result'); }} settings={settings} />}

            {stage === 'result' && (
              <Step title="Результат" footer={<PrimaryButton onClick={save}>Сохранить</PrimaryButton>}>
                <div className="grid grid-cols-2 gap-2">
                  <Tile label="Удержание в полную силу" value={`${hold ?? 0} с`} prev={prev?.hold} cur={hold} unit="с" />
                  <Tile label="Чётких быстрых подряд" value={String(quick ?? 0)} prev={prev?.quick} cur={quick} unit="" />
                </div>
                <p className="hairline mt-4 rounded-2xl bg-surface p-4 text-[14px] text-muted">
                  Ориентир: по портативной манометрии максимальное сжатие у здоровых мужчин держится 2–10 с. Самотест — по ощущениям,
                  он не равен манометрии, но хорошо показывает динамику. Если результат упадёт больше чем на 20 %, приложение предложит усилить тренировки.
                </p>
                {!technique && <p className="mt-3 text-[14px] text-gold">Техника не подтверждена — повторите проверку через пару дней.</p>}
              </Step>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function Step({ icon, tone = 'calm', title, children, footer }: { icon?: ReactNode; tone?: 'calm' | 'gold'; title: string; children: ReactNode; footer: ReactNode }) {
  return (
    <>
      <div className="flex-1 text-[15px] leading-relaxed">
        {icon && <span className={`mb-5 grid size-14 place-items-center rounded-full border ${tone === 'gold' ? 'border-gold/50 text-gold' : 'border-calm/50 text-calm'}`}>{icon}</span>}
        <h1 className="font-display mb-4 text-[34px] leading-[1.05]">{title}</h1>
        {children}
      </div>
      <div className="pt-6">{footer}</div>
    </>
  );
}

function Tile({ label, value, prev, cur, unit }: { label: string; value: string; prev?: number; cur?: number; unit: string }) {
  const diff = prev !== undefined && cur !== undefined ? cur - prev : null;
  return (
    <div className="card px-3 py-4 text-center">
      <div className="font-display text-[34px] leading-none">{value}</div>
      <div className="mt-2 text-[9.5px] leading-tight tracking-[0.14em] text-muted uppercase">{label}</div>
      {diff !== null && (
        <div className={`mt-2 text-[13px] font-medium ${diff > 0 ? 'text-calm' : diff < 0 ? 'text-squeeze' : 'text-muted'}`}>
          {diff > 0 ? '+' : ''}{diff} {unit} к прошлому
        </div>
      )}
    </div>
  );
}

const StopButton = ({ onClick, children }: { onClick: () => void; children: ReactNode }) => (
  <motion.button type="button" whileTap={{ scale: 0.97 }} onClick={onClick}
    className="flex h-14 w-full items-center justify-center rounded-full bg-squeeze text-[13.5px] font-medium tracking-[0.16em] text-on-accent uppercase shadow-lg shadow-squeeze/25">
    {children}
  </motion.button>
);

/** Таймер шагов самотеста: тикает раз в 100 мс, пока running */
function useClock(running: boolean) {
  const [t, setT] = useState(0);
  const start = useRef(0);
  useEffect(() => {
    if (!running) return;
    start.current = performance.now() - t * 1000;
    const id = setInterval(() => setT((performance.now() - start.current) / 1000), 100);
    return () => clearInterval(id);
  }, [running]);
  return t;
}

type Cues = Parameters<typeof playCue>[1];

function HoldTest({ onDone, settings }: { onDone: (sec: number) => void; settings: Cues }) {
  const [running, setRunning] = useState(false);
  const t = useClock(running);
  const finish = () => {
    setRunning(false);
    void keepAwake(false);
    playCue('relax', settings);
    speak('Отпустите полностью', settings);
    onDone(Math.round(Math.min(HOLD_MAX, t)));
  };
  useEffect(() => { if (running && t >= HOLD_MAX) finish(); }, [t]);
  const start = () => {
    unlockAudio();
    void keepAwake(true);
    playCue('squeeze', settings);
    speak('Сожмите на максимум и держите', settings);
    setRunning(true);
  };
  return (
    <Step title="Удержание" footer={running
      ? <StopButton onClick={finish}>Ослабло</StopButton>
      : <PrimaryButton onClick={start}><Timer size={20} /> Сжать и держать</PrimaryButton>}>
      <p className="text-muted">Сожмите на максимум и держите. Как только сжатие начнёт ослабевать или включаются ягодицы — нажмите «Ослабло». Дышите, не тужьтесь.</p>
      <div className="mt-6">
        <SphincterRing level={running ? 1 : 0} phase={running ? 'hold' : 'prep'} progress={t / HOLD_MAX}>
          <div className="text-center">
            <div className="font-display text-[84px] leading-none">{Math.floor(t)}</div>
            <div className="eyebrow mt-2 text-muted">секунд</div>
          </div>
        </SphincterRing>
      </div>
    </Step>
  );
}

function RestStep({ onDone }: { onDone: () => void }) {
  const t = useClock(true);
  const left = Math.max(0, Math.ceil(REST - t));
  useEffect(() => { if (left === 0) onDone(); }, [left]);
  return (
    <Step title="Отдых" footer={<SecondaryButton onClick={onDone} className="w-full">Пропустить</SecondaryButton>}>
      <p className="text-muted">Отпустите полностью и восстановитесь. Дальше — быстрые сокращения.</p>
      <div className="mt-6">
        <SphincterRing level={0} phase="relax" progress={t / REST}>
          <div className="font-display text-[84px] leading-none">{left}</div>
        </SphincterRing>
      </div>
    </Step>
  );
}

function QuickTest({ onDone, settings }: { onDone: (n: number) => void; settings: Cues }) {
  const [running, setRunning] = useState(false);
  const t = useClock(running);
  // ритм 1 с сжатие / 1 с расслабление; засчитываем каждое завершённое сокращение
  const cycle = Math.floor(t / 2);
  const squeezing = running && t % 2 < 1;
  const phaseRef = useRef(-1);
  useEffect(() => {
    if (!running) return;
    const phase = Math.floor(t);
    if (phase === phaseRef.current) return;
    phaseRef.current = phase;
    if (cycle >= QUICK_MAX) { stop(); return; }
    playCue(phase % 2 === 0 ? 'squeeze' : 'relax', settings);
  }, [t]);
  const stop = () => {
    setRunning(false);
    void keepAwake(false);
    onDone(Math.min(QUICK_MAX, cycle));
  };
  const start = () => {
    unlockAudio();
    void keepAwake(true);
    phaseRef.current = -1;
    setRunning(true);
  };
  return (
    <Step title="Быстрые сокращения" footer={running
      ? <StopButton onClick={stop}>Сбилось</StopButton>
      : <PrimaryButton onClick={start}><Zap size={20} /> Начать</PrimaryButton>}>
      <p className="text-muted">По высокому сигналу — резко сожмите на секунду, по низкому — отпустите полностью. Как только сокращения становятся смазанными или не успеваете отпустить — нажмите «Сбилось».</p>
      <div className="mt-6">
        <SphincterRing level={squeezing ? 1 : 0} phase={squeezing ? 'squeeze' : 'relax'} progress={(t % 2) / 2}>
          <div className="text-center">
            <div className="font-display text-[84px] leading-none">{cycle}</div>
            <div className="eyebrow mt-2 text-muted">{running ? (squeezing ? 'сжать' : 'отпустить') : 'сокращений'}</div>
          </div>
        </SphincterRing>
      </div>
    </Step>
  );
}
