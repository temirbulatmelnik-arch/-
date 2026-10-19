import { BellRing, Download, ExternalLink, Minus, Mic, PersonStanding, Plus, Smartphone, Timer, Trash2, Upload, Vibrate, Volume2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { SecondaryButton, Switch } from '../components/ui';
import { voiceSupported } from '../engine/cues';
import { buildIcs, downloadFile } from '../engine/reminders';
import { INSTALL_URL, isStandalone } from '../install/platform';
import { MAX_GOAL, useStore, type Theme } from '../store/store';

const THEMES: [Theme, string][] = [['system', 'Как в системе'], ['light', 'Светлая'], ['dark', 'Тёмная']];

// Внутри чужой страницы (превью) браузер не даёт скачивать файлы
const embedded = window.self !== window.top;
const EMBEDDED_NOTE = 'В превью скачивание файлов недоступно. Откройте приложение по своему адресу или установите на телефон.';

export function Settings() {
  const { settings, setSettings, history, levelId, levelSince, intensive, checks, importData, reset } = useStore();
  const file = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);

  const setTime = (i: number, v: string) => setSettings({ reminders: settings.reminders.map((t, k) => (k === i ? v : t)) });

  const exportData = () => {
    downloadFile(`tonus-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ app: 'tonus', version: 3, levelId, levelSince, intensive, settings, history, checks }, null, 2), 'application/json');
  };

  const onImport = async (f: File | undefined) => {
    if (!f) return;
    try {
      setMsg(importData(JSON.parse(await f.text())) ? 'Данные загружены.' : 'Это не файл «Тонуса».');
    } catch {
      setMsg('Не удалось прочитать файл.');
    }
  };

  return (
    <div className="space-y-5">
      <section>
        <h3 className="mb-1 text-[13px] font-medium tracking-wide text-muted uppercase">Подсказки</h3>
        <div className="card divide-y divide-line px-4">
          <Switch checked={settings.sound} onChange={v => setSettings({ sound: v })} label="Звуковые сигналы" hint="Высокий тон — сжать, низкий — расслабить" icon={<Volume2 size={18} />} />
          <Switch checked={settings.voice} onChange={v => setSettings({ voice: v })} label="Голосовые подсказки" hint={voiceSupported() ? '«Сжать», «Расслабить», названия блоков' : 'Браузер не поддерживает голос'} icon={<Mic size={18} />} />
          <Switch checked={settings.vibration} onChange={v => setSettings({ vibration: v })} label="Вибрация" hint="Можно заниматься с закрытыми глазами (Android)" icon={<Vibrate size={18} />} />
          <Switch checked={settings.ticks} onChange={v => setSettings({ ticks: v })} label="Отсчёт последних секунд" hint="Тихие щелчки в конце удержания" icon={<Timer size={18} />} />
          <Switch checked={settings.intro} onChange={v => setSettings({ intro: v })} label="Объяснение перед упражнением" hint="3D-демонстрация и подробная инструкция, тренировка ждёт до 30 с" icon={<PersonStanding size={18} />} />
        </div>
      </section>

      <section>
        <h3 className="mb-1 text-[13px] font-medium tracking-wide text-muted uppercase">Цель</h3>
        <div className="card flex items-center justify-between px-4 py-3">
          <div>
            <div className="text-[15px] font-medium">Тренировок в день</div>
            <div className="text-[13px] text-muted">Одна основная, остальные лёгкие. Рекомендуется 2</div>
          </div>
          <div className="flex items-center gap-3">
            <button type="button" aria-label="Меньше" onClick={() => setSettings({ dailyGoal: Math.max(1, settings.dailyGoal - 1) })} className="grid size-9 place-items-center rounded-xl bg-surface-2"><Minus size={18} /></button>
            <span className="w-5 text-center text-[20px] font-semibold">{settings.dailyGoal}</span>
            <button type="button" aria-label="Больше" onClick={() => setSettings({ dailyGoal: Math.min(MAX_GOAL, settings.dailyGoal + 1) })} className="grid size-9 place-items-center rounded-xl bg-surface-2"><Plus size={18} /></button>
          </div>
        </div>
      </section>

      <section>
        <h3 className="mb-1 text-[13px] font-medium tracking-wide text-muted uppercase">Напоминания</h3>
        <div className="card p-4">
          <p className="text-[14px] leading-snug text-muted">
            Напоминания добавляются в календарь телефона — так они сработают, даже когда приложение закрыто. В уведомлении будет только «Тонус: 5 минут».
          </p>
          <div className="mt-3 space-y-2">
            {settings.reminders.map((t, i) => (
              <div key={i} className="flex items-center gap-2">
                <input type="time" value={t} onChange={e => setTime(i, e.target.value)}
                  className="h-11 flex-1 rounded-xl border border-line bg-surface-2 px-3 text-[16px] text-ink" aria-label={`Напоминание ${i + 1}`} />
                <button type="button" aria-label="Удалить" onClick={() => setSettings({ reminders: settings.reminders.filter((_, k) => k !== i) })}
                  className="grid size-11 place-items-center rounded-xl bg-surface-2 text-muted"><Trash2 size={18} /></button>
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            {settings.reminders.length < 5 && (
              <SecondaryButton onClick={() => setSettings({ reminders: [...settings.reminders, '12:00'] })} className="flex-1"><Plus size={18} /> Время</SecondaryButton>
            )}
            <SecondaryButton onClick={() => downloadFile('tonus-napominaniya.ics', buildIcs(settings.reminders.filter(Boolean)), 'text/calendar')} className="flex-[2] bg-calm/15">
              <BellRing size={18} /> В календарь
            </SecondaryButton>
          </div>
          {embedded && <p className="mt-2 text-[13px] text-muted">{EMBEDDED_NOTE}</p>}
        </div>
      </section>

      <section>
        <h3 className="mb-1 text-[13px] font-medium tracking-wide text-muted uppercase">Установка</h3>
        <a href={INSTALL_URL} target={INSTALL_URL.startsWith('http') ? '_blank' : undefined} rel="noreferrer" className="card flex items-center gap-3 px-4 py-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-muted"><Smartphone size={18} /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-medium">{isStandalone() ? 'Приложение установлено' : 'Установить на телефон'}</span>
            <span className="block text-[13px] text-muted">iPhone и Android без магазина приложений, профиль для iPhone, QR-код</span>
          </span>
          <ExternalLink size={18} className="text-faint" />
        </a>
      </section>

      <section>
        <h3 className="mb-1 text-[13px] font-medium tracking-wide text-muted uppercase">Оформление</h3>
        <div className="card grid grid-cols-3 gap-1 p-1">
          {THEMES.map(([id, label]) => (
            <button key={id} type="button" onClick={() => setSettings({ theme: id })} aria-pressed={settings.theme === id}
              className={`rounded-[18px] py-2.5 text-[14px] font-medium transition ${settings.theme === id ? 'bg-ink text-bg' : 'text-muted'}`}>
              {label}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-1 text-[13px] font-medium tracking-wide text-muted uppercase">Данные</h3>
        <div className="card space-y-2 p-4">
          <p className="text-[14px] text-muted">Всё хранится только на этом устройстве. Сохраните копию, чтобы перенести журнал на другой телефон.</p>
          <div className="flex gap-2">
            <SecondaryButton onClick={exportData} className="flex-1"><Download size={18} /> Сохранить</SecondaryButton>
            <SecondaryButton onClick={() => file.current?.click()} className="flex-1"><Upload size={18} /> Загрузить</SecondaryButton>
          </div>
          <input ref={file} type="file" accept="application/json,.json" className="hidden" onChange={e => onImport(e.target.files?.[0])} />
          {embedded && <p className="text-[13px] text-muted">{EMBEDDED_NOTE}</p>}
          {msg && <p className="text-[14px]">{msg}</p>}
          {confirmReset ? (
            <div className="flex gap-2 pt-1">
              <SecondaryButton onClick={() => { reset(); setConfirmReset(false); }} className="flex-1 bg-squeeze/15 text-squeeze">Да, стереть всё</SecondaryButton>
              <SecondaryButton onClick={() => setConfirmReset(false)} className="flex-1">Отмена</SecondaryButton>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmReset(true)} className="pt-1 text-[14px] font-medium text-squeeze">Стереть журнал и настройки</button>
          )}
        </div>
      </section>

      <p className="text-center text-[12px] leading-relaxed text-faint">
        Тонус {__APP_VERSION__} · не медицинское изделие и не заменяет консультацию врача.
      </p>
    </div>
  );
}
