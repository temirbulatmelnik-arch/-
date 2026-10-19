import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, Ban, BookOpen, CalendarClock, Check, ChevronDown, CircleDot, ExternalLink, HeartPulse, PersonStanding, ShieldCheck, Sparkles, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { ExerciseDemo, FigureLegend, GuideText } from '../components/ExerciseDemo';
import { QUICK_FRONT } from '../engine/guides';
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
  ['Miller 1998: сжатие перед кашлем («Knack»)', 'https://pubmed.ncbi.nlm.nih.gov/9670874/'],
  ['Stafford 2016: какие подсказки включают мышцы у мужчин', 'https://onlinelibrary.wiley.com/doi/10.1002/nau.22745'],
  ['Cochrane 2024: подходы к тренировке тазового дна', 'https://www.cochranelibrary.com/cdsr/doi/10.1002/14651858.CD009508.pub2/full'],
  ['García-Sánchez 2019: параметры программ тренировки, мета-анализ', 'https://www.mdpi.com/1660-4601/16/22/4358'],
  ['Bø & Talseth 1996: результат через 5 лет и поддержка', 'https://pubmed.ncbi.nlm.nih.gov/8559536/'],
  ['Dorey 2004: упражнения при подтекании после мочеиспускания', 'https://uwe-repository.worktribe.com/output/1056650/pelvic-floor-exercises-for-treating-post-micturition-dribble-in-men-with-erectile-dysfunction-a-randomised-controlled-trial'],
  ['Yani 2022: неумение расслаблять тазовое дно у мужчин с тазовой болью', 'https://www.urotoday.com/recent-abstracts/men-s-health/prostatitis/137529-impaired-ability-to-relax-pelvic-floor-muscles-in-men-with-chronic-prostatitis-chronic-pelvic-pain-syndrome.html'],
  ['3D-анатомия: Z-Anatomy (CC BY-SA 4.0) на основе BodyParts3D, DBCLS (CC BY-SA 2.1 JP)', 'https://github.com/LluisV/Z-Anatomy'],
  ['3D-модель тела: MakeHuman (CC0)', 'http://www.makehumancommunity.org'],
];

/** упражнения в 3D; у быстрых — две подсказки, сзади и спереди */
const TYPES: { type: BlockType; front?: boolean; title: string }[] = [
  { type: 'breath', title: BLOCK_INFO.breath.title },
  { type: 'slow', title: BLOCK_INFO.slow.title },
  { type: 'quick', title: BLOCK_INFO.quick.title },
  { type: 'quick', front: true, title: 'Быстрые: спереди' },
  { type: 'endurance', title: BLOCK_INFO.endurance.title },
  { type: 'knack', title: BLOCK_INFO.knack.title },
  { type: 'lift', title: BLOCK_INFO.lift.title },
  { type: 'release', title: BLOCK_INFO.release.title },
];
const POSITIONS: [Position, string][] = [['sitting', 'Сидя'], ['standing', 'Стоя']];

