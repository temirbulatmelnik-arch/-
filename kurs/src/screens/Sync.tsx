// Связь с чатом «Финансы»: отчёт приложения → в проект Claude; обновление плана из чата → в приложение.
// А ещё — новая редакция зашифрованного плана с сайта: подтягивается по коду, данные на телефоне остаются.
import { Check, ClipboardPaste, Copy, Download, Share2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Field, PrimaryButton, SecondaryButton, Sheet } from '../components/ui';
import { today } from '../domain/dates';
import { downloadFile } from '../domain/ics';
import { applyChatPlan, describeChatPlan, parseChatPlan, type ChatPlan } from '../domain/planUpdate';
import { buildReport, PROJECT_INSTRUCTIONS } from '../domain/sync';
import type { PlanSeed } from '../domain/types';
import { open as openSealed, type Sealed } from '../domain/vault';
import { useStore } from '../store/store';
import { toast, useUi } from '../store/ui';

export function SyncSheet() {
  const open = useUi(s => s.sync);
  const set = useUi(s => s.set);
  return (
    <Sheet open={open} onClose={() => set({ sync: false })} title="Связь с чатом «Финансы»" subtitle="Приложение и аудит видят одно и то же">
      {open && <Body />}
    </Sheet>
  );
}

function report(): string {
  const s = useStore.getState();
  return buildReport({ now: today(), cal: s, debts: s.debts, marks: s.marks, expenses: s.expenses, reserve: s.reserve, savings: s.savings, cardBalance: s.cardBalance, closures: s.closures, checklist: s.checklist, checks: s.checks, wishes: s.wishes });
}

async function copy(text: string) {
  try { await navigator.clipboard.writeText(text); toast('Скопировано'); } catch { toast('Не удалось скопировать'); }
}

function Body() {
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<ChatPlan | null>(null);
  const [showInstr, setShowInstr] = useState(false);
  const name = `Курс — состояние на ${today()}.md`;

  const share = async () => {
    const file = new File([report()], name, { type: 'text/markdown' });
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (nav.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'Отчёт «Курса»' }); useStore.getState().setSettings({ lastReportAt: new Date().toISOString() }); } catch { /* отменено */ }
    } else {
      downloadFile(name, report(), 'text/markdown');
    }
  };

  const parse = () => {
    const p = parseChatPlan(text);
    if (!p) { toast('Не нашёл блок с "app": "kurs-plan"'); return; }
    setParsed(p);
  };
  const apply = () => {
    if (!parsed) return;
    const s = useStore.getState();
    s.applyPlanPatch(applyChatPlan(parsed, s));
    toast('План обновлён из чата');
    setParsed(null); setText('');
    useUi.getState().set({ sync: false });
  };

  return (
    <div className="space-y-5 pt-1">
      <section className="card space-y-3 p-4">
        <div className="eyebrow text-muted">1 · Приложение → чат</div>
        <p className="text-[13.5px] leading-snug">Отчёт со всеми свежими данными: остатки долгов, оплаты, поступления, итоги недель, траты по категориям, чек-лист. Добавьте его в <b className="font-medium">файлы проекта «Финансы»</b> — тогда любой чат в проекте увидит актуальное состояние. Раз в неделю, после закрытия недели, достаточно.</p>
        <PrimaryButton onClick={share}><Share2 size={17} strokeWidth={1.6} /> Поделиться отчётом</PrimaryButton>
        <div className="grid grid-cols-2 gap-2">
          <SecondaryButton onClick={() => void copy(report())}><Copy size={15} strokeWidth={1.5} /> Скопировать</SecondaryButton>
          <SecondaryButton onClick={() => downloadFile(name, report(), 'text/markdown')}><Download size={15} strokeWidth={1.5} /> Файл</SecondaryButton>
        </div>
        <p className="text-[12px] leading-snug text-faint">В Claude: проект «Финансы» → «Файлы» → «+» → выбрать файл из «Файлов». Старый отчёт удалите, чтобы не путать.</p>
      </section>

      <section className="card space-y-3 p-4">
        <div className="eyebrow text-muted">2 · Чат → приложение</div>
        {parsed ? (
          <>
            {parsed.summary && <p className="text-[14px] leading-snug font-medium">{parsed.summary}</p>}
            <ul className="space-y-1.5 text-[13px] leading-snug">
              {describeChatPlan(parsed, useStore.getState()).map(l => <li key={l} className="flex gap-2"><Check size={14} className="mt-0.5 shrink-0 text-pos" />{l}</li>)}
            </ul>
            <p className="text-[12px] text-faint">Траты, отметки, резерв и копилка не меняются, если в обновлении этого нет.</p>
            <div className="grid grid-cols-[auto_1fr] gap-2">
              <SecondaryButton onClick={() => setParsed(null)}>Назад</SecondaryButton>
              <PrimaryButton onClick={apply}>Применить</PrimaryButton>
            </div>
          </>
        ) : (
          <>
            <p className="text-[13.5px] leading-snug">Попросите в чате: <i>«обнови план для приложения»</i>. Скопируйте ответ целиком (или только блок кода) и вставьте сюда.</p>
            <textarea value={text} onChange={e => setText(e.target.value)} rows={5} placeholder='{ "app": "kurs-plan", … }' className="field font-mono text-[13px]" />
            <div className="grid grid-cols-2 gap-2">
              <SecondaryButton onClick={async () => { try { setText(await navigator.clipboard.readText()); } catch { toast('Вставьте вручную: удерживайте палец в поле'); } }}><ClipboardPaste size={15} strokeWidth={1.5} /> Вставить</SecondaryButton>
              <PrimaryButton tone="ink" onClick={parse} disabled={!text.trim()} className="h-12">Разобрать</PrimaryButton>
            </div>
          </>
        )}
      </section>

      <section className="card space-y-3 p-4">
        <div className="eyebrow text-muted">Один раз · инструкция проекта</div>
        <p className="text-[13.5px] leading-snug">Чтобы чат читал отчёты и отвечал обновлением в нужном виде, вставьте этот текст в <b className="font-medium">«Инструкции проекта»</b> «Финансы».</p>
        <SecondaryButton onClick={() => void copy(PROJECT_INSTRUCTIONS)} className="w-full"><Copy size={15} strokeWidth={1.5} /> Скопировать инструкцию</SecondaryButton>
        <button type="button" onClick={() => setShowInstr(!showInstr)} className="text-[12.5px] font-medium text-brass">{showInstr ? 'Скрыть текст' : 'Показать текст'}</button>
        {showInstr && <pre className="max-h-72 overflow-auto rounded-xl bg-surface-2 p-3 text-[11.5px] leading-snug whitespace-pre-wrap">{PROJECT_INSTRUCTIONS}</pre>}
      </section>
    </div>
  );
}

