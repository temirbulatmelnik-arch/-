import { BellRing, Download, ExternalLink, Mic, PersonStanding, Plus, ShieldCheck, Smartphone, Smile, Timer, Trash2, Upload, Vibrate, Volume2 } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { SecondaryButton, Switch } from '../components/ui';
import { JAW_FLAGS, NECK_FLAGS } from '../engine/content';
import { voiceSupported } from '../engine/cues';
import type { JawMode } from '../engine/program';
import { buildIcs, downloadFile } from '../engine/reminders';
import { INSTALL_URL, isStandalone } from '../install/platform';
import { useStore, type Theme } from '../store/store';
import { SafetyList } from './Onboarding';

const THEMES: [Theme, string][] = [['system', 'Как в системе'], ['light', 'Фарфор'], ['dark', 'Эспрессо']];
const JAW: [JawMode, string, string][] = [['chew', 'Жевание', 'обычная жвачка, 2 раза в день'], ['clench', 'Сжатие', '10 с почти в полную силу'], ['off', 'Выключено', 'без нагрузки на челюсть']];

// Внутри чужой страницы (превью) браузер не даёт скачивать файлы
const embedded = window.self !== window.top;
const EMBEDDED_NOTE = 'В превью скачивание файлов недоступно. Откройте приложение по своему адресу или установите на телефон.';

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <section><h3 className="eyebrow mb-2 text-gold">{title}</h3>{children}</section>
);

