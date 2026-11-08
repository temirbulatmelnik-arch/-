// Нижняя панель вкладок как в iOS: стекло, иконки-рисунки, плывущая подсветка активной вкладки.
import { motion } from 'motion/react';
import type { ReactElement } from 'react';
import type { Tab } from '../store';
import { spring } from './motion';

const ICONS: Record<Tab, ReactElement> = {
  today: (<g><circle cx="12" cy="12" r="4.2" /><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" /></g>),
  us: (<g><circle cx="9" cy="12" r="5.2" /><circle cx="15" cy="12" r="5.2" /></g>),
  dates: (<g><rect x="3.5" y="5" width="17" height="15" rx="3" /><path d="M3.5 9.5h17M8 3v4M16 3v4" /><circle cx="15.5" cy="15" r="1.4" fill="currentColor" stroke="none" /></g>),
  charts: (<g><circle cx="12" cy="12" r="8.6" /><circle cx="12" cy="12" r="4.2" /><path d="M12 3.4v4.4M12 16.2v4.4M3.4 12h4.4M16.2 12h4.4" /></g>),
};
const LABEL: Record<Tab, string> = { today: 'Сегодня', us: 'Мы', dates: 'Даты', charts: 'Карты' };

export function TabBar({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 px-3">
      <div className="glass mx-auto flex max-w-[520px] rounded-[26px] p-1.5 shadow-[0_10px_40px_rgba(0,0,0,.35)]">
        {(Object.keys(LABEL) as Tab[]).map(t => (
          <button key={t} onClick={() => onChange(t)} aria-current={tab === t ? 'page' : undefined}
            className={`relative flex flex-1 flex-col items-center gap-0.5 rounded-[20px] py-1.5 text-[12px] font-semibold transition-colors duration-200 ${tab === t ? 'text-brass' : 'text-faint'}`}>
            {tab === t && <motion.span layoutId="tab-pill" transition={spring} className="absolute inset-0 -z-10 rounded-[20px] bg-[color:var(--brass-soft)]" />}
            <motion.svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"
              animate={{ scale: tab === t ? 1.08 : 1, rotate: tab === t && t === 'today' ? 30 : 0 }} transition={spring}>{ICONS[t]}</motion.svg>
            {LABEL[t]}
          </button>
        ))}
      </div>
    </nav>
  );
}
