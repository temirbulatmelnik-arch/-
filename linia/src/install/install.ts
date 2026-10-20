// Страница установки «Линии» без магазина приложений: подсказывает способ под устройство,
// собирает профиль Web Clip для iPhone прямо в браузере и показывает QR-код для компьютера.
import '@fontsource-variable/manrope';
import '@fontsource-variable/cormorant-garamond';
import '../index.css';
import { renderSVG } from 'uqr';
import { detectPlatform, isStandalone, type Platform } from './platform';
import { buildWebClip } from './webclip';

const APP_URL = new URL('./', location.href).href;
const PROFILE_NAME = 'linia.mobileconfig';

function applyTheme() {
  let theme = 'system';
  try { theme = JSON.parse(localStorage.getItem('linia') ?? '{}')?.state?.settings?.theme ?? 'system'; } catch { /* нет доступа к хранилищу */ }
  const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
}

const SHARE_ICON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="inline -mt-1 text-gold"><path d="M12 3v12"/><path d="m8 7 4-4 4 4"/><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></svg>`;

const card = (title: string, badge: string, body: string) => `
  <section class="card p-5">
    <div class="flex items-center justify-between gap-3">
      <h2 class="text-[17px] font-semibold">${title}</h2>
      ${badge ? `<span class="shrink-0 rounded-full bg-gold/15 px-2.5 py-1 text-[12px] font-medium whitespace-nowrap">${badge}</span>` : ''}
    </div>
    <div class="mt-3 space-y-3 text-[15px] leading-relaxed">${body}</div>
  </section>`;

const steps = (items: string[]) => `<ol class="space-y-2.5">${items.map((t, i) => `
  <li class="flex gap-3"><span class="grid size-6 shrink-0 place-items-center rounded-full bg-surface-2 text-[13px] font-semibold">${i + 1}</span><span>${t}</span></li>`).join('')}</ol>`;

const note = (html: string) => `<p class="rounded-2xl bg-surface-2 p-3 text-[14px] leading-snug text-muted">${html}</p>`;

const HOME_SCREEN = card('На экран «Домой»', 'рекомендуем', `
  <p class="text-muted">Три касания в Safari. Приложение откроется без адресной строки и будет работать без интернета.</p>
  ${steps([
    `Нажмите «Поделиться» ${SHARE_ICON} внизу экрана. В iOS 26 кнопка спрятана в меню «•••» рядом с адресом.`,
    'Прокрутите список и выберите «На экран „Домой“».',
    'Если есть переключатель «Открывать как веб-приложение» — оставьте включённым. Нажмите «Добавить».',
  ])}`);

const PROFILE = card('Профилем конфигурации', 'один файл', `
  <p class="text-muted">Значок с иконкой и названием появится сам. Удобно, чтобы отправить приложение другому человеку.</p>
  <button type="button" data-profile class="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gold-grad text-[16px] font-semibold text-on-accent">Скачать профиль</button>
  ${steps([
    'Safari спросит, разрешить ли загрузку профиля, — нажмите «Разрешить».',
    'Откройте «Настройки»: вверху появится «Профиль загружен». Нажмите «Установить» и введите код-пароль телефона.',
    'Значок «Линию» появится на экране «Домой». Профиль нужно установить в течение 8 минут после загрузки.',
  ])}
  ${note('iOS пометит профиль как «Не проверен»: так она называет любой профиль без цифровой подписи. Внутри только значок: ни сертификатов, ни VPN, ни управления телефоном. Удалить: Настройки → Основные → VPN и управление устройством → Линия → Удалить профиль.')}
  <p class="text-[14px] text-muted" data-profile-file hidden>Если Safari сохранил файл в «Загрузки», откройте приложение «Файлы» → «Загрузки» → <b>${PROFILE_NAME}</b>.<span data-static-profile hidden> Или <a class="underline underline-offset-4" href="./${PROFILE_NAME}">скачайте готовый файл профиля</a>.</span></p>`);

const OTHER_IOS_BROWSER = card('Откройте страницу в Safari', '', `
  <p>Профиль конфигурации iPhone принимает только из Safari. Скопируйте адрес и откройте его в Safari.</p>
  <button type="button" data-copy class="flex h-12 w-full items-center justify-center rounded-2xl bg-surface-2 text-[15px] font-medium">Скопировать адрес</button>
  <p class="text-muted">Добавить на экран «Домой» можно и из этого браузера: меню «Поделиться» → «На экран „Домой“».</p>`);

const ANDROID = card('Android', '', `
  <button type="button" data-android hidden class="flex h-12 w-full items-center justify-center rounded-2xl bg-gold-grad text-[16px] font-semibold text-on-accent">Установить приложение</button>
  ${steps(['Откройте страницу в Chrome.', 'Меню ⋮ → «Установить приложение» или «Добавить на главный экран».', 'Подтвердите установку — значок появится среди приложений.'])}`);

const DESKTOP = () => card('Откройте на телефоне', '', `
  <div class="mx-auto w-48 rounded-2xl bg-white p-3">${renderSVG(location.href, { blackColor: '#0f172a', whiteColor: '#ffffff', border: 1 })}</div>
  <p class="text-center text-muted">Наведите камеру iPhone на код — откроется эта страница в Safari.</p>
  <p class="break-all text-center text-[13px] text-faint">${location.href}</p>
  <button type="button" data-profile class="flex h-12 w-full items-center justify-center rounded-2xl bg-surface-2 text-[15px] font-medium">Скачать профиль для iPhone</button>
  <p class="text-[14px] text-muted">С Mac файл профиля можно передать на iPhone через AirDrop — установка начнётся сама.</p>`);

const IMPORTANT = card('Важно знать', '', `
  <ul class="space-y-2.5 text-[14px] leading-snug">
    <li>Журнал в Safari и в установленном приложении хранится отдельно. Чтобы перенести, используйте Настройки → Данные → «Сохранить» и «Загрузить».</li>
    <li>На рабочем телефоне с корпоративным управлением установку профилей может запрещать служба ИТ. Тогда используйте способ «На экран „Домой“» или личный телефон.</li>
    <li>Обновления приходят сами: приложение проверяет новую версию при запуске с интернетом.</li>
  </ul>`);

function sections(p: Platform): { main: string[]; other: string[] } {
  switch (p) {
    case 'ios-safari': return { main: [HOME_SCREEN, PROFILE], other: [ANDROID] };
    case 'ios-other': return { main: [OTHER_IOS_BROWSER], other: [HOME_SCREEN, PROFILE, ANDROID] };
    case 'android': return { main: [ANDROID], other: [HOME_SCREEN, PROFILE] };
    case 'desktop': return { main: [DESKTOP()], other: [HOME_SCREEN, PROFILE, ANDROID] };
  }
}

async function downloadProfile() {
  const png = new Uint8Array(await (await fetch('./apple-touch-icon-180x180.png')).arrayBuffer());
  let bin = '';
  png.forEach(b => { bin += String.fromCharCode(b); });
  const xml = await buildWebClip({ url: APP_URL, label: 'Линия', iconBase64: btoa(bin) });
  const url = URL.createObjectURL(new Blob([xml], { type: 'application/x-apple-aspen-config' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = PROFILE_NAME;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  document.querySelectorAll<HTMLElement>('[data-profile-file]').forEach(el => { el.hidden = false; });
  // готовый файл кладётся рядом при сборке для сайта (SITE_URL); локально его нет
  const exists = await fetch(`./${PROFILE_NAME}`, { method: 'HEAD' }).then(r => r.ok).catch(() => false);
  document.querySelectorAll<HTMLElement>('[data-static-profile]').forEach(el => { el.hidden = !exists; });
}

function render() {
  const p = detectPlatform();
  const installed = isStandalone();
  const { main, other } = sections(p);
  const root = document.getElementById('root')!;
  root.innerHTML = `
    <header class="flex items-center gap-4">
      <img src="./pwa-192x192.png" alt="" width="64" height="64" class="size-16 rounded-[18px] shadow-lg shadow-gold/20" />
      <div>
        <h1 class="font-display text-[34px] leading-tight">Установить «Линию»</h1>
        <p class="text-[15px] text-muted">Без App Store, прямо с сайта</p>
      </div>
    </header>
    ${installed ? `<p class="mt-6 rounded-3xl bg-gold/15 p-4 text-[15px]">Приложение уже установлено и открыто с экрана «Домой».</p>` : ''}
    <div class="mt-6 space-y-3">${main.join('')}</div>
    <div class="mt-3">${IMPORTANT}</div>
    <details class="mt-3 card p-5">
      <summary class="cursor-pointer text-[15px] font-semibold">Другие устройства</summary>
      <div class="mt-4 space-y-3">${other.join('')}</div>
    </details>
    <a href="./" class="mt-6 flex h-12 items-center justify-center rounded-full bg-ink text-[15px] font-semibold text-bg">Открыть приложение</a>`;

  root.querySelectorAll('[data-profile]').forEach(b => b.addEventListener('click', () => { void downloadProfile(); }));
  root.querySelector('[data-copy]')?.addEventListener('click', async e => {
    const btn = e.currentTarget as HTMLButtonElement;
    try { await navigator.clipboard.writeText(location.href); btn.textContent = 'Адрес скопирован'; } catch { btn.textContent = location.href; }
  });
}

// Android/Chrome: системное окно установки по кнопке
let installEvent: (Event & { prompt: () => Promise<void> }) | null = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  installEvent = e as typeof installEvent;
  document.querySelectorAll<HTMLButtonElement>('[data-android]').forEach(b => {
    b.hidden = false;
    b.onclick = () => { void installEvent?.prompt(); };
  });
});

applyTheme();
render();
