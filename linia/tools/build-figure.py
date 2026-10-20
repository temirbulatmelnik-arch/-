"""Сборка 3D-модели для «Линии» в Blender (модуль bpy).

Тело — то же, что в «Тонусе» (MakeHuman, CC0: мужчина 190 см / 90 кг, запечённые текстуры), но с двумя
новыми костями: нижняя челюсть (веса из стандартного скелета MPFB) и язык (только для анатомии).
Анатомия головы, шеи и плечевого пояса — Z-Anatomy / BodyParts3D (CC BY-SA): череп, нижняя челюсть, зубы,
язык, подъязычная кость и гортань, шейные и верхние грудные позвонки, рёбра, грудина, ключицы, лопатки,
плечевые кости и около сорока мышц лица, дна рта, шеи, плеч и спины.

Подгонка атласа к телу — как линейное скинирование «наоборот»: у каждой вершины атласа считаются веса
костей скелета (кости — жёстко, мышцы — по двум ближайшим костям атласа), а у каждой кости скелета —
своё преобразование из позы атласа в позу MakeHuman: туловище — как в «Тонусе», голова и челюсть —
по габаритам черепа под кожей лица, плечевая кость — поворотом к руке в А-позе. Те же веса едут в файл:
мышцы и кости деформируются вместе со скелетом, когда фигура кивает, открывает рот или поднимает руки.

Запуск:  python tools/build-figure.py   (Python с модулем bpy; кеш загрузок — общий с «Тонусом»)
"""
import importlib.util
import json
import os
import sys
import shutil

import numpy as np

ROOT = os.path.dirname(os.path.abspath(__file__))
TONUS = os.path.join(ROOT, '..', '..', 'tonus')
OUT = os.path.join(ROOT, '..', 'public', 'figure')

# сборщик «Тонуса»: тело, загрузки, Blender-утилиты
_argv = sys.argv
sys.argv = [_argv[0], '-']
spec = importlib.util.spec_from_file_location('tonus_builder', os.path.join(TONUS, 'tools', 'build-figure.py'))
tb = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tb)
sys.argv = _argv
import bpy  # noqa: E402  (уже загружен сборщиком «Тонуса»)
import bmesh  # noqa: E402
from mathutils import Vector  # noqa: E402
from mathutils.bvhtree import BVHTree  # noqa: E402
from mathutils.kdtree import KDTree  # noqa: E402

log = tb.log
smooth = tb.smooth

# ===================================================================== группы анатомии

UPPER_TEETH = [f'Upper {t}.{s}' for t in ('medial incisor', 'lateral incisor', 'canine', 'first premolar', 'second premolar', 'first molar tooth', 'second molar tooth') for s in 'lr']
LOWER_TEETH = [f'Lower {t}.{s}' for t in ('medial incisor', 'lateral incisor', 'canine', 'first premolar', 'second premolar', 'first molar tooth', 'second molar tooth') for s in 'lr']
LR = lambda *names: [f'{n}.{s}' for n in names for s in 'lr']
RIB = ('First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth')
CART = ('first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh')

