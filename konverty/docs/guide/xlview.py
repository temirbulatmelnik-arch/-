# Картинка «как выглядит выгрузка в Excel» для инструкции: первые строки демо-выгрузки (вымышленные люди),
# напечатанные LibreOffice так же, как их увидит пользователь. Вход: demo/export.xlsx (его скачивает shoot.mjs).
import os, subprocess
import openpyxl
from openpyxl.worksheet.page import PageMargins
from PIL import Image, ImageChops

G = os.path.dirname(os.path.abspath(__file__))
wb = openpyxl.load_workbook(G + '/demo/export.xlsx')
ws = wb.active
yellow = [c.row for c in ws['B'] if c.fill.fill_type == 'solid']
print('жёлтых строк в демо-выгрузке:', len(yellow))
ws.print_area = 'A1:L19'
ws.page_setup.orientation = 'landscape'
ws.page_setup.fitToWidth = 1
ws.page_setup.fitToHeight = 0
ws.sheet_properties.pageSetUpPr.fitToPage = True
ws.page_margins = PageMargins(left=0.2, right=0.2, top=0.2, bottom=0.2)
wb.save(G + '/demo/export-view.xlsx')
out = G + '/xlrender'
os.makedirs(out, exist_ok=True)
for f in os.listdir(out):
    os.remove(os.path.join(out, f))
subprocess.run(['soffice', '--headless', '--convert-to', 'pdf', '--outdir', out, G + '/demo/export-view.xlsx'], capture_output=True, timeout=180, check=True)
subprocess.run(['pdftoppm', '-r', '170', '-f', '1', '-l', '1', '-png', out + '/export-view.pdf', out + '/p'], check=True)
im = Image.open(out + '/' + next(f for f in sorted(os.listdir(out)) if f.endswith('.png'))).convert('RGB')
bbox = ImageChops.difference(im, Image.new('RGB', im.size, (255, 255, 255))).getbbox()
im = im.crop((max(0, bbox[0] - 6), max(0, bbox[1] - 6), bbox[2] + 6, bbox[3] + 6))
im.save(G + '/shots/excel.png')
print('shots/excel.png', im.size)
