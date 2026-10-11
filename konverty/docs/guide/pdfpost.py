# Доводка PDF после печати из Chromium:
#  1) исправляет названия закладок: Chromium удваивает текст заголовков во flex-контейнере
#     («Первый запускПервый запуск») и склеивает строки через <br> («Сортировкаконвертов»);
#  2) печатает {"заголовок": страница} — по нему собирается оглавление.
# Запуск: python3 pdfpost.py файл.pdf '["Заголовок 1", ...]'
import json, sys
from pypdf import PdfReader, PdfWriter
from pypdf.generic import NameObject, TextStringObject

path, known = sys.argv[1], json.loads(sys.argv[2])
squash = lambda t: ''.join(t.split())
by_key = {squash(k): k for k in known}

def fix(t):
    t = ' '.join(t.split())
    k = squash(t)
    if k in by_key:
        return by_key[k]
    if len(k) % 2 == 0 and k[:len(k) // 2] in by_key and k[:len(k) // 2] * 2 == k:
        return by_key[k[:len(k) // 2]]
    n = len(t)
    if n % 2 == 0 and t[:n // 2] == t[n // 2:]:
        return t[:n // 2]
    return t

w = PdfWriter(clone_from=PdfReader(path))
page_no = {pg.indirect_reference.idnum: i + 1 for i, pg in enumerate(w.pages)}
pages = {}
root = w._root_object.get('/Outlines')
stack = [root.get_object()['/First']] if root is not None and '/First' in root.get_object() else []
while stack:
    it = stack.pop().get_object()
    title = fix(str(it['/Title']))
    it[NameObject('/Title')] = TextStringObject(title)
    dest = it.get('/Dest')
    if dest is not None:
        pages.setdefault(title, page_no.get(dest.get_object()[0].idnum))
    for key in ('/Next', '/First'):
        if key in it:
            stack.append(it[key])
w.add_metadata({'/Subject': 'Как работать с приложением «Сортировка конвертов»: вход по ключу, раскладка конвертов, сохранение прогресса, выгрузка в Excel, защита персональных данных'})
with open(path, 'wb') as f:
    w.write(f)
print(json.dumps(pages, ensure_ascii=False))
