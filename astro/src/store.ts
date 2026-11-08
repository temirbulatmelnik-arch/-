import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Tab = 'today' | 'us' | 'dates' | 'charts';
export type Slot = 'morning' | 'day' | 'evening';
export const SLOT_HOUR: Record<Slot, number> = { morning: 9, day: 14, evening: 20 };
export type DateFilter = 'important' | 'me' | 'dima' | 'pair';
export type ChartView = 'me' | 'dima' | 'syn' | 'comp' | 'vedic';
export type CalView = 'periods' | 'events';

interface State {
  tab: Tab; offset: number; element: number; live: boolean; toggleLive: () => void; setElement: (e: number) => void; slot: Slot; theme: 'dark' | 'light'; filter: DateFilter; chart: ChartView; cal: CalView; setCal: (c: CalView) => void;
  setTab: (t: Tab) => void; setOffset: (n: number) => void; setSlot: (s: Slot) => void;
  toggleTheme: () => void; setFilter: (f: DateFilter) => void; setChart: (c: ChartView) => void;
}

const nowSlot = (): Slot => { const h = new Date(Date.now() + 3 * 3600e3).getUTCHours(); return h < 12 ? 'morning' : h < 18 ? 'day' : 'evening'; };

export const useApp = create<State>()(persist((set, get) => ({
  tab: 'today', offset: 0, element: 2, live: true, toggleLive: () => set({ live: !get().live }), setElement: element => set({ element }), slot: nowSlot(), theme: document.documentElement.classList.contains('light') ? 'light' : 'dark', filter: 'important', chart: 'me', cal: 'periods', setCal: cal => set({ cal }),
  setTab: tab => set({ tab }),
  setOffset: offset => set({ offset }),
  setSlot: slot => set({ slot }),
  toggleTheme: () => {
    const theme = get().theme === 'dark' ? 'light' : 'dark';
    document.documentElement.classList.toggle('light', theme === 'light');
    try { localStorage.setItem('astro-theme', theme); } catch { /* приватный режим */ }
    set({ theme });
  },
  setFilter: filter => set({ filter }),
  setChart: chart => set({ chart }),
}), {
  name: 'astro-ui',
  // при открытии — всегда сегодня и текущее время суток: прогноз на сегодня сразу
  partialize: s => ({ filter: s.filter, chart: s.chart, live: s.live }),
}));
