// Замеры: угол шеи и плеча по боковому фото, шейно-подбородочный угол по профилю, фото анфас,
// тест выносливости сгибателей шеи, масса и окружность шеи, акромион лёжа; и проверка техники.
// Фото не покидают телефон: на устройстве остаются только миниатюры с разметкой.
import { motion } from 'motion/react';
import { Camera, Check, ImagePlus, RotateCcw, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { IconButton, PrimaryButton, SecondaryButton } from '../components/ui';
import { TECH_CHECK } from '../engine/content';
import type { BlockId } from '../engine/exercises';
import { BLOCKS } from '../engine/program';
import type { CheckKind, CheckRecord } from '../engine/stats';
import { useStore } from '../store/store';

type Pt = { x: number; y: number };

function Shell({ title, overline, onClose, children, footer }: { title: string; overline?: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="pt-safe fixed inset-0 z-40 flex flex-col bg-bg">
      <div className="mx-auto flex w-full max-w-md items-center gap-2 px-5 pt-3">
        <IconButton label="Закрыть" onClick={onClose} className="hairline bg-surface"><X size={19} /></IconButton>
        <div className="eyebrow flex-1 text-center text-gold">{overline}</div>
        <div className="size-11" />
      </div>
      <div className="mx-auto w-full max-w-md flex-1 overflow-y-auto px-5 pb-6">
        <h1 className="font-display mt-3 text-[38px] leading-[1.02]">{title}</h1>
        {children}
      </div>
      {footer && <div className="pb-safe border-t border-line bg-bg/95"><div className="mx-auto w-full max-w-md px-5 pt-3 pb-4">{footer}</div></div>}
    </div>
  );
}

const Steps = ({ items }: { items: string[] }) => (
  <ol className="mt-4 space-y-2.5 text-[15px] leading-relaxed">
    {items.map((t, i) => (
      <li key={i} className="flex gap-3"><span className="font-display grid size-6 shrink-0 place-items-center rounded-full border border-gold/50 text-[15px] text-gold">{i + 1}</span><span>{t}</span></li>
    ))}
  </ol>
);

const note = (t: ReactNode) => <p className="mt-4 rounded-[20px] bg-surface-2 px-4 py-3 text-[13.5px] leading-snug text-muted">{t}</p>;

// ——— Геометрия ———
const deg = (r: number) => (r * 180) / Math.PI;
/** Угол шеи: линия «козелок — C7» к горизонтали */
export function cvaAngle(tragus: Pt, c7: Pt) {
  return deg(Math.atan2(c7.y - tragus.y, Math.abs(tragus.x - c7.x)));
}
/** Угол плеча: линия «C7 — акромион» к горизонтали, в сторону лица; меньше — плечо выдвинуто вперёд */
export function shoulderAngle(tragus: Pt, c7: Pt, acromion: Pt) {
  const forward = Math.sign(tragus.x - c7.x) || 1;
  return deg(Math.atan2(acromion.y - c7.y, (acromion.x - c7.x) * forward));
}
/** Угол в вершине b между лучами к a и c */
export function angleAt(a: Pt, b: Pt, c: Pt) {
  const v1 = { x: a.x - b.x, y: a.y - b.y }, v2 = { x: c.x - b.x, y: c.y - b.y };
  const cos = (v1.x * v2.x + v1.y * v2.y) / (Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y) || 1);
  return deg(Math.acos(Math.max(-1, Math.min(1, cos))));
}

