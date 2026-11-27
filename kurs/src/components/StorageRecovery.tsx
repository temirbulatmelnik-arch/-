import { useEffect, useState } from 'react';
import { checkForInstalledUpdate } from '../install/update';
import type { FinanceStorageProblem } from '../store/financeStorage';
import { currentLegacyFile, migrationBackupFile, useStore } from '../store/store';
import { useUi } from '../store/ui';

const messages: Record<FinanceStorageProblem, string> = {
  changed: 'Состояние изменилось в другом окне «Курса». Закройте остальные окна и повторите проверку.',
  quota: 'Для записи журнала не хватило места в хранилище приложения.',
  verification: 'Проверка данных остановила запуск, чтобы сохранить исходную запись.',
  'other-version': 'Запись создана другой версией «Курса». Проверьте обновление приложения.',
  archive: 'Браузер пока не смог прочитать локальный архив. Повторите проверку или сохраните доступную копию.',
  storage: 'Браузер не смог открыть или записать хранилище приложения.',
};

function fromFirstReadable(readers: (() => string | null)[]) {
  for (const read of readers) {
    try {
      const data = read();
      if (data) return data;
    } catch { /* Check the next independent source. */ }
  }
  return null;
}

export function StorageRecovery({ problem, ready }: { problem: FinanceStorageProblem; ready: boolean }) {
  const updateReady = useUi(s => s.pwaUpdateReady);
  const [checking, setChecking] = useState(false);
  const [copy, setCopy] = useState<{ href: string; name: string }>();
  const [copyStatus, setCopyStatus] = useState('');

  useEffect(() => () => { if (copy) URL.revokeObjectURL(copy.href); }, [copy]);

  const retry = async () => {
    if (updateReady) { window.location.reload(); return; }
    setChecking(true);
    try { await checkForInstalledUpdate(); } catch { /* Reload also works offline. */ }
    window.location.reload();
  };

  const save = async (oldVersion = false) => {
    const readers = [currentLegacyFile, migrationBackupFile];
    if (ready && !oldVersion) readers.unshift(() => useStore.getState().exportData());
    const data = fromFirstReadable(readers);
    if (!data) { setCopyStatus('Копия пока недоступна в этом окне.'); return; }

    const name = oldVersion ? 'kurs-staraya-versiya.json' : 'kurs-lokalnaya-kopiya.json';
    const file = new File([data], name, { type: 'application/json' });
    setCopy({ href: URL.createObjectURL(file), name });
    setCopyStatus('Копия подготовлена. В меню «Поделиться» выберите «Сохранить в Файлы» или скачайте файл по ссылке ниже.');
    try {
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file] });
    } catch { /* The download link remains available. */ }
  };

  return <main className="mx-auto max-w-md space-y-4 px-4 pt-[calc(env(safe-area-inset-top)+1rem)]" aria-label="Восстановление доступа к Курсу">
    <h1 className="text-xl font-semibold">Нужно проверить данные</h1>
    <p>{messages[problem]}</p>
    <p className="text-sm text-muted">Курс {__APP_VERSION__} · код проверки {problem}</p>
    <button type="button" className="card block min-h-11 px-4" disabled={checking} onClick={() => void retry()}>
      {checking ? 'Проверяю обновление…' : updateReady ? 'Открыть обновлённую версию' : 'Проверить обновление и открыть снова'}
    </button>
    <button type="button" className="card block min-h-11 px-4" onClick={() => void save()}>Сохранить копию</button>
    {problem === 'changed' && <button type="button" className="card block min-h-11 px-4" onClick={() => void save(true)}>Сохранить данные старой версии</button>}
    {copyStatus && <p role="status" className="text-sm">{copyStatus}</p>}
    {copy && <a className="card inline-flex min-h-11 items-center px-4" href={copy.href} download={copy.name}>Скачать файл копии</a>}
  </main>;
}
