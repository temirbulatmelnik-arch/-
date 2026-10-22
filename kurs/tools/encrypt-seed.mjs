// Шифрует личный план для публикации: node tools/encrypt-seed.mjs <seed.json> <код>
// Открытый seed.json в репозиторий не кладётся — на сайт попадает только public/seed.enc.json.
import { readFileSync, writeFileSync } from 'node:fs';
import { seal, open } from '../src/domain/vault.ts';

const [file, code] = process.argv.slice(2);
if (!file || !code) {
  console.error('Использование: node tools/encrypt-seed.mjs <seed.json> <код>');
  process.exit(1);
}
const plain = JSON.stringify(JSON.parse(readFileSync(file, 'utf8')));
const sealed = await seal(plain, code);
if ((await open(sealed, code)) !== plain) throw new Error('проверка расшифровки не прошла');
writeFileSync(new URL('../public/seed.enc.json', import.meta.url), JSON.stringify(sealed));
console.log(`public/seed.enc.json: ${plain.length} → ${JSON.stringify(sealed).length} байт`);
