// Связь с чатом «Финансы»: один файл обмена в обе стороны (domain/exchange.ts).
// Приложение отдаёт всё состояние; ответ чата показывается карточками по одной: принять или пропустить — и применяется
// принятое.
// А ещё — новая редакция зашифрованного плана с сайта: подтягивается по коду, данные на телефоне остаются.
import { ArrowDownToLine, ArrowUpFromLine, Check, ClipboardPaste, Copy, Download, FileUp, Share2, X } from 'lucide-react';
import { AnimatePresence, motion, useMotionValue, useTransform } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { haptic } from '../components/haptics';
import { usePan } from '../components/motion';
import { Field, PrimaryButton, SecondaryButton, Segmented, Sheet, Tile } from '../components/ui';
import { today } from '../domain/dates';
import {
  applyExchange, buildExchange, exchangeDigest, exchangeFileName, normalize, parseExchange, previewExchange, type ExchangeFile, type ExchangeSection, type SectionId,
} from '../domain/exchange';
import { downloadFile } from '../domain/ics';
import { PROJECT_INSTRUCTIONS, PROTOCOL_VERSION } from '../domain/sync';
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

const exportText = (short: boolean) => JSON.stringify(buildExchange(useStore.getState(), today(), { short }), null, 1);

async function copy(text: string) {
  try { await navigator.clipboard.writeText(text); toast('Скопировано'); } catch { toast('Не удалось скопировать'); }
}

