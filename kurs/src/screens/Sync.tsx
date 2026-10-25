// Связь с чатом «Финансы»: один файл обмена в обе стороны (domain/exchange.ts).
// Приложение отдаёт всё состояние; ответ чата с изменениями показывается по разделам и применяется выбранное.
// А ещё — новая редакция зашифрованного плана с сайта: подтягивается по коду, данные на телефоне остаются.
import { ClipboardPaste, Copy, Download, FileUp, Share2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Field, PrimaryButton, SecondaryButton, Sheet, Switch } from '../components/ui';
import { today } from '../domain/dates';
import {
  applyExchange, buildExchange, exchangeFileName, normalize, parseExchange, previewExchange, type ExchangeFile, type ExchangeSection, type SectionId,
} from '../domain/exchange';
import { downloadFile } from '../domain/ics';
import { PROJECT_INSTRUCTIONS } from '../domain/sync';
import type { PlanSeed } from '../domain/types';
import { open as openSealed, type Sealed } from '../domain/vault';
import { uid, useStore } from '../store/store';
import { toast, useUi } from '../store/ui';

export function SyncSheet() {
  const open = useUi(s => s.sync);
  const set = useUi(s => s.set);
  return (
    <Sheet open={open} onClose={() => set({ sync: false })} title="Связь с чатом «Финансы»" subtitle="Один файл обмена: туда и обратно">
      {open && <Body />}
    </Sheet>
  );
}

const exportText = () => JSON.stringify(buildExchange(useStore.getState(), today()), null, 1);

async function copy(text: string) {
  try { await navigator.clipboard.writeText(text); toast('Скопировано'); } catch { toast('Не удалось скопировать'); }
}

function Body() {
  const [text, setText] = useState('');
  const [file, setFile] = useState<ExchangeFile | null>(null);
  const [sections, setSections] = useState<ExchangeSection[]>([]);
  const [off, setOff] = useState<Set<SectionId>>(new Set());
  const [showInstr, setShowInstr] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const name = exchangeFileName(today());

  const share = async () => {
    const body = exportText();
    const f = new File([body], name, { type: 'application/json' });
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (nav.canShare?.({ files: [f] })) {
      try { await navigator.share({ files: [f], title: 'Файл обмена «Курса»' }); useStore.getState().setSettings({ lastReportAt: new Date().toISOString() }); } catch { /* отменено */ }
    } else {
      downloadFile(name, body, 'application/json');
    }
  };

  const parse = (raw: string) => {
    const p = parseExchange(raw);
    if (!p) { toast('Не нашёл файл обмена: нужен JSON с "app": "kurs-exchange"'); return; }
    const f = normalize(p, useStore.getState());
    const list = previewExchange(f, useStore.getState(), today());
    if (!list.length) { toast('В файле нет ничего нового'); return; }
    setFile(f); setSections(list); setOff(new Set());
  };
  const apply = () => {
    if (!file) return;
    const s = useStore.getState();
    const only = new Set(sections.map(x => x.id).filter(id => !off.has(id)));
    s.applySync(applyExchange(file, s, today(), only, uid));
    toast('Изменения из чата применены');
    setFile(null); setText('');
    useUi.getState().set({ sync: false });
  };
  const toggle = (id: SectionId) => setOff(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <div className="space-y-5 pt-1">
      <section className="card space-y-3 p-4">
        <h3 className="text-[15px] font-medium">Из приложения в чат</h3>
        <p className="text-[13.5px] leading-snug">Один файл со всем, что знает приложение: лимиты, обязательные платежи, календарь с отметками, траты и зачисления за 90 дней, долги, резерв, копилка, чек-лист и стратегия. Добавьте его в <b className="font-medium">файлы проекта «Финансы»</b> вместо прошлого или приложите к сообщению.</p>
        <PrimaryButton onClick={() => void share()}><Share2 size={17} strokeWidth={1.6} /> Поделиться файлом</PrimaryButton>
        <div className="grid grid-cols-2 gap-2">
          <SecondaryButton onClick={() => void copy(exportText())}><Copy size={15} strokeWidth={1.5} /> Скопировать</SecondaryButton>
          <SecondaryButton onClick={() => downloadFile(name, exportText(), 'application/json')}><Download size={15} strokeWidth={1.5} /> Сохранить</SecondaryButton>
        </div>
      </section>

      <section className="card space-y-3 p-4">
        <h3 className="text-[15px] font-medium">Из чата в приложение</h3>
        {file ? (
          <>
            {file.summary && <p className="text-[14px] leading-snug font-medium">{file.summary}</p>}
            <div className="divide-hair">
              {sections.map(sec => (
                <div key={sec.id} className="py-2">
                  <Switch checked={!off.has(sec.id)} onChange={() => toggle(sec.id)} label={sec.title} hint={`${sec.lines.length} ${sec.lines.length === 1 ? 'изменение' : sec.lines.length < 5 ? 'изменения' : 'изменений'}`} />
                  <ul className={`space-y-1 pb-1 text-[13px] leading-snug ${off.has(sec.id) ? 'text-faint line-through' : 'text-muted'}`}>
                    {sec.lines.map((l, i) => <li key={i}>{l}</li>)}
                  </ul>
                </div>
              ))}
            </div>
            <p className="text-[12px] leading-snug text-muted">Применится только включённое. Чего нет в файле, не меняется.</p>
            <div className="grid grid-cols-[auto_1fr] gap-2">
              <SecondaryButton onClick={() => setFile(null)}>Назад</SecondaryButton>
              <PrimaryButton onClick={apply} disabled={sections.every(x => off.has(x.id))}>Применить</PrimaryButton>
            </div>
          </>
        ) : (
          <>
            <p className="text-[13.5px] leading-snug">Попросите в чате: <i>«внеси изменения в приложение»</i>. Чат ответит файлом обмена — блоком кода или файлом. Вставьте ответ целиком или выберите файл.</p>
            <textarea value={text} onChange={e => setText(e.target.value)} rows={5} placeholder='{ "app": "kurs-exchange", … }' className="field font-mono text-[13px]" />
            <input ref={picker} type="file" accept="application/json,.json,.txt,text/plain" hidden onChange={async e => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) parse(await f.text());
            }} />
            <div className="grid grid-cols-3 gap-2">
              <SecondaryButton onClick={async () => { try { setText(await navigator.clipboard.readText()); } catch { toast('Вставьте вручную: удерживайте палец в поле'); } }} className="px-2"><ClipboardPaste size={15} strokeWidth={1.5} /> Вставить</SecondaryButton>
              <SecondaryButton onClick={() => picker.current?.click()} className="px-2"><FileUp size={15} strokeWidth={1.5} /> Файл</SecondaryButton>
              <PrimaryButton tone="ink" onClick={() => parse(text)} disabled={!text.trim()} className="h-12">Разобрать</PrimaryButton>
            </div>
          </>
        )}
      </section>

      <section className="card space-y-3 p-4">
        <h3 className="text-[15px] font-medium">Один раз: инструкция проекта</h3>
        <p className="text-[13.5px] leading-snug">Чтобы чат понимал файл и отвечал изменениями в нужном виде, вставьте этот текст в <b className="font-medium">«Инструкции проекта»</b> «Финансы» вместо прежнего.</p>
        <SecondaryButton onClick={() => void copy(PROJECT_INSTRUCTIONS)} className="w-full"><Copy size={15} strokeWidth={1.5} /> Скопировать инструкцию</SecondaryButton>
        <button type="button" onClick={() => setShowInstr(!showInstr)} className="text-[12.5px] font-medium text-sea">{showInstr ? 'Скрыть текст' : 'Показать текст'}</button>
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