# Кости: группа → (вид, объекты, веса костей скелета). Веса позвонков плавно переходят от головы к груди.
BONES = {
    'skull': ('bone', ['Frontal bone', 'Occipital bone', 'Sphenoid bone', 'Ethmoid bone', 'Vomer'] + LR('Parietal bone', 'Temporal bone', 'Maxilla', 'Zygomatic bone', 'Nasal bone', 'Palatine bone', 'Lacrimal bone', 'Inferior nasal concha bone'), {'head': 1}),
    'teeth_upper': ('teeth', UPPER_TEETH, {'head': 1}),
    'mandible': ('bone', ['Mandible'], {'jaw': 1}),
    'teeth_lower': ('teeth', LOWER_TEETH, {'jaw': 1}),
    'hyoid': ('bone', ['Hyoid bone'], {'neck_01': 0.6, 'head': 0.2, 'jaw': 0.2}),
    'larynx': ('cartilage', ['Thyroid cartilage', 'Cricoid cartilage'], {'neck_01': 0.85, 'spine_03': 0.15}),
    'c1': ('bone', ['Atlas (C1)'], {'head': 0.8, 'neck_01': 0.2}),
    'c2': ('bone', ['Axis (C2)'], {'head': 0.6, 'neck_01': 0.4}),
    'c3': ('bone', ['Vertebra C3'], {'head': 0.4, 'neck_01': 0.6}),
    'c4': ('bone', ['Vertebra C4'], {'head': 0.2, 'neck_01': 0.8}),
    'c5': ('bone', ['Vertebra C5'], {'neck_01': 1}),
    'c6': ('bone', ['Vertebra C6'], {'neck_01': 0.7, 'spine_03': 0.3}),
    'c7': ('bone', ['Vertebra C7'], {'neck_01': 0.4, 'spine_03': 0.6}),
    'thoracic': ('bone', [f'Vertebra T{i}' for i in range(1, 7)], {'spine_03': 1}),
    'thoracic_low': ('bone', ['Vertebra T7', 'Vertebra T8'], {'spine_03': 0.6, 'spine_02': 0.4}),
    'ribs': ('bone', LR(*[f'{n} rib' for n in RIB[:6]]) + LR(*[f'Costal cartilage of {n} rib' for n in CART[:6]]) + ['Manubrium of sternum', 'Body of sternum'], {'spine_03': 1}),
    'ribs_low': ('bone', LR('Seventh rib', 'Eighth rib', 'Costal cartilage of seventh rib') + ['Xiphoid process'], {'spine_03': 0.6, 'spine_02': 0.4}),
    'clavicle_l': ('bone', ['Clavicle.l'], {'clavicle_l': 1}),
    'clavicle_r': ('bone', ['Clavicle.r'], {'clavicle_r': 1}),
    'scapula_l': ('bone', ['Scapula.l'], {'clavicle_l': 1}),
    'scapula_r': ('bone', ['Scapula.r'], {'clavicle_r': 1}),
    'humerus_l': ('bone', ['Humerus.l'], {'upperarm_l': 1}),
    'humerus_r': ('bone', ['Humerus.r'], {'upperarm_r': 1}),
}
# Ключи мышц совпадают с MuscleId в приложении (src/engine/muscles.ts).
# У Z-Anatomy названия частей трапециевидной перевёрнуты: «Ascending part» — верхние волокна (до затылка),
# «Descending part» — нижние; здесь группы названы по положению.
MUSCLES = {
    'longus': LR('Longus colli muscle', 'Longus capitis muscle'),
    'rectus_capitis': LR('Rectus anterior capitis muscle', 'Rectus lateralis capitis muscle'),
    'suboccipital': LR('Rectus posterior major capitis muscle', 'Rectus posterior minor capitis muscle', 'Obliquus inferior capitis muscle', 'Obliquus superior capitis muscle'),
    'scm': LR('Sternocleidomastoid muscle'),
    'scalenes': LR('Scalenus anterior muscle', 'Scalenus medius muscle', 'Scalenus posterior muscle'),
    'splenius': LR('Splenius capitis muscle', 'Splenius colli muscle', 'Semispinalis colli muscle'),
    'levator_scapulae': LR('Levator scapulae'),
    'trap_upper': LR('Ascending part of trapezius muscle'),
    'trap_middle': LR('Transverse part of trapezius muscle'),
    'trap_lower': LR('Descending part of trapezius muscle'),
    'rhomboids': LR('Rhomboid major muscle', 'Rhomboid minor muscle'),
    'serratus': LR('Serratus anterior muscle'),
    'pec_minor': LR('Pectoralis minor muscle'),
    'pec_major': LR('Clavicular head of pectoralis major muscle', 'Sternocostal head of pectoralis major muscle', '(Abdominal part of pectoralis major muscle)'),
    'infraspinatus': LR('Infraspinatus muscle'),
    'teres_minor': LR('Teres minor muscle'),
    'deltoid_post': LR('Scapular spinal part of deltoid muscle'),
    'deltoid_mid': LR('Acromial part of deltoid muscle'),
    'deltoid_ant': LR('Clavicular part of deltoid muscle'),
    'triceps': LR('Long head of triceps brachii', 'Lateral head of triceps brachii'),
    'erector': LR('Longissimus thoracis muscle', 'Iliocostalis thoracis muscle', 'Spinalis thoracis muscle', 'Semispinalis thoracis muscle'),
    'lats': LR('Latissimus dorsi muscle'),
    'infrahyoid': LR('Sternohyoid muscle', 'Omohyoid muscle', 'Thyrohyoid muscle', 'Sternothyroid muscle'),
    'digastric': LR('Anterior belly of digastric muscle', 'Posterior belly of digastric muscle', 'Intermediate tendon of digastric muscle'),
    'mylohyoid': LR('Mylohyoid muscle'),
    'geniohyoid': LR('Geniohyoid muscle'),
    'stylohyoid': LR('Stylohyoid muscle'),
    'tongue': ['Tongue'],
    'genioglossus': LR('Genioglossus muscle'),
    'hyoglossus': LR('Hyoglossus muscle'),
    'masseter': LR('Superficial part of masseter', 'Deep part of masseter'),
    'temporalis': LR('Temporalis muscle'),
    'pterygoid_med': LR('Medial pterygoid muscle'),
    'pterygoid_lat': LR('Superior head of lateral pterygoid muscle', 'Inferior head of lateral pterygoid muscle'),
    'orbicularis_oris': LR('Orbicularis oris muscle'),
    'zygomaticus': LR('Zygomaticus major muscle', 'Zygomaticus minor muscle'),
    'levator_anguli': LR('Levator anguli oris'),
    'risorius': LR('Risorius muscle'),
    'platysma': LR('Platysma'),
    'dao': LR('Depressor anguli oris'),
    'dli': LR('Depressor labii inferioris'),
    'mentalis': LR('Mentalis muscle'),
}
# поверхностные мышцы прижимаются к коже изнутри: атлас и тело MakeHuman не совпадают до миллиметра
SUPERFICIAL = {'platysma', 'orbicularis_oris', 'zygomaticus', 'levator_anguli', 'risorius', 'dao', 'dli', 'mentalis', 'masseter',
               'temporalis', 'scm', 'trap_upper', 'trap_middle', 'trap_lower', 'deltoid_post', 'deltoid_mid', 'deltoid_ant', 'pec_major',
               'lats', 'triceps', 'infraspinatus', 'teres_minor', 'serratus', 'rhomboids', 'splenius', 'digastric', 'mylohyoid', 'infrahyoid'}
