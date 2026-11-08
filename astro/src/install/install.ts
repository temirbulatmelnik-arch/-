// Страница установки «Моего астропрогноза» без магазина приложений — как у «Курса», «Тонуса» и «Линии»:
// профиль Web Clip для iPhone собирается прямо в браузере, есть способ «На экран „Домой“» и QR-код для компьютера.
import '@fontsource-variable/cormorant';
import '@fontsource-variable/manrope';
import '../index.css';
import { renderSVG } from 'uqr';
import { detectPlatform, isStandalone, type Platform } from './platform';
import { buildWebClip } from './webclip';

const APP_URL = new URL('./', location.href).href;
const PROFILE_NAME = 'astro.mobileconfig';
const LABEL = 'Астропрогноз';

try { if (localStorage.getItem('astro-theme') === 'light') document.documentElement.classList.add('light'); } catch { /* нет хранилища */ }

const SHARE_ICON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="inline -mt-1 text-brass"><path d="M12 3v12"/><path d="m8 7 4-4 4 4"/><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></svg>`;
const card = (title: string, body: string, halo = false) => `
  <section class="oracle ${halo ? 'halo' : ''} rounded-[26px] p-5">
    <h2 class="serif text-[24px] font-semibold leading-tight">${title}</h2>
    <div class="mt-3 space-y-3 text-[16px] leading-relaxed">${body}</div>
  </section>`;
const steps = (items: string[]) => `<ol class="space-y-2.5">${items.map((t, i) => `
  <li class="flex gap-3"><span class="grid size-7 shrink-0 place-items-center rounded-full bg-[color:var(--brass-soft)] text-[14px] font-semibold text-brass">${i + 1}</span><span>${t}</span></li>`).join('')}</ol>`;
const note = (html: string) => `<p class="rounded-2xl bg-[color:var(--line)] p-3 text-[14px] leading-snug text-dim">${html}</p>`;
const btn = (attr: string, text: string, primary = true) => `<button type="button" ${attr} class="flex h-12 w-full items-center justify-center rounded-full text-[16px] font-semibold ${primary ? 'bg-brass text-night shadow-[0_6px_24px_rgba(226,189,114,.35)]' : 'border hair text-ink'}">${text}</button>`;

const PROFILE = card('Профилем конфигурации', `
  <p class="text-dim">Значок с иконкой и названием появится сам — так же ставятся «Курс», «Тонус» и «Линия».</p>
  ${btn('data-profile', 'Скачать профиль')}
  ${steps([
    'Safari спросит, разрешить ли загрузку профиля, — нажмите «Разрешить».',
    'Откройте «Настройки»: вверху появится «Профиль загружен». Нажмите «Установить» и введите код-пароль телефона.',
    'Значок «Астропрогноз» появится на экране «Домой». Установить профиль нужно в течение 8 минут после загрузки.',
  ])}
  ${note('iOS пометит профиль как «Не проверен» — так она называет любой профиль без цифровой подписи. Внутри только значок: ни сертификатов, ни VPN, ни управления телефоном. Удалить: Настройки → Основные → VPN и управление устройством → Астропрогноз → Удалить профиль.')}
  <p class="text-[14px] text-dim" data-profile-file hidden>Если Safari сохранил файл в «Загрузки», откройте «Файлы» → «Загрузки» → <b>${PROFILE_NAME}</b>.<span data-static-profile hidden> Или <a class="underline underline-offset-4" href="./${PROFILE_NAME}">скачайте готовый файл профиля</a>.</span></p>`, true);

const HOME_SCREEN = card('На экран «Домой»', `
  <p class="text-dim">Три касания в Safari. Приложение откроется без адресной строки и будет работать без интернета.</p>
  ${steps([
    `Нажмите «Поделиться» ${SHARE_ICON} внизу экрана. В iOS 26 кнопка спрятана в меню «•••» рядом с адресом.`,
    'Прокрутите список и выберите «На экран „Домой“».',
    'Оставьте включённым «Открывать как веб-приложение», если такой переключатель есть, и нажмите «Добавить».',
  ])}`);

const OTHER_IOS = card('Откройте страницу в Safari', `
  <p>Профили конфигурации iPhone принимает только из Safari. Скопируйте адрес и откройте его в Safari.</p>
  ${btn('data-copy', 'Скопировать адрес', false)}`, true);

const DESKTOP = () => card('Откройте на телефоне', `
  <div class="mx-auto w-48 rounded-2xl bg-white p-3">${renderSVG(location.href, { blackColor: '#0a0d2a', whiteColor: '#ffffff', border: 1 })}</div>
  <p class="text-center text-dim">Наведите камеру iPhone на код — откроется эта страница в Safari.</p>
  ${btn('data-profile', 'Скачать профиль для iPhone', false)}`, true);

const IMPORTANT = card('Важно знать', `
  <ul class="space-y-2.5 text-[15px] leading-snug text-dim">
    <li>Все расчёты идут на телефоне — без сервера и без передачи ваших данных.</li>
    <li>Обновления приходят сами: при запуске с интернетом приложение скачивает новую версию и включает её при следующем открытии.</li>
    <li>На рабочем телефоне с корпоративным управлением установку профилей может запрещать служба ИТ — тогда подойдёт способ «На экран „Домой“».</li>
  </ul>`);

function sections(p: Platform): string[] {
  switch (p) {
    case 'ios-safari': return [PROFILE, HOME_SCREEN];
    case 'ios-other': return [OTHER_IOS, HOME_SCREEN];
    case 'android': return [HOME_SCREEN];
    case 'desktop': return [DESKTOP(), PROFILE];
  }
}

async function downloadProfile() {
  const png = new Uint8Array(await (await fetch('./apple-touch-icon-180x180.png')).arrayBuffer());
  let bin = '';
  png.forEach(b => { bin += String.fromCharCode(b); });
  const xml = await buildWebClip({ url: APP_URL, label: LABEL, iconBase64: btoa(bin) });
  const url = URL.createObjectURL(new Blob([xml], { type: 'application/x-apple-aspen-config' }));
  const a = document.createElement('a');
  a.href = url; a.download = PROFILE_NAME;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  document.querySelectorAll<HTMLElement>('[data-profile-file]').forEach(el => { el.hidden = false; });
  const exists = await fetch(`./${PROFILE_NAME}`, { method: 'HEAD' }).then(r => r.ok).catch(() => false);
  document.querySelectorAll<HTMLElement>('[data-static-profile]').forEach(el => { el.hidden = !exists; });
}

function render() {
  const root = document.getElementById('root')!;
  root.innerHTML = `
    <header class="flex flex-col items-center text-center">
      <img src="./pwa-192x192.png" alt="" width="96" height="96" class="size-24 rounded-[26px] shadow-[0_10px_40px_rgba(120,100,255,.45)]" />
      <h1 class="serif aura-text mt-4 text-[38px] leading-tight font-semibold">Мой астропрогноз</h1>
      <p class="text-[15px] text-dim">Установка без App Store, прямо с сайта</p>
    </header>
    ${isStandalone() ? `<p class="oracle mt-6 rounded-3xl p-4 text-[15px]">Приложение уже установлено и открыто с экрана «Домой».</p>` : ''}
    <div class="mt-6 space-y-3">${sections(detectPlatform()).join('')}</div>
    <div class="mt-3">${IMPORTANT}</div>
    <a href="./" class="mt-6 flex h-12 items-center justify-center rounded-full border text-[16px] font-semibold hair">Открыть приложение</a>`;
  root.querySelectorAll('[data-profile]').forEach(b => b.addEventListener('click', () => { void downloadProfile(); }));
  root.querySelector('[data-copy]')?.addEventListener('click', async e => {
    const b = e.currentTarget as HTMLButtonElement;
    try { await navigator.clipboard.writeText(location.href); b.textContent = 'Адрес скопирован'; } catch { b.textContent = location.href; }
  });
}
render();
