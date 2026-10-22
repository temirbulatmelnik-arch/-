// Загрузка скриншотов, PDF, CSV или текста → что на них → что обновить в приложении.
import { AlertTriangle, Camera, Check, ClipboardPaste, FileSpreadsheet, KeyRound, Loader2 } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { Chip, PrimaryButton, SecondaryButton, Sheet } from '../components/ui';
import { ddmm, today } from '../domain/dates';
import { rub } from '../domain/money';
import { CATEGORIES } from '../domain/plan';
import { fromAi, fromDrafts, type Proposal, type Review } from '../domain/proposals';
import { parseCsv, parseText } from '../domain/statements';
import type { CategoryId, Source } from '../domain/types';
import { useStore } from '../store/store';
import { toast, useUi } from '../store/ui';

export function ScanSheet() {
  const open = useUi(s => s.scan);
  const set = useUi(s => s.set);
  return (
    <Sheet open={open} onClose={() => set({ scan: false })} title="Загрузить из банка">
      {open && <Flow />}
    </Sheet>
  );
}

type Step = { s: 'pick' } | { s: 'text' } | { s: 'busy'; label: string } | { s: 'review'; review: Review } | { s: 'error'; text: string };

function ctx() {
  const st = useStore.getState();
  return { cal: st, marks: st.marks, expenses: st.expenses, reserve: st.reserve, now: today() };
}