# разгибатели и широчайшая уходят до таза — для верха тела оставляем грудной отдел
CROP_BELOW = {'erector': 1.12, 'lats': 1.05}            # высота в координатах Z-Anatomy, м
SUBDIVIDE = {'tongue': 2}
DECIMATE = {
    'skull': 16000, 'teeth_upper': 3000, 'mandible': 6000, 'teeth_lower': 3000, 'hyoid': 600, 'larynx': 1600,
    'c1': 700, 'c2': 700, 'c3': 600, 'c4': 600, 'c5': 600, 'c6': 600, 'c7': 600, 'thoracic': 3600, 'thoracic_low': 1000,
    'ribs': 9000, 'ribs_low': 2600, 'clavicle_l': 700, 'clavicle_r': 700, 'scapula_l': 2600, 'scapula_r': 2600, 'humerus_l': 1200, 'humerus_r': 1200,
    'longus': 1400, 'rectus_capitis': 400, 'suboccipital': 900, 'scm': 2200, 'scalenes': 1600, 'splenius': 2600, 'levator_scapulae': 1200,
    'trap_upper': 2600, 'trap_middle': 2200, 'trap_lower': 2600, 'rhomboids': 2000, 'serratus': 4000, 'pec_minor': 1400, 'pec_major': 3400,
    'infraspinatus': 1600, 'teres_minor': 800, 'deltoid_post': 1600, 'deltoid_mid': 1400, 'deltoid_ant': 1400, 'triceps': 2000,
    'erector': 3000, 'lats': 3600, 'infrahyoid': 1800, 'digastric': 1000, 'mylohyoid': 900, 'geniohyoid': 500, 'stylohyoid': 500,
    'tongue': 2400, 'genioglossus': 1400, 'hyoglossus': 700, 'masseter': 1600, 'temporalis': 2600, 'pterygoid_med': 600, 'pterygoid_lat': 500,
    'orbicularis_oris': 1400, 'zygomaticus': 700, 'levator_anguli': 300, 'risorius': 400, 'platysma': 3200, 'dao': 500, 'dli': 500, 'mentalis': 300,
}
# мягкие ткани между костью и кожей, м: макушка, подбородок, лоб, затылок, висок
SOFT = {'top': 0.0065, 'menton': 0.009, 'front': 0.006, 'back': 0.0065, 'side': 0.0065}
PUSH = 0.0016            # поверхностные мышцы — не ближе к коже, м
FACE_BACK = 0.007        # насколько отодвинуть нижнюю треть лица атласа назад, м


