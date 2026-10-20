import { describe, expect, it } from 'vitest';
import { detectPlatform } from './platform';
import { buildWebClip, profileId, stableUuid } from './webclip';

const URL_ = 'https://temirbulatmelnik-arch.github.io/-/linia/';

describe('профиль Web Clip', () => {
  it('UUID стабилен для одного адреса и разный для разных', async () => {
    const a = await stableUuid('x'), b = await stableUuid('x'), c = await stableUuid('y');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9A-F]{8}-[0-9A-F]{4}-5[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/);
  });

  it('идентификатор профиля из адреса', () => {
    expect(profileId(URL_)).toBe('io.github.temirbulatmelnik-arch.x.linia.linia');
    expect(profileId('https://linia.example.ru/app/')).toBe('ru.example.linia.app.linia');
  });

  it('содержит значок на весь экран, адрес, иконку и экранирует текст', async () => {
    const xml = await buildWebClip({ url: URL_ + '?a=1&b=2', label: 'Линия <тест>', iconBase64: 'AAAA' });
    expect(xml).toContain('<string>com.apple.webClip.managed</string>');
    expect(xml).toMatch(/<key>FullScreen<\/key>\s*<true\/>/);
    expect(xml).toMatch(/<key>IsRemovable<\/key>\s*<true\/>/);
    expect(xml).toContain('<string>https://temirbulatmelnik-arch.github.io/-/linia/?a=1&amp;b=2</string>');
    expect(xml).toContain('Линия &lt;тест&gt;');
    expect(xml).toMatch(/<data>\s*AAAA\s*<\/data>/);
    expect(xml.match(/<dict>/g)).toHaveLength(2);
    expect(xml.match(/<\/dict>/g)).toHaveLength(2);
  });
});

describe('платформа', () => {
  it('различает Safari на iPhone, другие браузеры на iPhone, iPad, Android и компьютер', () => {
    expect(detectPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1', 5)).toBe('ios-safari');
    expect(detectPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/130.0 Mobile/15E148 Safari/604.1', 5)).toBe('ios-other');
    expect(detectPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15', 5)).toBe('ios-safari');
    expect(detectPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15', 0)).toBe('desktop');
    expect(detectPlatform('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36', 5)).toBe('android');
  });
});