function Exercises3D() {
  const [sel, setSel] = useState(1);
  const { type, front, title } = TYPES[sel];
  const [position, setPosition] = useState<Position>('sitting');
  const chip = (on: boolean) => `shrink-0 rounded-full px-3 py-1.5 text-[14px] font-medium transition ${on ? 'bg-ink text-bg' : 'bg-surface-2 text-muted'}`;
  return (
    <div>
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-3">
        {TYPES.map((t, i) => <button key={t.title} type="button" onClick={() => setSel(i)} aria-pressed={i === sel} className={chip(i === sel)}>{t.title}</button>)}
      </div>
      <div className="mb-3 flex gap-2">
        {POSITIONS.map(([p, label]) => <button key={p} type="button" onClick={() => setPosition(p)} aria-pressed={p === position} className={chip(p === position)}>{label}</button>)}
      </div>
      <ExerciseDemo key={title} type={type} position={position} front={front} />
      <div className="mt-2"><FigureLegend /></div>
      <h3 className="mt-5 mb-2 text-[18px] font-semibold">{title}</h3>
      <GuideText type={type} guide={front ? QUICK_FRONT : undefined} />
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
            <b>Как найти:</b> сядьте на твёрдый стул и представьте, что сдерживаете газы. Сожмите кольцо вокруг заднего прохода и
            подтяните его вверх и внутрь — как будто втягиваете. Сиденье подскажет: промежность чуть отрывается от него вверх.
            Это они.
          </p>
          <p className="mt-3">
            <b>Вторая подсказка — спереди:</b> «укоротите пенис, подтяните яички». У мужчин она сильнее включает переднюю часть
            тазового дна, а задний проход подтягивается вместе с ней. В программе есть подходы с обеими подсказками.
          </p>
          <p className="mt-3 text-muted">
            Проверка: у зеркала основание пениса слегка втягивается, яички поднимаются; промежность за мошонкой уходит вверх,
            а не выпячивается; ягодицы мягкие; задний проход втягивается. Каждые 3 недели приложение просит пройти такую проверку
            и самотест силы — без неё не предложит следующий уровень.
          </p>
        </Section>

        <Section icon={<ShieldCheck size={20} />} title="Как правильно">
          <ul className="space-y-2.5">
            <Do>В медленных удержаниях сжимайте <b>на максимум</b>, вверх и внутрь: нагрузку задаёт сила, а не секунды.</Do>
            <Do>После <b>каждого</b> повтора отпускайте полностью: промежность возвращается на место.</Do>
            <Do>Дышите свободно, не тужьтесь: можно считать вслух — так задержать дыхание невозможно.</Do>
            <Do>Отдыхайте между сжатиями не меньше, чем длилось сжатие, а после 10-секундных — чуть дольше.</Do>
            <Do>Начинайте сидя на твёрдом стуле, затем переходите к упражнениям стоя.</Do>
            <Do>Лучше меньше, но правильно: если мышца устала и «уплывает», остановитесь.</Do>
            <Do>Опорожните мочевой пузырь перед тренировкой.</Do>
          </ul>
          <h3 className="mt-5 mb-2 text-[15px] font-semibold">Частые ошибки</h3>
          <ul className="space-y-2.5">
            <Dont>Задерживать дыхание или тужиться вниз.</Dont>
            <Dont>Сжимать вполсилы там, где нужен максимум, и не отмечать, что сжатие ослабевало.</Dont>
            <Dont>Сжимать ягодицы, бёдра, сильно втягивать живот.</Dont>
            <Dont>Не расслабляться до конца между повторами.</Dont>
            <Dont>Останавливать струю мочи как упражнение — это мешает нормальному опорожнению.</Dont>
            <Dont>Делать сотни сжатий в день: перетренированная мышца становится зажатой и болезненной.</Dont>
          </ul>
        </Section>

        <Section icon={<Sparkles size={20} />} title="Навыки на каждый день">
          <ul className="space-y-3">
            <li><b>Сжатие перед нагрузкой («Knack»).</b> Перед кашлем, чиханием, приседом, подъёмом тяжести сожмите сфинктер за секунду до усилия и держите, пока оно идёт. В программе это отдельное упражнение с 5-го уровня. В зале — перед тем как напрячь корпус на тяжёлом подходе.</li>
            <li><b>Выжимание после туалета.</b> Сразу после мочеиспускания сильно сожмите тазовое дно на пару секунд: так выходят последние капли из уретры. У мужчин этот приём уменьшал подтекание после туалета.</li>
            <li><b>Удержание позыва.</b> При внезапном позыве остановитесь, сожмите сфинктер, спокойно дышите и подождите, пока позыв ослабнет.</li>
            <li><b>Туалет без натуживания.</b> Подставка под ноги (колени выше бёдер), наклон вперёд, спокойный выдох. Не сидите в туалете с телефоном.</li>
            <li><b>Мягкий стул.</b> Клетчатка, вода, движение. Запоры и натуживание — главные враги тазового дна.</li>
            <li><b>Привычки-якоря.</b> Сделайте пару сжатий, когда ждёте чайник, стоите на светофоре, сидите в транспорте.</li>
          </ul>
        </Section>

        <Section icon={<CalendarClock size={20} />} title="Чего ждать и когда">
          <ul className="space-y-3">
            <li><b>2–4 недели</b> — легче находить мышцы и держать сжатие без ягодиц. Рост пока в основном нервный: мозг учится включать мышцу.</li>
            <li><b>4–8 недель</b> — лучше контроль: сжатие точнее, быстрее и вовремя.</li>
            <li><b>3–6 месяцев</b> — сила и выносливость самой мышцы. Поэтому на каждом уровне не меньше двух недель, весь путь — 3–5 месяцев.</li>
            <li><b>Дальше</b> — поддержка: 2–3 полные тренировки в неделю и ежедневный «Knack». Без них результат постепенно уходит.</li>
          </ul>
          <p className="mt-4 rounded-2xl bg-surface-2 p-3 text-[14px] text-muted">
            <b className="text-ink">Про «крепкий и узкий».</b> Тренировка делает наружный сфинктер сильнее, выносливее, быстрее и управляемее:
            при сжатии он плотнее закрывает проход и вовремя включается при кашле и нагрузке. Давление в покое создаёт в основном внутренний,
            непроизвольный сфинктер — его тонус упражнения стойко не повышают, анатомия тоже не меняется.
            Здоровая мышца умеет и сжиматься, и полностью расслабляться: поэтому в каждой тренировке есть расслабление.
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
          <p className="mt-4 font-semibold">Остановите укрепление — только расслабление и консультация специалиста по тазовому дну, если:</p>
          <ul className="mt-3 space-y-2.5">
            <Dont>появилась боль при семяизвержении;</Dont>
            <Dont>после тренировок болит промежность, яички или прямая кишка;</Dont>
            <Dont>кажется, что мышца «не отпускается»: напряжение остаётся после сжатия.</Dont>
          </ul>
        </Section>

        <Section icon={<Ban size={20} />} title="Приборы и стимуляция">
          <p>
            Если вы умеете правильно сжиматься, ничего не добавляют: электростимуляция, кресла с магнитной стимуляцией (HIFEM),
            стимуляция нервов, гипопрессивные упражнения, тренировка с баллоном. В исследованиях они не давали эффекта сверх упражнений
            у тех, кто умеет сокращать мышцы.
          </p>
          <p className="mt-3 text-muted">
            Датчик (БОС) или визит к физиотерапевту по тазовому дну имеет смысл, если вы не уверены в технике — например, проверка
            в приложении не проходит. Специалист проверит сжатие пальпацией и подскажет, что исправить.
          </p>
        </Section>

        <Section icon={<HeartPulse size={20} />} title="Что говорит наука">
          <p>
            Упражнения для сфинктера — первая линия лечения при слабости и недержании, их рекомендуют памятки NHS. Метода лучше
            упражнений для того, кто умеет правильно сжиматься, нет: датчики и стимуляция помогают в основном тем, кто не умеет.
          </p>
          <p className="mt-3">
            Больше ~24 сокращений в день эффекта уже не добавляет. Решают другое: правильное сжатие, сила каждого сокращения,
            своевременность под нагрузкой и месяцы регулярности. Поэтому в «Тонусе» одна основная тренировка в день (30–44 сокращения),
            проверка техники каждые 3 недели, «Knack» и не меньше двух недель на уровне.
          </p>
          <p className="mt-3">
            Исследований на здоровых мужчинах почти нет: данные перенесены с женщин и мужчин-пациентов — после операций на простате,
            с недержанием, с нарушениями эрекции. Поэтому приложение обещает только доказанное: сильнее, выносливее и управляемее.
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