function Flow() {
  const [step, setStep] = useState<Step>({ s: 'pick' });
  const [note, setNote] = useState('');
  const apiKey = useStore(s => s.settings.apiKey);
  const model = useStore(s => s.settings.model);
  const setSettings = useStore(s => s.setSettings);
  const [keyDraft, setKeyDraft] = useState('');
  const shots = useRef<HTMLInputElement>(null);
  const csv = useRef<HTMLInputElement>(null);

  const runAi = async (files: File[]) => {
    if (!files.length) return;
    setStep({ s: 'busy', label: files.length > 1 ? `Claude разбирает ${files.length} файла…` : 'Claude разбирает скриншот…' });
    // SDK Anthropic подгружается только здесь — главный экран открывается быстрее
    const { analyze, AiError } = await import('../domain/ai');
    try {
      const c = ctx();
      const r = await analyze({ files, apiKey, model, debts: c.cal.debts, now: c.now, note });
      setStep({ s: 'review', review: fromAi(r, c) });
    } catch (e) {
      setStep({ s: 'error', text: e instanceof AiError ? e.message : `Не получилось: ${(e as Error).message}` });
    }
  };

  const runCsv = async (file?: File) => {
    if (!file) return;
    const buf = await file.arrayBuffer();
    // банки отдают CSV в UTF-8 или Windows-1251
    let text = new TextDecoder('utf-8').decode(buf);
    if (text.includes('�')) text = new TextDecoder('windows-1251').decode(buf);
    const r = parseCsv(text);
    if (!r || !r.rows.length) { setStep({ s: 'error', text: 'Не нашёл в файле столбцы «Дата» и «Сумма». Пришлите скриншот выписки — его разберёт Claude.' }); return; }
    setStep({ s: 'review', review: fromDrafts(r.rows, ctx(), `Выписка: ${r.rows.length} операций. Столбцы: «${r.columns.date}», «${r.columns.amount}», «${r.columns.merchant}».`) });
  };

  if (step.s === 'busy') {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <Loader2 size={36} className="animate-spin text-accent" />
        <div className="text-[16px] font-bold">{step.label}</div>
        <p className="max-w-[260px] text-[13.5px] text-muted">Обычно 10–40 секунд. Не закрывайте приложение.</p>
      </div>
    );
  }
  if (step.s === 'error') {
    return (
      <div className="space-y-4 pt-2">
        <p className="flex items-start gap-2 rounded-2xl bg-danger/10 p-4 text-[14px] leading-snug text-danger"><AlertTriangle size={18} className="mt-0.5 shrink-0" />{step.text}</p>
        <SecondaryButton onClick={() => setStep({ s: 'pick' })} className="w-full">Назад</SecondaryButton>
      </div>
    );
  }
  if (step.s === 'review') return <ReviewList review={step.review} onBack={() => setStep({ s: 'pick' })} />;
  if (step.s === 'text') return <TextPaste onDone={review => setStep({ s: 'review', review })} onBack={() => setStep({ s: 'pick' })} />;

  return (
    <div className="space-y-3 pt-1">
      <input ref={shots} type="file" accept="image/*,application/pdf" multiple hidden onChange={e => { void runAi([...(e.target.files ?? [])]); e.target.value = ''; }} />
      <input ref={csv} type="file" accept=".csv,text/csv,text/plain,.txt" hidden onChange={e => { void runCsv(e.target.files?.[0]); e.target.value = ''; }} />

      <Option icon={<Camera size={22} />} title="Скриншоты или PDF-выписка" tag="Claude"
        text="Список операций, экран кредитки или кредита, чек платежа, зачисление премии, накопительный счёт — приложение само поймёт, что это, и предложит, какие блоки обновить."
        onClick={() => (apiKey ? shots.current?.click() : undefined)} disabled={!apiKey}>
        {apiKey ? (
          <input value={note} onChange={e => setNote(e.target.value)} onClick={e => e.stopPropagation()} placeholder="Комментарий для Claude (необязательно)" className="field mt-3 text-[14px]" />
        ) : (
          <div className="mt-3 space-y-2" onClick={e => e.stopPropagation()}>
            <p className="text-[13px] leading-snug text-muted">Нужен ключ API Anthropic (console.anthropic.com → API Keys). Это отдельно от подписки Claude: оплата за разбор, ≈ 3–5 ₽ за скриншот. Ключ хранится только на этом телефоне.</p>
            <div className="flex gap-2">
              <input value={keyDraft} onChange={e => setKeyDraft(e.target.value)} placeholder="sk-ant-…" autoCapitalize="off" autoCorrect="off" spellCheck={false} className="field text-[14px]" />
              <button type="button" onClick={() => { if (keyDraft.trim().startsWith('sk-')) { setSettings({ apiKey: keyDraft.trim() }); toast('Ключ сохранён'); } else toast('Ключ начинается с sk-ant-'); }}
                className="shrink-0 rounded-2xl bg-accent px-4 text-[14px] font-bold text-on-accent"><KeyRound size={17} /></button>
            </div>
          </div>
        )}
      </Option>

      <Option icon={<ClipboardPaste size={22} />} title="Текст со скриншота" tag="без интернета"
        text="Откройте скриншот в «Фото», удерживайте палец на тексте → «Выбрать всё» → «Скопировать» и вставьте сюда. Подходит для списка операций."
        onClick={() => setStep({ s: 'text' })} />

      <Option icon={<FileSpreadsheet size={22} />} title="Файл выписки CSV" tag="без интернета"
        text="Т-Банк и Альфа выгружают CSV: «Выписка» → «Экспорт». Категории расставятся по названиям магазинов."
        onClick={() => csv.current?.click()} />

      <p className="px-1 pt-1 text-[12px] leading-snug text-faint">Перед применением всё показывается списком — ничего не изменится без вашего «Применить». Скриншоты уходят только в Anthropic по вашему ключу и нигде не хранятся в приложении.</p>
    </div>
  );
}

function Option({ icon, title, tag, text, onClick, disabled, children }: { icon: ReactNode; title: string; tag: string; text: string; onClick: () => void; disabled?: boolean; children?: ReactNode }) {
  return (
    <div role="button" tabIndex={0} onClick={onClick} onKeyDown={e => e.key === 'Enter' && onClick()} className={`card block w-full p-4 text-left transition active:scale-[0.99] ${disabled ? '' : 'cursor-pointer'}`}>
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-accent/12 text-accent">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2"><span className="text-[16px] font-extrabold">{title}</span><Chip tone={tag === 'Claude' ? 'info' : 'neutral'}>{tag}</Chip></span>
          <span className="mt-1 block text-[13.5px] leading-snug text-muted">{text}</span>
        </span>
      </div>
      {children}
    </div>
  );
}

