import { BellRing, BriefcaseBusiness, ChevronRight, Download, KeyRound, MessagesSquare, PiggyBank, Repeat, Smartphone, Upload, Wallet } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Field, PrimaryButton, SecondaryButton, Segmented, Sheet, Switch, Tile } from '../components/ui';
import { MODELS } from '../domain/models';
import { ddmmyyyy, today } from '../domain/dates';
import { DEFAULT_PREPARATION_TIME } from '../domain/funds';
import { downloadFile } from '../domain/ics';
import { INSTALL_URL } from '../install/platform';
import { migrationBackupFile, useStore } from '../store/store';
import { MIGRATION_BACKUP_KEY } from '../store/financeStorage';
import { CATEGORY } from '../domain/plan';
import { toast, useUi } from '../store/ui';
import { disablePaymentPush, enablePaymentPush, paymentPushDiagnostics, pushConfigured, pushEnabled, testPaymentPush } from './paymentPush';
import { enableBadge, exportCalendar, exportCalendarTest, reminderDiagnostics, updateBadge } from './reminders';

export function SettingsSheet() {
  const open = useUi(s => s.settings);
  const set = useUi(s => s.set);
  return (
    <Sheet open={open} onClose={() => set({ settings: false })} title="Настройки">
      {open && <Body />}
    </Sheet>
  );
}

function Section({ title, id, children }: { title: string; id?: string; children: React.ReactNode }) {
  const focus = useUi(s => s.settingsFocus);
  const ref = useRef<HTMLElement>(null);
  const on = !!id && focus === id;
  // пришли из «Внимания» — прокрутить к разделу и на миг подсветить
  useEffect(() => {
    if (!on) return;
    const t = setTimeout(() => ref.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 350);
    const u = setTimeout(() => useUi.getState().set({ settingsFocus: null }), 2600);
    return () => { clearTimeout(t); clearTimeout(u); };
  }, [on]);
  return (
    <section ref={ref} className="mt-5 scroll-mt-3">
      <h3 className="mb-2 px-1 text-[14px] font-medium text-muted">{title}</h3>
      <div className={`card space-y-3 p-4 transition-shadow duration-700 ${on ? 'ring-2 ring-sea' : ''}`}>{children}</div>
    </section>
  );
}

