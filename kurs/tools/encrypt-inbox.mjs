// Доставка файла обмена в приложение через сайт: node tools/encrypt-inbox.mjs <файл.json> <код>
// Шифруется тем же кодом, что и план; приложение само находит новый файл и показывает, что изменится.
// Открытый файл в репозиторий не кладётся — на сайт попадает только public/inbox.enc.json.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { open, seal } from '../src/domain/vault.ts';

const [file, code] = process.argv.slice(2);
if (!file || !code) {
  console.error('Использование: node tools/encrypt-inbox.mjs <файл.json> <код>');
  process.exit(1);
}
const plain = JSON.stringify(JSON.parse(readFileSync(file, 'utf8')));
const id = createHash('sha256').update(plain).digest('hex').slice(0, 12);
const sealed = { ...(await seal(plain, code)), id };
if ((await open(sealed, code)) !== plain) throw new Error('проверка расшифровки не прошла');
writeFileSync(new URL('../public/inbox.enc.json', import.meta.url), JSON.stringify(sealed));
console.log(`public/inbox.enc.json: ${id}, ${plain.length} → ${JSON.stringify(sealed).length} байт`);