/** Фото в миниатюру с разметкой; координаты точек — доли ширины и высоты */
async function thumbnail(src: string, pts: Pt[], lines: [number, number][], horizontal?: number, max = 360): Promise<string> {
  const img = new Image();
  img.src = src;
  await img.decode();
  const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * k), h = Math.round(img.naturalHeight * k);
  const c = Object.assign(document.createElement('canvas'), { width: w, height: h });
  const g = c.getContext('2d')!;
  g.drawImage(img, 0, 0, w, h);
  g.lineWidth = 2;
  g.strokeStyle = '#d7b77e';
  for (const [a, b] of lines) { g.beginPath(); g.moveTo(pts[a].x * w, pts[a].y * h); g.lineTo(pts[b].x * w, pts[b].y * h); g.stroke(); }
  if (horizontal !== undefined) {
    g.setLineDash([4, 5]);
    g.beginPath(); g.moveTo(0, pts[horizontal].y * h); g.lineTo(w, pts[horizontal].y * h); g.stroke();
    g.setLineDash([]);
  }
  g.fillStyle = '#d7b77e';
  for (const p of pts) { g.beginPath(); g.arc(p.x * w, p.y * h, 4, 0, Math.PI * 2); g.fill(); }
  return c.toDataURL('image/jpeg', 0.72);
}

function PhotoPicker({ onPhoto }: { onPhoto: (url: string) => void }) {
  const cam = useRef<HTMLInputElement>(null);
  const lib = useRef<HTMLInputElement>(null);
  const pick = (f?: File) => { if (f) onPhoto(URL.createObjectURL(f)); };
  return (
    <div className="grid grid-cols-2 gap-2">
      <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={e => pick(e.target.files?.[0])} />
      <input ref={lib} type="file" accept="image/*" hidden onChange={e => pick(e.target.files?.[0])} />
      <PrimaryButton className="h-12" onClick={() => cam.current?.click()}><Camera size={18} /> Снять</PrimaryButton>
      <SecondaryButton onClick={() => lib.current?.click()}><ImagePlus size={17} /> Из фото</SecondaryButton>
    </div>
  );
}

