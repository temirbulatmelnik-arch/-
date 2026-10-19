// Где запущено приложение: от этого зависит, какой способ установки показывать.

export type Platform = 'ios-safari' | 'ios-other' | 'android' | 'desktop';

export function detectPlatform(ua = navigator.userAgent, touch = navigator.maxTouchPoints): Platform {
  // iPadOS притворяется маком, но у него есть сенсорный экран
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && touch > 1);
  if (ios) return /CriOS|FxiOS|EdgiOS|OPiOS|YaBrowser|GSA\//.test(ua) ? 'ios-other' : 'ios-safari';
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}

/** Открыто как установленное приложение (с экрана «Домой»), а не во вкладке браузера */
export function isStandalone(): boolean {
  return (navigator as Navigator & { standalone?: boolean }).standalone === true
    || window.matchMedia('(display-mode: standalone)').matches
    || window.matchMedia('(display-mode: fullscreen)').matches;
}

/** Адрес страницы установки. В одностраничном превью — адрес опубликованного сайта. */
export const INSTALL_URL: string = import.meta.env.VITE_INSTALL_URL || './install.html';