/* ---------- Новая редакция плана с сайта ---------- */

/** При запуске: на сайте план новее, чем на телефоне? Есть код — обновить молча, нет — попросить код. */
export function usePlanUpdates() {
  const ready = useStore(s => s.ready);
  useEffect(() => {
    if (!ready || !navigator.onLine) return;
    let cancelled = false;
    (async () => {
      try {
        const sealed = (await (await fetch('./seed.enc.json', { cache: 'no-cache' })).json()) as Sealed;
        const s = useStore.getState();
        // план, загруженный до появления редакций, считается первой редакцией; «с нуля» — без плана, не обновляем
        const localRev = s.planRev || (s.plan ? 1 : 0);
        if (cancelled || !localRev || (sealed.rev ?? 1) <= localRev) return;
        if (s.planCode) {
          const plain = await openSealed(sealed, s.planCode);
          if (plain) { s.updateFromSeed(JSON.parse(plain) as PlanSeed, s.planCode); toast('План обновлён до новой редакции'); return; }
        }
        useUi.getState().set({ unlock: true });
      } catch { /* нет сети или файла — попробуем в следующий раз */ }
    })();
    return () => { cancelled = true; };
  }, [ready]);
}

export function UnlockSheet() {
  const open = useUi(s => s.unlock);
  const set = useUi(s => s.set);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const unlock = async () => {
    setBusy(true); setError('');
    try {
      const sealed = (await (await fetch('./seed.enc.json', { cache: 'no-cache' })).json()) as Sealed;
      const plain = await openSealed(sealed, code);
      if (!plain) { setError('Код не подходит'); return; }
      useStore.getState().updateFromSeed(JSON.parse(plain) as PlanSeed, code);
      toast('План обновлён. Ваши траты и отметки на месте');
      set({ unlock: false });
    } catch { setError('Нет связи. Попробуйте позже.'); } finally { setBusy(false); }
  };
  return (
    <Sheet open={open} onClose={() => set({ unlock: false })} title="Новая редакция плана" subtitle="Стратегия обновится, данные останутся">
      <div className="space-y-3 pt-1">
        <p className="text-[13.5px] leading-snug text-muted">Появились обязательные платежи по датам, чек-лист и стратегия из аудита. Введите код доступа к плану — тот же, что при первом запуске. Больше спрашивать не буду.</p>
        <Field label="Код доступа">
          <input value={code} onChange={e => setCode(e.target.value)} placeholder="XXXX-XXXX-XXXX" autoCapitalize="characters" autoCorrect="off" spellCheck={false} className="field text-center font-mono tracking-widest" />
        </Field>
        {error && <p className="text-[13px] text-neg">{error}</p>}
        <PrimaryButton onClick={() => void unlock()} disabled={!code.trim() || busy}>{busy ? 'Обновляю…' : 'Обновить план'}</PrimaryButton>
      </div>
    </Sheet>
  );
}
