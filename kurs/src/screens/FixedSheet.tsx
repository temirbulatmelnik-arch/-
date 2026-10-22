// Обязательные ежемесячные платежи: у каждого своя дата и сумма (связь 8-го, спортзал 12-го, подписка 22-го).
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Money, PrimaryButton, Sheet } from '../components/ui';
import { monthKey, today } from '../domain/dates';
import { parseAmount } from '../domain/money';
import type { FixedItem } from '../domain/types';
import { useStore } from '../store/store';
import { toast, useUi } from '../store/ui';

export function FixedSheet() {
  const open = useUi(s => s.fixed);
  const set = useUi(s => s.set);
  return (
    <Sheet open={open} onClose={() => set({ fixed: false })} title="Обязательные платежи" subtitle="Связь, спортзал, подписки — каждый в свой день">
      {open && <Body onClose={() => set({ fixed: false })} />}
    </Sheet>
  );
}

interface Draft { id: string; name: string; day: string; amount: string; from?: string; note?: string }

function Body({ onClose }: { onClose: () => void }) {
  const fixed = useStore(s => s.fixed);
  const setFixed = useStore(s => s.setFixed);
  const [rows, setRows] = useState<Draft[]>(fixed.map(f => ({ ...f, day: String(f.day), amount: String(f.amount) })));
  const patch = (i: number, p: Partial<Draft>) => setRows(r => r.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const total = rows.reduce((s, r) => s + (parseAmount(r.amount) ?? 0), 0);
  const valid = rows.every(r => r.name.trim() && Number(r.day) >= 1 && Number(r.day) <= 31 && (parseAmount(r.amount) ?? 0) > 0);

  const save = () => {
    const list: FixedItem[] = rows.map(r => ({ id: r.id, name: r.name.trim(), day: Number(r.day), amount: parseAmount(r.amount)!, ...(r.from ? { from: r.from } : {}), ...(r.note ? { note: r.note } : {}) }));
    setFixed(list);
    toast('Обязательные платежи сохранены');
    onClose();
  };

  return (
    <div className="space-y-3 pt-1">
      {rows.map((r, i) => (
        <div key={r.id} className="card space-y-2 p-3">
          <div className="flex gap-2">
            <input value={r.name} onChange={e => patch(i, { name: e.target.value })} placeholder="Название" className="field" />
            <button type="button" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label="Удалить" className="grid w-12 shrink-0 place-items-center rounded-[14px] bg-surface-2 text-muted"><Trash2 size={16} strokeWidth={1.5} /></button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex items-center gap-2 rounded-[14px] bg-surface-2 px-3">
              <input value={r.day} onChange={e => patch(i, { day: e.target.value.replace(/\D/g, '').slice(0, 2) })} inputMode="numeric" className="w-full bg-transparent py-3 text-[16px] outline-none" aria-label="Число месяца" />
              <span className="shrink-0 text-[13px] text-muted">-го</span>
            </label>
            <label className="flex items-center gap-2 rounded-[14px] bg-surface-2 px-3">
              <input value={r.amount} onChange={e => patch(i, { amount: e.target.value })} inputMode="decimal" className="w-full bg-transparent py-3 text-[16px] outline-none" aria-label="Сумма" />
              <span className="shrink-0 text-[13px] text-muted">₽</span>
            </label>
          </div>
        </div>
      ))}
      <button type="button" onClick={() => setRows([...rows, { id: `fixed-${Date.now().toString(36)}`, name: '', day: String(new Date().getDate()), amount: '', from: monthKey(today()) }])}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-line text-[14px] text-muted"><Plus size={16} /> Добавить платёж</button>
      <div className="flex items-baseline justify-between px-1 pt-1 text-[13px] text-muted"><span>Итого в месяц</span><Money value={total} className="text-[15px] text-ink" /></div>
      <PrimaryButton onClick={save} disabled={!valid}>Сохранить</PrimaryButton>
      <p className="text-center text-[12px] leading-snug text-faint">Новые даты сразу появятся в календаре. Отметки «оплачено» за прошлые месяцы сохранятся.</p>
    </div>
  );
}
