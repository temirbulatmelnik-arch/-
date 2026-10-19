"""Сборка реалистичной 3D-модели для «Тонуса» в Blender (модуль bpy).

Тело — MakeHuman (CC0): мужчина 190 см, около 90 кг, максимальная мускулатура, прицельные морфы мышц.
Рельеф (пресс, белая линия, края прямой мышцы, нижний край грудных, «V-линии») вырезается на детальной
копии тела и запекается в карту нормалей и затенение. Кожа, короткая стрижка, брови, щетина, губы,
соски и шорты — процедурный материал, запечённый в текстуру по развёртке MakeHuman.

Анатомия для вида «насквозь» — Z-Anatomy / BodyParts3D (CC BY-SA 4.0 / CC BY-SA 2.1 JP): кости таза,
бедренные кости, позвоночник, рёбра, мышца, поднимающая задний проход, копчиковая мышца, наружный
сфинктер заднего прохода, мочевой пузырь, простата, диафрагма. Подгоняется к тазу модели по центрам
тазобедренных суставов.

Запуск (нужен Python с модулем bpy):  python tools/build-figure.py [body] [anatomy] [preview]
Переменные: TEX — размер текстур (2048), SAMPLES — сэмплы запекания затенения (64).
"""
import json
import math
import os
import ssl
import struct
import sys
import time
import urllib.request

import bpy  # первым: модуль bpy подключает bmesh и mathutils
import bmesh
import numpy as np

ROOT = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(ROOT, '.cache')
OUT = os.path.join(ROOT, '..', 'public', 'figure')
PREVIEW = os.path.join(CACHE, 'preview')
MH = 'https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data/'
MPFB = 'https://raw.githubusercontent.com/makehumancommunity/mpfb2/master/src/mpfb/data/'
ZA = 'https://raw.githubusercontent.com/LluisV/Z-Anatomy/PC-Version/Resources/Models/FBX/'
HEIGHT = 1.90       # м
MASS = 90.0         # кг
DENSITY = 1060.0    # кг/м³, мускулистое тело
TEX = int(os.environ.get('TEX', 2048))
SAMPLES = int(os.environ.get('SAMPLES', 64))
STEPS = [a for a in sys.argv[1:] if not a.startswith('-')] or ['body', 'anatomy']

T0 = time.time()
def log(*a):
    print(f'[{time.time() - T0:6.1f}s]', *a, flush=True)


def get(url, binary=False):
    path = os.path.join(CACHE, url.replace('https://raw.githubusercontent.com/', '').replace('/', '__'))
    if not os.path.exists(path):
        os.makedirs(CACHE, exist_ok=True)
        ca = os.environ.get('SSL_CERT_FILE') or ('/root/.ccr/ca-bundle.crt' if os.path.exists('/root/.ccr/ca-bundle.crt') else None)
        ctx = ssl.create_default_context(cafile=ca) if ca else None
        with urllib.request.urlopen(url.replace(' ', '%20'), context=ctx, timeout=600) as r, open(path + '.part', 'wb') as f:
            while chunk := r.read(1 << 20):
                f.write(chunk)
        os.replace(path + '.part', path)
    if binary:
        return path
    with open(path, encoding='utf-8') as f:
        return f.read()


def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


# ===================================================================== тело MakeHuman

def parse_obj(text):
    V, VT, faces = [], [], []
    group = ''
    for line in text.splitlines():
        if line.startswith('v '):
            V.append([float(x) for x in line.split()[1:4]])
        elif line.startswith('vt '):
            VT.append([float(x) for x in line.split()[1:3]])
        elif line.startswith('g '):
            group = line[2:].strip()
        elif line.startswith('f '):
            vs, ts = [], []
            for tok in line.split()[1:]:
                a = tok.split('/')
                vs.append(int(a[0]) - 1)
                ts.append(int(a[1]) - 1 if len(a) > 1 and a[1] else -1)
            faces.append((group, vs, ts))
    return np.array(V, dtype=np.float64), np.array(VT, dtype=np.float64), faces


def load_target(rel):
    idx, d = [], []
    for line in get(MH + 'targets/' + rel).splitlines():
        if not line or line[0] == '#':
            continue
        p = line.split()
        idx.append(int(p[0]))
        d.append([float(p[1]), float(p[2]), float(p[3])])
    return np.array(idx, dtype=np.int64), np.array(d, dtype=np.float64)


RACES = {'african': 1 / 3, 'asian': 1 / 3, 'caucasian': 1 / 3}
EXTRA = {
    'torso/torso-vshape-incr.target': 0.7,
    'torso/torso-muscle-pectoral-incr.target': 0.65,
    'torso/torso-muscle-dorsi-incr.target': 0.6,
    'stomach/stomach-pregnant-decr.target': 0.7,
}
for s in 'lr':
    EXTRA.update({
        f'armslegs/{s}-upperarm-muscle-incr.target': 0.6,
        f'armslegs/{s}-upperarm-shoulder-muscle-incr.target': 0.65,
        f'armslegs/{s}-lowerarm-muscle-incr.target': 0.45,
        f'armslegs/{s}-upperleg-muscle-incr.target': 0.55,
        f'armslegs/{s}-lowerleg-muscle-incr.target': 0.5,
    })


def weight_split(w):
    return {'averageweight': 1 - (w - 0.5) * 2, 'maxweight': (w - 0.5) * 2} if w >= 0.5 else {'minweight': (0.5 - w) * 2, 'averageweight': 1 - (0.5 - w) * 2}


class Body:
    def __init__(self):
        self.V0, self.VT, self.faces = parse_obj(get(MH + '3dobjs/base.obj'))
        self.targets = {}
        names = [f'macrodetails/{r}-male-young.target' for r in RACES] + list(EXTRA)
        for w in ('minweight', 'averageweight', 'maxweight'):
            names += [f'macrodetails/universal-male-young-maxmuscle-{w}.target',
                      f'macrodetails/height/male-young-maxmuscle-{w}-maxheight.target',
                      f'macrodetails/proportions/male-young-maxmuscle-{w}-idealproportions.target']
        for n in names:
            self.targets[n] = load_target(n)
        self.body_faces = [f for f in self.faces if f[0] == 'body']
        self.used = np.unique(np.concatenate([f[1] for f in self.body_faces]))
        self.tris = np.array([[vs[0], vs[k], vs[k + 1]] for _, vs, _ in self.body_faces for k in range(1, len(vs) - 1)])

    def morph(self, weight):
        V = self.V0.copy()
        def add(n, k):
            if k > 1e-4:
                i, d = self.targets[n]
                np.add.at(V, i, d * k)
        for r, k in RACES.items():
            add(f'macrodetails/{r}-male-young.target', k)
        for w, k in weight_split(weight).items():
            add(f'macrodetails/universal-male-young-maxmuscle-{w}.target', k)
            add(f'macrodetails/height/male-young-maxmuscle-{w}-maxheight.target', k)
            add(f'macrodetails/proportions/male-young-maxmuscle-{w}-idealproportions.target', k)
        for n, k in EXTRA.items():
            add(n, k)
        # в метры, ступни на полу, рост HEIGHT
        ys = V[self.used, 1]
        s = HEIGHT / (ys.max() - ys.min())
        V = V * s
        V[:, 1] -= ys.min() * s
        return V

    def mass(self, V):
        a, b, c = V[self.tris[:, 0]], V[self.tris[:, 1]], V[self.tris[:, 2]]
        return abs(np.einsum('ij,ij->i', a, np.cross(b, c)).sum() / 6) * DENSITY


def group_centroid(V, faces, name):
    idx = np.unique(np.concatenate([f[1] for f in faces if f[0] == name]))
    return V[idx].mean(axis=0)


def build_skeleton(V, faces):
    rig = json.loads(get(MPFB + 'rigs/standard/rig.game_engine.json'))
    names = []
    def visit(n):
        if n in names:
            return
        if rig[n]['parent']:
            visit(rig[n]['parent'])
        names.append(n)
    for n in rig:
        visit(n)
    def end(e):
        if e['strategy'] == 'CUBE':
            return group_centroid(V, faces, e['cube_name'])
        return V[e['vertex_indices']].mean(axis=0)
    bones = [{'name': n, 'parent': names.index(rig[n]['parent']) if rig[n]['parent'] else -1,
              'head': end(rig[n]['head']), 'tail': end(rig[n]['tail'])} for n in names]
    return names, bones