def jaw_weights(body, V, used, remap):
    """Кость нижней челюсти из стандартного скелета MPFB: положение сустава и веса вершин лица"""
    rig = json.loads(tb.get(tb.MPFB + 'rigs/standard/rig.default.json'))
    wdef = json.loads(tb.get(tb.MPFB + 'rigs/standard/weights.default.json'))['weights']
    def end(e):
        if e['strategy'] == 'CUBE':
            return tb.group_centroid(V, body.faces, e['cube_name'])
        if e['strategy'] == 'VERTEX':
            return V[e['vertex_index']]
        return V[e['vertex_indices']].mean(axis=0)
    head = end(rig['jaw']['head'])
    w = np.zeros(len(used))
    for vi, wt in wdef['jaw']:
        j = remap[vi]
        if j >= 0:
            w[j] = wt
    return head, w


def export_order(body, quads):
    """Порядок вершин athlete.bin «Тонуса»: вершины разделены по швам развёртки"""
    uv_loops = np.array([body.VT[t] for _, _, ts in body.body_faces for t in ts])
    key, src, loop = {}, [], 0
    for q, (_, vs, ts) in zip(quads, body.body_faces):
        for k in range(len(q)):
            kk = (q[k], tuple(np.round(uv_loops[loop + k], 6)))
            if kk not in key:
                key[kk] = len(src)
                src.append(q[k])
        loop += len(q)
    return np.array(src)


def blend_weights(rows, nb):
    """Список словарей {кость: вес} → не больше 4 влияний на вершину, сумма 255"""
    idx = np.zeros((len(rows), 4), np.uint8)
    wts = np.zeros((len(rows), 4), np.uint8)
    for i, r in enumerate(rows):
        top = sorted(r.items(), key=lambda x: -x[1])[:4]
        s = sum(w for _, w in top) or 1
        q = [int(np.floor(w / s * 255)) for _, w in top]
        q[0] += 255 - sum(q)
        for k, (b, _) in enumerate(top):
            idx[i, k], wts[i, k] = b, q[k]
    return idx, wts


