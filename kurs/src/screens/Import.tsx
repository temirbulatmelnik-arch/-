import { exchangeRevision } from '../domain/exchange';
import type { BankImportBatch } from '../domain/accounts';
import { accountOptions, cashAccount, cents, LIFE_ACCOUNT, RESERVE_ACCOUNT, rubles } from '../domain/accounts';
// Выписка и скриншоты из банка → что на них → что обновить: траты по категориям, оплаченные платежи,
// поступления (премия сразу открывает распределение), остаток на карте. После — итог недели.
import { AlertTriangle, Camera, Check, ClipboardPaste, FileText, Loader2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { Chip, Money, PrimaryButton, SecondaryButton, Sheet } from '../components/ui';
import { reconcileStatement, type StatementCheck } from '../domain/bankReconciliation';
import { ledger } from '../domain/ledger';
import { ddmm, fromKey, today } from '../domain/dates';
import { CATEGORIES } from '../domain/plan';
import { fromAi, fromBank, fromDrafts, type AnyProposal } from '../domain/proposals';
import { ScreenshotFlow } from './ScreenshotImport';
import type { ImageOCR } from '../domain/imageText';
import { moscowClock } from '../domain/funds';
import { parseBankText } from '../domain/bankText';
import { draft, parseBankTable, parseCsv, parseText, type DraftTx } from '../domain/statements';
import type { CategoryId, Source } from '../domain/types';
import { weekToClose } from '../domain/weekly';
import { uid, useStore } from '../store/store';
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

type Review = { duplicates?: ReturnType<typeof fromDrafts>['duplicates']; summary: string; warnings: string[]; items: AnyProposal[]; batch?: BankImportBatch; statement?: StatementCheck; accountId?: string; rejected?: number };
type Step = { s: 'pick' } | { s: 'text' } | { s: 'busy'; label: string } | { s: 'review'; review: Review } | { s: 'routes'; labels: string[]; done: (routes: Record<string, string>) => void } | { s: 'screenshots'; images: ImageOCR[] } | { s: 'error'; text: string };

async function sha256Hex(data: BufferSource) {
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function ctx() {
  const st = useStore.getState();
  return { cal: st, marks: st.marks, expenses: st.expenses, reserve: st.reserve, now: today(), memory: st.merchantMemory };
}

function BankRoutes({ labels, onBack, onContinue }: {
  labels: string[]; onBack: () => void; onContinue: (routes: Record<string, string>) => void;
}) {
  const book = useStore(s => s.accountBook);
  const [routes, setRoutes] = useState<Record<string, string>>({});
  return <div className="space-y-3 pt-2">
    <h3 className="font-medium">Счета из выписки</h3>
    <p className="text-sm text-muted">Укажите, с каким счётом в «Курсе» совпадает каждый счёт ВТБ.</p>
    {labels.map(label => <label key={label} className="block space-y-1 text-sm">
      <span>{label}</span>
      <select className="field" value={routes[label] ?? ''} onChange={event => setRoutes({ ...routes, [label]: event.target.value })}>
        <option value="">Выберите счёт</option>
        {accountOptions(book).map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
      </select>
    </label>)}
    <PrimaryButton className="w-full" disabled={labels.some(label => !routes[label])} onClick={() => onContinue(routes)}>Проверить операции</PrimaryButton>
    <SecondaryButton className="w-full" onClick={onBack}>Назад</SecondaryButton>
  </div>;
}

function Flow() {
  const [step, setStep] = useState<Step>({ s: 'pick' });
  const apiKey = useStore(s => s.settings.apiKey);
  const model = useStore(s => s.settings.model);
  const pdf = useRef<HTMLInputElement>(null);
  const statementFile = useRef<HTMLInputElement>(null);
  const shots = useRef<HTMLInputElement>(null);

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
      const r = await analyze({ files, apiKey, model, debts: c.cal.debts, now: c.now });
      setStep({ s: 'review', review: fromAi(r, c) });
    } catch (e) { fail(e, AiError); }
  };

  const runScreenshots = async (files: File[]) => {
    if (!files.length) return;
    setStep({ s: 'busy', label: 'Читаю скриншоты на устройстве…' });
    try {
      if (files.length > 8 || files.some(file => file.size > 15 * 1024 * 1024)) {
        setStep({ s: 'error', text: 'Выберите до 8 изображений размером до 15 МБ каждое.' });
        return;
      }
      const { readImageText } = await import('../domain/imageText');
      const images = await readImageText(files, moscowClock().date);
      setStep({ s: 'screenshots', images });
    } catch {
      setStep({ s: 'screenshots', images: [{ id: uid(), text: '', confidence: 0, stage: 'ocr' }] });
    }
  };

  const runPdfLocal = async (file?: File) => {
    if (!file) return;
    setStep({ s: 'busy', label: 'Читаю выписку на телефоне…' });
    try {
      const { pdfText, parseStatementText } = await import('../domain/pdf');
      const fileHash = await sha256Hex(await file.arrayBuffer());
      if (useStore.getState().accountBook.importBatches?.some(batch => batch.fileHash === fileHash && !batch.partial)) {
        setStep({ s: 'review', review: { summary: 'Этот файл уже импортирован.', items: [], warnings: [] } });
        return;
      }
      const st = parseStatementText(await pdfText(file));
      if (!st.lines.length) { setStep({ s: 'error', text: 'Не нашёл в PDF строк с датой и суммой. Попробуйте скриншоты или CSV.' }); return; }
      const statement = reconcileStatement({ opening: st.openingBalance, closing: st.closingBalance, end: st.periodEnd },
        st.lines.map(line => line.sign == null ? null : line.sign * line.amount), st.rejected);
      const rows = st.lines.map((line, index) => {
        const tx = draft(line.date, line.amount, line.text, { income: line.sign === 1 });
        return { ...tx, structured: true, occurredAt: line.occurredAt, skip: line.sign == null || tx.skip,
          ...(line.sign == null ? { unknownDirection: true as const } : {}),
          fingerprint: JSON.stringify(['csv:file', fileHash, index]) };
      });
      const review = fromDrafts(rows, ctx(), `Выписка PDF: ${rows.length} операций.`);
      setStep({ s: 'review', review: { ...review, statement, rejected: st.rejected, accountId: LIFE_ACCOUNT,
        batch: { id: fileHash, fileHash, bank: /ВТБ|VTB/i.test(st.raw) ? 'vtb' : 'pdf', importedAt: new Date().toISOString(),
          parserVersion: 'kurs-pdf-2', rowCount: rows.length } } });
    } catch (e) { fail(e); }
  };

  const runCsv = async (file?: File) => {
    if (!file) return;
    setStep({ s: 'busy', label: 'Читаю таблицу на устройстве…' });
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('Выберите файл размером до 10 МБ.');
      const buf = await file.arrayBuffer();
      const fileHash = await sha256Hex(buf);
      if (useStore.getState().accountBook.importBatches?.some(batch => batch.fileHash === fileHash && !batch.partial)) {
        setStep({ s: 'review', review: { summary: 'Этот файл уже импортирован.', items: [], warnings: [] } });
        return;
      }
      const xlsx = /\.xlsx$/i.test(file.name);
      let r;
      if (xlsx) {
        const { readSheet } = await import('read-excel-file/browser');
        r = parseBankTable(await readSheet(buf), fileHash);
      } else {
        let body = new TextDecoder('utf-8').decode(buf);
        if (body.includes('�')) body = new TextDecoder('windows-1251').decode(buf);
        r = parseCsv(body, fileHash);
      }
      if (!r) throw new Error('Не нашёл в файле столбцы «Дата» и «Сумма».');
      const rows = await Promise.all(r.rows.map(async row => /^\["csv:(operation|vtb)"/.test(row.fingerprint)
        ? { ...row, fingerprint: JSON.stringify([r.bank === 'vtb' && row.fingerprint.startsWith('["csv:vtb') ? 'csv:vtb' : 'csv:operation', await sha256Hex(new TextEncoder().encode(row.fingerprint))]) }
        : row));
      const accountLabels = [...new Set(rows.flatMap(row => row.bankAccount ? [row.bankAccount] : []))];
      const done = (routes?: Record<string, string>) => {
        const routed = rows.map((row): DraftTx => {
          const accountId = row.bankAccount && routes?.[row.bankAccount];
          return accountId ? { ...row, accountId, source: accountId === RESERVE_ACCOUNT ? 'reserve' : 'life' } : row;
        });
        const summary = 'Выписка: ' + routed.length + ' операций. Столбцы: «' + r.columns.date + '», «' + r.columns.amount + '», «' + r.columns.merchant + '».';
        const review = fromDrafts(routed, ctx(), summary);
        const warnings = r.rejected ? ['Пропущено строк: ' + r.rejected + '. Проверьте статус, валюту и формат данных в таблице.', ...review.warnings] : review.warnings;
        const statement = reconcileStatement(r.bounds, rows.map(row => row.income ? row.amount : -row.amount),
          r.rejected + (accountLabels.length > 1 ? 1 : 0));
        const accountId = accountLabels.length > 1 ? undefined : routes?.[accountLabels[0]] ??
          (/накопительн|резерв/i.test(accountLabels[0] ?? '') ? RESERVE_ACCOUNT : LIFE_ACCOUNT);
        setStep({ s: 'review', review: { ...review, warnings, rejected: r.rejected,
          ...(r.bounds.opening != null || r.bounds.closing != null ? { statement, accountId } : {}),
          batch: { id: fileHash, fileHash, bank: r.bank, importedAt: new Date().toISOString(),
            parserVersion: xlsx ? 'kurs-xlsx-1' : 'kurs-csv-2', rowCount: routed.length } } });
      };
      if (r.bank === 'vtb' && accountLabels.length > 1) setStep({ s: 'routes', labels: accountLabels, done });
      else done();
    } catch (e) {
      fail(e);
    }
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
  if (step.s === 'screenshots') return <ScreenshotFlow images={step.images} onBack={() => setStep({ s: 'pick' })} />;
  if (step.s === 'routes') return <BankRoutes labels={step.labels} onBack={() => setStep({ s: 'pick' })} onContinue={step.done} />;
  if (step.s === 'review') return <ReviewList review={step.review} onBack={() => setStep({ s: 'pick' })} />;
  // одно касание: прочитать буфер (iPhone спросит «Вставить») и сразу показать, что нашлось
  const pasteBank = async () => {
    let text = '';
    try { text = await navigator.clipboard.readText(); } catch { /* нет доступа к буферу — вставят вручную */ }
    const r = text.trim() ? reviewFromText(text) : null;
    if (r) setStep({ s: 'review', review: r });
    else { toast(text.trim() ? 'В скопированном нет сумм вида «−350 ₽» — вставьте текст вручную' : 'Буфер пуст или закрыт — вставьте текст вручную'); setStep({ s: 'text' }); }
  };

  if (step.s === 'text') return <TextPaste onDone={review => setStep({ s: 'review', review })} onBack={() => setStep({ s: 'pick' })} />;

  const demo = !!import.meta.env.VITE_DEMO;
  return (
    <div className="space-y-3 pt-1">
      {!demo && <>
        <input ref={statementFile} type="file" accept=".pdf,.csv,.xlsx,application/pdf,text/csv" hidden onChange={e => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file && (/\.pdf$/i.test(file.name) || file.type === 'application/pdf')) void runPdfLocal(file);
          else void runCsv(file);
        }} />
        <input ref={pdf} type="file" accept="application/pdf" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void runAi([f]); }} />
        <input ref={shots} type="file" accept="image/*" multiple hidden onChange={e => { const f = [...(e.target.files ?? [])]; e.target.value = ''; void runScreenshots(f); }} />
      </>}
      <div className="card space-y-2 p-4">
        <PrimaryButton className="w-full" onClick={() => demo
          ? void runCsv(new File(['Дата;Сумма;Описание\n' + today() + ';-189,50;Учебная покупка'], 'uchebnaya-vypiska.csv', { type: 'text/csv' }))
          : statementFile.current?.click()}><FileText size={18} /> {demo ? 'Открыть учебную выписку' : 'Выбрать выписку'}</PrimaryButton>
        <p className="text-[13px] text-muted">{demo ? 'Демо использует учебную выписку. Личные файлы здесь отключены.'
          : 'PDF, CSV и XLSX разбираются на устройстве. Операции можно проверить перед записью.'}</p>
      </div>
      {!demo && <details className="card p-3">
        <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">Скриншот или текст</summary>
        <div className="grid gap-2">
          <SecondaryButton onClick={() => shots.current?.click()}><Camera size={18} /> Выбрать скриншот</SecondaryButton>
          <SecondaryButton onClick={pasteBank}><ClipboardPaste size={18} /> Вставить скопированный текст</SecondaryButton>
          <SecondaryButton onClick={() => setStep({ s: 'text' })}>Ввести текст вручную</SecondaryButton>
          {apiKey && <button type="button" onClick={() => pdf.current?.click()} className="min-h-11 text-[13px] text-sea">Передать PDF в Claude для разбора</button>}
        </div>
      </details>}
    </div>
  );
}

