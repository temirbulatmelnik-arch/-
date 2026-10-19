import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, BookOpen, CalendarClock, Check, ChevronDown, CircleDot, ExternalLink, HeartPulse, PersonStanding, ShieldCheck, Sparkles, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { ExerciseDemo, FigureLegend, GuideText } from '../components/ExerciseDemo';
import { PelvisDiagram } from '../components/PelvisDiagram';
import { BLOCK_INFO, type BlockType, type Position } from '../engine/program';
import { ScreenHeader } from '../components/ui';

function Section({ icon, title, children, open: initial = false }: { icon: ReactNode; title: string; children: ReactNode; open?: boolean }) {
  const [open, setOpen] = useState(initial);
  return (
    <section className="card overflow-hidden">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center gap-3 p-4 text-left">
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-surface-2 text-calm">{icon}</span>
        <span className="flex-1 text-[16px] font-semibold">{title}</span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} className="text-muted"><ChevronDown size={20} /></motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }}>
            <div className="px-4 pb-5 text-[15px] leading-relaxed">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

const Do = ({ children }: { children: ReactNode }) => (
  <li className="flex gap-2.5"><Check size={18} className="mt-1 shrink-0 text-calm" strokeWidth={3} /><span>{children}</span></li>
);
const Dont = ({ children }: { children: ReactNode }) => (
  <li className="flex gap-2.5"><X size={18} className="mt-1 shrink-0 text-squeeze" strokeWidth={3} /><span>{children}</span></li>
);

const SOURCES: [string, string][] = [
  ['NHS: упражнения для мышц тазового дна (мужчины)', 'https://royalpapworth.nhs.uk/application/files/5415/5844/9803/PI_104_Pelvic_floor_exercise_for_men_vs2.pdf'],
  ['NHS: упражнения для анального сфинктера (St George’s)', 'https://www.stgeorges.nhs.uk/wp-content/uploads/2025/04/PHP_LCYB.pdf'],
  ['NHS: упражнения для анального сфинктера (Gloucestershire)', 'https://gloshospitals.nhs.uk/your-visit/patient-information-leaflets/anal-sphincter-exercises-women'],
  ['NHS: мышцы тазового дна (Berkshire)', 'https://www.berkshirehealthcare.nhs.uk/media/168314/pelvic_floor_muscles_leaflet.pdf'],
  ['Cochrane: биофидбэк и упражнения для сфинктера при недержании кала', 'https://cochranelibrary.com/cdsr/doi/10.1002/14651858.CD002111.pub3/information/ro'],
  ['Обзор программ тренировки тазового дна у мужчин', 'https://portfolio.jcu.edu.au/Publications/JCU174411'],
  ['3D-анатомия: Z-Anatomy (CC BY-SA 4.0) на основе BodyParts3D, DBCLS (CC BY-SA 2.1 JP)', 'https://github.com/LluisV/Z-Anatomy'],
  ['3D-модель тела: MakeHuman (CC0)', 'http://www.makehumancommunity.org'],
];

const TYPES: BlockType[] = ['breath', 'slow', 'quick', 'lift', 'endurance', 'release'];
const POSITIONS: [Position, string][] = [['lying', 'Лёжа'], ['sitting', 'Сидя'], ['standing', 'Стоя']];

function Exercises3D() {
  const [type, setType] = useState<BlockType>('slow');
  const [position, setPosition] = useState<Position>('lying');
  const chip = (on: boolean) => `shrink-0 rounded-full px-3 py-1.5 text-[14px] font-medium transition ${on ? 'bg-ink text-bg' : 'bg-surface-2 text-muted'}`;
  return (
    <div>
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-3">
        {TYPES.map(t => <button key={t} type="button" onClick={() => setType(t)} aria-pressed={t === type} className={chip(t === type)}>{BLOCK_INFO[t].title}</button>)}
      </div>
      <div className="mb-3 flex gap-2">
        {POSITIONS.map(([p, label]) => <button key={p} type="button" onClick={() => setPosition(p)} aria-pressed={p === position} className={chip(p === position)}>{label}</button>)}
      </div>
      <ExerciseDemo type={type} position={position} />
      <div className="mt-2"><FigureLegend /></div>
      <h3 className="mt-5 mb-2 text-[18px] font-semibold">{BLOCK_INFO[type].title}</h3>
      <GuideText type={type} />
    </div>
  );
}

