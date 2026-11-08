// Карточка транзита: полоса силы слева, глифы, толкование; раскрывается — проходы и окно действия.
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { ASPECT } from '../engine/aspects';
import type { TransitCard as T } from '../engine/day';
import { PL_NOM, pointRu } from '../engine/events';
import { fmtOrb } from '../engine/core';
import { fmtDay, fmtDateTime, fmtRange, fmtTime } from '../engine/time';
import { natureOf } from '../content/compose';
import { ASPECT_COLOR, GLYPH, PCOLOR, isTextGlyph } from './glyphs';
import { Chip } from './ui';
import { spring } from './motion';

const ACC: Record<string, string> = { conj: 'соединение', sext: 'секстиль', square: 'квадрат', trine: 'трин', opp: 'оппозиция', quincunx: 'квинконс', semisq: 'полуквадрат', sesq: 'сесквиквадрат', semisext: 'полусекстиль', quintile: 'квинтиль' };

export function TransitCardView({ tr, who = 'me', now }: { tr: T; who?: 'me' | 'dima'; now: number }) {
  const [open, setOpen] = useState(false);
  const nat = natureOf(tr.aspect);
  const col = ASPECT_COLOR[nat];
  const fast = tr.t === 'moon';
  const exactLabel = tr.exactNow ? 'точный' : tr.nearest ? (fast || Math.abs(tr.nearest - now) < 2 * 864e5 ? `точно ${fmtDay(tr.nearest)} в ${fmtTime(tr.nearest)}` : `точно ${fmtDay(tr.nearest, true)}`) : '';
  return (
    <motion.article aria-label={`${PL_NOM[tr.t]}, ${ACC[tr.aspect]}, ${pointRu(tr.n, who)}`} layout transition={spring} onClick={() => setOpen(o => !o)} className="oracle relative cursor-pointer overflow-hidden rounded-[22px] py-4 pr-4 pl-5">
      <span className="absolute top-3 bottom-3 left-0 w-[5px] rounded-r-full" style={{ background: col, opacity: 0.35 + Math.min(1, tr.strength / 1.6) * 0.65, boxShadow: `0 0 14px ${col}` }} />
      <div className="flex items-center gap-3">
        <div className="flex shrink-0 items-center gap-1 text-[24px]">
          <span className="glyph" style={{ color: PCOLOR[tr.t] }}>{GLYPH[tr.t]}</span>
          <span className="glyph text-[18px]" style={{ color: col }}>{ASPECT[tr.aspect].glyph}</span>
          <span className={isTextGlyph(tr.n) ? 'serif text-[17px] font-bold' : 'glyph'} style={{ color: PCOLOR[tr.n] }}>{GLYPH[tr.n]}</span>
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-[17px] leading-snug font-semibold">{PL_NOM[tr.t]}{tr.retro ? ' R' : ''} <span className="glyph font-normal" style={{ color: col }}>{ASPECT[tr.aspect].glyph}</span> {pointRu(tr.n, who)}</h3>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <Chip tone={tr.applying ? 'brass' : 'plain'}>{tr.exactNow ? 'точный' : tr.applying ? 'сходится' : 'расходится'}</Chip>
            <Chip>орб {fmtOrb(tr.orb)}</Chip>
            {exactLabel && !tr.exactNow && <Chip>{exactLabel}</Chip>}
          </div>
        </div>
      </div>
      <div className="mt-3 space-y-1.5 text-[16px] leading-relaxed text-dim">
        {tr.text.map((x, i) => <p key={i} className={i === 0 ? 'text-ink' : ''}>{x}</p>)}
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={spring} className="overflow-hidden">
            <div className="mt-3 border-t pt-3 text-[15px] text-dim hair">
              <p>Окно действия: <span className="text-ink">{fast ? `${fmtTime(tr.window[0])}–${fmtTime(tr.window[1])}` : fmtRange(tr.window[0], tr.window[1])}</span></p>
              {tr.passes.length > 1 && (
                <div className="mt-2">
                  <p>Все проходы — одна история:</p>
                  <ol className="mt-1 flex flex-wrap gap-1.5">
                    {tr.passes.map((p, i) => <li key={i}><Chip tone={Math.abs(p - now) < 864e5 * 3 ? 'brass' : 'plain'}>{i + 1}. {fmtDay(p, true)}</Chip></li>)}
                  </ol>
                </div>
              )}
              {tr.passes.length === 1 && !fast && <p className="mt-1">Точный аспект: {fmtDateTime(tr.passes[0])}</p>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  );
}
