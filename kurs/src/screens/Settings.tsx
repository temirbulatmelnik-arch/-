import { BellRing, ChevronRight, Download, KeyRound, Smartphone, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { Field, PrimaryButton, SecondaryButton, Segmented, Sheet, Switch } from '../components/ui';
import { MODELS } from '../domain/models';
import { ddmmyyyy, today } from '../domain/dates';
import { downloadFile } from '../domain/ics';
import { INSTALL_URL } from '../install/platform';
import { useStore } from '../store/store';
import { toast, useUi } from '../store/ui';
import { enableBadge, exportCalendar, updateBadge } from './reminders';

export function SettingsSheet() {
  const open = useUi(s => s.settings);
  const set = useUi(s => s.set);
  return (
    <Sheet open={open} onClose={() => set({ settings: false })} title="Настройки">
      {open && <Body />}
    </Sheet>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <h3 className="mb-2 px-1 text-[13px] font-medium tracking-wide text-muted uppercase">{title}</h3>
      <div className="card space-y-3 p-4">{children}</div>
    </section>
  );
}

function Body() {
  const s = useStore();
  const st = s.settings;
  const [key, setKey] = useState(st.apiKey);
  const file = useRef<HTMLInputElement>(null);

  const backup = () => {
    downloadFile(`kurs-${today()}.json`, s.exportData(), 'application/json');
    s.setSettings({ lastBackupAt: new Date().toISOString() });
    toast('Сохраните файл в «Файлы» или iCloud Drive');
  };
  const restore = async (f?: File) => {
    if (!f) return;
    try {
      if (!confirm('Заменить все данные на этом телефоне данными из файла?')) return;
      toast(s.importData(JSON.parse(await f.text())) ? 'Данные восстановлены' : 'Это не резервная копия «Курса»');
    } catch { toast('Файл не читается'); }
  };

  return (
    <div className="-mt-3">
      <Section title="План">
        {([
          ['Связь с чатом «Финансы»', 'Отчёт для чата и обновление плана из него', { sync: true }],
          ['Обязательные платежи', 'Связь, спортзал, подписки — даты и суммы', { fixed: true }],
          ['Зарплатная карта', 'Остаток для прогноза по дням', { card: true }],
          ['Остатки недель', 'Копилка и закрытые недели', { savings: true }],
        ] as const).map(([title, hint, open]) => (
          <button key={title} type="button" onClick={() => useUi.getState().set({ settings: false, ...open })} className="flex w-full items-center justify-between gap-3 py-1 text-left">
            <span><span className="block text-[14.5px] font-medium">{title}</span><span className="block text-[12.5px] text-muted">{hint}</span></span>
            <ChevronRight size={16} className="shrink-0 text-faint" />
          </button>
        ))}
      </Section>

      <Section title="Напоминания">
        <p className="text-[13.5px] leading-snug text-muted">Веб-приложение не может само будить телефон по расписанию, поэтому напоминания идут через календарь iPhone: один файл — все платежи, поступления и понедельники на полгода, с будильниками.</p>
        <div className="grid grid-cols-3 gap-2">
          {[3, 1, 0].map(d => {
            const on = st.remindDays.includes(d);
            return (
              <button key={d} type="button" onClick={() => s.setSettings({ remindDays: on ? st.remindDays.filter(x => x !== d) : [...st.remindDays, d] })}
                className={`rounded-xl py-2.5 text-[13px] font-medium ${on ? 'bg-sea text-on-sea' : 'bg-surface-2 text-muted'}`}>
                {d === 0 ? 'в день' : d === 1 ? 'за день' : 'за 3 дня'}
              </button>
            );
          })}
        </div>
        <Field label="Во сколько напоминать">
          <input type="time" value={st.remindTime} onChange={e => s.setSettings({ remindTime: e.target.value || '10:00' })} className="field" />
        </Field>
        <Switch checked={st.hideAmounts} onChange={v => s.setSettings({ hideAmounts: v })} label="Скрывать суммы" hint="На экране блокировки будет только «Курс: Кредитка, минимальный»." />
        <PrimaryButton onClick={() => exportCalendar()}><BellRing size={18} /> Добавить в календарь iPhone</PrimaryButton>
        <p className="text-[12.5px] leading-snug text-faint">
          Откроется окно «Добавить все» — подтвердите. Повторная загрузка обновит события, а не задублирует.
          {st.lastIcsAt ? ` Последний раз: ${ddmmyyyy(st.lastIcsAt.slice(0, 10))}.` : ''} Обновляйте после крупных изменений и раз в квартал.
        </p>
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

      <Section title="Данные">
        <p className="text-[13.5px] leading-snug text-muted">Всё хранится только на этом телефоне. Удалите приложение или очистите данные сайта — пропадёт. Сохраняйте копию раз в две недели.</p>
        <input ref={file} type="file" accept="application/json,.json" hidden onChange={e => { void restore(e.target.files?.[0]); e.target.value = ''; }} />
        <div className="grid grid-cols-2 gap-2">
          <SecondaryButton onClick={backup}><Download size={17} /> Сохранить</SecondaryButton>
          <SecondaryButton onClick={() => file.current?.click()}><Upload size={17} /> Загрузить</SecondaryButton>
        </div>
        {st.lastBackupAt && <p className="text-[12.5px] text-faint">Последняя копия: {ddmmyyyy(st.lastBackupAt.slice(0, 10))}</p>}
      </Section>

      <Section title="Оформление">
        <Segmented value={st.theme} onChange={v => s.setSettings({ theme: v })} options={[{ id: 'system', label: 'Как в системе' }, { id: 'light', label: 'Светлая' }, { id: 'dark', label: 'Тёмная' }]} />
      </Section>

      <Section title="Приложение">
        <a href={INSTALL_URL} className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-surface-2 text-[15px] font-medium"><Smartphone size={18} /> Установка на iPhone</a>
        <button type="button" onClick={() => { if (confirm('Стереть все данные «Курса» на этом телефоне? Сначала сохраните копию.')) { s.reset(); useUi.getState().set({ settings: false }); } }}
          className="w-full py-2 text-[13px] font-medium text-neg">Стереть все данные</button>
        <p className="text-center text-[12px] text-faint">Курс {__APP_VERSION__}</p>
      </Section>
    </div>
  );
}