def vertex_normals(P, tris):
    n = np.zeros_like(P)
    a, b, c = P[tris[:, 0]], P[tris[:, 1]], P[tris[:, 2]]
    fn = np.cross(b - a, c - a)
    for k in range(3):
        np.add.at(n, tris[:, k], fn)
    n /= np.linalg.norm(n, axis=1, keepdims=True) + 1e-12
    return n


def make_body():
    body = Body()
    # вес под 90 кг: масса растёт с параметром веса — ищем половинным делением
    lo, hi = 0.3, 1.0
    for _ in range(12):
        mid = (lo + hi) / 2
        m = body.mass(body.morph(mid))
        lo, hi = (mid, hi) if m < MASS else (lo, mid)
    weight = (lo + hi) / 2
    V = body.morph(weight)
    log(f'параметр веса {weight:.3f}, масса {body.mass(V):.1f} кг, рост {HEIGHT} м')

    names, bones = build_skeleton(V, body.faces)
    B = {b['name']: b for b in bones}

    # сетка тела: исходные вершины группы body
    used = body.used
    remap = -np.ones(len(V), dtype=np.int64)
    remap[used] = np.arange(len(used))
    P = V[used]
    quads = [[int(remap[v]) for v in vs] for _, vs, _ in body.body_faces]
    tris = np.array([[q[0], q[k], q[k + 1]] for q in quads for k in range(1, len(q) - 1)], dtype=np.int64)
    N = vertex_normals(P, tris)

    # веса костей (до 4 на вершину), сумма ровно 255
    wfile = json.loads(get(MPFB + 'rigs/standard/weights.game_engine.json'))['weights']
    infl = [[] for _ in range(len(P))]
    for bone, lst in wfile.items():
        bi = names.index(bone)
        for vi, w in lst:
            j = remap[vi]
            if j >= 0 and w > 1e-4:
                infl[j].append((bi, w))
    skin_idx = np.zeros((len(P), 4), np.uint8)
    skin_w = np.zeros((len(P), 4), np.uint8)
    dominant = []
    for i, lst in enumerate(infl):
        lst.sort(key=lambda x: -x[1])
        top = lst[:4] or [(names.index('pelvis'), 1.0)]
        s = sum(w for _, w in top)
        q = [int(math.floor(w / s * 255)) for _, w in top]
        q[0] += 255 - sum(q)
        for k, (b, _) in enumerate(top):
            skin_idx[i, k] = b
            skin_w[i, k] = q[k]
        dominant.append(names[top[0][0]])
    dominant = np.array(dominant)

    # ориентиры
    eyes = []
    for g in ('helper-l-eye', 'helper-r-eye'):
        idx = np.unique(np.concatenate([f[1] for f in body.faces if f[0] == g]))
        c = V[idx].mean(axis=0)
        eyes.append({'c': c, 'r': float(np.linalg.norm(V[idx] - c, axis=1).mean())})
    mid = np.abs(P[:, 0]) < 0.012
    pel = np.isin(dominant, ['pelvis', 'thigh_l', 'thigh_r']) & mid
    crotch = P[pel][np.argmin(P[pel][:, 1])]
    hipY = (B['thigh_l']['head'][1] + B['thigh_r']['head'][1]) / 2
    L = {
        'crotch': crotch, 'hipY': hipY, 'spine01': B['spine_01']['head'], 'spine03': B['spine_03']['head'],
        'navel': None, 'nipples': [],
    }
    # пупок: самая глубокая точка передней поверхности живота на средней линии
    belly = (np.abs(P[:, 0]) < 0.01) & (P[:, 1] > hipY + 0.05) & (P[:, 1] < B['spine_02']['head'][1]) & (N[:, 2] > 0.5)
    cand = P[belly]
    # глубина относительно соседей по высоте: минимум z после сглаживания
    order = np.argsort(cand[:, 1])
    zs = cand[order, 2]
    k = 6
    rel = zs - np.convolve(np.pad(zs, k, mode='edge'), np.ones(2 * k + 1) / (2 * k + 1), mode='valid')
    L['navel'] = cand[order][np.argmin(rel)]
    # соски: концы «костей груди» скелета MakeHuman (breast.L / breast.R)
    L['nipples'] = [V[8451], V[1779]]
    log('пупок', np.round(L['navel'], 3), 'соски', [np.round(n, 3) for n in L['nipples']], 'промежность', np.round(crotch, 3))
    return body, V, P, N, quads, tris, used, remap, names, bones, B, skin_idx, skin_w, dominant, eyes, L, weight


def masks(P, N, dominant, B, eyes, L):
    """Маски для процедурного материала: волосы, брови, шорты, щетина, губы, покраснение, ареолы."""
    n = len(P)
    hair, brow, shorts, stubble, lips, red, areola = (np.zeros(n) for _ in range(7))
    head = np.isin(dominant, ['head', 'neck_01'])
    hc = B['head']['head']
    eyeY = (eyes[0]['c'][1] + eyes[1]['c'][1]) / 2
    eyeR = (eyes[0]['r'] + eyes[1]['r']) / 2
    d = P - hc
    ang = np.arctan2(np.abs(d[:, 0]), d[:, 2])  # 0 — лицо, π — затылок
    line = eyeY + 0.058 - 0.036 * (1 - np.cos(np.minimum(np.pi, ang))) - 0.022 * smooth(1.8, 3.1, ang)
    hair = head * smooth(line - 0.004, line + 0.008, P[:, 1])
    # бакенбарды до середины уха
    side = head & (np.abs(d[:, 0]) > 0.055) & (ang > 1.1) & (ang < 1.75)
    hair = np.maximum(hair, side * smooth(eyeY - 0.012, eyeY + 0.0, P[:, 1]) * (1 - smooth(1.55, 1.75, ang)))
    for e in eyes:
        c = e['c']
        r = e['r']
        ex = (P[:, 0] - c[0]) * np.sign(c[0])
        ey = P[:, 1] - c[1]
        u = np.clip(ex / (r * 2.4), -0.45, 1)
        arc = r * 1.5 + r * 0.25 * np.cos(u * np.pi / 2) - r * 0.35 * smooth(0.5, 1.0, u)
        thick = r * 0.52 * (1 - 0.45 * smooth(0.2, 1.0, u))
        m = head & (P[:, 2] > c[2] - r * 0.3) & (u > -0.42) & (u < 1.0)
        brow = np.maximum(brow, m * (1 - smooth(thick * 0.6, thick, np.abs(ey - arc))))
    # губы и щетина
    mouthY = eyeY - 0.075
    front = head & (d[:, 2] > 0.04)
    lipd = np.abs(P[:, 1] - mouthY) / 0.0085 + (np.abs(P[:, 0]) / 0.026) ** 2
    lips = front * (1 - smooth(0.7, 1.05, lipd))
    jaw = (dominant == 'head') & (P[:, 1] < mouthY + 0.022) & (P[:, 1] > mouthY - 0.065) & (d[:, 2] > -0.03)
    stubble = jaw * smooth(-0.02, 0.03, d[:, 2]) * (1 - lips) * (1 - smooth(eyeY - 0.06, eyeY - 0.035, P[:, 1]))
    stubble = np.maximum(stubble, jaw * (np.abs(P[:, 0]) < 0.06) * (P[:, 1] < mouthY - 0.01) * 0.8 * (1 - lips))
    # покраснение: уши, нос, щёки, локти, колени, кисти, стопы
    nose = front & (np.abs(P[:, 0]) < 0.02) & (np.abs(P[:, 1] - (eyeY - 0.035)) < 0.025)
    cheeks = front & (np.abs(np.abs(P[:, 0]) - 0.04) < 0.018) & (np.abs(P[:, 1] - (eyeY - 0.04)) < 0.02)
    ears = head & (np.abs(d[:, 0]) > 0.065) & (np.abs(P[:, 1] - eyeY) < 0.035)
    red = np.maximum.reduce([nose * 0.7, cheeks * 0.5, ears * 0.8,
                             np.isin(dominant, ['hand_l', 'hand_r']) * 0.6,
                             np.isin(dominant, ['foot_l', 'foot_r', 'ball_l', 'ball_r']) * 0.5])
    for s in 'lr':
        for j in ('calf_', 'lowerarm_'):
            c = B[j + s]['head']
            red = np.maximum(red, 0.45 * np.exp(-np.sum((P - c) ** 2, axis=1) / 0.035 ** 2))
    # ареолы и соски
    for c in L['nipples']:
        dist = np.linalg.norm(P - c, axis=1)
        areola = np.maximum(areola, (1 - smooth(0.011, 0.014, dist)) * 0.75 + (1 - smooth(0.003, 0.0045, dist)) * 0.25)
    # шорты: здесь только область таза и бёдер; точные края по высоте — в материале (shorts_range)
    shorts = np.isin(dominant, ['pelvis', 'spine_01', 'thigh_l', 'thigh_r']).astype(float)
    A = np.stack([hair, brow, shorts, stubble], axis=1)
    Bm = np.stack([lips, red, areola, np.ones(n)], axis=1)
    return np.clip(A, 0, 1), np.clip(Bm, 0, 1)


