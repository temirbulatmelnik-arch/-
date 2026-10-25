// Выписка и скриншоты из банка → что на них → что обновить: траты по категориям, оплаченные платежи,
// поступления (премия сразу открывает распределение), остаток на карте. После — итог недели.
import { AlertTriangle, Camera, Check, ClipboardPaste, FileSpreadsheet, FileText, KeyRound, Loader2 } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { Chip, Money, PrimaryButton, SecondaryButton, Sheet } from '../components/ui';
import { ddmm, fromKey, today } from '../domain/dates';
import { CATEGORIES } from '../domain/plan';
import { fromAi, fromDrafts, type Proposal, type Review } from '../domain/proposals';
import { draft, parseCsv, parseText } from '../domain/statements';
import type { CategoryId, Source } from '../domain/types';
import { weekToClose } from '../domain/weekly';
import { useStore } from '../store/store';
import { toast, useUi } from '../store/ui';

export function ImportSheet() {
  const open = useUi(s => s.scan);
  const set = useUi(s => s.set);
  return (
    <Sheet open={open} onClose={() => set({ scan: false })} title="Выписка из банка" subtitle="Траты, платежи, поступления и остаток — за один раз">
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
  const pdf = useRef<HTMLInputElement>(null);
  const pdfLocal = useRef<HTMLInputElement>(null);
  const shots = useRef<HTMLInputElement>(null);
  const csv = useRef<HTMLInputElement>(null);

  const fail = (e: unknown, AiError?: new (...a: never[]) => Error) =>
    setStep({ s: 'error', text: AiError && e instanceof AiError ? e.message : `Не получилось: ${(e as Error).message}` });

  const runAi = async (files: File[]) => {
    if (!files.length) return;
    const isPdf = files.some(f => f.type === 'application/pdf');
    setStep({ s: 'busy', label: isPdf ? 'Claude читает выписку…' : files.length > 1 ? `Claude разбирает ${files.length} скриншота…` : 'Claude разбирает скриншот…' });
    // SDK Anthropic подгружается только здесь — главный экран открывается быстрее
    const { analyze, AiError } = await import('../domain/ai');
    try {
      const c = ctx();
      const r = await analyze({ files, apiKey, model, debts: c.cal.debts, now: c.now, note });
      setStep({ s: 'review', review: fromAi(r, c) });
    } catch (e) { fail(e, AiError); }
  };

  const runPdfLocal = async (file?: File) => {
    if (!file) return;
    setStep({ s: 'busy', label: 'Читаю выписку на телефоне…' });
    try {
      const { pdfText, parseStatementText, isIncomeLine } = await import('../domain/pdf');
      const st = parseStatementText(await pdfText(file));
      if (!st.lines.length) { setStep({ s: 'error', text: 'Не нашёл в PDF строк с датой и суммой. Попробуйте скриншоты или CSV.' }); return; }
      const rows = st.lines.map(l => draft(l.date, l.amount, l.text, { income: isIncomeLine(l) }));
      const last = st.periodEnd ?? st.lines.map(l => l.date).sort().at(-1)!;
      setStep({ s: 'review', review: fromDrafts(rows, ctx(), `Выписка: ${rows.length} операций. Разобрано на телефоне — проверьте категории и знаки.`, st.closingBalance != null ? { cardBalance: { amount: st.closingBalance, date: last } } : {}) });
    } catch (e) { fail(e); }
  };

  const runCsv = async (file?: File) => {
    if (!file) return;
    const buf = await file.arrayBuffer();
    // банки отдают CSV в UTF-8 или Windows-1251
    let text = new TextDecoder('utf-8').decode(buf);
    if (text.includes('�')) text = new TextDecoder('windows-1251').decode(buf);
    const r = parseCsv(text);
    if (!r || !r.rows.length) { setStep({ s: 'error', text: 'Не нашёл в файле столбцы «Дата» и «Сумма».' }); return; }
    setStep({ s: 'review', review: fromDrafts(r.rows, ctx(), `Выписка: ${r.rows.length} операций. Столбцы: «${r.columns.date}», «${r.columns.amount}», «${r.columns.merchant}».`) });
  };

  if (step.s === 'busy') {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <Loader2 size={30} strokeWidth={1.5} className="animate-spin text-sea" />
        <div className="text-[15px] font-medium">{step.label}</div>
        <p className="max-w-[260px] text-[13px] text-muted">Обычно 10–40 секунд. Не закрывайте приложение.</p>
      </div>
    );
  }
  if (step.s === 'error') {
    return (
      <div className="space-y-4 pt-2">
        <p className="flex items-start gap-2 rounded-2xl bg-neg/10 p-4 text-[14px] leading-snug text-neg"><AlertTriangle size={17} className="mt-0.5 shrink-0" />{step.text}</p>
        <SecondaryButton onClick={() => setStep({ s: 'pick' })} className="w-full">Назад</SecondaryButton>
      </div>
    );
  }
  if (step.s === 'review') return <ReviewList review={step.review} onBack={() => setStep({ s: 'pick' })} />;
  if (step.s === 'text') return <TextPaste onDone={review => setStep({ s: 'review', review })} onBack={() => setStep({ s: 'pick' })} />;

  return (
    <div className="space-y-2.5 pt-1">
      <input ref={pdf} type="file" accept="application/pdf" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void (apiKey ? runAi([f]) : runPdfLocal(f)); }} />
      <input ref={pdfLocal} type="file" accept="application/pdf" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; void runPdfLocal(f); }} />
      <input ref={shots} type="file" accept="image/*" multiple hidden onChange={e => { const f = [...(e.target.files ?? [])]; e.target.value = ''; void runAi(f); }} />
      <input ref={csv} type="file" accept=".csv,text/csv,text/plain,.txt" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; void runCsv(f); }} />

      <Option icon={<FileText size={19} strokeWidth={1.5} />} title="Выписка PDF" tag={apiKey ? 'Claude' : 'на телефоне'}
        text="В приложении банка: карта → «Выписка» → период «неделя» → поделиться PDF → «Сохранить в Файлы». Затем выберите файл здесь."
        onClick={() => pdf.current?.click()}>
        {apiKey && <button type="button" onClick={e => { e.stopPropagation(); pdfLocal.current?.click(); }} className="mt-2 text-[12.5px] font-medium text-sea">Разобрать без Claude, бесплатно</button>}
      </Option>

      <Option icon={<Camera size={19} strokeWidth={1.5} />} title="Скриншоты" tag="Claude"
        text="Список операций, экран кредитки, чек платежа, зачисление, накопительный счёт — приложение поймёт, что это."
        onClick={() => (apiKey ? shots.current?.click() : undefined)} disabled={!apiKey}>
        {apiKey ? (
          <input value={note} onChange={e => setNote(e.target.value)} onClick={e => e.stopPropagation()} placeholder="Комментарий для Claude (необязательно)" className="field mt-3 text-[14px]" />
        ) : (
          <div className="mt-3 space-y-2" onClick={e => e.stopPropagation()}>
            <p className="text-[12.5px] leading-snug text-muted">Нужен ключ API Anthropic (console.anthropic.com → API Keys) — отдельно от подписки Claude, ≈ 3–5 ₽ за разбор. Хранится только на телефоне.</p>
            <div className="flex gap-2">
              <input value={keyDraft} onChange={e => setKeyDraft(e.target.value)} placeholder="sk-ant-…" autoCapitalize="off" autoCorrect="off" spellCheck={false} className="field text-[14px]" />
              <button type="button" aria-label="Сохранить ключ" onClick={() => { if (keyDraft.trim().startsWith('sk-')) { setSettings({ apiKey: keyDraft.trim() }); toast('Ключ сохранён'); } else toast('Ключ начинается с sk-ant-'); }}
                className="bg-sea-grad grid w-12 shrink-0 place-items-center rounded-[14px] text-on-sea"><KeyRound size={17} /></button>
            </div>
          </div>
        )}
      </Option>

      <Option icon={<ClipboardPaste size={19} strokeWidth={1.5} />} title="Текст со скриншота" tag="на телефоне"
        text="В «Фото» удерживайте палец на тексте → «Выбрать всё» → «Скопировать» и вставьте сюда."
        onClick={() => setStep({ s: 'text' })} />

      <Option icon={<FileSpreadsheet size={19} strokeWidth={1.5} />} title="Файл CSV" tag="на телефоне"
        text="Если банк выгружает таблицу: даты, суммы и описания найдутся по заголовкам."
        onClick={() => csv.current?.click()} />

      <p className="px-1 pt-2 text-[11.5px] leading-snug text-faint">Ничего не меняется без «Применить». Переводы между своими счетами и погашения кредитов не считаются тратами — погашения отмечаются в календаре платежей.</p>
    </div>
  );
}

