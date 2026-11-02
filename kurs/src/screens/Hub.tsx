// «Банк и чат»: всё, что приходит снаружи, в одном месте — выписка и скриншоты, воскресная сверка, обмен с чатом
// «Финансы», премия. Сверху — что приложение знает о счетах сейчас.
import { BellRing, ChevronRight, Gift, MessagesSquare, Repeat, Scale, ScanText, Vault, WalletCards } from 'lucide-react';
import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { item, list } from '../components/motion';
import { runQuick } from '../components/TabBar';
import { Money, Sheet } from '../components/ui';
import { ddmm } from '../domain/dates';
import { useStore } from '../store/store';
import { useUi } from '../store/ui';
import { useLedger } from './Checkup';
import { exportCalendar } from './reminders';

export function HubSheet() {
  const open = useUi(s => s.hub);
  const set = useUi(s => s.set);
  return (
    <Sheet open={open} onClose={() => set({ hub: false })} title="Банк и чат" subtitle="Всё, что приходит из банка и из чата «Финансы»">
      {open && <Body />}
    </Sheet>
  );
}

function Body() {
  const set = useUi(s => s.set);
  const led = useLedger();
  const last = useStore(s => s.checkups.at(-1));
  const go = (id: string) => { set({ hub: false }); window.setTimeout(() => runQuick(id), 180); };
  const open = (p: Parameters<typeof set>[0]) => { set({ hub: false }); window.setTimeout(() => set(p), 180); };

  return (
    <motion.div className="space-y-3 pt-1" variants={list} initial="hidden" animate="show">
      <motion.div variants={item} className="deep-card grid grid-cols-3 gap-2 px-4 py-4">
        <Acc label="Карта ВТБ" value={led.card} />
        <Acc label="Резерв" value={led.reserve} />
        <Acc label={led.creditCard ? `${led.creditCard.short}, долг` : 'Кредитка'} value={led.credit} />
        <p className="col-span-3 mt-1 text-[12px] leading-snug text-card-muted">
          {last ? `По учёту после сверки ${ddmm(last.date)}: траты, платежи и переводы с тех пор учтены.` : 'Сверки ещё не было: цифры — по последнему остатку из банка и чата.'}
        </p>
      </motion.div>

      <Big icon={<ScanText size={21} strokeWidth={1.6} />} title="Из банка" onClick={() => go('scan')}
        text="Текст со скриншота ВТБ, Сбера, Т-Банка, сами скриншоты, выписка PDF или CSV. Траты, оплаченные платежи и поступления — за раз." />
      <Big icon={<Scale size={21} strokeWidth={1.6} />} title="Сверка с банком" onClick={() => go('checkup')}
        text="Остатки на карте, в резерве и на кредитке против учёта: что не внесено и сколько перевести. Лучше в воскресенье вечером." />
      <Big icon={<MessagesSquare size={21} strokeWidth={1.6} />} title="Чат «Финансы»" onClick={() => go('sync')}
        text="Отправить файл в Claude или вставить ответ из чата: план, лимиты, отметки, мост." />
      <Big icon={<Gift size={21} strokeWidth={1.6} />} title="Пришла премия" onClick={() => go('bonus')}
        text="Резерв до следующей премии, остальное сегодня же в долг — по правилам плана." />

      <motion.div variants={item} className="card divide-hair overflow-hidden">
        <Small icon={<WalletCards size={17} strokeWidth={1.5} />} title="Остаток на карте ВТБ" onClick={() => open({ card: true })} />
        <Small icon={<Vault size={17} strokeWidth={1.5} />} title="Резерв и его журнал" onClick={() => open({ reserve: true })} />
        <Small icon={<Repeat size={17} strokeWidth={1.5} />} title="Обязательные платежи" onClick={() => open({ fixed: true })} />
        <Small icon={<BellRing size={17} strokeWidth={1.5} />} title="Напоминания в календарь iPhone" onClick={() => exportCalendar()} />
      </motion.div>
      <motion.p variants={item} className="px-1 pb-1 text-[12px] leading-snug text-faint">Удержите «+» внизу — эти действия раскроются веером.</motion.p>
    </motion.div>
  );
}

function Acc({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-[11.5px] text-card-muted">{label}</div>
      {value == null ? <div className="mt-0.5 text-[14px] text-card-muted">нет данных</div> : <Money value={value} className="figure mt-0.5 block text-[17px] leading-tight" />}
    </div>
  );
}

function Big({ icon, title, text, onClick }: { icon: ReactNode; title: string; text: string; onClick: () => void }) {
  return (
    <motion.button variants={item} type="button" onClick={onClick} whileTap={{ scale: 0.98 }} className="card flex w-full items-start gap-3.5 p-4 text-left">
      <span className="grid size-11 shrink-0 place-items-center rounded-[15px] bg-sea/12 text-sea">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15.5px] font-medium">{title}</span>
        <span className="mt-0.5 block text-[12.5px] leading-snug text-muted">{text}</span>
      </span>
      <ChevronRight size={17} className="mt-3 shrink-0 text-faint" />
    </motion.button>
  );
}

function Small({ icon, title, onClick }: { icon: ReactNode; title: string; onClick: () => void }) {
  return (
    <motion.button type="button" whileTap={{ scale: 0.98 }} onClick={onClick} className="flex w-full items-center gap-3 px-4 py-3 text-left text-[14px]">
      <span className="text-muted">{icon}</span>
      <span className="min-w-0 flex-1">{title}</span>
      <ChevronRight size={15} className="shrink-0 text-faint" />
    </motion.button>
  );
}