function Body() {
  const s = useStore();
  const st = s.settings;
  const hasMigrationBackup = (() => { try { return localStorage.getItem(MIGRATION_BACKUP_KEY) != null; } catch { return false; } })();
  const pwaUpdateReady = useUi(s => s.pwaUpdateReady);
  const [key, setKey] = useState(st.apiKey);
  const file = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Record<string, unknown> | null>(null);
  const [beforeRestore, setBeforeRestore] = useState<string | null>(null);
  const count = (value: unknown) => Array.isArray(value) ? value.length : value && typeof value === 'object' ? Object.keys(value).length : 0;

  const backup = () => {
    downloadFile(`kurs-${today()}.json`, s.exportData(), 'application/json');
    s.setSettings({ lastBackupAt: new Date().toISOString() });
    toast('Сохраните файл в «Файлы» или iCloud Drive');
  };
  const restore = async (f?: File) => {
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (data?.app !== 'kurs' || !Array.isArray(data.debts) || !Array.isArray(data.expenses)) { toast('Выберите полную резервную копию «Курса»'); return; }
      setPending(data);
    } catch { toast('Файл не читается'); }
  };

  return (
    <div className="-mt-3">
      <Section title="План">
        {/* как в «Настройках» iPhone: у каждой строки свой цветной значок */}
        {([
          ['Связь с чатом «Финансы»', 'Файл обмена: туда и обратно', { sync: true }, MessagesSquare, '#8b63e0'],
          ['Обязательные платежи', 'Связь, спортзал, подписки — даты и суммы', { fixed: true }, Repeat, '#5b6fb8'],
          ['Зарплатная карта', 'Остаток для прогноза по дням', { card: true }, Wallet, '#1f8fb0'],
          ['Счета и операции', 'Сверки, переводы, займы и Сплит', { finance: true }, Wallet, '#1f8fb0'],
          ['Работа и доходы', 'Начисления, налоги и отпуска', { workSheet: true }, BriefcaseBusiness, '#397d70'],
          ['Остатки недель', 'Копилка и закрытые недели', { savings: true }, PiggyBank, '#e9a01c'],
        ] as const).map(([title, hint, open, Icon, color]) => (
          <button key={title} type="button" onClick={() => useUi.getState().set({ settings: false, ...open })} className="flex w-full items-center gap-3 py-1 text-left">
            <Tile c={color} className="size-9 !rounded-[11px]"><Icon size={17} strokeWidth={1.9} /></Tile>
            <span className="min-w-0 flex-1"><span className="block text-[14.5px] font-medium">{title}</span><span className="block text-[12.5px] text-muted">{hint}</span></span>
            <ChevronRight size={16} className="shrink-0 text-faint" />
          </button>
        ))}
      </Section>

      <Section title="Напоминания" id="reminders">
        <p className="text-[13.5px] leading-snug text-muted">На iPhone при закрытом «Курсе» напомнит приложение «Календарь». Сначала импортируйте файл и разрешите уведомления Календаря в настройках iOS.</p>
        <p className="text-[12.5px] text-muted">Подготовка платежей накануне и пополнение в воскресенье запланированы на {DEFAULT_PREPARATION_TIME} по Москве. Напоминания в Календаре отражают состояние при экспорте. После изменения дат или подготовки платежей обновите календарь.</p>
        <div className="grid grid-cols-2 gap-2">
          {[3, 0].map(d => {
            const on = st.remindDays.includes(d);
            return (
              <button key={d} type="button" onClick={() => s.setSettings({ remindDays: on ? st.remindDays.filter(x => x !== d) : [...st.remindDays, d] })}
                className={`rounded-xl py-2.5 text-[13px] font-medium ${on ? 'bg-sea text-on-sea' : 'bg-surface-2 text-muted'}`}>
                {d === 0 ? 'в день' : 'за 3 дня'}
              </button>
            );
          })}
        </div>
        <Field label="Время дополнительных напоминаний">
          <input type="time" value={st.remindTime} onChange={e => s.setSettings({ remindTime: e.target.value || '10:00' })} className="field" />
        </Field>
        <Switch checked={st.hideAmounts} onChange={v => s.setSettings({ hideAmounts: v })} label="Скрывать суммы" hint="Календарь покажет напоминания без сумм." />
        <PrimaryButton onClick={() => exportCalendar()}><BellRing size={18} /> Добавить в календарь iPhone</PrimaryButton>
        <p className="text-[12.5px] leading-snug text-faint">
          Выберите отдельный календарь «Курс». При изменении даты, суммы или оплаты замените старые события новой выгрузкой, чтобы iPhone не напоминал дважды.
          {st.lastIcsAt ? ` Последний раз: ${ddmmyyyy(st.lastIcsAt.slice(0, 10))}.` : ''}
        </p>
        <SecondaryButton onClick={() => void exportCalendarTest()} className="w-full">Тест уведомления Календаря через 3 минуты</SecondaryButton>
        <details className="text-[13px] text-muted">
          <summary className="text-sea">Диагностика уведомлений</summary>
          <ReminderStatus />
        </details>
        <Switch checked={st.badge} onChange={async v => {
          if (v && !(await enableBadge())) { toast('Разрешите уведомления для «Курса» в Настройках iPhone'); return; }
          s.setSettings({ badge: v });
          setTimeout(updateBadge, 0);
        }} label="Цифра на значке" hint="Сколько платежей горит или просрочено. Обновляется, когда открываете приложение." />
      </Section>

      <Section title="Разбор скриншотов (Claude)">
        <Field label="Ключ API Anthropic" hint={<>Создаётся на console.anthropic.com → API Keys. Это отдельный платный доступ, не подписка Claude. Хранится только на этом телефоне и не попадает в резервную копию.</>}>
          <div className="flex gap-2">
            <input value={key} onChange={e => setKey(e.target.value)} type="password" placeholder="sk-ant-…" autoCapitalize="off" autoCorrect="off" spellCheck={false} className="field text-[14px]" />
            <button type="button" onClick={() => { s.setSettings({ apiKey: key.trim() }); toast(key.trim() ? 'Ключ сохранён' : 'Ключ удалён'); }} className="shrink-0 rounded-2xl bg-sea px-4 text-on-sea" aria-label="Сохранить ключ"><KeyRound size={18} /></button>
          </div>
        </Field>
        <div className="space-y-1.5">
          {MODELS.map(m => (
            <button key={m.id} type="button" onClick={() => s.setSettings({ model: m.id })}
              className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left ${st.model === m.id ? 'bg-sea/12 ring-1 ring-sea' : 'bg-surface-2'}`}>
              <span><span className="block text-[14px] font-medium">{m.name}</span><span className="block text-[12px] text-muted">{m.note}</span></span>
              {st.model === m.id && <span className="text-[12px] font-medium text-sea">выбрано</span>}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Память продавцов">
        <p className="text-[13.5px] leading-snug text-muted">Сменили категорию при разборе скриншота — приложение запомнит продавца. «Это я» — переводы на своё имя не считаются тратами.</p>
        {Object.keys(s.merchantMemory).length === 0
          ? <p className="text-[12.5px] text-faint">Пока пусто: правила появятся после первого разбора текста со скриншота.</p>
          : (
            <div className="divide-hair -mx-1">
              {Object.entries(s.merchantMemory).sort(([a], [b]) => a.localeCompare(b)).map(([k, rule]) => (
                <div key={k} className="flex items-center justify-between gap-3 px-1 py-2 text-[13.5px]">
                  <span className="min-w-0 truncate">{k.replace(/^person:/, '')}{k.startsWith('person:') ? <span className="text-faint"> (человек)</span> : null}</span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="text-muted">{rule === 'self' ? 'это я' : rule === 'skip' ? 'пропускать' : CATEGORY[rule].short}</span>
                    <button type="button" onClick={() => s.remember(k, null)} className="text-[12.5px] font-medium text-neg">Забыть</button>
                  </span>
                </div>
              ))}
            </div>
          )}
      </Section>

      <Section title="Данные" id="backup">
        <p className="text-[13.5px] leading-snug text-muted">Всё хранится только на этом телефоне. Удалите приложение или очистите данные сайта — пропадёт. Сохраняйте копию раз в две недели.</p>
        <input ref={file} type="file" accept="application/json,.json" hidden onChange={e => { void restore(e.target.files?.[0]); e.target.value = ''; }} />
        <div className="grid grid-cols-2 gap-2">
          <SecondaryButton onClick={backup}><Download size={17} /> Сохранить</SecondaryButton>
          {!import.meta.env.VITE_DEMO && <SecondaryButton onClick={() => file.current?.click()}><Upload size={17} /> Загрузить</SecondaryButton>}
        </div>
        {hasMigrationBackup && <SecondaryButton className="w-full" onClick={() => {
          try {
            const backup = migrationBackupFile();
            if (backup) setPending(JSON.parse(backup));
          } catch { toast('Копия до обновления не прошла проверку'); }
        }}>Копия до обновления</SecondaryButton>}
        {pending && <div className="space-y-2 rounded-xl bg-surface-2 p-3 text-[13px]">
          <p className="font-medium">Предпросмотр восстановления</p>
          {([['Покупки', 'expenses'], ['Долги', 'debts'], ['Отметки календаря', 'marks'], ['Отметки чек-листа', 'checks'],
            ['Сверки', 'checkups'], ['История резерва', 'reserveLog'], ['История импорта', 'imports']] as const).map(([label, key]) =>
            <div key={key} className="flex justify-between"><span>{label}</span><span>{count(s[key])} → {count(pending[key])}</span></div>)}
          <SecondaryButton className="w-full" onClick={backup}>Скачать копию текущих данных</SecondaryButton>
          <PrimaryButton onClick={() => {
            const previous = s.exportData();
            try {
              if (!s.importData(pending)) { toast('Резервная копия несовместима'); return; }
              setBeforeRestore(previous); setPending(null); toast('Копия восстановлена');
            } catch { toast('Восстановление не удалось'); }
          }}>Восстановить из файла</PrimaryButton>
          <SecondaryButton className="w-full" onClick={() => setPending(null)}>Отмена</SecondaryButton>
        </div>}
        {beforeRestore && <SecondaryButton className="w-full" onClick={() => {
          if (s.importData(JSON.parse(beforeRestore))) { setBeforeRestore(null); toast('Восстановление отменено'); }
        }}>Отменить последнее восстановление</SecondaryButton>}
        {st.lastBackupAt && <p className="text-[12.5px] text-faint">Последняя копия: {ddmmyyyy(st.lastBackupAt.slice(0, 10))}</p>}
      </Section>

      <Section title="Оформление">
        <Segmented value={st.theme} onChange={v => s.setSettings({ theme: v })} options={[{ id: 'system', label: 'Как в системе' }, { id: 'light', label: 'Светлая' }, { id: 'dark', label: 'Тёмная' }]} />
      </Section>

      <Section title="Приложение">
        {pwaUpdateReady && <PrimaryButton onClick={() => window.location.reload()}>Открыть обновлённую версию</PrimaryButton>}
        <a href={INSTALL_URL} className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-surface-2 text-[15px] font-medium"><Smartphone size={18} /> Установка на iPhone</a>
        <button type="button" onClick={() => useUi.getState().set({ settings: false, tour: true })} className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-surface-2 text-[15px] font-medium">Что где в приложении</button>
        <button type="button" onClick={() => { if (confirm('Стереть все данные «Курса» на этом телефоне? Сначала сохраните копию.')) { s.reset(); useUi.getState().set({ settings: false }); } }}
          className="w-full py-2 text-[13px] font-medium text-neg">Стереть все данные</button>
        <p className="text-center text-[12px] text-faint">Курс {__APP_VERSION__}</p>
      </Section>
    </div>
  );
}


function ReminderStatus() {
  const [enabled, setEnabled] = useState(pushEnabled);
  const [technical, setTechnical] = useState<Awaited<ReturnType<typeof paymentPushDiagnostics>> | null>(null);
  useEffect(() => {
    let active = true;
    void paymentPushDiagnostics().then(value => { if (active) setTechnical(value); }).catch(() => {});
    return () => { active = false; };
  }, [enabled]);
  const [busy, setBusy] = useState(false);
  const status = reminderDiagnostics();
  const permissions = { granted: 'разрешение выдано', denied: 'разрешение запрещено', default: 'разрешение не запрашивали', unavailable: 'разрешение недоступно' };
  return <div className="mt-2 space-y-1">
    <p>Режим {status.mode ? 'с экрана «Домой»' : 'в браузере'}. {status.online ? 'Сеть доступна.' : 'Сети нет. Календарь работает с ранее импортированными событиями.'}</p>
    <p>Web Push {status.worker && status.push ? 'поддерживается устройством' : 'недоступен в этом режиме'}, {permissions[status.permission]}.</p>
    {pushConfigured ? <>
      {technical && <p>Подписка {technical.subscribed ? 'есть' : 'отсутствует'}. Отправитель {
        technical.backend === 'online' ? 'ответил' : technical.backend === 'unavailable' ? 'не ответил' : 'ожидает проверки'}.
        {technical.latestSync && <> Последняя сверка {new Date(technical.latestSync).toLocaleString('ru-RU')}.</>}
        {technical.scheduled != null && <> Напоминаний в очереди {technical.scheduled}.</>}</p>}
      <Switch checked={enabled} onChange={async next => {
        if (busy) return;
        setBusy(true);
        try {
          if (next) {
            const ok = await enablePaymentPush();
            setEnabled(ok);
            if (!ok) toast('Проверьте установку на экран «Домой», сеть и разрешение уведомлений');
          } else { setEnabled(false); await disablePaymentPush(); }
        } catch { toast('Изменение подписки будет повторено при подключении к сети'); }
        finally { setBusy(false); }
      }} label="Уведомления о платежах" hint="Отправитель получает подписку и время уведомления без сумм и названий." />
      {enabled && <SecondaryButton onClick={async () => {
        toast(await testPaymentPush() ? 'Тест передан отправителю. Проверьте системное уведомление.' : 'Тест не принят. Проверьте сеть и отправителя.');
      }} className="w-full">Отправить тест Web Push</SecondaryButton>}
    </> : <p>Отправитель Web Push не подключён. Системные напоминания доступны через Календарь.</p>}
  </div>;
}