function Body() {
  const inbox = useUi(s => s.inbox);
  const [text, setText] = useState(inbox?.text ?? '');
  const [file, setFile] = useState<ExchangeFile | null>(null);
  const [sections, setSections] = useState<ExchangeSection[]>([]);
  const [off, setOff] = useState<Set<SectionId>>(new Set());
  const [showInstr, setShowInstr] = useState(false);
  const [short, setShort] = useState(true);
  const [digest, setDigest] = useState<string[]>([]);
  const imports = useStore(s => s.imports);
  const picker = useRef<HTMLInputElement>(null);
  const name = exchangeFileName(today());

  const share = async () => {
    const body = exportText(short);
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
    setFile(f); setSections(list); setOff(new Set()); setDigest(exchangeDigest(f, useStore.getState(), today()));
  };
  // файл, доставленный с сайта, сразу разбираем; отметка «применён» — когда его применили или вернулись назад
  useEffect(() => { if (inbox) parse(inbox.text); }, []);
  const seenInbox = () => {
    if (!inbox) return;
    useStore.getState().setSettings({ inboxSeen: inbox.id });
    useUi.getState().set({ inbox: null });
  };
  const apply = () => {
    if (!file) return;
    seenInbox();
    const s = useStore.getState();
    const only = new Set(sections.map(x => x.id).filter(id => !off.has(id)));
    s.applySync(applyExchange(file, s, today(), only, uid), file.summary || digest.join('; ') || 'Изменения из чата');
    toast('Изменения из чата применены');
    setFile(null); setText('');
    useUi.getState().set({ sync: false });
  };
  const decide = (id: SectionId, accept: boolean) => setOff(prev => {
    const next = new Set(prev);
    if (accept) next.delete(id); else next.add(id);
    return next;
  });

  // ответ чата одним касанием: прочитать буфер (iPhone спросит «Вставить») и сразу показать изменения
  const pasteAnswer = async () => {
    let raw = '';
    try { raw = await navigator.clipboard.readText(); } catch { /* буфер закрыт */ }
    if (raw.trim()) parse(raw); else toast('Буфер пуст или закрыт — вставьте ответ в поле ниже');
  };

  // ответ чата разобран — на экране только его изменения, по одному
  if (file) {
    return <Review file={file} sections={sections} digest={digest} off={off} decide={decide} onBack={() => { seenInbox(); setFile(null); }} onApply={apply} />;
  }

  return (
    <div className="space-y-5 pt-1">
      {/* обмен в два касания: скопировать файл для чата — и вставить его ответ. Подробности — ниже */}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => void copy(exportText(true))} className="deep-card px-4 py-4 text-left transition-transform duration-100 active:scale-[.97]" style={{ background: 'linear-gradient(165deg, #8f58e2 0%, #6a3fc0 55%, #432a86 100%)' }}>
          <span aria-hidden="true" className="deep-sheen" />
          <ArrowUpFromLine size={22} strokeWidth={1.9} />
          <span className="mt-2 block text-[15.5px] leading-tight font-medium">Скопировать для чата</span>
          <span className="mt-1 block text-[12px] leading-snug text-white/75">короткий файл для сверки</span>
        </button>
        <button type="button" onClick={() => void pasteAnswer()} className="deep-card px-4 py-4 text-left transition-transform duration-100 active:scale-[.97]">
          <span aria-hidden="true" className="deep-sheen" />
          <ArrowDownToLine size={22} strokeWidth={1.9} />
          <span className="mt-2 block text-[15.5px] leading-tight font-medium">Вставить ответ чата</span>
          <span className="mt-1 block text-[12px] leading-snug text-card-muted">покажу, что изменится</span>
        </button>
      </div>
      <section className="card space-y-3 p-4">
        <h3 className="flex items-center gap-2.5 text-[15px] font-medium"><Tile c="#8b63e0" className="size-8 !rounded-[10px]"><ArrowUpFromLine size={16} strokeWidth={2} /></Tile>Из приложения в чат</h3>
        <p className="text-[13.5px] leading-snug">Файл со всем, что знает приложение. Добавьте его в <b className="font-medium">файлы проекта «Финансы»</b> вместо прошлого или приложите к сообщению.</p>
        <Segmented value={short ? 'short' : 'full'} onChange={v => setShort(v === 'short')} options={[{ id: 'short', label: 'Коротко, для сверки' }, { id: 'full', label: 'Полностью' }]} />
        <p className="text-[12px] leading-snug text-muted">{short ? 'Календарь на 2 недели назад и 45 дней вперёд, траты за 14 дней, 4 недели, без стратегии — чтобы не вставлять в чат тысячи строк.' : 'Всё: календарь с дальними поправками, траты за 90 дней, шаблоны, стратегия и правила.'}</p>
        <PrimaryButton onClick={() => void copy(exportText(short))}><Copy size={17} strokeWidth={1.6} /> Отправить в Claude — скопировать</PrimaryButton>
        <div className="grid grid-cols-2 gap-2">
          <SecondaryButton onClick={() => void share()}><Share2 size={15} strokeWidth={1.5} /> Поделиться</SecondaryButton>
          <SecondaryButton onClick={() => downloadFile(name, exportText(short), 'application/json')}><Download size={15} strokeWidth={1.5} /> Сохранить</SecondaryButton>
        </div>
      </section>

      <section className="card space-y-3 p-4">
        <h3 className="flex items-center gap-2.5 text-[15px] font-medium"><Tile c="#1f8fb0" className="size-8 !rounded-[10px]"><ArrowDownToLine size={16} strokeWidth={2} /></Tile>Из чата в приложение</h3>
        <p className="text-[13.5px] leading-snug">Попросите в чате: <i>«внеси изменения в приложение»</i>. Чат ответит файлом обмена — блоком кода или файлом. Вставьте ответ целиком или выберите файл.</p>
        <textarea value={text} onChange={e => setText(e.target.value)} rows={5} placeholder='{ "app": "kurs-exchange", … }' className="field font-mono text-[13px]" />
        <input ref={picker} type="file" accept="application/json,.json,.txt,text/plain" hidden onChange={async e => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) parse(await f.text());
        }} />
        <div className="grid grid-cols-3 gap-2">
          <SecondaryButton onClick={async () => { try { setText(await navigator.clipboard.readText()); } catch { toast('Вставьте вручную: удерживайте палец в поле'); } }} className="px-2"><ClipboardPaste size={15} strokeWidth={1.5} /> Из Claude</SecondaryButton>
          <SecondaryButton onClick={() => picker.current?.click()} className="px-2"><FileUp size={15} strokeWidth={1.5} /> Файл</SecondaryButton>
          <PrimaryButton tone="ink" onClick={() => parse(text)} disabled={!text.trim()} className="h-12">Разобрать</PrimaryButton>
        </div>
      </section>

      {imports.length > 0 && (
        <section className="card p-4">
          <h3 className="text-[15px] font-medium">Последние импорты</h3>
          <p className="mt-1 text-[12.5px] leading-snug text-muted">Прислали неверный блок — откатите: данные вернутся к виду до импорта.</p>
          <div className="divide-hair mt-2">
            {[...imports].reverse().map(r => (
              <div key={r.id} className="flex items-start gap-3 py-2.5">
                <span className="min-w-0 flex-1 text-[13px] leading-snug"><span className="text-muted">{new Date(r.at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span><br />{r.summary}</span>
                <button type="button" className="shrink-0 rounded-full border border-line px-3 py-1.5 text-[12.5px] font-medium"
                  onClick={() => { if (confirm('Вернуть данные к виду до этого импорта? Более поздние импорты тоже отменятся.')) { useStore.getState().rollbackImport(r.id); toast('Импорт откатан'); } }}>Откатить</button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="card space-y-3 p-4">
        <h3 className="text-[15px] font-medium">Протокол обмена, версия {PROTOCOL_VERSION}</h3>
        <p className="text-[13.5px] leading-snug">Чтобы чат понимал файл и отвечал изменениями в нужном виде, вставьте этот текст в <b className="font-medium">«Инструкции проекта»</b> «Финансы» вместо прежнего.</p>
        <SecondaryButton onClick={() => void copy(PROJECT_INSTRUCTIONS)} className="w-full"><Copy size={15} strokeWidth={1.5} /> Скопировать инструкцию</SecondaryButton>
        <button type="button" onClick={() => setShowInstr(!showInstr)} className="text-[12.5px] font-medium text-sea">{showInstr ? 'Скрыть текст' : 'Показать текст'}</button>
        {showInstr && <pre className="max-h-72 overflow-auto rounded-xl bg-surface-2 p-3 text-[11.5px] leading-snug whitespace-pre-wrap">{PROJECT_INSTRUCTIONS}</pre>}
      </section>
    </div>
  );
}

/* ---------- Изменения из чата: по одному ---------- */

const count = (n: number) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'изменение' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'изменения' : 'изменений'}`;

/** Ответ чата — стопкой карточек: одна карточка — один раздел изменений («Лимиты: 8 000 → 9 000»). Вправо или
 *  «Принять» — берём, влево или «Пропустить» — нет. В конце — итог, где решение можно поменять, и «Применить» */
function Review({ file, sections, digest, off, decide, onBack, onApply }: {
  file: ExchangeFile; sections: ExchangeSection[]; digest: string[]; off: Set<SectionId>;
  decide: (id: SectionId, accept: boolean) => void; onBack: () => void; onApply: () => void;
}) {
  const [i, setI] = useState(0);
  const [dir, setDir] = useState(1);
  const sec = sections[i];
  const warn = digest.filter(d => d.startsWith('⚠'));
  const answer = (accept: boolean) => {
    if (!sec) return;
    haptic();
    setDir(accept ? 1 : -1);
    decide(sec.id, accept);
    setI(i + 1);
  };
  const taken = sections.filter(x => !off.has(x.id)).length;
  return (
    <div className="space-y-3 pt-1">
      {file.summary && <p className="text-[14.5px] leading-snug font-medium">{file.summary}</p>}
      {warn.length > 0 && (
        <ul className="space-y-1 rounded-2xl bg-neg/10 px-3.5 py-2.5 text-[13px] leading-snug text-neg">{warn.map((d, k) => <li key={k}>{d}</li>)}</ul>
      )}
      <div className="flex items-center gap-1.5" aria-label={sec ? `Изменение ${i + 1} из ${sections.length}` : 'Итог'}>
        {sections.map((x, k) => (
          <span key={x.id} className={`h-1 flex-1 rounded-full transition-colors duration-300 ${k > i ? 'bg-ink/12' : k === i ? 'bg-ink/45' : off.has(x.id) ? 'bg-ink/25' : 'bg-pos'}`} />
        ))}
      </div>
      <AnimatePresence mode="wait" custom={dir} initial={false}>
        {sec ? (
          <ChangeCard key={sec.id} sec={sec} n={i + 1} total={sections.length} dir={dir} onAnswer={answer} />
        ) : (
          <motion.div key="sum" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ type: 'spring', bounce: 0.15, duration: 0.4 }} className="space-y-3">
            <section className="card p-4">
              <h3 className="text-[16px] font-medium">{taken ? `Принято ${taken} из ${sections.length}` : 'Ничего не принято'}</h3>
              <p className="mt-0.5 text-[12.5px] text-muted">Нажмите на строку, чтобы передумать. Чего нет в файле, не меняется.</p>
              <div className="divide-hair mt-1.5">
                {sections.map(x => {
                  const on = !off.has(x.id);
                  return (
                    <button key={x.id} type="button" onClick={() => { haptic(); decide(x.id, !on); }} aria-pressed={on} className="flex w-full items-center gap-3 py-2.5 text-left">
                      <span className={`grid size-7 shrink-0 place-items-center rounded-full transition-colors duration-200 ${on ? 'bg-pos text-white' : 'bg-surface-2 text-faint'}`}>{on ? <Check size={15} strokeWidth={2.4} /> : <X size={14} strokeWidth={2} />}</span>
                      <span className="min-w-0 flex-1">
                        <span className={`block text-[14.5px] leading-tight font-medium ${on ? '' : 'text-faint line-through'}`}>{x.title}</span>
                        <span className="block text-[12px] text-muted">{count(x.lines.length)}</span>
                      </span>
                      <span className={`text-[12.5px] font-medium ${on ? 'text-pos' : 'text-faint'}`}>{on ? 'принято' : 'пропущено'}</span>
                    </button>
                  );
                })}
              </div>
            </section>
            <div className="grid grid-cols-[auto_1fr] gap-2">
              <SecondaryButton onClick={() => setI(0)}>Заново</SecondaryButton>
              <PrimaryButton onClick={onApply} disabled={!taken}>{taken ? `Применить: ${count(sections.filter(x => !off.has(x.id)).reduce((t, x) => t + x.lines.length, 0))}` : 'Нечего применять'}</PrimaryButton>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="flex items-center justify-between pt-0.5 text-[13px] font-medium">
        <button type="button" onClick={onBack} className="py-2 text-muted">Отмена</button>
        {sec && sections.length - i > 1 && (
          <button type="button" onClick={() => { haptic(); sections.slice(i).forEach(x => decide(x.id, true)); setDir(1); setI(sections.length); }} className="py-2 text-sea">Принять всё оставшееся</button>
        )}
      </div>
    </div>
  );
}

/** Одна карточка изменений: тянется пальцем, под пальцем проступает «Принять» или «Пропустить» */
function ChangeCard({ sec, n, total, dir, onAnswer }: { sec: ExchangeSection; n: number; total: number; dir: number; onAnswer: (accept: boolean) => void }) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 0, 200], [-5, 0, 5]);
  const yes = useTransform(x, [20, 100], [0, 1]);
  const no = useTransform(x, [-100, -20], [1, 0]);
  const pan = usePan({
    axis: 'x',
    onMove: d => x.set(d),
    onEnd: (d, v) => { if (d > 90 || v > 500) onAnswer(true); else if (d < -90 || v < -500) onAnswer(false); else x.set(0); },
  });
  const fresh = sec.lines.filter(l => !l.startsWith('Уже есть'));
  const have = sec.lines.length - fresh.length;
  return (
    <motion.section {...pan} custom={dir} style={{ x, rotate, touchAction: 'pan-y' }}
      variants={{ enter: { opacity: 0, y: 18, scale: 0.97 }, center: { opacity: 1, y: 0, scale: 1 }, exit: (d: number) => ({ opacity: 0, x: d * 240, transition: { duration: 0.18 } }) }}
      initial="enter" animate="center" exit="exit" transition={{ type: 'spring', bounce: 0.18, duration: 0.4 }}
      className="card relative overflow-hidden p-4 shadow-[0_18px_36px_-24px_rgba(10,36,51,.55)]">
      <motion.span aria-hidden="true" style={{ opacity: yes }} className="absolute top-3 right-3 rounded-full bg-pos px-3 py-1 text-[12.5px] font-medium text-white">Принять</motion.span>
      <motion.span aria-hidden="true" style={{ opacity: no }} className="absolute top-3 right-3 rounded-full bg-ink/70 px-3 py-1 text-[12.5px] font-medium text-bg">Пропустить</motion.span>
      <div className="text-[12.5px] font-medium text-sea">Изменение {n} из {total}</div>
      <h3 className="mt-0.5 text-[17px] leading-snug font-medium">{sec.title}</h3>
      <ul className={`mt-2 max-h-[34vh] space-y-1.5 overflow-y-auto overscroll-contain leading-snug ${fresh.length === 1 ? 'text-[16px]' : 'text-[14px]'}`}>
        {fresh.map((l, k) => <li key={k} className={l.startsWith('⚠') ? 'text-neg' : ''}>{l}</li>)}
      </ul>
      {have > 0 && <p className="mt-2 text-[12px] text-faint">Ещё {have} уже есть в приложении — повторно не добавятся</p>}
      <div className="mt-3.5 grid grid-cols-2 gap-2">
        <SecondaryButton onClick={() => onAnswer(false)}>Пропустить</SecondaryButton>
        <PrimaryButton onClick={() => onAnswer(true)} className="!h-12"><Check size={17} strokeWidth={2} /> Принять</PrimaryButton>
      </div>
      <p className="mt-2 text-center text-[11.5px] text-faint">Или смахните: вправо — принять, влево — пропустить</p>
    </motion.section>
  );
}

/* ---------- Новая редакция плана с сайта ---------- */

/** На сайте план новее, чем на телефоне? Есть код — обновить молча, нет — попросить код */
export async function checkPlan(): Promise<'updated' | 'unlock' | 'none'> {
  if (import.meta.env.VITE_DEMO || !navigator.onLine) return 'none';
  try {
    const sealed = (await (await fetch('./seed.enc.json', { cache: 'no-cache' })).json()) as Sealed;
    const s = useStore.getState();
    // план, загруженный до появления редакций, считается первой редакцией; «с нуля» — без плана, не обновляем
    const localRev = s.planRev || (s.plan ? 1 : 0);
    if (!localRev || (sealed.rev ?? 1) <= localRev) return 'none';
    if (s.planCode) {
      const plain = await openSealed(sealed, s.planCode);
      if (plain) { s.updateFromSeed(JSON.parse(plain) as PlanSeed, s.planCode); toast('План обновлён до новой редакции'); return 'updated'; }
    }
    useUi.getState().set({ unlock: true });
    return 'unlock';
  } catch { return 'none'; /* нет сети или файла — попробуем в следующий раз */ }
}

/** Новый файл обмена с сайта (зашифрован кодом плана) — открыть в окне обмена; применить или нет — решает человек */
export async function checkInbox(): Promise<boolean> {
  if (import.meta.env.VITE_DEMO || !navigator.onLine) return false;
  try {
    const res = await fetch('./inbox.enc.json', { cache: 'no-cache' });
    if (!res.ok) return false;
    const sealed = (await res.json()) as Sealed & { id?: string };
    const s = useStore.getState();
    if (!sealed.id || !s.planCode || s.settings.inboxSeen === sealed.id) return false;
    const plain = await openSealed(sealed, s.planCode);
    if (!plain) return false;
    useUi.getState().set({ sync: true, inbox: { id: sealed.id, text: plain } });
    return true;
  } catch { return false; /* нет сети или файла */ }
}

/** При запуске — проверить новую редакцию плана */
export function usePlanUpdates() {
  const ready = useStore(s => s.ready);
  useEffect(() => { if (ready) void checkPlan(); }, [ready]);
}

/** При запуске — проверить файл обмена с сайта */
export function useInbox() {
  const ready = useStore(s => s.ready);
  useEffect(() => { if (ready) void checkInbox(); }, [ready]);
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