function TextPaste({ onDone, onBack }: { onDone: (r: Review) => void; onBack: () => void }) {
  const [text, setText] = useState('');
  const paste = async () => {
    try { setText(await navigator.clipboard.readText()); } catch { toast('Вставьте вручную: удерживайте палец в поле → «Вставить»'); }
  };
  const run = () => {
    const c = ctx();
    const rows = parseText(text, c.now);
    if (!rows.length) { toast('Не нашёл сумм вида «−350 ₽». Проверьте текст'); return; }
    onDone(fromDrafts(rows, c, `Из текста: ${rows.length} операций. Проверьте даты и категории.`));
  };
  return (
    <div className="space-y-3 pt-1">
      <textarea value={text} onChange={e => setText(e.target.value)} rows={10} placeholder={'Сегодня\nЯндекс Go\n−412 ₽\nВчера\nПятёрочка\n−1 234,56 ₽'} className="field font-mono text-[14px]" />
      <div className="grid grid-cols-2 gap-2">
        <SecondaryButton onClick={paste}>Вставить</SecondaryButton>
        <SecondaryButton onClick={onBack}>Назад</SecondaryButton>
      </div>
      <PrimaryButton onClick={run} disabled={!text.trim()}>Разобрать</PrimaryButton>
    </div>
  );
}

const SOURCE_LABEL: Record<Source, string> = { life: 'карта жизни', credit: 'кредитка!', reserve: 'резерв' };
const NEXT_SOURCE: Record<Source, Source> = { life: 'credit', credit: 'reserve', reserve: 'life' };