def shorts_range(L, B):
    thighMid = L['hipY'] - 0.40 * (L['hipY'] - B['calf_l']['head'][1])
    return thighMid, L['navel'][1] - 0.035


def definition(P, N, L, B):
    """Глубина рельефа (м) для детальной копии: пресс, белая линия, края прямой мышцы, грудные, V-линии."""
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    ax = np.abs(x)
    front = smooth(0.25, 0.6, N[:, 2])
    navel = L['navel'][1]
    nipY = (L['nipples'][0][1] + L['nipples'][1][1]) / 2
    xiph = nipY - 0.085
    pubis = L['crotch'][1] + 0.075
    depth = np.zeros(len(P))
    nipX = abs(L['nipples'][0][0])
    # белая линия
    band = smooth(navel - 0.05, navel - 0.02, y) * (1 - smooth(xiph - 0.01, xiph + 0.01, y))
    depth += 0.0042 * np.exp(-(x / 0.0065) ** 2) * band
    # сухожильные перемычки: на уровне пупка и две выше — «кубики» пресса
    absw = 0.074
    for k, yi in enumerate([navel + 0.012, navel + 0.07, navel + 0.128]):
        curve = yi + 0.014 * (ax / absw) ** 2 - 0.004 * k
        depth += (0.0042 - 0.0004 * k) * np.exp(-((y - curve) / 0.0062) ** 2) * (1 - smooth(absw - 0.01, absw + 0.004, ax)) * smooth(0.003, 0.012, ax)
    # нижний пресс без перемычек, но с мягким краем
    # полулунные линии — наружные края прямой мышцы
    semi = absw + 0.008 + 0.014 * (y - navel) / 0.12
    depth += 0.0042 * np.exp(-((ax - semi) / 0.0075) ** 2) * smooth(pubis + 0.02, navel - 0.03, y) * (1 - smooth(xiph - 0.01, xiph + 0.02, y))
    # V-линии: от гребня подвздошной кости к лобку
    p0 = np.array([0.112, navel - 0.03])
    p1 = np.array([0.03, pubis])
    seg = p1 - p0
    t = np.clip(((ax - p0[0]) * seg[0] + (y - p0[1]) * seg[1]) / seg.dot(seg), 0, 1)
    dist = np.hypot(ax - (p0[0] + t * seg[0]), y - (p0[1] + t * seg[1]))
    depth += 0.0055 * np.exp(-(dist / 0.009) ** 2) * smooth(0, 0.12, t) * (1 - smooth(0.85, 1, t))
    # нижний край грудных мышц: ниже всего под соском, к грудине чуть выше, к подмышке — круто вверх
    u = ax - nipX
    pec = nipY - 0.05 + np.where(u < 0, 0.022 * (u / nipX) ** 2, 0.085 * (u / 0.09) ** 2)
    depth += 0.005 * np.exp(-((y - pec) / 0.009) ** 2) * smooth(0.012, 0.03, ax) * (1 - smooth(nipX + 0.075, nipX + 0.095, ax))
    depth += 0.0026 * np.exp(-(x / 0.0075) ** 2) * smooth(nipY - 0.06, nipY - 0.03, y) * (1 - smooth(B['clavicle_l']['head'][1] - 0.05, B['clavicle_l']['head'][1] - 0.02, y))
    torso = (y > pubis - 0.01) & (y < B['clavicle_l']['head'][1])
    return depth * front * torso


# ===================================================================== Blender: сцена, запекание

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scn = bpy.context.scene
    scn.render.engine = 'CYCLES'
    scn.cycles.device = 'CPU'
    scn.cycles.samples = SAMPLES
    scn.render.bake.margin = 8
    scn.view_settings.view_transform = 'Standard'
    scn.view_settings.look = 'None'
    world = bpy.data.worlds.new('bake')
    world.light_settings.distance = 0.06  # затенение только в складках мышц
    scn.world = world
    return scn


def mesh_object(name, P, faces, uv_loops=None, attrs=None):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(p) for p in P], [], faces)
    me.update()
    if uv_loops is not None:
        uv = me.uv_layers.new(name='UV')
        uv.data.foreach_set('uv', uv_loops.astype(np.float32).ravel())
    for aname, data in (attrs or {}).items():
        a = me.color_attributes.new(aname, 'FLOAT_COLOR', 'POINT')
        a.data.foreach_set('color', data.astype(np.float32).ravel())
    for p in me.polygons:
        p.use_smooth = True
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def evaluated_copy(ob, name):
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
    me.name = name
    nob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(nob)
    return nob


