// Расшифровывает план для правки: node tools/decrypt-seed.mjs <код> [куда.json]
// Файл с открытым планом кладите вне репозитория и после encrypt-seed удаляйте.
import { readFileSync, writeFileSync } from 'node:fs';
import { open } from '../src/domain/vault.ts';

const [code, out = '/tmp/kurs-seed.json'] = process.argv.slice(2);
if (!code) {
  console.error('Использование: node tools/decrypt-seed.mjs <код> [куда.json]');
  process.exit(1);
}
const sealed = JSON.parse(readFileSync(new URL('../public/seed.enc.json', import.meta.url), 'utf8'));
const plain = await open(sealed, code);
if (!plain) { console.error('Код не подходит'); process.exit(1); }
writeFileSync(out, JSON.stringify(JSON.parse(plain), null, 1));
console.log(`План расшифрован: ${out}`);
