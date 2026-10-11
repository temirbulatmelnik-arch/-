# Инструкция для сотрудников

[`Инструкция — Сортировка конвертов.pdf`](Инструкция%20—%20Сортировка%20конвертов.pdf) — пошаговая инструкция с картинками, 20 страниц A4:
как защищены персональные данные, первый запуск, вход в обычный день, главный экран, раскладка конвертов,
сохранение прогресса, выгрузка в Excel, настройки, перерыв и конец работы, что делать при ошибках, горячие клавиши.
На всех снимках экрана — демо-версия приложения с вымышленными людьми.

## Как устроено

- Вёрстка — HTML и CSS для печати (CSS Paged Media: A4, колонтитулы с номерами страниц).
  PDF печатает Chromium через Playwright (`page.pdf`), с закладками и разметкой для программ чтения с экрана (tagged PDF).
- Шрифты Golos Text и PT Sans Narrow (лицензия SIL OFL, пакеты `@fontsource`), значки Lucide (`lucide-static`, лицензия ISC).
- `pdfpost.py` (pypdf) чинит названия закладок, которые Chromium удваивает, и находит страницы разделов для оглавления.
- `shots/` — снимки экрана, `shots/meta.json` — где на снимке нужные кнопки (по ним рисуются красные рамки с номерами).
- `marks.json` — вымышленные люди, которых съёмка отмечает заранее, чтобы на снимках были заполнены журнал и счётчики.

## Пересобрать PDF после правки текста

```bash
cd konverty && npm install
PW_PATH=$(npm root -g)/playwright/index.js node docs/guide/build-guide.mjs
```

Нужны Playwright с Chromium, Python с pypdf и `pdfinfo` (poppler-utils).
Если Chromium лежит не там, где его ищет Playwright, путь задаётся в `CHROMIUM_PATH`.

## Переснять скриншоты после изменения приложения

```bash
python3 docs/guide/mkdemo.py путь/к/base.json   # демо-база: из настоящей берутся только улицы, индексы и районы
node build.mjs --data docs/guide/demo/demo-base.json --xlsx docs/guide/demo/demo-base.xlsx \
  --xlsx-name "База ветеранов (пример).xlsx" --out docs/guide/demo/app.html --key docs/guide/demo/demo.key
python3 docs/guide/mkenv.py                       # картинки конвертов перед «камерой»
python3 -m http.server 8767 --bind 127.0.0.1 --directory docs/guide/demo &
PW_PATH=$(npm root -g)/playwright/index.js node docs/guide/shoot.mjs
python3 docs/guide/xlview.py                      # картинка выгрузки в Excel (нужен LibreOffice)
```

`mkdemo.py` не даёт вымышленному человеку совпасть по ФИО ни с кем из настоящей базы.
Папка `docs/guide/demo/` (демо-версия и демо-ключ) в репозиторий не попадает.