def skin_material(name, shorts_y, rough=False):
    """Процедурная кожа и всё, что на ней нарисовано; результат запекается как излучение.
    rough=True — тот же рисунок, но в оттенках серого: карта шероховатости (ткань матовая, губы влажнее)."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    emit = nt.nodes.new('ShaderNodeEmission')
    nt.links.new(emit.outputs[0], out.inputs[0])
    coord = nt.nodes.new('ShaderNodeTexCoord')

    def attr(n):
        a = nt.nodes.new('ShaderNodeAttribute')
        a.attribute_name = n
        sep = nt.nodes.new('ShaderNodeSeparateColor')
        nt.links.new(a.outputs['Color'], sep.inputs[0])
        al = a.outputs['Alpha']
        return sep.outputs[0], sep.outputs[1], sep.outputs[2], al

    def noise(scale, detail=6.0, rough=0.6, distort=0.0, stretch=None):
        src = coord.outputs['Object']
        if stretch:
            mp = nt.nodes.new('ShaderNodeMapping')
            mp.inputs['Scale'].default_value = stretch
            nt.links.new(src, mp.inputs[0])
            src = mp.outputs[0]
        nz = nt.nodes.new('ShaderNodeTexNoise')
        nz.inputs['Scale'].default_value = scale
        nz.inputs['Detail'].default_value = detail
        nz.inputs['Roughness'].default_value = rough
        nz.inputs['Distortion'].default_value = distort
        nt.links.new(src, nz.inputs['Vector'])
        return nz.outputs['Fac']

    def rgb(h):
        h = h.lstrip('#')
        c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
        return [((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in c] + [1]

    def mixc(a, b, fac):
        m = nt.nodes.new('ShaderNodeMix')
        m.data_type = 'RGBA'
        if isinstance(fac, float):
            m.inputs['Factor'].default_value = fac
        else:
            nt.links.new(fac, m.inputs['Factor'])
        for i, v in ((6, a), (7, b)):
            if isinstance(v, list):
                m.inputs[i].default_value = v
            else:
                nt.links.new(v, m.inputs[i])
        return m.outputs[2]

    def math_op(op, a, b):
        m = nt.nodes.new('ShaderNodeMath')
        m.operation = op
        for i, v in enumerate((a, b)):
            if isinstance(v, (int, float)):
                m.inputs[i].default_value = v
            else:
                nt.links.new(v, m.inputs[i])
        return m.outputs[0]

    def ramp(fac, a, b):
        m = nt.nodes.new('ShaderNodeMapRange')
        m.inputs['From Min'].default_value = a
        m.inputs['From Max'].default_value = b
        nt.links.new(fac, m.inputs['Value'])
        return m.outputs[0]

    hairM, browM, legsM, stubbleM = attr('maskA')
    lipsM, redM, areolaM, _ = attr('maskB')
    # шорты: чёткие края по высоте (координата Y модели), внутри области таза и бёдер
    sepxyz = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(coord.outputs['Object'], sepxyz.inputs[0])
    hem = ramp(sepxyz.outputs['Y'], shorts_y[0] - 0.0015, shorts_y[0] + 0.0015)
    band = math_op('SUBTRACT', 1.0, ramp(sepxyz.outputs['Y'], shorts_y[1] - 0.0015, shorts_y[1] + 0.0015))
    shortsM = math_op('MULTIPLY', ramp(legsM, 0.45, 0.55), math_op('MULTIPLY', hem, band))
    if rough:
        val = mixc([0.5, 0.5, 0.5, 1], [0.36, 0.36, 0.36, 1], lipsM)
        val = mixc(val, [0.72, 0.72, 0.72, 1], hairM)
        val = mixc(val, [0.9, 0.9, 0.9, 1], shortsM)
        nt.links.new(val, emit.inputs['Color'])
        return mat

    skin = mixc(rgb('#b47a5c'), rgb('#cd9878'), ramp(noise(14, 4, 0.5), 0.35, 0.65))       # пятнистость кожи
    skin = mixc(skin, rgb('#9c6a51'), math_op('MULTIPLY', ramp(noise(260, 2, 0.5), 0.6, 0.85), 0.08))  # поры
    skin = mixc(skin, rgb('#c46f60'), math_op('MULTIPLY', redM, 0.32))
    skin = mixc(skin, rgb('#a85f57'), math_op('MULTIPLY', lipsM, 0.75))
    skin = mixc(skin, rgb('#7a4a3c'), math_op('MULTIPLY', areolaM, 0.85))
    stub = math_op('MULTIPLY', stubbleM, math_op('MULTIPLY', ramp(noise(900, 1, 0.5), 0.45, 0.7), 0.42))
    skin = mixc(skin, rgb('#3a2b24'), stub)
    browN = ramp(noise(380, 3, 0.6, stretch=(1, 3.5, 1)), 0.38, 0.62)
    skin = mixc(skin, rgb('#2b1e17'), math_op('MULTIPLY', browM, math_op('ADD', math_op('MULTIPLY', browN, 0.3), 0.62)))
    hairN = ramp(noise(1400, 2, 0.6), 0.3, 0.7)
    skin = mixc(skin, rgb('#241a14'), math_op('MULTIPLY', hairM, math_op('ADD', math_op('MULTIPLY', hairN, 0.25), 0.72)))
    fabric = mixc(rgb('#262b35'), rgb('#323946'), ramp(noise(600, 2, 0.4, stretch=(1, 4, 1)), 0.35, 0.65))
    skin = mixc(skin, fabric, shortsM)
    nt.links.new(skin, emit.inputs['Color'])
    emit.inputs['Strength'].default_value = 1.0
    return mat


def bake_target(ob, image):
    """Материал низкой модели с узлом картинки — сюда пишется запекание."""
    mat = bpy.data.materials.new('bake_' + image.name)
    mat.use_nodes = True
    nt = mat.node_tree
    node = nt.nodes.new('ShaderNodeTexImage')
    node.image = image
    nt.nodes.active = node
    ob.data.materials.clear()
    ob.data.materials.append(mat)


def bake(low, high, kind, image, **kw):
    bake_target(low, image)
    bpy.ops.object.select_all(action='DESELECT')
    high.select_set(True)
    low.select_set(True)
    bpy.context.view_layer.objects.active = low
    log('запекание', kind, image.size[:])
    bpy.ops.object.bake(type=kind, use_selected_to_active=True, cage_extrusion=0.006, max_ray_distance=0.02,
                        target='IMAGE_TEXTURES', margin=8, use_clear=True, **kw)


def save_jpeg(image, path, quality=88):
    scn = bpy.context.scene
    s = scn.render.image_settings
    s.file_format = 'JPEG'
    s.color_mode = 'RGB'
    s.quality = quality
    image.save_render(path, scene=scn)
    log('сохранено', os.path.relpath(path, os.path.join(ROOT, '..')), f'{os.path.getsize(path) / 1024:.0f} КБ')


def build_body():
    scn = reset()
    body, V, P, N, quads, tris, used, remap, names, bones, B, skin_idx, skin_w, dominant, eyes, L, weight = make_body()
    maskA, maskB = masks(P, N, dominant, B, eyes, L)

    uv_loops = np.array([body.VT[t] for _, _, ts in body.body_faces for t in ts])
    low = mesh_object('body_low', P, quads, uv_loops, {'maskA': maskA, 'maskB': maskB})

    # детальная копия: подразделение ×2 и рельеф вдоль нормалей
    sub = low.modifiers.new('sub', 'SUBSURF')
    sub.levels = sub.render_levels = 2
    sub.uv_smooth = 'PRESERVE_BOUNDARIES'
    high = evaluated_copy(low, 'body_high')
    low.modifiers.remove(sub)
    hm = high.data
    HP = np.zeros(len(hm.vertices) * 3)
    hm.vertices.foreach_get('co', HP)
    HP = HP.reshape(-1, 3)
    HN = np.zeros(len(hm.vertices) * 3)
    hm.vertex_normals.foreach_get('vector', HN)
    HN = HN.reshape(-1, 3)
    d = definition(HP, HN, L, B)
    hm.vertices.foreach_set('co', (HP - HN * d[:, None]).ravel())
    hm.update()
    log('детальная копия', len(hm.vertices), 'вершин, рельеф до', f'{d.max() * 1000:.1f} мм')
    sy = shorts_range(L, B)
    high.data.materials.append(skin_material('skin_proc', sy))

    os.makedirs(OUT, exist_ok=True)
    img_n = bpy.data.images.new('normal', TEX, TEX)
    img_n.colorspace_settings.name = 'Non-Color'
    bake(low, high, 'NORMAL', img_n, normal_space='TANGENT')
    save_jpeg(img_n, os.path.join(OUT, 'athlete-normal.jpg'), 92)

    scn.cycles.samples = SAMPLES
    img_ao = bpy.data.images.new('ao', TEX, TEX)
    img_ao.colorspace_settings.name = 'Non-Color'
    bake(low, high, 'AO', img_ao)

    scn.cycles.samples = 1
    img_c = bpy.data.images.new('color', TEX, TEX)
    bake(low, high, 'EMIT', img_c)

    # затенение в цвет: мягко, чтобы рельеф читался и без прямого света
    c = np.zeros(TEX * TEX * 4, np.float32)
    img_c.pixels.foreach_get(c)
    a = np.zeros(TEX * TEX * 4, np.float32)
    img_ao.pixels.foreach_get(a)
    ao = a.reshape(-1, 4)[:, :1]
    c = c.reshape(-1, 4)
    c[:, :3] *= 0.42 + 0.58 * np.clip(ao, 0, 1) ** 0.9
    img_c.pixels.foreach_set(c.ravel())
    save_jpeg(img_c, os.path.join(OUT, 'athlete-color.jpg'), 88)

    # карта шероховатости: тот же рисунок в оттенках серого
    high.data.materials.clear()
    high.data.materials.append(skin_material('skin_rough', sy, rough=True))
    img_r = bpy.data.images.new('rough', TEX // 2, TEX // 2)
    img_r.colorspace_settings.name = 'Non-Color'
    bake(low, high, 'EMIT', img_r)
    save_jpeg(img_r, os.path.join(OUT, 'athlete-rough.jpg'), 85)

    export_body(body, P, N, quads, used, remap, names, bones, skin_idx, skin_w, dominant, eyes, L, uv_loops, weight)
    if 'preview' in STEPS:
        preview_body(low)
    return B, L


def breath_morph(P, N, dominant, L, B):
    torso = np.isin(dominant, ['pelvis', 'spine_01', 'spine_02', 'spine_03'])
    navelY = L['navel'][1] + 0.01
    belly = np.exp(-((P[:, 1] - navelY) / 0.1) ** 2) * smooth(-0.2, 0.6, N[:, 2]) * (P[:, 1] > L['hipY'] - 0.02)
    chest = np.exp(-((P[:, 1] - B['spine_03']['head'][1] - 0.04) / 0.09) ** 2) * smooth(-0.1, 0.5, N[:, 2])
    keep = torso & (N[:, 2] > -0.2)
    d = np.zeros_like(P)
    d[:, 0] = N[:, 0] * (0.013 * belly + 0.005 * chest)
    d[:, 1] = N[:, 1] * 0.005 * chest + 0.004 * chest
    d[:, 2] = N[:, 2] * (0.026 * belly + 0.007 * chest)
    return d * keep[:, None]


def export_body(body, P, N, quads, used, remap, names, bones, skin_idx, skin_w, dominant, eyes, L, uv_loops, weight):
    """Вершины разделяются по швам развёртки; нормали — общие, чтобы на швах не было ступенек."""
    key, verts, index = {}, [], []
    loop = 0
    for q, (_, vs, ts) in zip(quads, body.body_faces):
        ids = []
        for k in range(len(q)):
            uv = tuple(np.round(uv_loops[loop + k], 6))
            kk = (q[k], uv)
            if kk not in key:
                key[kk] = len(verts)
                verts.append((q[k], uv))
            ids.append(key[kk])
        loop += len(q)
        for k in range(1, len(ids) - 1):
            index += [ids[0], ids[k], ids[k + 1]]
    src = np.array([v for v, _ in verts])
    UV = np.array([uv for _, uv in verts])
    pos = P[src]
    nrm = N[src]
    br = breath_morph(P, N, dominant, L, {b['name']: b for b in bones})[src]
    n = len(src)
    assert n < 65536
    lo, hi = pos.min(axis=0), pos.max(axis=0)
    parts = [
        np.round((pos - lo) / (hi - lo) * 65535).astype(np.uint16),
        np.round(np.clip(nrm, -1, 1) * 127).astype(np.int8),
        np.round(np.clip(UV, 0, 1) * 65535).astype(np.uint16),
        skin_idx[src], skin_w[src],
        np.clip(np.round(br / 0.00025), -127, 127).astype(np.int8),
        np.array(index, dtype=np.uint16),
    ]
    names_p = ['position', 'normal', 'uv', 'skinIndex', 'skinWeight', 'breath', 'index']
    offsets, blob = {}, bytearray()
    for nm, arr in zip(names_p, parts):
        blob += b'\0' * ((-len(blob)) % 4)
        offsets[nm] = len(blob)
        blob += arr.tobytes()
    with open(os.path.join(OUT, 'athlete.bin'), 'wb') as f:
        f.write(blob)
    r4 = lambda v: [round(float(x), 4) for x in v]
    meta = {
        'source': 'MakeHuman base mesh, targets and MPFB game_engine rig — CC0 (makehumancommunity.org)',
        'height': HEIGHT, 'mass': MASS, 'weight': float(weight),
        'vertices': n, 'indices': len(index),
        'bounds': {'lo': r4(lo), 'hi': r4(hi)}, 'breathStep': 0.00025,
        'offsets': offsets,
        'textures': {'color': 'athlete-color.jpg', 'normal': 'athlete-normal.jpg', 'rough': 'athlete-rough.jpg'},
        'bones': [{'name': b['name'], 'parent': b['parent'], 'head': r4(b['head'])} for b in bones],
        'eyes': [{'c': r4(e['c']), 'r': round(e['r'], 4)} for e in eyes],
        'landmarks': {'crotch': r4(L['crotch']), 'hipY': round(float(L['hipY']), 4), 'spine01': r4(L['spine01']),
                      'spine03': r4(L['spine03']), 'navel': r4(L['navel']), 'minZ': round(float(lo[2]), 4)},
    }
    with open(os.path.join(OUT, 'athlete.json'), 'w') as f:
        json.dump(meta, f)
    log('тело:', n, 'вершин,', len(index) // 3, 'треугольников,', f'{len(blob) / 1024:.0f} КБ')


def preview_body(low):
    scn = bpy.context.scene
    mat = bpy.data.materials.new('preview')
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes['Principled BSDF']
    col = nt.nodes.new('ShaderNodeTexImage')
    col.image = bpy.data.images.load(os.path.join(OUT, 'athlete-color.jpg'))
    nm = nt.nodes.new('ShaderNodeTexImage')
    nm.image = bpy.data.images.load(os.path.join(OUT, 'athlete-normal.jpg'))
    nm.image.colorspace_settings.name = 'Non-Color'
    nmap = nt.nodes.new('ShaderNodeNormalMap')
    nt.links.new(col.outputs[0], bsdf.inputs['Base Color'])
    nt.links.new(nm.outputs[0], nmap.inputs['Color'])
    nt.links.new(nmap.outputs[0], bsdf.inputs['Normal'])
    bsdf.inputs['Roughness'].default_value = 0.5
    bsdf.inputs['Subsurface Weight'].default_value = 0.08
    low.data.materials.clear()
    low.data.materials.append(mat)
    for ob in list(scn.objects):
        if ob.name != 'body_low':
            bpy.data.objects.remove(ob)
    world = bpy.data.worlds.new('w')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.05, 0.06, 0.09, 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.6
    scn.world = world
    for name, loc, energy in (('key', (2.5, -3.5, 3.0), 420), ('rim', (-2.5, 3.0, 2.5), 320), ('fill', (-3, -2, 1.5), 120)):
        ld = bpy.data.lights.new(name, 'AREA')
        ld.energy = energy
        ld.size = 2
        lo_ = bpy.data.objects.new(name, ld)
        lo_.location = loc
        scn.collection.objects.link(lo_)
        lo_.rotation_euler = (0, 0, 0)
        direction = -np.array(loc)
        lo_.rotation_mode = 'QUATERNION'
        from mathutils import Vector
        lo_.rotation_quaternion = Vector(direction).to_track_quat('-Z', 'Y')
    low.rotation_euler = (math.pi / 2, 0, 0)  # Y-вверх MakeHuman → Z-вверх Blender
    os.makedirs(PREVIEW, exist_ok=True)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    scn.collection.objects.link(cam)
    scn.camera = cam
    scn.render.resolution_x, scn.render.resolution_y = 640, 960
    scn.cycles.samples = 48
    scn.render.image_settings.file_format = 'PNG'
    from mathutils import Vector
    for tag, eye, target, lens in (('full', (1.2, -4.6, 1.15), (0, 0, 1.0), 50), ('torso', (0.5, -1.9, 1.25), (0, 0, 1.22), 55), ('face', (0.15, -0.75, 1.76), (0, 0, 1.74), 70)):
        cam.location = eye
        cam.data.lens = lens
        cam.rotation_mode = 'QUATERNION'
        cam.rotation_quaternion = (Vector(target) - Vector(eye)).to_track_quat('-Z', 'Y')
        scn.render.filepath = os.path.join(PREVIEW, f'body-{tag}.png')
        bpy.ops.render.render(write_still=True)
        log('превью', scn.render.filepath)


# ===================================================================== анатомия Z-Anatomy

# группа → (кость скелета, к которой крепится; объекты Z-Anatomy)
ANATOMY = {
    'pelvis_bones': ('pelvis', ['Hip bone.l', 'Hip bone.r', 'Sacrum', 'Coccyx', 'Vertebra L5', 'Vertebra L4']),
    'femur_l': ('thigh_l', ['Femur.l']),
    'femur_r': ('thigh_r', ['Femur.r']),
    'spine': ('spine_02', ['Vertebra L3', 'Vertebra L2', 'Vertebra L1'] + [f'Vertebra T{i}' for i in range(5, 13)]),
    'ribs': ('spine_03', [f'{n} rib.{s}' for n in ('Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth', 'Eleventh', 'Twelfth') for s in 'lr']
             + [f'Costal cartilage of {n} rib.{s}' for n in ('fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth') for s in 'lr']
             + ['Body of sternum', 'Xiphoid process']),
    'levator': ('pelvis', [f'{m}.{s}' for m in ('Iliococcygeus muscle', 'Pubococcygeus muscle', 'Pubo-analis muscle', 'Coccygeus muscle') for s in 'lr']),
    'sphincter': ('pelvis', ['External anal sphincter.l', 'External anal sphincter.r']),
    'bladder': ('pelvis', ['Urinary bladder']),
    'prostate': ('pelvis', ['Prostate']),
    'diaphragm': ('spine_02', ['Diaphragm']),
    'testes': ('pelvis', ['Testis.l', 'Testis.r', 'Epididymis.l', 'Epididymis.r']),
}
DECIMATE = {'pelvis_bones': 9000, 'femur_l': 1600, 'femur_r': 1600, 'spine': 7000, 'ribs': 9000, 'levator': 5000,
            'sphincter': 600, 'bladder': 1400, 'prostate': 500, 'diaphragm': 6000, 'penis': 40000, 'scrotum': 5000, 'testes': 2000,
            'urethral_sphincter': 1200, 'bulbospongiosus': 1600, 'ischiocavernosus': 1600}

# Пенис строится ровным цилиндром вдоль изогнутой оси: выходит из лобка вперёд-вниз и свисает перед мошонкой.
# Атласные пещеристые тела неровные и при растяжении становятся бугристыми, поэтому форму задаём сами.
# Корень у симфиза — точка поворота для анимации.
PENIS_ROOT = np.array([0.0, -0.072, 0.816])          # у нижнего края лобкового симфиза, координаты Z-Anatomy
PEN_LENGTH = 0.118       # от выхода из тела до кончика, м
PEN_GLANS = 0.04         # длина головки
PEN_BASE = 0.121         # обхват у основания, м — чуть толще
PEN_MID = 0.114          # обхват ствола
PEN_NECK = 0.108         # лёгкое сужение перед венцом
PEN_CORONA = 0.113       # венец головки — почти как ствол
PEN_INSIDE = 0.025       # насколько ствол уходит под кожу тела (там он растворяется)
PEN_FLARE = 0.2          # у тела основание шире на 20 % и переходит в кожу лобка
PEN_BEND = 0.045         # на каком отрезке от выхода из тела ось поворачивается вниз, м


# Подкожные вены ствола в координатах (u — от выхода из тела до венца, θ — угол от тыльной стороны, рад):
# поверхностная дорсальная вена по средней линии и несколько ветвей. Лёгкие возвышения кожи, не более 1,1 мм.
VEINS = [
    (0.06, 0.94, lambda u: 0.10 * np.sin(5.0 * u + 0.4), 0.0021, 0.0011),
    (0.30, 0.80, lambda u: 0.15 + (u - 0.30) * 2.4, 0.0016, 0.0008),
    (0.48, 0.90, lambda u: -0.10 - (u - 0.48) * 2.2, 0.0015, 0.0007),
    (0.12, 0.62, lambda u: 1.75 + 0.18 * np.sin(7.0 * u), 0.0015, 0.0006),
    (0.25, 0.85, lambda u: -1.65 + 0.2 * np.sin(6.0 * u + 1.0), 0.0014, 0.0006),
]


def ellipsoid(c, r, nu=32, nv=20):
    th = np.linspace(0, np.pi, nv)[:, None]
    ph = np.linspace(0, 2 * np.pi, nu, endpoint=False)[None, :]
    pts = np.stack([np.sin(th) * np.cos(ph), np.cos(th) + 0 * ph, np.sin(th) * np.sin(ph)], axis=-1).reshape(-1, 3) * r + c
    faces = [[i * nu + j, i * nu + (j + 1) % nu, (i + 1) * nu + (j + 1) % nu, (i + 1) * nu + j] for i in range(nv - 1) for j in range(nu)]
    return pts, faces


def merge(parts):
    pts, faces, off = [], [], 0
    for P, F in parts:
        pts.append(P)
        faces += [[i + off for i in f] for f in F]
        off += len(P)
    return np.concatenate(pts), faces


def skin_over(name, pts, faces, voxel, iterations, inflate):
    """Кожа поверх органов: объединить в один объём (воксельный ремеш), сгладить и отодвинуть на толщину кожи"""
    ob = mesh_object(name, pts, faces)
    rm = ob.modifiers.new('rm', 'REMESH')
    rm.mode, rm.voxel_size, rm.adaptivity = 'VOXEL', voxel, 0.0
    sm = ob.modifiers.new('sm', 'SMOOTH')
    sm.factor, sm.iterations = 0.6, iterations
    ds = ob.modifiers.new('ds', 'DISPLACE')
    ds.strength, ds.mid_level = inflate, 0.0
    ev = evaluated_copy(ob, name + '_skin')
    P = np.array([v.co[:] for v in ev.data.vertices])
    return P, [list(p.vertices) for p in ev.data.polygons]


def subset(P, faces, keep):
    faces = [f for f in faces if all(keep[i] for i in f)]
    used = sorted({i for f in faces for i in f})
    remap = {v: k for k, v in enumerate(used)}
    return P[used], [[remap[i] for i in f] for f in faces]


def triangles(faces):
    return np.array([[f[0], f[k], f[k + 1]] for f in faces for k in range(1, len(f) - 1)], dtype=np.int64)


def shell(pts, faces, keep, offset):
    """Мышца, лежащая на органе: часть его поверхности, отодвинутая наружу по нормалям"""
    T = triangles(faces)
    N = vertex_normals(pts, T)
    c = pts[T].mean(axis=1)
    fn = np.cross(pts[T[:, 1]] - pts[T[:, 0]], pts[T[:, 2]] - pts[T[:, 0]])
    fn /= np.linalg.norm(fn, axis=1, keepdims=True) + 1e-12
    T = T[keep(c, fn)]
    used = np.unique(T)
    remap = -np.ones(len(pts), dtype=np.int64)
    remap[used] = np.arange(len(used))
    return pts[used] + N[used] * offset, remap[T].tolist()


def bulbospongiosus(world_mesh):
    # обхватывает луковицу пениса снизу и с боков; сверху она прилежит к мембране промежности
    pts, faces = world_mesh(['Corpus spongiosum of penis'])
    return shell(pts, faces, lambda c, n: (c[:, 1] > -0.014) & (n[:, 2] < 0.35), 0.0017)


def ischiocavernosus(world_mesh):
    # покрывает ножки пещеристых тел, расходящиеся к седалищным костям
    pts, faces = world_mesh(['Corpus cavernosum of penis'])
    return shell(pts, faces, lambda c, n: (np.abs(c[:, 0]) > 0.012) & (c[:, 1] > -0.014) & (n[:, 2] < 0.45), 0.0016)


def urethral_sphincter(world_mesh, rings=9, seg=28, r_out=0.0068, r_in=0.003):
    """Кольцо вокруг перепончатой части уретры — от верхушки простаты до луковицы пениса"""
    u, _ = world_mesh(['Urethra'])
    zs = np.linspace(0.8075, 0.817, rings)
    centers = []
    for z in zs:
        sl = u[(np.abs(u[:, 2] - z) < 0.0015) & (u[:, 1] > 0.0)]
        centers.append(sl.mean(axis=0) if len(sl) else np.array([0.0, 0.008, z]))
    C = np.array(centers)
    tang = np.gradient(C, axis=0)
    tang /= np.linalg.norm(tang, axis=1, keepdims=True)
    pts, faces = [], []
    for r in (r_out, r_in):
        for c, t in zip(C, tang):
            a = np.cross(t, [1.0, 0, 0]); a /= np.linalg.norm(a)
            b = np.cross(t, a)
            for k in range(seg):
                ang = 2 * np.pi * k / seg
                pts.append(c + r * (np.cos(ang) * a + np.sin(ang) * b))
    ring = lambda layer, i, k: layer * rings * seg + i * seg + k % seg
    for layer, flip in ((0, False), (1, True)):
        for i in range(rings - 1):
            for k in range(seg):
                q = [ring(layer, i, k), ring(layer, i, k + 1), ring(layer, i + 1, k + 1), ring(layer, i + 1, k)]
                faces.append(q[::-1] if flip else q)
    for i, flip in ((0, True), (rings - 1, False)):          # торцы между наружной и внутренней стенкой
        for k in range(seg):
            q = [ring(0, i, k), ring(0, i, k + 1), ring(1, i, k + 1), ring(1, i, k)]
            faces.append(q[::-1] if flip else q)
    return np.array(pts), faces


# сглаживание: у атласа на луковице и ножках мало вершин, оболочки мышц иначе выглядят гранёными
SUBDIVIDE = {'bulbospongiosus': 2, 'ischiocavernosus': 2}

PROCEDURAL = {
    'urethral_sphincter': ('pelvis', urethral_sphincter),
    'bulbospongiosus': ('pelvis', bulbospongiosus),
    'ischiocavernosus': ('pelvis', ischiocavernosus),
}


def za_to_mh(p):
    """Z-Anatomy (Blender: Z — вверх, −Y — вперёд) → MakeHuman (Y — вверх, Z — вперёд)."""
    return np.stack([p[:, 0], p[:, 2], -p[:, 1]], axis=1)


def L_y(L):
    return float(np.array(L['crotch'])[1])


def build_anatomy(B, L):
    reset()
    for f in ('SkeletalSystem100.fbx', 'MuscularSystem100.fbx', 'VisceralSystem100.fbx'):
        path = get(ZA + f, binary=True)
        log('импорт', f)
        bpy.ops.import_scene.fbx(filepath=path)
    objs = {o.name: o for o in bpy.data.objects if o.type == 'MESH'}

    def world_mesh(names):
        Ps, Fs, off = [], [], 0
        for n in names:
            o = objs.get(n)
            if o is None:
                log('нет объекта', n)
                continue
            me = o.data
            M = np.array(o.matrix_world)
            co = np.zeros(len(me.vertices) * 3)
            me.vertices.foreach_get('co', co)
            co = co.reshape(-1, 3) @ M[:3, :3].T + M[:3, 3]
            Ps.append(co)
            for p in me.polygons:
                Fs.append([i + off for i in p.vertices])
            off += len(co)
        return np.concatenate(Ps), Fs

    # подгонка: масштаб — по росту; по глубине — центр таза к суставу таза модели;
    # по высоте — нижний край наружного сфинктера к коже между ягодицами (заднепроходное отверстие)
    from mathutils import Vector
    real = [o for o in objs.values() if len(o.data.vertices) > 20 and not o.name.endswith(('.j', '.i', '.t', '.s', '.g'))]
    zs = [(o.matrix_world @ Vector(c)).z for o in real for c in o.bound_box]
    zmin, zmax = min(zs), max(zs)
    s = HEIGHT / (zmax - zmin)
    pelvis = za_to_mh(world_mesh(ANATOMY['pelvis_bones'][1][:4])[0]) * s
    sph = za_to_mh(world_mesh(ANATOMY['sphincter'][1])[0]) * s
    t = np.zeros(3)
    t[2] = B['pelvis']['head'][2] - (pelvis[:, 2].min() + pelvis[:, 2].max()) / 2
    zc = (sph[:, 2].min() + sph[:, 2].max()) / 2 + t[2]
    body = Body()
    meta = json.load(open(os.path.join(OUT, 'athlete.json')))
    BP = body.morph(meta['weight'])[body.used]
    near = (np.abs(BP[:, 0]) < 0.012) & (np.abs(BP[:, 2] - zc) < 0.012) & (BP[:, 1] < L_y(L) + 0.1)
    skin_y = BP[near][:, 1].min()
    t[1] = skin_y + 0.004 - sph[:, 1].min()
    # туловище модели от таза до груди короче анатомического: выше тазобедренных суставов сжимаем по высоте,
    # чтобы верх грудины встал на уровень ключиц
    yh = (B['thigh_l']['head'][1] + B['thigh_r']['head'][1]) / 2
    top = (za_to_mh(world_mesh(['Manubrium of sternum'])[0]) * s + t)[:, 1].max()
    k = (B['clavicle_l']['head'][1] - yh) / (top - yh)
    def place(p):
        p = za_to_mh(p) * s + t
        p[:, 1] = np.where(p[:, 1] > yh, yh + k * (p[:, 1] - yh), p[:, 1])
        return p
    log(f'масштаб анатомии {s:.4f} (рост модели Z-Anatomy {zmax - zmin:.3f} м), сдвиг {np.round(t, 3)}, кожа у сфинктера {skin_y:.3f} м, туловище ×{k:.3f}')

    # снаружи ли точка относительно кожи тела: то, что уходит внутрь тела, у пениса и мошонки срезаем
    from mathutils.bvhtree import BVHTree
    VB = body.morph(meta['weight'])
    bvh = BVHTree.FromPolygons(VB.tolist(), body.tris.tolist())
    def depth(P):
        """Расстояние до кожи тела: больше нуля — снаружи"""
        out = np.zeros(len(P))
        for i, p in enumerate(P):
            loc, n, _, _ = bvh.find_nearest(Vector(p))
            assert loc is not None, f'нет ближайшей точки кожи для {p}'
            out[i] = (Vector(p) - loc).dot(n)
        return out
    inner = np.array(B['pelvis']['head'])
    sign = -1 if depth(inner[None])[0] > 0 else 1       # нормали сетки тела должны смотреть наружу
    log('нормали тела наружу' if sign == 1 else 'нормали тела внутрь — переворачиваем')
    outside = lambda P, margin: sign * depth(P) > margin
    # у тела кожа пениса и мошонки не обрывается, а плавно растворяется на последнем сантиметре
    fade = lambda P: smooth(-0.009, -0.001, sign * depth(P))

    root = place(PENIS_ROOT[None])[0]
    # Ось пениса — кривая: выходит из лобка вперёд-вниз, изгибается и свисает перед мошонкой.
    # Точка выхода — где луч к корню (у симфиза) спереди и чуть снизу впервые встречает кожу тела.
    ray = Vector((0.0, -0.35, 1.0)).normalized()
    hit = bvh.ray_cast(Vector(root) + ray * 0.2, -ray)
    S0 = np.array(hit[0])
    log(f'выход пениса из тела {np.round(S0, 3)}, корень {np.round(root, 3)}')
    unit = lambda v: np.asarray(v, dtype=float) / np.linalg.norm(v)
    D0, D1 = unit([0.0, -0.55, 1.0]), unit([0.0, -1.0, 0.06])
    SC = PEN_LENGTH - PEN_GLANS                                  # венец, м по оси от выхода из тела
    pen = {}

    def radius(ell):
        c = np.interp(ell, [-PEN_INSIDE, 0.012, SC * 0.5, SC - 0.007, SC - 0.0025, SC + 0.002],
                      [PEN_BASE, PEN_BASE, PEN_MID, PEN_NECK, PEN_NECK, PEN_CORONA]) / (2 * np.pi)
        c = c * (1 + PEN_FLARE * (1 - smooth(-0.004, 0.022, ell)))   # у тела основание расширяется и сливается с кожей
        tau = np.clip((ell - SC - 0.002) / (PEN_GLANS - 0.002), 0, 1)
        dome = PEN_CORONA / (2 * np.pi) * (1 - 0.05 * tau) * np.clip(1 - tau ** 2.3, 0, 1) ** 0.42
        return np.where(ell > SC + 0.002, dome, c)

    def vein_field(ell, th):
        """Высота кожи над подкожными венами, м"""
        R = radius(ell)
        out = np.zeros(len(ell))
        for u0, u1, theta, width, height in VEINS:
            u = np.linspace(u0, u1, 160)
            amp = np.sin(np.pi * (u - u0) / (u1 - u0)) ** 0.5      # к концам вена уходит глубже
            dist = np.hypot(ell[:, None] - u[None, :] * SC, R[:, None] * ((th[:, None] - theta(u)[None, :] + np.pi) % (2 * np.pi) - np.pi))
            k = dist.argmin(axis=1)
            out = np.maximum(out, height * amp[k] * np.exp(-(dist[np.arange(len(ell)), k] / width) ** 2))
        return out * smooth(0.004, 0.016, ell) * (1 - smooth(SC - 0.006, SC - 0.001, ell))

    def penis_skin(nth=112):
        ell = np.concatenate([np.linspace(-PEN_INSIDE, 0, 16), np.linspace(0, SC, 100)[1:], np.linspace(SC, PEN_LENGTH * 0.997, 51)[1:]])
        nt = len(ell)
        # направление оси плавно поворачивается от «вперёд-вниз» к «вниз» на первых сантиметрах
        k = smooth(0.004, PEN_BEND, ell)[:, None]
        T = D0 * (1 - k) + D1 * k
        T /= np.linalg.norm(T, axis=1, keepdims=True)
        C = np.zeros((nt, 3))
        i0 = np.searchsorted(ell, 0.0)
        C[i0] = S0
        for i in range(i0 + 1, nt):
            C[i] = C[i - 1] + (T[i] + T[i - 1]) / 2 * (ell[i] - ell[i - 1])
        for i in range(i0 - 1, -1, -1):
            C[i] = C[i + 1] - (T[i] + T[i + 1]) / 2 * (ell[i + 1] - ell[i])
        # кадры без закрутки: тыльная сторона у корня смотрит вверх, у свисающей части — вперёд
        E1 = np.zeros((nt, 3))
        up = np.array([0.0, 1.0, 0.0])
        E1[0] = unit(up - T[0] * (up @ T[0]))
        for i in range(1, nt):
            E1[i] = unit(E1[i - 1] - T[i] * (E1[i - 1] @ T[i]))
        E2 = np.cross(T, E1)
        th = np.linspace(-np.pi, np.pi, nth, endpoint=False)
        L_, TH = np.meshgrid(ell, th, indexing='ij')
        L_, TH = L_.ravel(), TH.ravel()
        r = radius(L_) + vein_field(L_, TH)
        # губчатое тело — едва заметный валик по нижней стороне ствола; на кончике — щель наружного отверстия уретры
        r += 0.0006 * np.exp(-((np.abs(TH) - np.pi) / 0.3) ** 2) * (L_ > 0) * (L_ < SC)
        tau = np.clip((L_ - SC) / PEN_GLANS, 0, 1)
        r -= 0.0011 * smooth(0.9, 1.0, tau) * np.exp(-(np.sin(TH) * r / 0.0011) ** 2)
        ii = np.repeat(np.arange(nt), nth)
        P = C[ii] + E1[ii] * (0.97 * r * np.cos(TH))[:, None] + E2[ii] * (1.03 * r * np.sin(TH))[:, None]
        P = np.vstack([P, C[-1] + T[-1] * (PEN_LENGTH - ell[-1])])
        tip = len(P) - 1
        faces = [[i * nth + j, i * nth + (j + 1) % nth, (i + 1) * nth + (j + 1) % nth, (i + 1) * nth + j] for i in range(nt - 1) for j in range(nth)]
        faces += [[(nt - 1) * nth + j, (nt - 1) * nth + (j + 1) % nth, tip] for j in range(nth)]
        f = faces[(nt // 2) * nth]
        if np.cross(P[f[1]] - P[f[0]], P[f[2]] - P[f[0]]) @ (P[f[0]] - C[nt // 2]) < 0:
            faces = [f[::-1] for f in faces]
        # параметры вершин — для оттенка головки, вен и растворения у тела (порядок вершин дальше сохраняется)
        pen['ell'] = np.append(L_, PEN_LENGTH)
        pen['th'] = np.append(TH, 0.0)
        pen['front'] = np.append(r * np.cos(TH), 0.0)
        pen['C'], pen['E1'], pen['ell_axis'] = C, E1, ell
        assert np.isfinite(P).all(), 'пенис: NaN в вершинах'
        return P, faces

    def scrotum():
        parts, centers = [], []
        for s_ in 'lr':
            t = place(world_mesh([f'Testis.{s_}', f'Epididymis.{s_}'])[0])
            c = (t.min(axis=0) + t.max(axis=0)) / 2
            centers.append(c)
            parts.append(ellipsoid(c, (t.max(axis=0) - t.min(axis=0)) / 2 + 0.0085))
        # один мешок: середина между яичками, а верх мешка сужается и переходит в нижнюю сторону основания пениса
        c = (centers[0] + centers[1]) / 2
        parts.append(ellipsoid(c + np.array([0, 0.002, 0]), np.array([0.014, 0.021, 0.017])))
        ell, C, E1 = pen['ell_axis'], pen['C'], pen['E1']
        i = np.searchsorted(ell, 0.016)
        base = C[i] - E1[i] * 0.75 * PEN_BASE / (2 * np.pi)       # нижняя сторона основания пениса
        top = c + np.array([0, 0.018, 0])
        for k in np.linspace(0, 1, 4):
            parts.append(ellipsoid(top + (base - top) * k, np.array([0.021, 0.017, 0.016]) * (1 - 0.3 * k)))
        P, F = skin_over('scrotum', *merge(parts), voxel=0.0016, iterations=18, inflate=0.0)
        return subset(P, F, outside(P, -0.01))

    def pen_attr(P, key):
        assert len(P) == len(pen['ell']), 'вершины пениса не должны прореживаться'
        return pen[key]

    def glans_tint(P):
        # 1 — головка, 0 — кожа ствола: ровное кольцо венца, с тыльной стороны чуть выше
        return smooth(SC - 0.0015, SC + 0.003, pen_attr(P, 'ell') + 0.12 * pen['front'])

    def penis_veins(P, T):
        return P, vein_field(pen_attr(P, 'ell'), pen['th']) / max(h for *_, h in VEINS)

    TINT = {'penis': glans_tint}
    # основание пениса растворяется выше точки выхода из тела: передняя сторона цилиндра там ещё снаружи кожи
    FADE = {'penis': lambda P: np.minimum(fade(P), smooth(-0.012, 0.002, pen_attr(P, 'ell'))), 'scrotum': fade}
    POST = {'penis': penis_veins}

    groups, blob = [], bytearray()
    sources = [(g, bone, lambda names=names: world_mesh(names), False) for g, (bone, names) in ANATOMY.items()]
    sources += [(g, bone, lambda fn=fn: fn(world_mesh), False) for g, (bone, fn) in PROCEDURAL.items()]
    sources += [('penis', 'pelvis', penis_skin, True), ('scrotum', 'pelvis', scrotum, True)]
    for gname, bone, source, placed in sources:
        pts, faces = source()
        if not placed:
            pts = place(pts)
        ob = mesh_object(gname, pts, faces)
        if gname in SUBDIVIDE:
            sub = ob.modifiers.new('sub', 'SUBSURF')
            sub.levels = sub.render_levels = SUBDIVIDE[gname]
            ob = evaluated_copy(ob, gname + '_sub')
            faces = [list(p.vertices) for p in ob.data.polygons]
        tri = sum(len(f) - 2 for f in faces)
        target = DECIMATE[gname]
        if tri > target:
            dec = ob.modifiers.new('dec', 'DECIMATE')
            dec.ratio = target / tri
            ob2 = evaluated_copy(ob, gname + '_dec')
        else:
            ob2 = ob
        bm = bmesh.new()
        bm.from_mesh(ob2.data)
        bmesh.ops.triangulate(bm, faces=bm.faces[:])
        bm.verts.ensure_lookup_table()
        P = np.array([v.co[:] for v in bm.verts])
        T = np.array([[v.index for v in f.verts] for f in bm.faces], dtype=np.int64)
        bm.free()
        attrs = {}
        if gname in POST:
            P, attrs['vein'] = POST[gname](P, T)
        if gname in TINT:
            attrs['tint'] = TINT[gname](P)
        if gname in FADE:
            attrs['fade'] = FADE[gname](P)
        Nn = vertex_normals(P, T)
        assert len(P) < 65536, gname
        lo, hi = P.min(axis=0), P.max(axis=0)
        span = np.maximum(hi - lo, 1e-6)
        parts = [np.round((P - lo) / span * 65535).astype(np.uint16), np.round(Nn * 127).astype(np.int8), T.astype(np.uint16).ravel()]
        extra = list(attrs)
        for key in extra:
            parts.append(np.round(np.clip(attrs[key], 0, 1) * 255).astype(np.uint8))
        offs = []
        for arr in parts:
            blob += b'\0' * ((-len(blob)) % 4)
            offs.append(len(blob))
            blob += arr.tobytes()
        groups.append({'name': gname, 'bone': bone, 'vertices': len(P), 'indices': int(T.size),
                       'lo': [round(float(x), 5) for x in lo], 'hi': [round(float(x), 5) for x in hi],
                       'offsets': {'position': offs[0], 'normal': offs[1], 'index': offs[2]}})
        for key, o in zip(extra, offs[3:]):
            groups[-1]['offsets'][key] = o
        if gname == 'penis':
            # точка поворота: корень пениса — вокруг неё он подтягивается при передней подсказке
            groups[-1]['pivot'] = [round(float(x), 5) for x in root]
            log(f'пенис: снаружи {PEN_LENGTH * 100:.1f} см, обхват у основания {PEN_BASE * 100:.1f}, ствола {PEN_MID * 100:.1f}, '
                f'венца {PEN_CORONA * 100:.1f} см; выход из тела {np.round(S0, 3)}, кончик {np.round(pen["C"][-1], 3)}')
        log(f'{gname}: {len(P)} вершин, {len(T)} треугольников, y {lo[1]:.3f}..{hi[1]:.3f}')
    with open(os.path.join(OUT, 'anatomy.bin'), 'wb') as f:
        f.write(blob)
    meta = {
        'source': 'Z-Anatomy (CC BY-SA 4.0), based on BodyParts3D, The Database Center for Life Science (CC BY-SA 2.1 JP)',
        'license': 'CC BY-SA 4.0', 'groups': groups,
    }
    with open(os.path.join(OUT, 'anatomy.json'), 'w') as f:
        json.dump(meta, f)
    sph = next(g for g in groups if g['name'] == 'sphincter')
    log(f'анатомия: {len(blob) / 1024:.0f} КБ; низ сфинктера {sph["lo"][1]:.3f} м, промежность кожи {L["crotch"][1]:.3f} м')


if __name__ == '__main__':
    log('шаги:', STEPS)
    B = L = None
    if 'body' in STEPS:
        B, L = build_body()
    if 'anatomy' in STEPS:
        if B is None:
            meta = json.load(open(os.path.join(OUT, 'athlete.json')))
            B = {b['name']: b for b in meta['bones']}
            L = meta['landmarks']
        build_anatomy(B, L)
    log('готово')
