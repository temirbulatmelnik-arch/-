// Приглашение установить приложение, если оно открыто во вкладке Safari, а не с экрана «Домой».
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { spring } from './motion';

const standalone = () => (navigator as Navigator & { standalone?: boolean }).standalone === true || matchMedia('(display-mode: standalone)').matches;

export function InstallBanner() {
  const [hide, setHide] = useState(() => { try { return standalone() || !!localStorage.getItem('astro-install-hide'); } catch { return standalone(); } });
  return (
    <AnimatePresence>
      {!hide && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0, marginBottom: 0 }} transition={spring}
          className="halo oracle mb-4 flex items-center gap-3 rounded-[22px] p-3.5">
          <img src="./pwa-64x64.png" alt="" width="44" height="44" className="size-11 rounded-[12px]" />
          <div className="min-w-0 flex-1">
            <p className="text-[15.5px] font-semibold">Установить на iPhone</p>
            <p className="text-[13.5px] text-dim">Значком, как «Курс»</p>
          </div>
          <a href="./install.html" className="shrink-0 rounded-full bg-brass px-3.5 py-2 text-[14.5px] font-semibold text-night">Установить</a>
          <button aria-label="Скрыть" onClick={() => { setHide(true); try { localStorage.setItem('astro-install-hide', '1'); } catch { /* */ } }} className="shrink-0 px-1 text-[20px] text-faint">×</button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