/** Разметка точек на фото: касание ставит следующую точку, точку можно перетащить */
function Marker({ src, labels, pts, setPts, lines, horizontal }: { src: string; labels: string[]; pts: Pt[]; setPts: (p: Pt[]) => void; lines: [number, number][]; horizontal?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<number | null>(null);
  const pos = (e: React.PointerEvent): Pt => {
    const r = box.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };
  const down = (e: React.PointerEvent) => {
    const p = pos(e);
    const r = box.current!.getBoundingClientRect();
    const near = pts.findIndex(q => Math.hypot((q.x - p.x) * r.width, (q.y - p.y) * r.height) < 28);
    if (near >= 0) drag.current = near;
    else if (pts.length < labels.length) { setPts([...pts, p]); drag.current = pts.length; }
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const move = (e: React.PointerEvent) => {
    if (drag.current === null) return;
    const next = [...pts];
    next[drag.current] = pos(e);
    setPts(next);
  };
  return (
    <div ref={box} className="relative mt-4 touch-none overflow-hidden rounded-[24px] bg-black select-none" onPointerDown={down} onPointerMove={move} onPointerUp={() => { drag.current = null; }}>
      <img src={src} alt="" className="block w-full" draggable={false} />
      <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        {horizontal !== undefined && pts[horizontal] && <line x1="0" x2="100" y1={pts[horizontal].y * 100} y2={pts[horizontal].y * 100} stroke="#d7b77e" strokeWidth="0.4" strokeDasharray="1.5 1.5" vectorEffect="non-scaling-stroke" />}
        {lines.filter(([a, b]) => pts[a] && pts[b]).map(([a, b]) => (
          <line key={`${a}${b}`} x1={pts[a].x * 100} y1={pts[a].y * 100} x2={pts[b].x * 100} y2={pts[b].y * 100} stroke="#d7b77e" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      {pts.map((p, i) => (
        <span key={i} className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}>
          <span className="block size-5 rounded-full border-2 border-white bg-gold shadow" />
          <span className="absolute top-6 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] whitespace-nowrap text-white">{labels[i]}</span>
        </span>
      ))}
    </div>
  );
}

const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;

// ——— Угол шеи и плеча ———
function CvaFlow({ onClose }: { onClose: () => void }) {
  const addCheck = useStore(s => s.addCheck);
  const [stage, setStage] = useState<'intro' | 'photo' | 'mark'>('intro');
  const [src, setSrc] = useState<string | null>(null);
  const [pts, setPts] = useState<Pt[]>([]);
  const [shots, setShots] = useState<{ cva: number; shoulder?: number; thumb: string }[]>([]);
  const labels = ['козелок уха', 'C7', 'акромион'];
  const cva = pts.length >= 2 ? cvaAngle(pts[0], pts[1]) : null;
  const sh = pts.length >= 3 ? shoulderAngle(pts[0], pts[1], pts[2]) : null;

  const accept = async () => {
    if (!src || cva === null) return;
    const thumb = await thumbnail(src, pts, pts.length >= 3 ? [[1, 0], [1, 2]] : [[1, 0]], 1);
    const next = [...shots, { cva, shoulder: sh ?? undefined, thumb }];
    setShots(next);
    setSrc(null); setPts([]);
    if (next.length >= 3) save(next); else setStage('photo');
  };
  const save = (list = shots) => {
    if (!list.length) return onClose();
    const shs = list.map(s => s.shoulder).filter((v): v is number => v !== undefined);
    addCheck({ id: `${Date.now()}`, at: new Date().toISOString(), kind: 'cva', values: { cva: avg(list.map(s => s.cva)), shoulder: shs.length ? avg(shs) : undefined, shots: list.length }, thumb: list[0].thumb });
    setStage('intro');
    setDone(list);
  };
  const [done, setDone] = useState<typeof shots | null>(null);

  if (done) {
    const v = avg(done.map(s => s.cva));
    const shs = done.map(s => s.shoulder).filter((x): x is number => x !== undefined);
    return (
      <Shell title="Замер сохранён" overline="Угол шеи" onClose={onClose} footer={<PrimaryButton onClick={onClose}>Готово</PrimaryButton>}>
        <div className="card mt-5 p-6 text-center">
          <div className="font-display text-[64px] leading-none">{v.toFixed(1)}°</div>
          <div className="mt-2 text-[14px] text-muted">среднее из {done.length} {done.length === 1 ? 'снимка' : 'снимков'}</div>
          {shs.length > 0 && <div className="mt-4 text-[15px]">Угол плеча <b>{avg(shs).toFixed(1)}°</b> <span className="text-muted">(норма 53 ± 6°)</span></div>}
        </div>
        {note(<>{v >= 50 ? '≥ 50–53° — типичный диапазон.' : v < 48 ? '< 48–50° — голова вынесена вперёд.' : 'Пограничная зона 48–50°.'} Ошибка фото — около 5°: изменения меньше считаем погрешностью, пока тренд не повторится три замера подряд. Сравнивайте только свои замеры, сделанные одинаково.</>)}
      </Shell>
    );
  }

  if (stage === 'intro') return (
    <Shell title="Угол шеи по фото" overline="Замер осанки" onClose={onClose} footer={<PrimaryButton onClick={() => setStage('photo')}>Понятно, снимаем</PrimaryButton>}>
      <p className="mt-3 text-[15px] text-muted">Краниовертебральный угол — между линией «козелок уха — C7» и горизонталью. Чем меньше, тем дальше голова вынесена вперёд. С того же снимка считается угол плеча.</p>
      <Steps items={[
        'Телефон вертикально на полке или стопке книг, объектив на уровне плеча, в 1,5–3 м, строго перпендикулярно боку. Включите таймер камеры.',
        'Шея открыта, волосы убраны с уха. На C7 — наклейка: это самый выступающий позвонок у основания шеи при наклоне головы.',
        'Перед снимком сделайте 3–5 шагов на месте, смотрите на метку на уровне глаз, два спокойных вдоха. Снимаем привычную позу, а не исправленную.',
        'Стоя, всегда в одно и то же время суток. Три снимка — приложение возьмёт среднее.',
      ]} />
      {note('Снимок можно сделать штатной камерой с таймером и выбрать «Из фото». Фото остаётся на телефоне: сохраняется только миниатюра с разметкой.')}
    </Shell>
  );

  return (
    <Shell title={src ? 'Отметьте точки' : `Снимок ${shots.length + 1} из 3`} overline="Угол шеи" onClose={onClose}
      footer={src ? (
        <div className="grid grid-cols-[auto_1fr] gap-2">
          <SecondaryButton onClick={() => { setSrc(null); setPts([]); }}><RotateCcw size={16} /></SecondaryButton>
          <PrimaryButton className="h-12" disabled={cva === null} onClick={() => void accept()}>{shots.length >= 2 ? 'Сохранить замер' : 'Дальше'}</PrimaryButton>
        </div>
      ) : shots.length ? <SecondaryButton className="w-full" onClick={() => save()}>Сохранить по {shots.length} {shots.length === 1 ? 'снимку' : 'снимкам'}</SecondaryButton> : undefined}>
      {!src ? (
        <div className="mt-5"><PhotoPicker onPhoto={u => { setSrc(u); setStage('mark'); }} />
          {shots.length > 0 && <p className="mt-4 text-center text-[14px] text-muted">Предыдущие: {shots.map(s => `${s.cva.toFixed(1)}°`).join(' · ')}</p>}
        </div>
      ) : (
        <>
          <p className="mt-2 text-[14.5px] text-muted">Коснитесь по очереди: <b>{labels.slice(0, 3).join(' → ')}</b>. Акромион — по желанию, для угла плеча. Точки можно перетащить.</p>
          <Marker src={src} labels={labels} pts={pts} setPts={setPts} lines={[[1, 0], [1, 2]]} horizontal={1} />
          <div className="mt-4 flex justify-center gap-6 text-center">
            <div><div className="font-display text-[34px]">{cva !== null ? `${cva.toFixed(1)}°` : '—'}</div><div className="text-[12px] text-muted">угол шеи</div></div>
            <div><div className="font-display text-[34px]">{sh !== null ? `${sh.toFixed(1)}°` : '—'}</div><div className="text-[12px] text-muted">угол плеча</div></div>
          </div>
        </>
      )}
    </Shell>
  );
}

// ——— Профиль ———
function ProfileFlow({ onClose, front = false }: { onClose: () => void; front?: boolean }) {
  const addCheck = useStore(s => s.addCheck);
  const [intro, setIntro] = useState(true);
  const [src, setSrc] = useState<string | null>(null);
  const [pts, setPts] = useState<Pt[]>([]);
  const [saved, setSaved] = useState<number | null | undefined>(undefined);
  const labels = ['подбородок снизу', 'угол шеи', 'шея ниже'];
  const angle = pts.length === 3 ? angleAt(pts[0], pts[1], pts[2]) : null;

  const save = async () => {
    if (!src) return;
    const thumb = await thumbnail(src, pts, front ? [] : [[1, 0], [1, 2]]);
    addCheck({ id: `${Date.now()}`, at: new Date().toISOString(), kind: front ? 'front' : 'profile', values: angle !== null ? { angle } : {}, thumb });
    setSaved(angle);
  };

  if (saved !== undefined) return (
    <Shell title="Фото сохранено" overline={front ? 'Анфас' : 'Профиль'} onClose={onClose} footer={<PrimaryButton onClick={onClose}>Готово</PrimaryButton>}>
      {saved !== null && <div className="card mt-5 p-6 text-center"><div className="font-display text-[64px] leading-none">{Math.round(saved)}°</div><div className="mt-2 text-[14px] text-muted">шейно-подбородочный угол</div></div>}
      {note(front ? 'Сравнивайте фото анфас рядом в «Прогрессе»: ширину нижней челюсти и симметрию.' : 'Идеал по разным работам — от 90–100° до 105–120°, при полноте под подбородком угол часто больше 120°. Поза головы, угол камеры и свет меняют угол сильнее любой тренировки — смысл имеет только собственный тренд.')}
    </Shell>
  );

  if (intro) return (
    <Shell title={front ? 'Фото анфас' : 'Фото профиля'} overline="Замер лица" onClose={onClose} footer={<PrimaryButton onClick={() => setIntro(false)}>Понятно, снимаем</PrimaryButton>}>
      <Steps items={[
        'Камера на высоте лица, на фиксированном расстоянии 1–1,5 м. Не широкоугольное селфи вблизи — оно искажает подбородок.',
        front ? 'Смотрите прямо в камеру, лицо расслаблено, зубы сомкнуты без усилия.' : 'Строго в профиль. Голова во франкфуртской горизонтали: линия от нижнего края глазницы до козелка горизонтальна.',
        'Одинаковые свет, время суток (утром лицо отёчнее) и длина бороды. Челюсть нейтральна.',
        front ? 'Сохраняется только миниатюра для сравнения.' : 'Потом отметьте три точки: низ подбородка, самую глубокую точку угла между подбородком и шеей, точку на передней линии шеи ниже.',
      ]} />
      {!front && note('Совет из исследования: сделайте рядом два снимка — с привычной и с нейтральной головой. Разница часто больше, чем от месяцев упражнений.')}
    </Shell>
  );

  return (
    <Shell title={src ? (front ? 'Сохранить фото' : 'Отметьте точки') : 'Снимок'} overline={front ? 'Анфас' : 'Профиль'} onClose={onClose}
      footer={src ? (
        <div className="grid grid-cols-[auto_1fr] gap-2">
          <SecondaryButton onClick={() => { setSrc(null); setPts([]); }}><RotateCcw size={16} /></SecondaryButton>
          <PrimaryButton className="h-12" disabled={!front && angle === null} onClick={() => void save()}>Сохранить</PrimaryButton>
        </div>
      ) : undefined}>
      {!src ? <div className="mt-5"><PhotoPicker onPhoto={setSrc} /></div> : front ? (
        <img src={src} alt="" className="mt-4 w-full rounded-[24px]" />
      ) : (
        <>
          <p className="mt-2 text-[14.5px] text-muted">Коснитесь: <b>{labels.join(' → ')}</b>.</p>
          <Marker src={src} labels={labels} pts={pts} setPts={setPts} lines={[[1, 0], [1, 2]]} />
          <div className="mt-4 text-center"><div className="font-display text-[40px]">{angle !== null ? `${Math.round(angle)}°` : '—'}</div><div className="text-[12px] text-muted">шейно-подбородочный угол</div></div>
        </>
      )}
    </Shell>
  );
}

// ——— Тест выносливости сгибателей шеи ———
function DnfFlow({ onClose }: { onClose: () => void }) {
  const addCheck = useStore(s => s.addCheck);
  const [trials, setTrials] = useState<number[]>([]);
  const [run, setRun] = useState<number | null>(null);
  const [rest, setRest] = useState(0);
  const [, tick] = useState(0);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (run === null && rest <= 0) return;
    const id = setInterval(() => { tick(t => t + 1); setRest(r => Math.max(0, r - 0.25)); }, 250);
    return () => clearInterval(id);
  }, [run, rest]);

  const elapsed = run !== null ? (performance.now() - run) / 1000 : 0;
  const stop = () => {
    const next = [...trials, Math.round(elapsed)];
    setTrials(next);
    setRun(null);
    if (next.length < 2) setRest(60);
  };
  const save = () => {
    addCheck({ id: `${Date.now()}`, at: new Date().toISOString(), kind: 'dnf', values: { seconds: avg(trials) } });
    setSaved(true);
  };
  const mean = trials.length ? avg(trials) : 0;

  if (saved || trials.length >= 2) return (
    <Shell title={saved ? 'Результат сохранён' : 'Результат'} overline="Выносливость шеи" onClose={onClose}
      footer={saved ? <PrimaryButton onClick={onClose}>Готово</PrimaryButton> : <PrimaryButton onClick={save}>Сохранить</PrimaryButton>}>
      <div className="card mt-5 p-6 text-center">
        <div className="font-display text-[64px] leading-none">{Math.round(mean)} с</div>
        <div className="mt-2 text-[14px] text-muted">среднее двух попыток: {trials.join(' и ')} с</div>
      </div>
      {note(<>Норма для мужчин — 38,9 ± 20,1 с, от возраста не зависит. {mean < 20 ? 'Меньше 20 секунд — ниже среднего: программа как раз на это.' : mean >= 39 ? 'Выше средней нормы.' : 'В пределах нормы.'} Значимым считаем изменение от 10 секунд.</>)}
    </Shell>
  );

  return (
    <Shell title="Тест выносливости шеи" overline="Замер осанки" onClose={onClose}
      footer={run !== null ? <PrimaryButton onClick={stop}>Стоп — подбородок «отпустил»</PrimaryButton>
        : rest > 0 ? <SecondaryButton className="w-full" onClick={() => setRest(0)}>Пропустить отдых</SecondaryButton>
          : <PrimaryButton onClick={() => setRun(performance.now())}>{trials.length ? 'Вторая попытка' : 'Старт'}</PrimaryButton>}>
      {run === null && rest <= 0 && trials.length === 0 && (
        <Steps items={[
          'Лягте на спину на пол, колени согнуты. Телефон рядом, экраном к себе.',
          'Сделайте кивок — подбородок прижат к горлу — и поднимите голову примерно на 2 см.',
          'Нажмите «Старт» в момент подъёма. Держите, дыша спокойно.',
          'Нажмите «Стоп», когда подбородок «отпускает»: разглаживаются складки кожи спереди на шее или голова начинает дрожать.',
          'Две попытки с отдыхом в минуту — приложение возьмёт среднее.',
        ]} />
      )}
      <div className="mt-8 grid place-items-center">
        <motion.div className="font-display text-[110px] leading-none tabular-nums" animate={{ opacity: run !== null ? 1 : 0.5 }}>
          {run !== null ? Math.floor(elapsed) : rest > 0 ? Math.ceil(rest) : trials[0] ?? 0}
        </motion.div>
        <div className="mt-2 text-[14px] text-muted">{run !== null ? 'секунд — держите' : rest > 0 ? 'отдых до второй попытки' : trials.length ? `первая попытка: ${trials[0]} с` : 'секунд'}</div>
      </div>
    </Shell>
  );
}

// ——— Числа: масса и шея, акромион ———
function NumberFlow({ kind, onClose }: { kind: 'body' | 'acromion'; onClose: () => void }) {
  const addCheck = useStore(s => s.addCheck);
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const num = (s: string) => (s.trim() ? Number(s.replace(',', '.')) : undefined);
  const va = num(a), vb = num(b);
  const ok = (va !== undefined && !Number.isNaN(va)) || (vb !== undefined && !Number.isNaN(vb));
  const body = kind === 'body';
  const save = () => {
    addCheck({ id: `${Date.now()}`, at: new Date().toISOString(), kind, values: body ? { weight: va, neck: vb } : { left: va, right: vb } });
    onClose();
  };
  const field = (label: string, unit: string, v: string, set: (s: string) => void) => (
    <label className="card flex items-center gap-3 px-5 py-4">
      <span className="flex-1 text-[15px] font-medium">{label}</span>
      <input inputMode="decimal" value={v} onChange={e => set(e.target.value)} placeholder="—" className="font-display w-24 bg-transparent text-right text-[28px] outline-none" />
      <span className="text-[14px] text-muted">{unit}</span>
    </label>
  );
  return (
    <Shell title={body ? 'Масса и шея' : 'Плечи лёжа'} overline={body ? 'Замер лица' : 'Замер осанки'} onClose={onClose} footer={<PrimaryButton disabled={!ok} onClick={save}>Сохранить</PrimaryButton>}>
      <p className="mt-3 text-[15px] text-muted">
        {body ? 'Размеры лица тесно связаны с массой тела и окружностью шеи. Записывайте среднюю массу за неделю (утром, натощак) и окружность шеи под кадыком.'
          : 'Лёжа на спине на твёрдом полу, руки вдоль тела. Помощник линейкой или угольником измеряет расстояние от пола до заднего края акромиона — костного выступа на плече.'}
      </p>
      <div className="mt-5 space-y-2.5">
        {body ? <>{field('Масса тела', 'кг', a, setA)}{field('Окружность шеи', 'см', b, setB)}</> : <>{field('Левое плечо', 'мм', a, setA)}{field('Правое плечо', 'мм', b, setB)}</>}
      </div>
      {note(body ? 'Первая заметная на лице цель — около −5 кг, если лишний жир есть.' : 'У молодых мужчин с завёрнутыми плечами — около 59 ± 10 мм. Методики различаются, поэтому сравнивайте только свои замеры во времени.')}
    </Shell>
  );
}

export function CheckFlow({ kind, onClose }: { kind: CheckKind; onClose: () => void }) {
  switch (kind) {
    case 'cva': return <CvaFlow onClose={onClose} />;
    case 'profile': return <ProfileFlow onClose={onClose} />;
    case 'front': return <ProfileFlow onClose={onClose} front />;
    case 'dnf': return <DnfFlow onClose={onClose} />;
    case 'body': case 'acromion': return <NumberFlow kind={kind} onClose={onClose} />;
  }
}

// ——— Проверка техники ———
export function TechCheck({ block, onClose }: { block: BlockId; onClose: () => void }) {
  const passTech = useStore(s => s.passTech);
  const items = TECH_CHECK[block];
  const [ok, setOk] = useState<Record<string, boolean>>({});
  const [result, setResult] = useState<boolean | null>(null);
  const all = items.every(i => ok[i.id]);
  const finish = () => {
    if (all) passTech(block);
    setResult(all);
  };
  if (result !== null) return (
    <Shell title={result ? 'Техника чистая' : 'Ещё немного практики'} overline={BLOCKS[block].title} onClose={onClose} footer={<PrimaryButton onClick={onClose}>Готово</PrimaryButton>}>
      <p className="mt-4 text-[15px] leading-relaxed text-muted">
        {result ? 'Проверка засчитана на этом уровне. Переход откроется, когда наберутся три занятия подряд «с запасом» и пройдёт срок уровня.'
          : 'Отработайте пункты без отметки на следующих занятиях — на 3D-демонстрации в описании упражнения видно, какие мышцы должны молчать. Проверку можно повторить в любой день.'}
      </p>
    </Shell>
  );
  return (
    <Shell title="Проверка техники" overline={BLOCKS[block].title} onClose={onClose} footer={<PrimaryButton onClick={finish}>Готово</PrimaryButton>}>
      <p className="mt-3 text-[15px] text-muted">Сделайте одно-два упражнения уровня и честно отметьте, что получается.</p>
      <div className="mt-4 space-y-2.5">
        {items.map(i => (
          <button key={i.id} type="button" onClick={() => setOk({ ...ok, [i.id]: !ok[i.id] })} aria-pressed={!!ok[i.id]}
            className={`card flex w-full items-start gap-3.5 px-5 py-4 text-left transition ${ok[i.id] ? 'border-gold/70' : ''}`}>
            <span className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border transition ${ok[i.id] ? 'border-gold bg-gold text-on-accent' : 'border-gold/45'}`}>{ok[i.id] && <Check size={14} strokeWidth={3} />}</span>
            <span><span className="block text-[15px] font-medium">{i.text}</span><span className="block text-[13px] leading-snug text-muted">{i.hint}</span></span>
          </button>
        ))}
      </div>
    </Shell>
  );
}

export type { CheckRecord };
