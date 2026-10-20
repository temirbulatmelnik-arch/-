// Мышцы, которые подсвечивает 3D-модель. Ключи совпадают с группами анатомии (tools/build-figure.py).
export type MuscleId =
  | 'longus' | 'rectus_capitis' | 'suboccipital' | 'scm' | 'scalenes' | 'splenius'
  | 'levator_scapulae' | 'trap_upper' | 'trap_middle' | 'trap_lower' | 'rhomboids' | 'serratus'
  | 'pec_minor' | 'pec_major' | 'infraspinatus' | 'teres_minor' | 'deltoid_post' | 'deltoid_ant'
  | 'triceps' | 'erector' | 'lats'
  | 'infrahyoid' | 'digastric' | 'mylohyoid' | 'geniohyoid' | 'stylohyoid'
  | 'tongue' | 'genioglossus' | 'hyoglossus'
  | 'masseter' | 'temporalis' | 'pterygoid_med' | 'pterygoid_lat'
  | 'orbicularis_oris' | 'zygomaticus' | 'levator_anguli' | 'risorius' | 'platysma' | 'dao' | 'dli' | 'mentalis';

export type Region = 'neck' | 'shoulders' | 'face';

export const MUSCLES: Record<MuscleId, { name: string; region: Region }> = {
  longus: { name: 'длинные мышцы шеи и головы', region: 'neck' },
  rectus_capitis: { name: 'передние прямые мышцы головы', region: 'neck' },
  suboccipital: { name: 'подзатылочные мышцы', region: 'neck' },
  scm: { name: 'грудино-ключично-сосцевидная (ГКС)', region: 'neck' },
  scalenes: { name: 'лестничные мышцы', region: 'neck' },
  splenius: { name: 'ременные мышцы', region: 'neck' },
  levator_scapulae: { name: 'мышца, поднимающая лопатку', region: 'shoulders' },
  trap_upper: { name: 'верхняя часть трапециевидной', region: 'shoulders' },
  trap_middle: { name: 'средняя часть трапециевидной', region: 'shoulders' },
  trap_lower: { name: 'нижняя часть трапециевидной', region: 'shoulders' },
  rhomboids: { name: 'ромбовидные', region: 'shoulders' },
  serratus: { name: 'передняя зубчатая', region: 'shoulders' },
  pec_minor: { name: 'малая грудная', region: 'shoulders' },
  pec_major: { name: 'большая грудная', region: 'shoulders' },
  infraspinatus: { name: 'подостная', region: 'shoulders' },
  teres_minor: { name: 'малая круглая', region: 'shoulders' },
  deltoid_post: { name: 'задняя дельта', region: 'shoulders' },
  deltoid_ant: { name: 'передняя дельта', region: 'shoulders' },
  triceps: { name: 'трицепс', region: 'shoulders' },
  erector: { name: 'разгибатели грудного отдела', region: 'shoulders' },
  lats: { name: 'широчайшая', region: 'shoulders' },
  infrahyoid: { name: 'подподъязычные мышцы', region: 'neck' },
  digastric: { name: 'двубрюшная', region: 'face' },
  mylohyoid: { name: 'челюстно-подъязычная', region: 'face' },
  geniohyoid: { name: 'подбородочно-подъязычная', region: 'face' },
  stylohyoid: { name: 'шилоподъязычная', region: 'face' },
  tongue: { name: 'мышцы языка', region: 'face' },
  genioglossus: { name: 'подбородочно-язычная', region: 'face' },
  hyoglossus: { name: 'подъязычно-язычная', region: 'face' },
  masseter: { name: 'жевательная', region: 'face' },
  temporalis: { name: 'височная', region: 'face' },
  pterygoid_med: { name: 'медиальная крыловидная', region: 'face' },
  pterygoid_lat: { name: 'латеральная крыловидная', region: 'face' },
  orbicularis_oris: { name: 'круговая мышца рта', region: 'face' },
  zygomaticus: { name: 'скуловые мышцы', region: 'face' },
  levator_anguli: { name: 'мышца, поднимающая угол рта', region: 'face' },
  risorius: { name: 'мышца смеха', region: 'face' },
  platysma: { name: 'платизма', region: 'face' },
  dao: { name: 'мышца, опускающая угол рта', region: 'face' },
  dli: { name: 'мышца, опускающая нижнюю губу', region: 'face' },
  mentalis: { name: 'подбородочная', region: 'face' },
};

/** Что делает мышца в упражнении: работает, помогает, растягивается, должна молчать */
export interface MuscleMap {
  work: MuscleId[];
  also?: MuscleId[];
  stretch?: MuscleId[];
  quiet?: MuscleId[];
}

export const muscleNames = (ids: MuscleId[] = []) => ids.map(m => MUSCLES[m].name);