export function Learn() {
  return (
    <div className="pb-4">
      <ScreenHeader title="Техника" subtitle="Как делать правильно и безопасно" />
      <div className="space-y-3 px-5">
        <Section icon={<PersonStanding size={20} />} title="Упражнения в 3D" open>
          <Exercises3D />
        </Section>

        <Section icon={<CircleDot size={20} />} title="Где эти мышцы">
          <PelvisDiagram />
          <p className="mt-4">
            Мышцы тазового дна натянуты, как гамак, от лобковой кости до копчика. Вокруг заднего прохода — кольцо
            сфинктера. Они держат газы и стул, поддерживают органы малого таза и участвуют в половой функции.
          </p>
          <p className="mt-3">
            <b>Как найти:</b> сидя или лёжа представьте, что сдерживаете газы. Сожмите кольцо вокруг заднего прохода и
            подтяните его вверх и внутрь — как будто втягиваете. Почувствовали подъём промежности — это они.
          </p>
          <p className="mt-3 text-muted">
            Проверка: положите ладонь на ягодицы — при правильном сжатии они остаются мягкими. Задний проход
            втягивается внутрь, а не выталкивается наружу.
          </p>
        </Section>

        <Section icon={<ShieldCheck size={20} />} title="Как правильно">
          <ul className="space-y-2.5">
            <Do>Сжимайте <b>вверх и внутрь</b>, без рывка, а затем <b>полностью</b> отпускайте.</Do>
            <Do>Дышите свободно: можно считать вслух — так задержать дыхание невозможно.</Do>
            <Do>Отдыхайте между сжатиями не меньше, чем длилось сжатие.</Do>
            <Do>Начинайте лёжа, затем сидя, потом стоя.</Do>
            <Do>Лучше меньше, но правильно: если мышца устала и «уплывает», остановитесь.</Do>
            <Do>Опорожните мочевой пузырь перед тренировкой.</Do>
          </ul>
          <h3 className="mt-5 mb-2 text-[15px] font-semibold">Частые ошибки</h3>
          <ul className="space-y-2.5">
            <Dont>Задерживать дыхание или тужиться вниз.</Dont>
            <Dont>Сжимать ягодицы, бёдра, сильно втягивать живот.</Dont>
            <Dont>Не расслабляться до конца между повторами.</Dont>
            <Dont>Останавливать струю мочи как упражнение — это мешает нормальному опорожнению.</Dont>
            <Dont>Делать сотни сжатий в день: перетренированная мышца становится зажатой и болезненной.</Dont>
          </ul>
        </Section>

        <Section icon={<Sparkles size={20} />} title="Навыки на каждый день">
          <ul className="space-y-3">
            <li><b>Сжатие перед нагрузкой.</b> Перед кашлем, чиханием, смехом, подъёмом тяжести коротко сожмите сфинктер и держите во время усилия.</li>
            <li><b>Удержание позыва.</b> При внезапном позыве остановитесь, сожмите сфинктер, спокойно дышите и подождите, пока позыв ослабнет.</li>
            <li><b>Туалет без натуживания.</b> Подставка под ноги (колени выше бёдер), наклон вперёд, спокойный выдох. Не сидите в туалете с телефоном.</li>
            <li><b>Мягкий стул.</b> Клетчатка, вода, движение. Запоры и натуживание — главные враги тазового дна.</li>
            <li><b>Привычки-якоря.</b> Сделайте пару сжатий, когда ждёте чайник, стоите на светофоре, сидите в транспорте.</li>
          </ul>
        </Section>

        <Section icon={<CalendarClock size={20} />} title="Чего ждать и когда">
          <ul className="space-y-3">
            <li><b>2–3 недели</b> — легче находить мышцы и держать сжатие без помощи ягодиц.</li>
            <li><b>3–6 недель</b> — обычно заметны первые изменения: сжатие сильнее, контроль лучше.</li>
            <li><b>3–6 месяцев</b> — устойчивый результат. Дальше хватит поддерживающего уровня 1–2 раза в день.</li>
          </ul>
          <p className="mt-4 rounded-2xl bg-surface-2 p-3 text-[14px] text-muted">
            <b className="text-ink">Про «крепкий и узкий».</b> Тренировка не меняет анатомию, но повышает силу и выносливость сжатия,
            тонус и контроль сфинктера — субъективно это ощущается как более «плотный» и собранный задний проход.
            Здоровая мышца при этом умеет и сжиматься, и полностью расслабляться: именно поэтому в каждой тренировке есть блок расслабления.
          </p>
        </Section>

        <Section icon={<AlertTriangle size={20} />} title="Когда сначала к врачу">
          <p>Покажитесь проктологу, урологу или гинекологу, а лучше — специалисту по реабилитации тазового дна, если:</p>
          <ul className="mt-3 space-y-2.5">
            <Dont>есть кровь в стуле, боль в заднем проходе, изменился стул без видимой причины — это нужно проверить в первую очередь;</Dont>
            <Dont>есть анальная трещина или острый геморрой: при них сфинктер часто и так в спазме, укрепление может навредить;</Dont>
            <Dont>недавно была операция на прямой кишке, простате, мочевом пузыре или роды — начинайте только по согласованию с врачом;</Dont>
            <Dont>упражнения вызывают боль, а после них — чувство неполного опорожнения, запор, трудно начать мочеиспускание. Это признаки перенапряжения мышц: нужна работа над расслаблением, а не над силой;</Dont>
            <Dont>есть недержание газов или кала — упражнения помогают, но врач подберёт программу и, возможно, биофидбэк.</Dont>
          </ul>
        </Section>

        <Section icon={<HeartPulse size={20} />} title="Что говорит наука">
          <p>
            Упражнения для сфинктера — первая линия лечения при слабости и недержании, их рекомендуют памятки NHS.
            Обзор Cochrane (21 исследование, 1525 участников) показывает, что доказательства пока скромные; в одном исследовании
            упражнения с биофидбэком (датчиком) дали лучший результат, чем упражнения без него.
          </p>
          <p className="mt-3">
            Единой «правильной» схемы нет: в исследованиях от 18 до 240 сокращений в день. Программа «Тонуса» держится в середине
            этого диапазона и опирается на схему NHS: медленные удержания до 10 секунд, быстрые сокращения, 3 раза в день.
          </p>
          <p className="mt-3 text-muted">Приложение — не медицинское изделие и не заменяет консультацию врача.</p>
        </Section>

        <Section icon={<BookOpen size={20} />} title="Источники">
          <ul className="space-y-2">
            {SOURCES.map(([name, url]) => (
              <li key={url}>
                <a href={url} target="_blank" rel="noreferrer" className="flex items-start gap-2 text-ink underline decoration-line underline-offset-4">
                  <ExternalLink size={16} className="mt-1 shrink-0 text-muted" /> {name}
                </a>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </div>
  );
}
