// Всё хранится только на устройстве (localStorage). Никаких аккаунтов и серверов.
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_START } from '../engine/program';
import type { CheckRecord, Rating, SessionRecord } from '../engine/stats';

export type Theme = 'system' | 'light' | 'dark';

export interface Settings {
  sound: boolean;
  vibration: boolean;
  voice: boolean;
  ticks: boolean;
  /** тренировок в день: одна основная и остальные лёгкие */
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
  /** когда начат текущий уровень: переход не раньше minDays */
  levelSince: string;
  /** начало интенсивного блока в режиме поддержки */
  intensive: string | null;
  settings: Settings;
  history: SessionRecord[];
  checks: CheckRecord[];
  finishOnboarding: (levelId: number) => void;
  setLevel: (id: number) => void;
  setSettings: (patch: Partial<Settings>) => void;
  addSession: (s: SessionRecord) => void;
  rateSession: (id: string, rating: Rating | undefined, discomfort: boolean) => void;
  addCheck: (c: CheckRecord) => void;
  startIntensive: () => void;
  importData: (data: unknown) => boolean;
  reset: () => void;
}

export const MAX_GOAL = 3;

/** Версия 2: вводные уровни 1–2 больше не обязательны, по умолчанию старт с уровня 3.
 *  Версия 3: дни на уровне считаются с момента обновления, в день не больше 3 тренировок. */
export function migrate(persisted: unknown, version: number, now = new Date()) {
  const p = persisted as { levelId?: number; levelSince?: string; settings?: Partial<Settings> } | null;
  if (!p) return p;
  const r = { ...p };
  if (version < 2 && typeof r.levelId === 'number' && r.levelId < DEFAULT_START) r.levelId = DEFAULT_START;
  if (version < 3) {
    r.levelSince ??= now.toISOString();
    if (r.settings?.dailyGoal) r.settings = { ...r.settings, dailyGoal: Math.min(MAX_GOAL, r.settings.dailyGoal) };
  }
  return r;
}

const DEFAULT_SETTINGS: Settings = {
  sound: true,
  vibration: true,
  voice: true,
  ticks: true,
  dailyGoal: 2,
  reminders: ['08:30', '19:00'],
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
      levelSince: new Date().toISOString(),
      intensive: null,
      settings: DEFAULT_SETTINGS,
      history: [],
      checks: [],
      finishOnboarding: levelId => set({ onboarded: true, levelId, levelSince: new Date().toISOString() }),
      setLevel: id => set(s => (s.levelId === id ? {} : { levelId: id, levelSince: new Date().toISOString(), intensive: null })),
      setSettings: patch => set(s => ({ settings: { ...s.settings, ...patch } })),
      addSession: rec => set(s => ({ history: [...s.history, rec] })),
      rateSession: (id, rating, discomfort) => set(s => ({
        history: s.history.map(h => (h.id === id ? { ...h, rating, discomfort } : h)),
      })),
      addCheck: c => set(s => ({ checks: [...s.checks, c] })),
      startIntensive: () => set({ intensive: new Date().toISOString() }),
      importData: data => {
        const d = data as Partial<State> | null;
        if (!d || !Array.isArray(d.history) || typeof d.levelId !== 'number') return false;
        set({
          history: d.history, levelId: d.levelId, settings: { ...DEFAULT_SETTINGS, ...d.settings }, onboarded: true,
          checks: Array.isArray(d.checks) ? d.checks : [], levelSince: d.levelSince ?? new Date().toISOString(), intensive: d.intensive ?? null,
        });
        return true;
      },
      reset: () => set({ onboarded: false, levelId: DEFAULT_START, levelSince: new Date().toISOString(), intensive: null, settings: DEFAULT_SETTINGS, history: [], checks: [] }),
    }),
    {
      name: 'tonus',
      version: 3,
      migrate,
      partialize: s => ({ onboarded: s.onboarded, levelId: s.levelId, levelSince: s.levelSince, intensive: s.intensive, settings: s.settings, history: s.history, checks: s.checks }),
      merge: (persisted, current) => {
        const p = persisted as Partial<State> | undefined;
        return { ...current, ...p, settings: { ...DEFAULT_SETTINGS, ...p?.settings } };
      },
    },
  ),
);
