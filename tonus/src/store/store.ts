// Всё хранится только на устройстве (localStorage). Никаких аккаунтов и серверов.
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_START } from '../engine/program';
import type { Rating, SessionRecord } from '../engine/stats';

export type Theme = 'system' | 'light' | 'dark';

export interface Settings {
  sound: boolean;
  vibration: boolean;
  voice: boolean;
  ticks: boolean;
  dailyGoal: number;
  reminders: string[];
  theme: Theme;
  /** скрыть подсказку «Установите на телефон» на главном экране */
  installHintHidden: boolean;
  /** подробное объяснение с 3D-демонстрацией перед каждым упражнением */
  intro: boolean;
  /** что показывать во время тренировки: 3D-фигуру или кольцо */
  playerView: 'figure' | 'ring';
}

interface State {
  onboarded: boolean;
  levelId: number;
  settings: Settings;
  history: SessionRecord[];
  finishOnboarding: (levelId: number) => void;
  setLevel: (id: number) => void;
  setSettings: (patch: Partial<Settings>) => void;
  addSession: (s: SessionRecord) => void;
  rateSession: (id: string, rating: Rating, discomfort: boolean) => void;
  importData: (data: unknown) => boolean;
  reset: () => void;
}

/** Версия 2: вводные уровни 1–2 больше не обязательны, по умолчанию старт с уровня 3 */
export function migrate(persisted: unknown, version: number) {
  const p = persisted as { levelId?: number } | null;
  if (version < 2 && p && typeof p.levelId === 'number' && p.levelId < DEFAULT_START) return { ...p, levelId: DEFAULT_START };
  return p;
}

const DEFAULT_SETTINGS: Settings = {
  sound: true,
  vibration: true,
  voice: true,
  ticks: true,
  dailyGoal: 3,
  reminders: ['08:30', '14:00', '21:00'],
  theme: 'system',
  installHintHidden: false,
  intro: true,
  playerView: 'figure',
};

export const useStore = create<State>()(
  persist(
    set => ({
      onboarded: false,
      levelId: DEFAULT_START,
      settings: DEFAULT_SETTINGS,
      history: [],
      finishOnboarding: levelId => set({ onboarded: true, levelId }),
      setLevel: id => set({ levelId: id }),
      setSettings: patch => set(s => ({ settings: { ...s.settings, ...patch } })),
      addSession: rec => set(s => ({ history: [...s.history, rec] })),
      rateSession: (id, rating, discomfort) => set(s => ({
        history: s.history.map(h => (h.id === id ? { ...h, rating, discomfort } : h)),
      })),
      importData: data => {
        const d = data as Partial<State> | null;
        if (!d || !Array.isArray(d.history) || typeof d.levelId !== 'number') return false;
        set({ history: d.history, levelId: d.levelId, settings: { ...DEFAULT_SETTINGS, ...d.settings }, onboarded: true });
        return true;
      },
      reset: () => set({ onboarded: false, levelId: DEFAULT_START, settings: DEFAULT_SETTINGS, history: [] }),
    }),
    {
      name: 'tonus',
      version: 2,
      migrate,
      partialize: s => ({ onboarded: s.onboarded, levelId: s.levelId, settings: s.settings, history: s.history }),
      merge: (persisted, current) => {
        const p = persisted as Partial<State> | undefined;
        return { ...current, ...p, settings: { ...DEFAULT_SETTINGS, ...p?.settings } };
      },
    },
  ),
);