function ReviewList({ review, onBack }: { review: Review; onBack: () => void }) {
  const [items, setItems] = useState<Proposal[]>(review.items);
  const store = useStore();
  const set = useUi(s => s.set);
  const patch = (id: string, p: Partial<Proposal>) => setItems(list => list.map(i => (i.id === id ? ({ ...i, ...p } as Proposal) : i)));
  const on = items.filter(i => i.on);

  const apply = () => {
    const txs = on.flatMap(i => (i.type === 'tx' ? [i.tx] : []));
    if (txs.length) store.addExpenses(txs.map(t => ({ date: t.date, amount: t.amount, category: t.category, note: t.merchant, source: t.source, origin: 'ai' as const, fingerprint: t.fingerprint })));
    let bonus: Proposal | undefined;
    for (const i of on) {
      if (i.type === 'debt') {
        store.updateDebt(i.debt.id, { balance: i.balance });
        if (i.event && i.minPayment > 0) store.setOverride(i.event.key, { amount: i.minPayment, ...(i.dueDate ? { date: i.dueDate } : {}) });
      }
      if (i.type === 'mark') store.markEvent(i.event, true, i.amount);
      if (i.type === 'income' && i.event) {
        if (i.bonus && !bonus) bonus = i;
        else if (!i.bonus) store.markEvent(i.event, true, i.amount);
      }
      if (i.type === 'reserve') store.setReserve(i.balance, 'Сверка по скриншоту');
    }
    toast(`Обновлено: ${on.length}`);
    if (bonus && bonus.type === 'income' && bonus.event) set({ scan: false, bonus: { event: { ...bonus.event, amount: bonus.amount } } });
    else set({ scan: false });
  };

  const groups: [string, Proposal['type'][]][] = [['Долги и платежи', ['debt', 'mark']], ['Поступления', ['income']], ['Резерв', ['reserve']], ['Траты', ['tx']]];

  return (
    <div className="space-y-4 pt-1">
      <div className="rounded-2xl bg-accent/10 p-4 text-[14px] leading-snug">{review.summary || 'Готово.'}</div>
      {review.warnings.map((w, k) => (
        <p key={k} className="flex items-start gap-2 rounded-2xl bg-danger/10 p-3 text-[13.5px] leading-snug text-danger"><AlertTriangle size={16} className="mt-0.5 shrink-0" />{w}</p>
      ))}
      {items.length === 0 && <p className="rounded-2xl bg-surface-2 p-4 text-[14px] text-muted">Обновлять нечего: на изображении не нашлось операций, остатков или платежей.</p>}

      {groups.map(([title, types]) => {
        const list = items.filter(i => types.includes(i.type));
        if (!list.length) return null;
        return (
          <section key={title}>
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-[13px] font-bold text-muted">{title}</span>
              {title === 'Траты' && <button type="button" onClick={() => setItems(all => all.map(i => (i.type === 'tx' ? { ...i, on: !list.every(x => x.on) } : i)))} className="text-[13px] font-semibold text-accent">{list.every(x => x.on) ? 'Снять все' : 'Выбрать все'}</button>}
            </div>
            <div className="card divide-y divide-line overflow-hidden">
              {list.map(i => (
                <div key={i.id} className={`flex items-start gap-3 px-3 py-3 ${i.on ? '' : 'opacity-55'}`}>
                  <button type="button" onClick={() => patch(i.id, { on: !i.on })} aria-label={i.on ? 'Не применять' : 'Применить'}
                    className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg border-2 ${i.on ? 'border-accent bg-accent text-on-accent' : 'border-line text-transparent'}`}><Check size={15} strokeWidth={3} /></button>
                  <div className="min-w-0 flex-1"><ProposalBody p={i} onPatch={p => patch(i.id, p)} /></div>
                </div>
              ))}
            </div>
          </section>
        );
      })}

      <div className="grid grid-cols-[auto_1fr] gap-2 pb-2">
        <SecondaryButton onClick={onBack}>Назад</SecondaryButton>
        <PrimaryButton onClick={apply} disabled={!on.length}>Применить {on.length || ''}</PrimaryButton>
      </div>
    </div>
  );
}

function ProposalBody({ p, onPatch }: { p: Proposal; onPatch: (x: Partial<Proposal>) => void }) {
  switch (p.type) {
    case 'tx':
      return (
        <div>
          <div className="flex items-start justify-between gap-2">
            <span className="min-w-0 truncate text-[14.5px] font-semibold">{p.tx.merchant}</span>
            <span className={`shrink-0 text-[14.5px] font-bold ${p.tx.source === 'credit' ? 'text-danger' : ''}`}>{rub(p.tx.amount)}</span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12.5px]">
            <span className="text-muted">{ddmm(p.tx.date)}</span>
            <select value={p.tx.category} onChange={e => onPatch({ tx: { ...p.tx, category: e.target.value as CategoryId } } as Partial<Proposal>)}
              className="rounded-lg bg-surface-2 px-2 py-1 text-[12.5px] font-semibold">
              {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.short}</option>)}
            </select>
            <button type="button" onClick={() => onPatch({ tx: { ...p.tx, source: NEXT_SOURCE[p.tx.source] } } as Partial<Proposal>)}
              className={`rounded-lg px-2 py-1 font-semibold ${p.tx.source === 'credit' ? 'bg-danger/12 text-danger' : 'bg-surface-2'}`}>{SOURCE_LABEL[p.tx.source]}</button>
            {p.tx.duplicate && <Chip tone="warn">уже есть</Chip>}
            {p.tx.skip && <Chip>не трата?</Chip>}
          </div>
        </div>
      );
    case 'debt':
      return (
        <div className="text-[14px] leading-snug">
          <div className="font-semibold">{p.debt.short}: остаток {rub(p.debt.balance)} → <b>{rub(p.balance)}</b></div>
          {p.event && p.minPayment > 0 && <div className="mt-0.5 text-[13px] text-muted">Платёж {p.dueDate ? `до ${ddmm(p.dueDate)}` : ''}: {rub(p.event.amount, { approx: p.event.approx })} → <b className="text-ink">{rub(p.minPayment)}</b></div>}
        </div>
      );
    case 'mark':
      return <div className="text-[14px] leading-snug"><span className="font-semibold">Отметить оплаченным:</span> {p.event.title}, {ddmm(p.event.date)} — <b>{rub(p.amount)}</b></div>;
    case 'income':
      return (
        <div className="text-[14px] leading-snug">
          {p.event ? <><span className="font-semibold">{p.event.title}</span> ~{ddmm(p.event.date)}: пришло <b className="text-accent">{rub(p.amount)}</b></> : <>Поступление {ddmm(p.date)}: {rub(p.amount)} — не нашёл в календаре</>}
          {p.bonus && <div className="mt-0.5 text-[13px] font-semibold text-accent">Дальше — распределить премию</div>}
        </div>
      );
    case 'reserve':
      return <div className="text-[14px] leading-snug"><span className="font-semibold">Резерв:</span> {rub(useStore.getState().reserve)} → <b>{rub(p.balance)}</b></div>;
  }
}
