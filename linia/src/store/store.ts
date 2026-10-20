// Всё хранится только на устройстве (localStorage). Никаких аккаунтов и серверов. Фото — миниатюрами.
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { BlockId } from '../engine/exercises';
import { DEFAULT_START, type JawMode } from '../engine/program';
import { dayKey, type CheckRecord, type Rating, type SessionRecord } from '../engine/stats';

export type Theme = 'system' | 'light' | 'dark';
export type HabitId = 'tongue' | 'spf' | 'sleep' | 'screen';

export interface Settings {
  sound: boolean;
  vibration: boolean;
  voice: boolean;
  ticks: boolean;
  theme: Theme;
  /** подробное объяснение с 3D-демонстрацией перед каждым упражнением */
  intro: boolean;
  /** что показывать во время занятия: 3D-фигуру или таймер */
  playerView: 'figure' | 'timer';
  /** модуль челюсти: жевание, сжатие зубов или выключен */
  jawMode: JawMode;
  /** улыбка с сопротивлением — по желанию, для более полных щёк */
  cheeks: boolean;
  /** врач или стоматолог разрешил занятия, несмотря на отметки в опроснике */
  neckCleared: boolean;
  jawCleared: boolean;
  installHintHidden: boolean;
  reminders: string[];
}

export interface BlockState {
  levelId: number;
  /** когда начат текущий уровень: переход не раньше minDays */
  levelSince: string;
  /** когда начат блок — от него считаются недели и замеры */
  started: string;
  /** последняя пройденная проверка техники */
  techAt?: string;
  /** поддержка осанки: начало двух недель на уровне «Выносливость» */
  boost?: string | null;
}

export interface Safety {
  /** отметки опросника о шее и о челюсти */
  neck: string[];
  jaw: string[];
  at: string;
}

interface State {
  onboarded: boolean;
  blocks: Record<BlockId, BlockState>;
  safety: Safety;
  settings: Settings;
  history: SessionRecord[];
  checks: CheckRecord[];
  /** ежедневные привычки: день → отметки */
  habits: Record<string, Partial<Record<HabitId, boolean>>>;
  finishOnboarding: (start: Record<BlockId, number>, safety: Omit<Safety, 'at'>) => void;
  setLevel: (block: BlockId, id: number) => void;
  passTech: (block: BlockId) => void;
  startBoost: () => void;
  setSafety: (s: Omit<Safety, 'at'>) => void;
  setSettings: (patch: Partial<Settings>) => void;
  addSession: (s: SessionRecord) => void;
  rateSession: (id: string, rating: Rating | undefined, discomfort: boolean) => void;
  addCheck: (c: CheckRecord) => void;
  removeCheck: (id: string) => void;
  toggleHabit: (h: HabitId, day?: string) => void;
  importData: (data: unknown) => boolean;
  reset: () => void;
}

export const DEFAULT_SETTINGS: Settings = {
  sound: true,
  vibration: true,
  voice: true,
  ticks: true,
  theme: 'system',
  intro: true,
  playerView: 'figure',
  jawMode: 'chew',
  cheeks: false,
  neckCleared: false,
  jawCleared: false,
  installHintHidden: false,
  reminders: ['10:00', '13:00', '16:00', '19:00'],
};

const now = () => new Date().toISOString();
const freshBlock = (levelId: number): BlockState => ({ levelId, levelSince: now(), started: now(), boost: null });
const initial = () => ({
  onboarded: false,
  blocks: { posture: freshBlock(DEFAULT_START.posture), face: freshBlock(DEFAULT_START.face) },
  safety: { neck: [], jaw: [], at: now() },
  settings: DEFAULT_SETTINGS,
  history: [] as SessionRecord[],
  checks: [] as CheckRecord[],
  habits: {} as State['habits'],
});

export const useStore = create<State>()(
  persist(
    set => ({
      ...initial(),
      finishOnboarding: (start, safety) => set({
        onboarded: true,
        blocks: { posture: freshBlock(start.posture), face: freshBlock(start.face) },
        safety: { ...safety, at: now() },
      }),
      setLevel: (block, id) => set(s => (s.blocks[block].levelId === id ? {} : {
        blocks: { ...s.blocks, [block]: { ...s.blocks[block], levelId: id, levelSince: now(), boost: null } },
      })),
      passTech: block => set(s => ({ blocks: { ...s.blocks, [block]: { ...s.blocks[block], techAt: now() } } })),
      startBoost: () => set(s => ({ blocks: { ...s.blocks, posture: { ...s.blocks.posture, boost: now() } } })),
      setSafety: safety => set({ safety: { ...safety, at: now() } }),
      setSettings: patch => set(s => ({ settings: { ...s.settings, ...patch } })),
      addSession: rec => set(s => ({ history: [...s.history, rec] })),
      rateSession: (id, rating, discomfort) => set(s => ({
        history: s.history.map(h => (h.id === id ? { ...h, rating, discomfort } : h)),
      })),
      addCheck: c => set(s => ({ checks: [...s.checks, c] })),
      removeCheck: id => set(s => ({ checks: s.checks.filter(c => c.id !== id) })),
      toggleHabit: (h, day = dayKey(new Date())) => set(s => {
        const cur = s.habits[day] ?? {};
        return { habits: { ...s.habits, [day]: { ...cur, [h]: !cur[h] } } };
      }),
      importData: data => {
        const d = data as Partial<State> | null;
        if (!d || !Array.isArray(d.history) || !d.blocks?.posture || !d.blocks?.face) return false;
        set({
          onboarded: true, history: d.history, blocks: d.blocks, settings: { ...DEFAULT_SETTINGS, ...d.settings },
          checks: Array.isArray(d.checks) ? d.checks : [], habits: d.habits ?? {}, safety: d.safety ?? { neck: [], jaw: [], at: now() },
        });
        return true;
      },
      reset: () => set(initial()),
    }),
    {
      name: 'linia',
      version: 1,
      partialize: s => ({ onboarded: s.onboarded, blocks: s.blocks, safety: s.safety, settings: s.settings, history: s.history, checks: s.checks, habits: s.habits }),
      merge: (persisted, current) => {
        const p = persisted as Partial<State> | undefined;
        return { ...current, ...p, settings: { ...DEFAULT_SETTINGS, ...p?.settings } };
      },
    },
  ),
);

/** Можно ли нагружать челюсть: опросник ВНЧС чистый или стоматолог разрешил */
export const jawAllowed = (s: { safety: Safety; settings: Pick<Settings, 'jawCleared'> }) => s.safety.jaw.length === 0 || s.settings.jawCleared;
export const neckFlagged = (s: { safety: Safety; settings: Pick<Settings, 'neckCleared'> }) => s.safety.neck.length > 0 && !s.settings.neckCleared;