export function Settings() {
  const s = useStore();
  const { settings, setSettings } = s;
  const file = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const [safety, setSafety] = useState(false);
  const jawFlagged = s.safety.jaw.length > 0;
  const neckFlagged = s.safety.neck.length > 0;

  const setTime = (i: number, v: string) => setSettings({ reminders: settings.reminders.map((t, k) => (k === i ? v : t)) });
  const exportData = () => downloadFile(`linia-${new Date().toISOString().slice(0, 10)}.json`,
    JSON.stringify({ app: 'linia', version: 1, blocks: s.blocks, safety: s.safety, settings, history: s.history, checks: s.checks, habits: s.habits }, null, 2), 'application/json');
  const onImport = async (f: File | undefined) => {
    if (!f) return;
    try { setMsg(s.importData(JSON.parse(await f.text())) ? 'Данные загружены.' : 'Это не файл «Линии».'); } catch { setMsg('Не удалось прочитать файл.'); }
  };

  return (
    <div className="space-y-7">
      <Section title="Подсказки">
        <div className="card divide-y divide-line px-4">
          <Switch checked={settings.sound} onChange={v => setSettings({ sound: v })} label="Звуковые сигналы" hint="Мягкие тоны: начать, отпустить, смена стороны" icon={<Volume2 size={17} />} />
          <Switch checked={settings.voice} onChange={v => setSettings({ voice: v })} label="Голос" hint={voiceSupported() ? 'Названия упражнений, счёт повторов, «держите», «отпустите»' : 'Браузер не поддерживает голос'} icon={<Mic size={17} />} />
          <Switch checked={settings.vibration} onChange={v => setSettings({ vibration: v })} label="Вибрация" hint="На Android — можно заниматься с закрытыми глазами" icon={<Vibrate size={17} />} />
          <Switch checked={settings.ticks} onChange={v => setSettings({ ticks: v })} label="Отсчёт последних секунд" hint="Тихие щелчки в конце удержания" icon={<Timer size={17} />} />
          <Switch checked={settings.intro} onChange={v => setSettings({ intro: v })} label="Объяснение перед упражнением" hint="3D-демонстрация и техника, занятие ждёт до 30 с" icon={<PersonStanding size={17} />} />
        </div>
      </Section>

      <Section title="Фейс-лифтинг">
        <div className="card p-4">
          <div className="text-[15px] font-medium">Модуль челюсти</div>
          <div className="mt-3 grid grid-cols-3 gap-1.5">
            {JAW.map(([id, label, hint]) => (
              <button key={id} type="button" onClick={() => setSettings({ jawMode: id })} aria-pressed={settings.jawMode === id}
                className={`rounded-[18px] border px-2 py-2.5 text-center transition ${settings.jawMode === id ? 'border-gold bg-gold/12' : 'border-line'}`}>
                <span className="block text-[14px] font-medium">{label}</span>
                <span className="block text-[11px] leading-tight text-muted">{hint}</span>
              </button>
            ))}
          </div>
          {jawFlagged && (
            <div className="mt-3 rounded-2xl bg-warn/10 p-3 text-[13.5px] leading-snug">
              По опроснику модуль выключен: жевание, сжатие и открывание рта против кулака не входят в занятия.
              <div className="mt-1"><Switch checked={settings.jawCleared} onChange={v => setSettings({ jawCleared: v })} label="Стоматолог разрешил" /></div>
            </div>
          )}
        </div>
        <div className="card mt-2 px-4">
          <Switch checked={settings.cheeks} onChange={v => setSettings({ cheeks: v })} label="Полнее щёки" hint="Улыбка с сопротивлением со 2-го уровня. Нагружает морщинки у глаз" icon={<Smile size={17} />} />
        </div>
      </Section>

      <Section title="Безопасность">
        <button type="button" onClick={() => setSafety(!safety)} className="card flex w-full items-center gap-3 px-4 py-3.5 text-left">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 text-gold"><ShieldCheck size={17} /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-medium">Опросники шеи и челюсти</span>
            <span className="block text-[13px] text-muted">{neckFlagged || jawFlagged ? `Отмечено: ${s.safety.neck.length + s.safety.jaw.length}` : 'Отметок нет'} · пройдены {new Date(s.safety.at).toLocaleDateString('ru-RU')}</span>
          </span>
        </button>
        {safety && (
          <div className="card mt-2 space-y-5 p-4">
            <SafetyList title="Шея" flags={NECK_FLAGS} value={s.safety.neck} onChange={neck => s.setSafety({ neck, jaw: s.safety.jaw })} />
            <SafetyList title="Челюсть" flags={JAW_FLAGS} value={s.safety.jaw} onChange={jaw => s.setSafety({ neck: s.safety.neck, jaw })} />
            {neckFlagged && <Switch checked={settings.neckCleared} onChange={v => setSettings({ neckCleared: v })} label="Врач разрешил упражнения для шеи" />}
          </div>
        )}
      </Section>

      <Section title="Напоминания">
        <div className="card p-4">
          <p className="text-[14px] leading-snug text-muted">Добавьте в календарь телефона — сработают, даже когда приложение закрыто. Удобно для минутных пауз в рабочие часы.</p>
          <div className="mt-3 space-y-2">
            {settings.reminders.map((t, i) => (
              <div key={i} className="flex items-center gap-2">
                <input type="time" value={t} onChange={e => setTime(i, e.target.value)} aria-label={`Напоминание ${i + 1}`}
                  className="h-11 flex-1 rounded-2xl border border-line bg-surface-2 px-3 text-[16px] text-ink" />
                <button type="button" aria-label="Удалить" onClick={() => setSettings({ reminders: settings.reminders.filter((_, k) => k !== i) })}
                  className="grid size-11 place-items-center rounded-full bg-surface-2 text-muted"><Trash2 size={17} /></button>
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            {settings.reminders.length < 8 && <SecondaryButton onClick={() => setSettings({ reminders: [...settings.reminders, '12:00'] })} className="flex-1"><Plus size={17} /> Время</SecondaryButton>}
            <SecondaryButton onClick={() => downloadFile('linia-napominaniya.ics', buildIcs(settings.reminders.filter(Boolean)), 'text/calendar')} className="flex-[2]"><BellRing size={17} /> В календарь</SecondaryButton>
          </div>
          {embedded && <p className="mt-2 text-[13px] text-muted">{EMBEDDED_NOTE}</p>}
        </div>
      </Section>

      <Section title="Установка">
        <a href={INSTALL_URL} target={INSTALL_URL.startsWith('http') ? '_blank' : undefined} rel="noreferrer" className="card flex items-center gap-3 px-4 py-3.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 text-gold"><Smartphone size={17} /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-medium">{isStandalone() ? 'Приложение установлено' : 'Установить на телефон'}</span>
            <span className="block text-[13px] text-muted">iPhone и Android без магазина приложений</span>
          </span>
          <ExternalLink size={17} className="text-faint" />
        </a>
      </Section>

      <Section title="Оформление">
        <div className="card grid grid-cols-3 gap-1 p-1">
          {THEMES.map(([id, label]) => (
            <button key={id} type="button" onClick={() => setSettings({ theme: id })} aria-pressed={settings.theme === id}
              className={`rounded-full py-2.5 text-[14px] font-medium transition ${settings.theme === id ? 'bg-ink text-bg' : 'text-muted'}`}>{label}</button>
          ))}
        </div>
      </Section>

      <Section title="Данные">
        <div className="card space-y-2 p-4">
          <p className="text-[14px] text-muted">Всё хранится только на этом устройстве, фото — миниатюрами. Сохраните копию, чтобы перенести журнал.</p>
          <div className="flex gap-2">
            <SecondaryButton onClick={exportData} className="flex-1"><Download size={17} /> Сохранить</SecondaryButton>
            <SecondaryButton onClick={() => file.current?.click()} className="flex-1"><Upload size={17} /> Загрузить</SecondaryButton>
          </div>
          <input ref={file} type="file" accept="application/json,.json" className="hidden" onChange={e => onImport(e.target.files?.[0])} />
          {embedded && <p className="text-[13px] text-muted">{EMBEDDED_NOTE}</p>}
          {msg && <p className="text-[14px]">{msg}</p>}
          {confirmReset ? (
            <div className="flex gap-2 pt-1">
              <SecondaryButton onClick={() => { s.reset(); setConfirmReset(false); }} className="flex-1 text-warn">Да, стереть всё</SecondaryButton>
              <SecondaryButton onClick={() => setConfirmReset(false)} className="flex-1">Отмена</SecondaryButton>
            </div>
          ) : <button type="button" onClick={() => setConfirmReset(true)} className="pt-1 text-[14px] font-medium text-warn">Стереть журнал и настройки</button>}
        </div>
      </Section>

      <p className="text-center text-[12px] leading-relaxed text-faint">Линия {__APP_VERSION__} · не медицинское изделие и не заменяет консультацию врача.</p>
    </div>
  );
}
