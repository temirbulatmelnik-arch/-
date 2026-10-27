// Стопка карточек на «Неделе», как в Wallet: открыта одна, остальные лежат стопкой и показывают только главное.
// Цвет карточки — по смыслу: сегодня — Нева, платежи — закат, дела — золото, резерв — сумерки (index.css, --stack-*).
import { motion } from 'motion/react';
import type { ReactNode } from 'react';

export type StackTone = 'today' | 'ahead' | 'todo' | 'money';

export interface StackCard {
  id: string;
  tone: StackTone;
  kicker: ReactNode;
  title: ReactNode;
  amount?: ReactNode;
  /** заголовок карточки требует внимания: просрочка, перерасход */
  alert?: boolean;
  body: ReactNode;
}

export function CardStack({ cards, open, onOpen }: { cards: StackCard[]; open: string | null; onOpen: (id: string | null) => void }) {
  return (
    <div className="flex flex-col">
      {cards.map((c, i) => {
        const isOpen = open === c.id;
        const last = i === cards.length - 1;
        return (
          <section key={c.id} className="relative overflow-hidden rounded-[24px] border"
            style={{ marginTop: i ? -14 : 0, background: `var(--stack-${c.tone})`, borderColor: `var(--stack-${c.tone}-line)`, boxShadow: 'var(--stack-shadow)' }}>
            {/* свёрнутая карточка оставляет снизу место под край следующей — заголовок не перекрывается */}
            <button type="button" onClick={() => onOpen(isOpen ? null : c.id)} aria-expanded={isOpen}
              className="flex w-full items-center gap-3 px-[18px] pt-4 text-left transition-[padding] duration-300"
              style={{ paddingBottom: isOpen || last ? 16 : 30 }}>
              <span className="min-w-0 flex-1">
                <span className="block text-[12.5px]" style={{ color: c.alert ? 'var(--neg)' : `var(--stack-${c.tone}-kicker)` }}>{c.kicker}</span>
                <span className="mt-0.5 block truncate text-[16px] font-medium">{c.title}</span>
              </span>
              {c.amount != null && <span className={`figure shrink-0 text-[17px] ${c.alert ? 'text-neg' : ''}`}>{c.amount}</span>}
            </button>
            <motion.div initial={false} animate={{ height: isOpen ? 'auto' : 0 }} transition={{ type: 'spring', stiffness: 380, damping: 38 }}
              className="overflow-hidden" inert={!isOpen}>
              <div className="px-0.5 pb-3">{c.body}</div>
            </motion.div>
          </section>
        );
      })}
    </div>
  );
}
