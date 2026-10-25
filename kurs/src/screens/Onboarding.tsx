// Первый запуск: открыть личный план кодом, восстановить копию или начать с нуля.
import { Lock, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { SkyHeader } from '../components/Petersburg';
import { PrimaryButton, SecondaryButton } from '../components/ui';
import type { PlanSeed } from '../domain/types';
import { open, type Sealed } from '../domain/vault';
import { useStore } from '../store/store';

export function Onboarding() {
  const loadSeed = useStore(s => s.loadSeed);
  const startEmpty = useStore(s => s.startEmpty);
  const importData = useStore(s => s.importData);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const file = useRef<HTMLInputElement>(null);

  const unlock = async () => {
    setBusy(true); setError('');
    try {
      const sealed = (await (await fetch('./seed.enc.json', { cache: 'no-cache' })).json()) as Sealed;
      const plain = await open(sealed, code);
      if (!plain) { setError('Код не подходит. Проверьте буквы и цифры.'); return; }
      loadSeed(JSON.parse(plain) as PlanSeed, code);
    } catch {
      setError('Не удалось загрузить план. Нужен интернет при первом запуске.');
    } finally { setBusy(false); }
  };

  return (
    <div className="pt-safe pb-safe mx-auto flex min-h-dvh max-w-md flex-col">
      <SkyHeader title="Курс" subtitle="План выхода из долгов" />
      <div className="flex-1 px-5 pt-4">
        <p className="text-[15px] leading-snug text-muted">Сколько можно потратить на этой неделе, что и когда платить, куда отправить премию — и как тает долг.</p>

        <div className="card mt-4 space-y-3 p-5">
          <div className="flex items-center gap-2 text-[15px] font-medium"><Lock size={16} strokeWidth={1.6} className="text-sea" /> Ваш план уже внутри</div>
          <p className="text-[13.5px] leading-snug text-muted">Долги, платежи и этапы из финансового аудита зашифрованы. Введите код — он расшифрует план прямо на телефоне.</p>
          <input value={code} onChange={e => setCode(e.target.value)} placeholder="XXXX-XXXX-XXXX" autoCapitalize="characters" autoCorrect="off" spellCheck={false}
            className="field text-center font-mono text-[20px] tracking-widest" onKeyDown={e => e.key === 'Enter' && code && void unlock()} />
          {error && <p className="text-[13.5px] font-medium text-neg">{error}</p>}
          <PrimaryButton onClick={() => void unlock()} disabled={!code.trim() || busy}>{busy ? 'Открываю…' : 'Открыть план'}</PrimaryButton>
        </div>
      </div>
      <div className="space-y-2 px-5 py-6">
        <input ref={file} type="file" accept="application/json,.json" hidden onChange={async e => {
          const f = e.target.files?.[0];
          if (f) { try { if (!importData(JSON.parse(await f.text()))) setError('Это не резервная копия «Курса»'); } catch { setError('Файл не читается'); } }
          e.target.value = '';
        }} />
        <SecondaryButton onClick={() => file.current?.click()} className="w-full"><Upload size={17} /> Восстановить из резервной копии</SecondaryButton>
        <button type="button" onClick={startEmpty} className="w-full py-2 text-[14px] font-medium text-muted">Начать с нуля и внести долги вручную</button>
      </div>
    </div>
  );
}
