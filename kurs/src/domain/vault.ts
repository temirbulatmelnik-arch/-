// Личный план лежит на публичном сайте только в зашифрованном виде (AES-GCM, ключ из кода через PBKDF2).
// Без кода это набор случайных байт; расшифровка — один раз на телефоне при первом запуске.

export interface Sealed {
  v: 1;
  /** редакция плана — открытым текстом, чтобы телефон понял, что есть обновление, ещё до ввода кода */
  rev?: number;
  iter: number;
  salt: string;
  iv: string;
  data: string;
}

const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));

/** Код вводится как угодно: строчными, с пробелами или без дефисов */
export const normalizeCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, '');

async function key(code: string, salt: Uint8Array, iter: number, usage: KeyUsage[]) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(normalizeCode(code)), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt as BufferSource, iterations: iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, usage);
}

export async function seal(plain: string, code: string, iter = 600_000): Promise<Sealed> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const k = await key(code, salt, iter, ['encrypt']);
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, new TextEncoder().encode(plain)));
  return { v: 1, iter, salt: b64(salt), iv: b64(iv), data: b64(data) };
}

/** null — неверный код */
export async function open(s: Sealed, code: string): Promise<string | null> {
  try {
    const k = await key(code, unb64(s.salt), s.iter, ['decrypt']);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(s.iv) as BufferSource }, k, unb64(s.data) as BufferSource);
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}