/** Текст, скопированный со снимка банка, → предложения. ВТБ, Сбер, Т-Банк: операции с категориями банка, сумма дня,
 *  обязательный платёж, остатки; иначе — строки с суммами. null — сумм не нашлось */
function reviewFromText(text: string): Review | null {
  const c = ctx();
  const bank = parseBankText(text, c.now);
  if (bank.ops.length || bank.dues.length || bank.balances.card != null || bank.balances.reserve != null) return fromBank(bank, c);
  const rows = parseText(text, c.now);
  return rows.length ? fromDrafts(rows, c, `Из текста: ${rows.length} операций. Проверьте даты и категории.`) : null;
}

function TextPaste({ onDone, onBack }: { onDone: (r: Review) => void; onBack: () => void }) {
  const [text, setText] = useState('');
  const paste = async () => {
    try { setText(await navigator.clipboard.readText()); } catch { toast('Вставьте вручную: удерживайте палец в поле → «Вставить»'); }
  };
  const run = () => {
    const r = reviewFromText(text);
    if (!r) { toast('Не нашёл сумм вида «−350 ₽». Проверьте текст'); return; }
    onDone(r);
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
  const [revision] = useState(() => exchangeRevision(useStore.getState()));
  const [items, setItems] = useState<AnyProposal[]>(review.items);
  const set = useUi(s => s.set);
  const patch = (id: string, p: Partial<AnyProposal>) => setItems(list => list.map(i => (i.id === id ? ({ ...i, ...p } as AnyProposal) : i)));
  const on = items.filter(i => i.on && (i.type !== 'income' || i.event) && (i.type !== 'tx' || (!(i.tx.structured && i.tx.skip) && (!i.tx.duplicate || i.tx.needsDuplicateReview))));
  const [showAll, setShowAll] = useState(!review.batch);
  const duplicates = review.duplicates?.length ?? items.filter(i => i.type === 'tx' && i.tx.duplicate && !i.tx.needsDuplicateReview).length;
  const exceptions = items.filter(i => !on.includes(i) && (i.type === 'person' || i.type === 'income' ||
    i.type === 'posting' || i.type === 'tx' && (!i.tx.duplicate || i.tx.needsDuplicateReview) && !i.tx.skip));
  const displayed = showAll ? items : exceptions;
  const spent = on.reduce((s, i) => s + (i.type === 'tx' ? i.tx.amount : 0), 0);

  const apply = () => {
    const store = useStore.getState();
    // снимок до изменений — неверный импорт откатывается в «Связи с чатом» → «Последние импорты»
    const result: { bonus?: AnyProposal } = {};
    const seenCsv = new Set(store.expenses.map(expense => expense.fingerprint));
    const txs = on.flatMap(i => {
      if (i.type !== 'tx') return [];
      if (i.tx.fingerprint.startsWith('["csv:')) {
        if (seenCsv.has(i.tx.fingerprint)) return [];
        seenCsv.add(i.tx.fingerprint);
      }
      return [i.tx];
    });
    if (!txs.length && on.every(i => i.type === 'tx')) { toast('Новых операций нет'); return; }
    const unresolved = items.some(item => !on.includes(item) && (item.type === 'posting' || item.type === 'income' ||
      item.type === 'mark' || item.type === 'tx' && (!item.tx.duplicate || item.tx.needsDuplicateReview)));
    const batch = review.batch ? { ...review.batch, ...(unresolved ? { partial: true as const } : {}) } : undefined;
    const applied = store.applyBankImport(revision, `Из банка: ${review.summary}`, batch, (store, current) => {
      const people = on.flatMap(i => (i.type === 'person' && i.choice === 'spend' ? [i] : []));
      if (txs.length || people.length) store.addExpenses([
        ...txs.map(t => ({ date: t.date, amount: t.amount, category: t.category, note: t.merchant, source: t.source, accountId: t.accountId, origin: t.structured ? ('csv' as const) : t.nameKey ? ('text' as const) : ('ai' as const), fingerprint: t.fingerprint, ...(t.occurredAt ? { occurredAt: t.occurredAt } : {}), ...(t.creditCard ? { creditCard: t.creditCard } : {}) })),
        ...people.map(p => ({ date: p.date, amount: p.amount, category: p.category, note: p.name, source: 'life' as const, origin: 'text' as const, fingerprint: p.fingerprint })),
      ]);
      // память продавцов: сменили категорию — запомнить
      for (const t of txs) if (t.nameKey && t.suggested && t.category !== t.suggested) store.remember(t.nameKey, t.category);
      for (const i of on) {
        if (i.type === 'person' && (i.choice === 'self')) store.remember(i.key, 'self');
        if (i.type === 'mark' && i.selfKey && !store.merchantMemory[i.selfKey]) store.remember(i.selfKey, 'self');
        if (i.type === 'transfer') {
          if (i.dir === 'toCard') { if (i.event) store.markEvent(i.event, true, i.amount); else store.moveReserve(-i.amount, 'Перевод из резерва на карту', i.amount); }
          else store.moveReserve(i.amount, 'Перевод с карты в резерв', -i.amount);
        }
        if (i.type === 'refund') {
          const accountId = cashAccount(i.expense) ?? i.expense.creditCard;
          if (accountId) {
            store.saveOperation({ id: uid(), externalId: JSON.stringify(['refund', i.expense.id, i.date, i.amount, i.name]),
              type: 'refund', expenseId: i.expense.id, accountId, debtId: i.expense.source === 'credit' ? i.expense.creditCard : undefined,
              amount: Math.min(i.expense.amount, i.amount), date: i.date, createdAt: new Date().toISOString(), status: 'confirmed', origin: 'bank', fundingSource: 'unknown' });
          }
        }
        if (i.type === 'posting' && !store.saveOperation({ ...i.op, createdAt: new Date().toISOString() })) {
          throw new Error('bank row could not be committed');
        }
        if (i.type === 'interest') store.moveReserve(i.amount, 'Проценты на накопительный');
        if (i.type === 'due') store.setOverride(i.event.key, { amount: i.amount, date: i.date });
        if (i.type === 'debt') {
          store.updateDebt(i.debt.id, { balance: i.balance });
          if (i.event && i.minPayment > 0) store.setOverride(i.event.key, { amount: i.minPayment, ...(i.dueDate ? { date: i.dueDate } : {}) });
        }
        if (i.type === 'mark') store.markEvent(i.event, true, i.amount, undefined,
          { paidDate: i.date, accountId: i.event.accountId, bankAt: i.bankAt, externalId: i.externalId });
        if (i.type === 'income' && i.event) {
          if (i.bonus && !result.bonus) result.bonus = i;
          else if (!i.bonus) store.markEvent(i.event, true, i.amount, undefined,
            { paidDate: i.date, bankAt: i.bankAt, externalId: i.externalId, bankVerified: !!i.externalId });
        }
        if (i.type === 'reserve') store.setReserve(i.balance, 'Сверка по выписке');
        if (i.type === 'card') store.setCardBalance({ amount: i.balance, date: i.date, source: 'statement' });
      }
      if (batch && review.statement && review.accountId) {
        const statement = review.statement;
        const state = current();
        const position = statement.end ? ledger({ ...state, now: statement.end }) : null;
        const lastReserveSnapshot = [...state.checkups.map(row => row.date), ...state.reserveLog.filter(row => row.abs).map(row => row.date)].sort().at(-1);
        const balance = review.accountId === LIFE_ACCOUNT ? position?.cardPosted
          : lastReserveSnapshot && statement.end && statement.end >= lastReserveSnapshot ? position?.reservePosted : null;
        batch.statement = { ...statement, accountId: review.accountId,
          ...(balance != null ? { ledgerClosingMinor: cents(balance) } : {}) };
      }
    });
    const bonus = result.bonus;
    if (!applied && !bonus) { toast('Данные изменились или операции уже учтены. Откройте выписку заново.'); return; }
    if (applied) {
      const check = batch?.statement;
      toast(check?.status === 'mismatch' || check?.ledgerClosingMinor != null && check.ledgerClosingMinor !== check.closingMinor
        ? 'Операции записаны. Конечный остаток требует сверки.' : `Обновлено: ${on.length}`);
    }
    if (bonus && bonus.type === 'income' && bonus.event) { set({ scan: false, bonus: { event: { ...bonus.event, amount: bonus.amount } } }); return; }
    // в выходные и в начале недели после выписки — сразу итог недели
    const now = today(), dow = fromKey(now).getDay();
    const monday = weekToClose(now, useStore.getState().closures);
    if ((dow === 0 || dow === 6 || dow === 1 || dow === 2) && !useStore.getState().closures[monday] && txs.length) set({ scan: false, week: monday });
    else set({ scan: false });
  };

  const groups: [string, AnyProposal['type'][]][] = [['Платежи и долги', ['mark', 'debt', 'due']], ['Переводы', ['person', 'transfer']], ['Поступления и возвраты', ['income', 'refund', 'interest', 'posting']], ['Счета', ['card', 'reserve']], ['Траты', ['tx']], ['Не траты', ['info']]];

  return (
    <div className="space-y-4 pt-1">
      <div className="rounded-2xl bg-surface-2 px-4 py-3 text-[13.5px] leading-snug">{review.summary || 'Готово.'}</div>
      {review.batch && <p className="px-1 text-sm">К записи {on.length} · совпадений {duplicates} · проверить {exceptions.length}
        {!!review.rejected && ` · ошибок ${review.rejected}`}</p>}
      {!!review.duplicates?.length && <details className="card px-3 text-sm">
        <summary className="min-h-11 cursor-pointer py-2.5 font-medium">Уже учтены · {review.duplicates.length}</summary>
        <ul className="max-h-64 divide-y divide-line overflow-auto">
          {review.duplicates.map(row => <li key={row.id} className="flex items-start gap-2 py-2 text-[13px]">
            <span className="min-w-0 flex-1 break-words">{ddmm(row.date)} · {row.merchant}</span>
            <Money value={row.amount} kopecks className="shrink-0" />
          </li>)}
        </ul>
      </details>}
      {review.batch && review.statement?.closingMinor == null && <p className="px-1 text-sm text-muted">В выписке нет остатка.</p>}
      {review.statement && <section aria-label="Сверка выписки" className="card space-y-1 p-3 text-[13px]">
        <p className="font-medium">{review.statement.status === 'matched' ? 'Строки выписки сходятся с конечным остатком'
          : review.statement.status === 'mismatch' ? 'Строки выписки расходятся с конечным остатком' : 'В выписке недостаточно данных для сверки'}</p>
        {review.statement.closingMinor != null && <p>В банке на конец периода <Money value={rubles(review.statement.closingMinor)} kopecks /></p>}
        {review.statement.calculatedMinor != null && <p>По строкам выписки <Money value={rubles(review.statement.calculatedMinor)} kopecks /></p>}
        {review.statement.differenceMinor != null && review.statement.differenceMinor !== 0 &&
          <p className="text-warn">Разница <Money value={rubles(review.statement.differenceMinor)} kopecks /></p>}
        <p className="text-muted">После записи приложение сравнит расчётный остаток с выпиской. Контрольный остаток меняется в разделе сверки.</p>
      </section>}
      {review.warnings.map((w, k) => (
        <p key={k} className="flex items-start gap-2 rounded-2xl bg-neg/10 px-4 py-3 text-[13px] leading-snug text-neg"><AlertTriangle size={15} className="mt-0.5 shrink-0" />{w}</p>
      ))}
      {items.length === 0 && <p className="rounded-2xl bg-surface-2 p-4 text-[14px] text-muted">Обновлять нечего: не нашлось операций, остатков или платежей.</p>}

      {review.batch && items.length > exceptions.length && <SecondaryButton className="w-full" onClick={() => setShowAll(value => !value)}>
        {showAll ? 'Только исключения' : 'Показать все строки'}
      </SecondaryButton>}
      {groups.map(([title, types]) => {
        const list = displayed.filter(i => types.includes(i.type));
        if (!list.length) return null;
        return (
          <section key={title}>
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="eyebrow text-muted">{title}</span>
              {title === 'Траты' && showAll && <button type="button" onClick={() => setItems(all => all.map(i => (i.type === 'tx' ? { ...i, on: !list.every(x => x.on) } : i)))} className="text-[12.5px] font-medium text-sea">{list.every(x => x.on) ? 'Снять все' : 'Выбрать все'}</button>}
            </div>
            <div className="card divide-hair overflow-hidden">
              {list.map(i => (
                <div key={i.id} className={`flex items-start gap-3 px-3.5 py-3 ${i.on || i.type === 'person' ? '' : 'opacity-50'}`}>
                  {i.type !== 'info' && i.type !== 'person' && (i.type !== 'income' || i.event) && !(i.type === 'tx' && i.tx.structured && i.tx.skip) && <button type="button" onClick={() => patch(i.id, { on: !i.on })} aria-label={i.on ? 'Не применять' : 'Применить'}
                    className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-md border ${i.on ? 'border-transparent bg-ink text-bg' : 'border-line text-transparent'}`}><Check size={13} strokeWidth={2.5} /></button>}
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

function ProposalBody({ p, onPatch }: { p: AnyProposal; onPatch: (x: Partial<AnyProposal>) => void }) {
  switch (p.type) {
    case 'person': {
      const opts: [NonNullable<typeof p.choice>, string][] = p.incoming ? [['self', 'Это я'], ['other', 'Не я']] : [['self', 'Перевод себе'], ['spend', 'Трата']];
      return (
        <div>
          <div className="flex items-start justify-between gap-2">
            <span className="min-w-0 truncate text-[14px] font-medium">{p.name}</span>
            <Money value={p.amount} sign={p.incoming} className={`shrink-0 text-[14px] ${p.incoming ? 'text-pos' : ''}`} />
          </div>
          <div className="mt-0.5 text-[12px] text-muted">{ddmm(p.date)}, {p.incoming ? 'перевод от человека: от себя — не доход' : 'перевод человеку: себе — не трата'}</div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {opts.map(([id, label]) => (
              <button key={id} type="button" onClick={() => onPatch({ choice: p.choice === id ? null : id, on: p.choice !== id } as Partial<AnyProposal>)}
                className={`rounded-lg px-2.5 py-1 text-[12.5px] font-medium ${p.choice === id ? 'bg-ink text-bg' : 'bg-surface-2'}`}>{label}</button>
            ))}
            {p.choice === 'spend' && (
              <select value={p.category} onChange={e => onPatch({ category: e.target.value as CategoryId } as Partial<AnyProposal>)} className="rounded-lg bg-surface-2 px-2 py-1 text-[12px] font-medium">
                {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.short}</option>)}
              </select>
            )}
          </div>
        </div>
      );
    }
    case 'posting':
      return <div className="text-[13.5px]"><div className="flex justify-between gap-2">
        <span className="font-medium">{p.text}</span><Money value={p.op.amount} kopecks /></div>
        <div className="text-muted">{ddmm(p.op.date)} · {p.op.note}</div></div>;
    case 'transfer':
      return (
        <div className="text-[13.5px] leading-snug">
          <div className="flex items-start justify-between gap-2"><span className="font-medium">Между своими счетами, {ddmm(p.date)}</span><Money value={p.amount} className="shrink-0" /></div>
          <button type="button" onClick={() => onPatch({ dir: p.dir === 'toCard' ? 'toReserve' : 'toCard' } as Partial<AnyProposal>)} className="mt-1.5 rounded-lg bg-surface-2 px-2.5 py-1 text-[12.5px] font-medium">
            {p.dir === 'toCard' ? 'Из резерва на карту' : 'С карты в резерв'} ⇄
          </button>
          {p.dir === 'toCard' && p.event && <div className="mt-1 text-[12px] text-muted">Отметит пополнение карты {ddmm(p.event.date)}.</div>}
        </div>
      );
    case 'refund':
      return <div className="text-[13.5px] leading-snug"><span className="font-medium">Возврат {p.name}</span> <Money value={p.amount} sign className="text-pos" /> {p.amount >= p.expense.amount - 0.5 ? 'убирает' : 'уменьшает'} трату «{p.expense.note ?? 'без названия'}» {ddmm(p.expense.date)} на <Money value={p.expense.amount} /></div>;
    case 'interest':
      return <div className="text-[13.5px] leading-snug"><span className="font-medium">Проценты {ddmm(p.date)}:</span> <Money value={p.amount} sign className="text-pos" /> в резерв</div>;
    case 'due':
      return <div className="text-[13.5px] leading-snug"><span className="font-medium">{p.debt.short}:</span> платёж до {ddmm(p.date)} — <Money value={p.event.amount} approx={p.event.approx} /> → <span className="text-ink"><Money value={p.amount} /></span></div>;
    case 'info':
      return <div className="flex items-start justify-between gap-2 text-[13px] leading-snug text-muted"><span className="min-w-0">{ddmm(p.date)} {p.text}</span><Money value={p.amount} className="shrink-0" /></div>;
    case 'tx':
      return (
        <div className={p.tx.duplicate ? 'opacity-50' : ''}>
          <div className="flex items-start justify-between gap-2">
            <span className="min-w-0 truncate text-[14px] font-medium">{p.tx.merchant}</span>
            <Money value={p.tx.amount} className={`shrink-0 text-[14px] ${p.tx.source === 'credit' ? 'text-neg' : ''}`} />
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12px]">
            <span className="text-muted">{ddmm(p.tx.date)}</span>
            {p.tx.structured && p.tx.skip && <span className="text-warn">Требует сверки</span>}
            <select value={p.tx.category} onChange={e => onPatch({ tx: { ...p.tx, category: e.target.value as CategoryId } } as Partial<AnyProposal>)}
              className="rounded-lg bg-surface-2 px-2 py-1 text-[12px] font-medium">
              {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.short}</option>)}
            </select>
            <button type="button" onClick={() => onPatch({ tx: { ...p.tx, accountId: undefined, source: NEXT_SOURCE[p.tx.source] } } as Partial<AnyProposal>)}
              className={`rounded-lg px-2 py-1 font-medium ${p.tx.source === 'credit' ? 'bg-neg/12 text-neg' : 'bg-surface-2'}`}>{SOURCE_LABEL[p.tx.source]}</button>
            {p.tx.duplicate && <Chip tone="warn">{p.tx.needsDuplicateReview ? 'Возможное совпадение' : 'Уже есть'}</Chip>}
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
