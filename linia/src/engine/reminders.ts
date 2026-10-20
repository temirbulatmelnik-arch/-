// Напоминания через календарь телефона: файл .ics с ежедневными событиями.
// Веб-приложение не может само будить телефон по расписанию, а календарь напомнит надёжно.
// Текст нейтральный («Линия: минутка для шеи»), чтобы уведомление на экране ничего не раскрывало.

const pad = (n: number) => String(n).padStart(2, '0');

export function buildIcs(times: string[], now = new Date()): string {
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const events = times.map((t, i) => {
    const [h, m] = t.split(':').map(Number);
    return [
      'BEGIN:VEVENT',
      `UID:linia-${i}-${pad(h)}${pad(m)}@linia.local`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${date}T${pad(h)}${pad(m)}00`,
      'DURATION:PT10M',
      'RRULE:FREQ=DAILY',
      'SUMMARY:Линия: минутка для шеи',
      'DESCRIPTION:Минутная пауза или занятие в приложении «Линия».',
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'DESCRIPTION:Линия: минутка для шеи',
      'TRIGGER:PT0M',
      'END:VALARM',
      'END:VEVENT',
    ].join('\r\n');
  });
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Linia//RU', 'CALSCALE:GREGORIAN', ...events, 'END:VCALENDAR', ''].join('\r\n');
}

export function downloadFile(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
