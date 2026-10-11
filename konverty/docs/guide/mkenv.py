# Картинки конвертов для съёмки инструкции (вымышленные адресаты из демо-базы): env/e1.jpg, e2.jpg, e4.jpg
import os
from PIL import Image, ImageDraw, ImageFont

G = os.path.dirname(os.path.abspath(__file__))
F = '/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf'
FS = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'


def env(path, lines, rot=-2.5):
    W, H = 1280, 720
    desk = (58, 52, 47)
    im = Image.new('RGB', (W, H), desk)
    e = Image.new('RGB', (1000, 560), (240, 236, 226))
    d = ImageDraw.Draw(e)
    fs = ImageFont.truetype(FS, 17)
    for i, l in enumerate(['Отправитель:', 'Санкт-Петербург']):
        d.text((34, 30 + i * 24), l, font=fs, fill=(95, 95, 110))
    d.rectangle([830, 26, 960, 176], outline=(150, 150, 150), width=2)
    d.text((858, 92), 'МАРКА', font=fs, fill=(150, 150, 150))
    for k in range(38):
        x = 40 + k * 6
        d.line([(x, 490), (x, 530)], fill=(40, 40, 40), width=1 + k % 3)
    f = ImageFont.truetype(F, 34)
    y = 230
    for l in lines:
        d.text((300, y), l, font=f, fill=(25, 25, 40))
        y += 48
    e = e.rotate(rot, expand=True, fillcolor=desk, resample=Image.BICUBIC)
    im.paste(e, ((W - e.width) // 2, (H - e.height) // 2))
    im.save(os.path.join(G, path), quality=90)


os.makedirs(os.path.join(G, 'env'), exist_ok=True)
env('env/e1.jpg', ['Кому: Смирновой Галине Петровне', 'Куда: ул. Ленская, д. 12, корп. 1, кв. 45', '195426 Санкт-Петербург'])
env('env/e2.jpg', ['Кому: Кузнецовой А. И.', 'Куда: пр. Просвещения, д. 30', '194352 Санкт-Петербург'], 1.5)
env('env/e4.jpg', ['Кому: Воробьёвой Лидии Михайловне', 'Куда: ул. Дыбенко, д. 8, корп. 1, кв. 120', '193168 Санкт-Петербург'], -1)
print('ok')