def main():
    os.makedirs(OUT, exist_ok=True)
    # ——— тело: как в «Тонусе», плюс кость челюсти
    body, V, P, N, quads, tris, used, remap, names, bones, B, skin_idx, skin_w, dominant, eyes, L, weight = tb.make_body()
    src = export_order(body, quads)
    tmeta = json.load(open(os.path.join(TONUS, 'public', 'figure', 'athlete.json')))
    tbin = open(os.path.join(TONUS, 'public', 'figure', 'athlete.bin'), 'rb').read()
    assert tmeta['vertices'] == len(src), (tmeta['vertices'], len(src))
    o, n = tmeta['offsets'], len(src)
    lo, hi = np.array(tmeta['bounds']['lo']), np.array(tmeta['bounds']['hi'])
    pos = lo + np.frombuffer(tbin, np.uint16, n * 3, o['position']).reshape(-1, 3) / 65535 * (hi - lo)
    err = np.abs(pos - P[src]).max()
    assert err < 1e-4, f'тело «Тонуса» не совпадает: {err}'
    log(f'тело «Тонуса»: {n} вершин, расхождение {err * 1000:.3f} мм')

    jaw_head, wj = jaw_weights(body, V, used, remap)
    bone_names = [b['name'] for b in bones] + ['jaw', 'tongue']
    bi = {nm: i for i, nm in enumerate(bone_names)}
    log(f'сустав челюсти {np.round(jaw_head, 3)}, вершин с весом челюсти {(wj > 0.01).sum()}')

    # ——— анатомия
    tb.reset()
    for f in ('SkeletalSystem100.fbx', 'MuscularSystem100.fbx', 'VisceralSystem100.fbx'):
        log('импорт', f)
        bpy.ops.import_scene.fbx(filepath=tb.get(tb.ZA + f, binary=True))
    objs = {ob.name: ob for ob in bpy.data.objects if ob.type == 'MESH'}

    def world_mesh(nms):
        Ps, Fs, off = [], [], 0
        for nm in nms:
            ob = objs.get(nm)
            if ob is None:
                log('нет объекта', nm)
                continue
            me = ob.data
            M = np.array(ob.matrix_world)
            co = np.zeros(len(me.vertices) * 3)
            me.vertices.foreach_get('co', co)
            Ps.append(co.reshape(-1, 3) @ M[:3, :3].T + M[:3, 3])
            Fs += [[i + off for i in p.vertices] for p in me.polygons]
            off += len(me.vertices)
        return np.concatenate(Ps), Fs

    # туловище — как в «Тонусе»: масштаб по росту, таз к тазу, сфинктер к коже, туловище сжато по высоте
    za = tb.za_to_mh
    real = [ob for ob in objs.values() if len(ob.data.vertices) > 20 and not ob.name.endswith(('.j', '.i', '.t', '.s', '.g'))]
    zs = [(ob.matrix_world @ Vector(c)).z for ob in real for c in ob.bound_box]
    s = tb.HEIGHT / (max(zs) - min(zs))
    pelvis = za(world_mesh(tb.ANATOMY['pelvis_bones'][1][:4])[0]) * s
    sph = za(world_mesh(tb.ANATOMY['sphincter'][1])[0]) * s
    t = np.zeros(3)
    t[2] = B['pelvis']['head'][2] - (pelvis[:, 2].min() + pelvis[:, 2].max()) / 2
    zc = (sph[:, 2].min() + sph[:, 2].max()) / 2 + t[2]
    near = (np.abs(P[:, 0]) < 0.012) & (np.abs(P[:, 2] - zc) < 0.012) & (P[:, 1] < L['crotch'][1] + 0.1)
    t[1] = P[near][:, 1].min() + 0.004 - sph[:, 1].min()
    yh = (B['thigh_l']['head'][1] + B['thigh_r']['head'][1]) / 2
    top = (za(world_mesh(['Manubrium of sternum'])[0]) * s + t)[:, 1].max()
    k = (B['clavicle_l']['head'][1] - yh) / (top - yh)

    def place(p):
        p = za(p) * s + t
        p[:, 1] = np.where(p[:, 1] > yh, yh + k * (p[:, 1] - yh), p[:, 1])
        return p
    log(f'туловище: масштаб {s:.4f}, сдвиг {np.round(t, 3)}, ×{k:.3f} по высоте')

    # голова: габариты черепа под кожей лица — по осям отдельно
    skull_p = place(world_mesh(BONES['skull'][1])[0])
    mand_p = place(world_mesh(['Mandible'])[0])
    front_p = place(world_mesh(['Frontal bone'])[0])
    back_p = place(world_mesh(['Occipital bone'])[0])
    side_p = place(world_mesh(LR('Parietal bone'))[0])
    eyeY = (eyes[0]['c'][1] + eyes[1]['c'][1]) / 2
    eyeZ = eyes[0]['c'][2]
    mid = np.abs(P[:, 0]) < 0.006
    headv = dominant == 'head'
    chin = mid & headv & (P[:, 1] < eyeY - 0.09) & (N[:, 1] < -0.45)
    mh = {
        'top': P[:, 1].max() - SOFT['top'],
        'menton': P[chin][np.argmax(P[chin][:, 2]), 1] + SOFT['menton'],
        'front': P[mid & (P[:, 1] > eyeY + 0.015) & (P[:, 1] < eyeY + 0.06)][:, 2].max() - SOFT['front'],
        'back': P[mid & headv & (P[:, 1] > eyeY - 0.01) & (P[:, 1] < eyeY + 0.07)][:, 2].min() + SOFT['back'],
    }
    zmid = mand_p[np.abs(mand_p[:, 0]) < 0.008]
    za_ = {'top': skull_p[:, 1].max(), 'menton': zmid[:, 1].min(), 'front': front_p[:, 2].max(), 'back': back_p[:, 2].min()}
    wi = np.argmax(np.abs(side_p[:, 0]))
    za_half, za_wy = np.abs(side_p[wi, 0]), side_p[wi, 1]
    ay = (mh['top'] - mh['menton']) / (za_['top'] - za_['menton'])
    az = (mh['front'] - mh['back']) / (za_['front'] - za_['back'])
    wy = mh['menton'] + ay * (za_wy - za_['menton'])
    band = headv & (np.abs(P[:, 1] - wy) < 0.006) & (P[:, 2] < mh['front'] - 0.04) & (P[:, 2] > mh['back'] + 0.04)
    ax = (np.abs(P[band][:, 0]).max() - SOFT['side']) / za_half
    log(f'голова: масштаб x {ax:.3f}, y {ay:.3f}, z {az:.3f}; подбородок кожи {mh["menton"] - SOFT["menton"]:.3f} м, глаза {eyeY:.3f} м')

    def head_tf(p):
        q = p.copy()
        q[:, 0] = ax * p[:, 0]
        q[:, 1] = mh['menton'] + ay * (p[:, 1] - za_['menton'])
        q[:, 2] = mh['back'] + az * (p[:, 2] - za_['back'])
        # лицо MakeHuman площе атласного: нижнюю треть лица (челюсть, зубы, губы) отодвигаем назад
        lower = smooth(eyeY - 0.03, eyeY - 0.075, q[:, 1]) * smooth(eyeZ - 0.07, eyeZ - 0.02, q[:, 2])
        q[:, 2] -= FACE_BACK * lower
        return q

    # плечевая кость: из анатомической позы (руки вниз) к руке MakeHuman в А-позе — поворот вокруг головки
    def arm_tf(side):
        h = place(world_mesh([f'Humerus.{side}'])[0])
        ys = h[:, 1]
        head = h[ys > ys.max() - 0.03].mean(axis=0)
        elbow = h[ys < ys.min() + 0.03].mean(axis=0)
        joint = np.array(B[f'upperarm_{side}']['head'])
        a = (elbow - head) / np.linalg.norm(elbow - head)
        b = np.array(B[f'lowerarm_{side}']['head']) - joint
        b /= np.linalg.norm(b)
        v, c = np.cross(a, b), float(a @ b)
        vx = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
        R = np.eye(3) + vx + vx @ vx / (1 + c)
        log(f'плечо {side}: поворот {np.degrees(np.arccos(np.clip(c, -1, 1))):.1f}°, головка → сустав {np.round((joint - head) * 1000).astype(int)} мм')
        return lambda p: (p - head) @ R.T + joint
    arm = {'l': arm_tf('l'), 'r': arm_tf('r')}

    def bone_tf(name, placed):
        if name in ('head', 'jaw', 'tongue'):
            return head_tf(placed)
        if name == 'neck_01':
            return 0.5 * (head_tf(placed) + placed)
        if name in ('upperarm_l', 'upperarm_r'):
            return arm[name[-1]](placed)
        return placed

    # ——— сетки в координатах атласа: подразделение, срез, упрощение
    def prepared(gname, nms):
        pts, faces = world_mesh(nms)
        if gname in CROP_BELOW:
            pts, faces = tb.subset(pts, faces, pts[:, 2] > CROP_BELOW[gname])
        ob = tb.mesh_object(gname, pts, faces)
        if gname in SUBDIVIDE:
            sub = ob.modifiers.new('sub', 'SUBSURF')
            sub.levels = sub.render_levels = SUBDIVIDE[gname]
            ob = tb.evaluated_copy(ob, gname + '_sub')
        tri = sum(len(p.vertices) - 2 for p in ob.data.polygons)
        if tri > DECIMATE[gname]:
            dec = ob.modifiers.new('dec', 'DECIMATE')
            dec.ratio = DECIMATE[gname] / tri
            ob = tb.evaluated_copy(ob, gname + '_dec')
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        bmesh.ops.triangulate(bm, faces=bm.faces[:])
        bm.verts.ensure_lookup_table()
        Pz = np.array([v.co[:] for v in bm.verts])
        T = np.array([[v.index for v in f.verts] for f in bm.faces], dtype=np.int64)
        bm.free()
        return Pz, T

    groups = {}
    for g, (kind, nms, wts) in BONES.items():
        Pz, T = prepared(g, nms)
        groups[g] = {'kind': kind, 'P': Pz, 'T': T, 'w': [dict(wts)] * len(Pz)}
    # кости-опоры для мышц: деревья поиска ближайшей точки
    trees = {}
    for g, d in groups.items():
        kd = KDTree(len(d['P']))
        for i, p in enumerate(d['P']):
            kd.insert(Vector(p), i)
        kd.balance()
        trees[g] = kd

    for g, nms in MUSCLES.items():
        Pz, T = prepared(g, nms)
        rows = []
        for p in Pz:
            v = Vector(p)
            ds = sorted((trees[b].find(v)[2], b) for b in trees)
            (d1, b1), (d2, b2) = ds[0], ds[1]
            w1, w2 = 1 / (d1 * d1 + 1e-6), 1 / (d2 * d2 + 1e-6)
            r = {}
            for b, w in ((b1, w1), (b2, w2)):
                for bone, bw in BONES[b][2].items():
                    r[bone] = r.get(bone, 0) + bw * w / (w1 + w2)
            rows.append(r)
        groups[g] = {'kind': 'muscle', 'P': Pz, 'T': T, 'w': rows}

    # язык: кончик — на кости языка, корень — на нижней челюсти
    tg = groups['tongue']
    zt = za(tg['P'])[:, 2]
    u = smooth(zt.min() + 0.25 * (zt.max() - zt.min()), zt.max() - 0.1 * (zt.max() - zt.min()), zt)
    tg['w'] = [{'jaw': 1 - x, 'tongue': x} for x in u]
    tongue_root = None

    # ——— поза атласа → поза MakeHuman по весам костей
    # Полость рта у MakeHuman — часть кожи с нормалями внутрь рта, она доходит почти до низа подбородка.
    # Для проверки «под кожей» её не берём, иначе челюсть, зубы и мышцы дна рта окажутся «снаружи».
    # Внутренняя стенка узнаётся лучом: в полости луч по нормали упирается в противоположную стенку в пределах 10 см.
    full = BVHTree.FromPolygons(V.tolist(), body.tris.tolist())
    inside = Vector(B['pelvis']['head'])
    loc, nrm, _, _ = full.find_nearest(inside)
    skin_out = -1 if (inside - loc).dot(nrm) > 0 else 1      # нормали кожи наружу (+1) или внутрь (−1)
    TA, TB, TC = V[body.tris[:, 0]], V[body.tris[:, 1]], V[body.tris[:, 2]]
    cen = (TA + TB + TC) / 3
    fn = np.cross(TB - TA, TC - TA)
    fn /= np.linalg.norm(fn, axis=1, keepdims=True) + 1e-12
    box = (np.abs(cen[:, 0]) < 0.06) & (cen[:, 1] > mh['menton'] - 0.03) & (cen[:, 1] < eyeY + 0.01) & (cen[:, 2] > eyeZ - 0.1)
    inner_tri = np.zeros(len(body.tris), bool)
    for i in np.where(box)[0]:
        d = skin_out * fn[i]
        hit = full.ray_cast(Vector(cen[i] + d * 1e-4), Vector(d), 0.1)
        inner_tri[i] = hit[0] is not None
    tris_out = body.tris[~inner_tri]
    log(f'полость рта: {inner_tri.sum()} треугольников исключено из проверки кожи, нормали {"наружу" if skin_out > 0 else "внутрь"}')
    bvh = BVHTree.FromPolygons(V.tolist(), tris_out.tolist())
    def depth(Q):
        out, loc_n = np.zeros(len(Q)), []
        for i, q in enumerate(Q):
            loc, nrm, _, _ = bvh.find_nearest(Vector(q))
            out[i] = (Vector(q) - loc).dot(nrm)
            loc_n.append((np.array(loc), np.array(nrm)))
        return out, loc_n
    sign = skin_out

    names_all = list(groups)
    dump = {'_skin': V[np.isin(np.arange(len(V)), used)], '_inner': V[np.unique(body.tris[inner_tri])]}
    for g in names_all:
        d = groups[g]
        placed = place(d['P'])
        out = np.zeros_like(placed)
        for bone in {b for r in d['w'] for b in r}:
            wv = np.array([r.get(bone, 0.0) for r in d['w']])
            if wv.any():
                out += wv[:, None] * bone_tf(bone, placed)
        tot = np.array([sum(r.values()) for r in d['w']])
        out /= tot[:, None]
        if os.environ.get('DUMP'):
            dump[g] = out.copy()
        dep, ln = depth(out)
        dep *= sign
        # к коже прижимаются только поверхностные мышцы, чуть выступающие наружу; у рта проверка ненадёжна
        mouth_zone = (np.abs(out[:, 0]) < 0.035) & (out[:, 1] > mh['menton'] - 0.01) & (out[:, 1] < eyeY - 0.03) & (out[:, 2] > eyeZ - 0.07)
        bad = (g in SUPERFICIAL) & (dep > -PUSH) & (dep < 0.015) & ~mouth_zone
        for i in np.where(bad)[0]:
            loc, nrm = ln[i]
            out[i] = loc - sign * nrm * PUSH
        if bad.mean() > 0.02:
            log(f'  {g}: прижато к коже {bad.mean() * 100:.0f} % вершин')
        d['M'] = out
        if g == 'tongue':
            tongue_root = out[u < 0.05].mean(axis=0)
    log(f'корень языка {np.round(tongue_root, 3)}')
    if os.environ.get('DUMP'):
        np.savez(os.environ['DUMP'], **dump)
        log('дамп', os.environ['DUMP'])

    # ——— тело: веса с челюстью
    rows = []
    for i in src:
        r = {}
        for kk in range(4):
            if skin_w[i, kk]:
                r[int(skin_idx[i, kk])] = r.get(int(skin_idx[i, kk]), 0) + skin_w[i, kk] / 255
        if wj[i] > 0.005:
            r = {b: w * (1 - wj[i]) for b, w in r.items()}
            r[bi['jaw']] = r.get(bi['jaw'], 0) + wj[i]
        rows.append(r)
    bidx, bw = blend_weights(rows, len(bone_names))
    blob = bytearray(tbin)
    blob[o['skinIndex']:o['skinIndex'] + n * 4] = bidx.tobytes()
    blob[o['skinWeight']:o['skinWeight'] + n * 4] = bw.tobytes()
    with open(os.path.join(OUT, 'athlete.bin'), 'wb') as f:
        f.write(blob)
    r4 = lambda v: [round(float(x), 4) for x in v]
    meta = dict(tmeta)
    meta['bones'] = tmeta['bones'] + [
        {'name': 'jaw', 'parent': bi['head'], 'head': r4(jaw_head)},
        {'name': 'tongue', 'parent': bi['jaw'], 'head': r4(tongue_root)},
    ]
    meta['source'] = tmeta['source'] + '; jaw weights — MPFB default rig (CC0)'
    meta['landmarks'] = dict(tmeta['landmarks'], eyeY=round(float(eyeY), 4), eyeZ=round(float(eyeZ), 4), menton=round(float(mh['menton'] - SOFT['menton']), 4))
    with open(os.path.join(OUT, 'athlete.json'), 'w') as f:
        json.dump(meta, f)
    for tex in tmeta['textures'].values():
        shutil.copy(os.path.join(TONUS, 'public', 'figure', tex), os.path.join(OUT, tex))

    # ——— анатомия: позиции, нормали, индексы, веса костей
    blob, out_groups = bytearray(), []
    for g in names_all:
        d = groups[g]
        Pm, T = d['M'], d['T']
        Nn = tb.vertex_normals(Pm, T)
        assert len(Pm) < 65536, g
        ridx = [{bi[b]: w for b, w in r.items() if w > 0} for r in d['w']]
        sidx, sw = blend_weights(ridx, len(bone_names))
        lo, hi = Pm.min(axis=0), Pm.max(axis=0)
        span = np.maximum(hi - lo, 1e-6)
        parts = [np.round((Pm - lo) / span * 65535).astype(np.uint16), np.round(np.clip(Nn, -1, 1) * 127).astype(np.int8),
                 T.astype(np.uint16).ravel(), sidx.ravel(), sw.ravel()]
        offs = []
        for arr in parts:
            blob += b'\0' * ((-len(blob)) % 4)
            offs.append(len(blob))
            blob += arr.tobytes()
        out_groups.append({'name': g, 'kind': d['kind'], 'vertices': len(Pm), 'indices': int(T.size),
                           'lo': [round(float(x), 5) for x in lo], 'hi': [round(float(x), 5) for x in hi],
                           'offsets': dict(zip(['position', 'normal', 'index', 'skinIndex', 'skinWeight'], offs))})
        log(f'{g}: {len(Pm)} вершин, {len(T)} треугольников, y {lo[1]:.3f}..{hi[1]:.3f}')
    with open(os.path.join(OUT, 'anatomy.bin'), 'wb') as f:
        f.write(blob)
    with open(os.path.join(OUT, 'anatomy.json'), 'w') as f:
        json.dump({'source': 'Z-Anatomy (CC BY-SA 4.0), based on BodyParts3D, The Database Center for Life Science (CC BY-SA 2.1 JP)',
                   'license': 'CC BY-SA 4.0', 'groups': out_groups}, f)
    log(f'анатомия: {len(out_groups)} групп, {len(blob) / 1024:.0f} КБ')


if __name__ == '__main__':
    main()
    log('готово')