function Option({ icon, title, tag, text, onClick, disabled, children }: { icon: ReactNode; title: string; tag: string; text: string; onClick: () => void; disabled?: boolean; children?: ReactNode }) {
  return (
    <div role="button" tabIndex={0} onClick={onClick} onKeyDown={e => e.key === 'Enter' && onClick()} className={`card block w-full p-4 text-left transition active:scale-[0.99] ${disabled ? '' : 'cursor-pointer'}`}>
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-2 text-ink/80">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2"><span className="text-[15px] font-medium">{title}</span><Chip tone={tag === 'Claude' ? 'info' : 'neutral'}>{tag}</Chip></span>
          <span className="mt-1 block text-[12.5px] leading-snug text-muted">{text}</span>
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
  const set = useUi(s => s.set);
  const patch = (id: string, p: Partial<Proposal>) => setItems(list => list.map(i => (i.id === id ? ({ ...i, ...p } as Proposal) : i)));
  const on = items.filter(i => i.on);
  const spent = on.reduce((s, i) => s + (i.type === 'tx' ? i.tx.amount : 0), 0);

  const apply = () => {
    const store = useStore.getState();
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
      if (i.type === 'reserve') store.setReserve(i.balance, 'Сверка по выписке');
      if (i.type === 'card') store.setCardBalance({ amount: i.balance, date: i.date, source: 'statement' });
    }
    toast(`Обновлено: ${on.length}`);
    if (bonus && bonus.type === 'income' && bonus.event) { set({ scan: false, bonus: { event: { ...bonus.event, amount: bonus.amount } } }); return; }
    // в выходные и в начале недели после выписки — сразу итог недели
    const now = today(), dow = fromKey(now).getDay();
    const monday = weekToClose(now, useStore.getState().closures);
    if ((dow === 0 || dow === 6 || dow === 1 || dow === 2) && !useStore.getState().closures[monday] && txs.length) set({ scan: false, week: monday });
    else set({ scan: false });
  };

  const groups: [string, Proposal['type'][]][] = [['Платежи и долги', ['mark', 'debt']], ['Поступления', ['income']], ['Счета', ['card', 'reserve']], ['Траты', ['tx']]];

  return (
    <div className="space-y-4 pt-1">
      <div className="rounded-2xl bg-surface-2 px-4 py-3 text-[13.5px] leading-snug">{review.summary || 'Готово.'}</div>
      {review.warnings.map((w, k) => (
        <p key={k} className="flex items-start gap-2 rounded-2xl bg-neg/10 px-4 py-3 text-[13px] leading-snug text-neg"><AlertTriangle size={15} className="mt-0.5 shrink-0" />{w}</p>
      ))}
      {items.length === 0 && <p className="rounded-2xl bg-surface-2 p-4 text-[14px] text-muted">Обновлять нечего: не нашлось операций, остатков или платежей.</p>}

      {groups.map(([title, types]) => {
        const list = items.filter(i => types.includes(i.type));
        if (!list.length) return null;
        return (
          <section key={title}>
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="eyebrow text-muted">{title}</span>
              {title === 'Траты' && <button type="button" onClick={() => setItems(all => all.map(i => (i.type === 'tx' ? { ...i, on: !list.every(x => x.on) } : i)))} className="text-[12.5px] font-medium text-sea">{list.every(x => x.on) ? 'Снять все' : 'Выбрать все'}</button>}
            </div>
            <div className="card divide-hair overflow-hidden">
              {list.map(i => (
                <div key={i.id} className={`flex items-start gap-3 px-3.5 py-3 ${i.on ? '' : 'opacity-50'}`}>
                  <button type="button" onClick={() => patch(i.id, { on: !i.on })} aria-label={i.on ? 'Не применять' : 'Применить'}
                    className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-md border ${i.on ? 'border-transparent bg-ink text-bg' : 'border-line text-transparent'}`}><Check size={13} strokeWidth={2.5} /></button>
                  <div className="min-w-0 flex-1"><ProposalBody p={i} onPatch={p => patch(i.id, p)} /></div>
                </div>
              ))}
            </div>
          </section>
        );
      })}

      <div className="grid grid-cols-[auto_1fr] gap-2 pb-2">
        <SecondaryButton onClick={onBack}>Назад</SecondaryButton>
        <PrimaryButton onClick={apply} disabled={!on.length}>Применить {on.length || ''}{spent ? <span className="font-normal opacity-70">, трат на <Money value={spent} /></span> : null}</PrimaryButton>
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
            <span className="min-w-0 truncate text-[14px] font-medium">{p.tx.merchant}</span>
            <Money value={p.tx.amount} className={`shrink-0 text-[14px] ${p.tx.source === 'credit' ? 'text-neg' : ''}`} />
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12px]">
            <span className="text-muted">{ddmm(p.tx.date)}</span>
            <select value={p.tx.category} onChange={e => onPatch({ tx: { ...p.tx, category: e.target.value as CategoryId } } as Partial<Proposal>)}
              className="rounded-lg bg-surface-2 px-2 py-1 text-[12px] font-medium">
              {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.short}</option>)}
            </select>
            <button type="button" onClick={() => onPatch({ tx: { ...p.tx, source: NEXT_SOURCE[p.tx.source] } } as Partial<Proposal>)}
              className={`rounded-lg px-2 py-1 font-medium ${p.tx.source === 'credit' ? 'bg-neg/12 text-neg' : 'bg-surface-2'}`}>{SOURCE_LABEL[p.tx.source]}</button>
            {p.tx.duplicate && <Chip tone="warn">уже есть</Chip>}
            {p.tx.skip && <Chip>не трата?</Chip>}
          </div>
        </div>
      );
    case 'debt':
      return (
        <div className="text-[13.5px] leading-snug">
          <div className="font-medium">{p.debt.short}: остаток <Money value={p.debt.balance} /> → <Money value={p.balance} /></div>
          {p.event && p.minPayment > 0 && <div className="mt-0.5 text-[12.5px] text-muted">Платёж {p.dueDate ? `до ${ddmm(p.dueDate)}` : ''}: <Money value={p.event.amount} approx={p.event.approx} /> → <span className="text-ink"><Money value={p.minPayment} /></span></div>}
        </div>
      );
    case 'mark':
      return <div className="text-[13.5px] leading-snug"><span className="font-medium">Оплачено:</span> {p.event.title}, {ddmm(p.event.date)} — <Money value={p.amount} /></div>;
    case 'income':
      return (
        <div className="text-[13.5px] leading-snug">
          {p.event ? <><span className="font-medium">{p.event.title}</span> ~{ddmm(p.event.date)}: пришло <Money value={p.amount} className="text-pos" /></> : <>Поступление {ddmm(p.date)}: <Money value={p.amount} /> — не нашёл в календаре</>}
          {p.bonus && <div className="mt-0.5 text-[12.5px] text-pos">Дальше — распределить премию</div>}
        </div>
      );
    case 'reserve':
      return <div className="text-[13.5px] leading-snug"><span className="font-medium">Резерв:</span> <Money value={useStore.getState().reserve} /> → <Money value={p.balance} /></div>;
    case 'card':
      return <div className="text-[13.5px] leading-snug"><span className="font-medium">Зарплатная карта на {ddmm(p.date)}:</span> <Money value={p.balance} /> — прогноз по дням пересчитается</div>;
  }
}
