// Профиль конфигурации iOS (.mobileconfig) с одним Web Clip: значок «Тонуса» на экране «Домой»,
// открывается как отдельное приложение без интерфейса Safari. Формат — Apple DeviceManagement / WebClip
// (PayloadType com.apple.webClip.managed). Профиль не содержит сертификатов, VPN и не включает управление устройством.

export interface WebClipOptions {
  url: string;
  label: string;
  /** PNG значка в base64 */
  iconBase64: string;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** UUID из хеша строки: один и тот же адрес даёт тот же профиль, повторная установка его обновит */
export async function stableUuid(seed: string): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(seed)));
  const b = hash.slice(0, 16);
  b[6] = (b[6] & 0x0f) | 0x50; // версия 5 — UUID из имени
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`.toUpperCase();
}

/** Идентификатор профиля из адреса: https://user.github.io/app/ → io.github.user.app.tonus */
export function profileId(url: string): string {
  const u = new URL(url);
  const host = u.hostname.split('.').reverse();
  const path = u.pathname.split('/').filter(Boolean).map(p => p.replace(/[^A-Za-z0-9]/g, '') || 'x');
  return [...host, ...path, 'tonus'].join('.');
}

export async function buildWebClip({ url, label, iconBase64 }: WebClipOptions): Promise<string> {
  const id = profileId(url);
  const [profileUuid, clipUuid] = await Promise.all([stableUuid(`${url}#profile`), stableUuid(`${url}#webclip`)]);
  // base64 в plist разбиваем на строки, как это делает Apple Configurator
  const icon = iconBase64.replace(/\s+/g, '').match(/.{1,68}/g)?.join('\n\t\t\t') ?? '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>PayloadContent</key>
	<array>
		<dict>
			<key>FullScreen</key>
			<true/>
			<key>Icon</key>
			<data>
			${icon}
			</data>
			<key>IgnoreManifestScope</key>
			<false/>
			<key>IsRemovable</key>
			<true/>
			<key>Label</key>
			<string>${esc(label)}</string>
			<key>Precomposed</key>
			<true/>
			<key>URL</key>
			<string>${esc(url)}</string>
			<key>PayloadDisplayName</key>
			<string>Значок «${esc(label)}» на экране «Домой»</string>
			<key>PayloadIdentifier</key>
			<string>${esc(id)}.webclip</string>
			<key>PayloadType</key>
			<string>com.apple.webClip.managed</string>
			<key>PayloadUUID</key>
			<string>${clipUuid}</string>
			<key>PayloadVersion</key>
			<integer>1</integer>
		</dict>
	</array>
	<key>PayloadDescription</key>
	<string>Добавляет на экран «Домой» значок приложения «${esc(label)}» (${esc(url)}). Профиль содержит только этот значок: никаких сертификатов, VPN и управления устройством. Удалить: Настройки → Основные → VPN и управление устройством.</string>
	<key>PayloadDisplayName</key>
	<string>${esc(label)}</string>
	<key>PayloadIdentifier</key>
	<string>${esc(id)}</string>
	<key>PayloadRemovalDisallowed</key>
	<false/>
	<key>PayloadType</key>
	<string>Configuration</string>
	<key>PayloadUUID</key>
	<string>${profileUuid}</string>
	<key>PayloadVersion</key>
	<integer>1</integer>
</dict>
</plist>
`;
}
