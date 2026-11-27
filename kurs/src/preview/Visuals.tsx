import { GlassLens } from './GlassLens';
import {
  Anchor, ArrowDownLeft, ArrowLeftRight, ArrowRight, CalendarClock, ChevronRight,
  FlaskConical, ShieldCheck, WalletCards, Waves, type LucideIcon,
} from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { useUi } from '../store/ui';
import { Money } from '../components/ui';
import { useVisibleWaves, WaterSurface } from './WaterSurface';

export function Glyph({ icon: Icon, tone = 'aqua', size = 21, lens = false }: {
  icon: LucideIcon; tone?: string; size?: number; lens?: boolean;
}) {
  return <span className="nv-glyph" data-tone={tone} aria-hidden="true">{lens && <GlassLens />}<Icon size={size} strokeWidth={1.65} /></span>;
}

export function Jump({ icon, label, onClick, tone = 'aqua', children }: {
  icon: LucideIcon; label: string; onClick: () => void; tone?: string; children?: ReactNode;
}) {
  return <button type="button" className="nv-jump nv-press" data-tone={tone} onClick={onClick}>
    <Glyph icon={icon} tone={tone} /><span>{label}{children && <small>{children}</small>}</span>
    <ChevronRight size={15} aria-hidden="true" />
  </button>;
}

export function Vessels({ total, parts, open, reserveVerified, children }: {
  total: number | null;
  parts: [number | null, number, number];
  open: [() => void, () => void, () => void];
  reserveVerified: boolean;
  children?: ReactNode;
}) {
  const labels = ['Свободно', 'Под платежи', 'Резерв'];
  const icons = [WalletCards, CalendarClock, ShieldCheck];
  const tones = ['aqua', 'amber', 'iris'];
  const max = Math.max(1, ...parts.map(n => n ?? 0));
  const waves = useVisibleWaves<HTMLElement>(parts.some(value => (value ?? 0) > 0));
  return <section ref={waves} className="nv-vessels nv-glass" aria-label="Свои деньги">
    <div className="nv-overline"><Waves size={19} strokeWidth={1.7} aria-hidden="true" /> Свои деньги</div>
    <div className="nv-amount">{total == null ? <span className="nv-unknown">Нужна сверка</span> : <Money value={total} approx={!reserveVerified} kopecks />}</div>
    <div className="nv-tanks">
      {parts.map((value, i) => {
        const fill = value != null && value > 0 ? value / max * 75 : 0;
        return <button className="nv-tank nv-press" type="button" key={labels[i]} data-tone={tones[i]} onClick={open[i]}
          style={{ '--fill': `${fill}%` } as CSSProperties}>
          <span className="nv-tank-water" aria-hidden="true">
            {fill > 0 && <WaterSurface color="var(--nv-water-line)" fill="var(--nv-water-top)" />}
          </span>
          <Glyph icon={icons[i]} tone={tones[i]} size={18} lens />
          <span className="nv-tank-label">{labels[i]}</span>
          <strong>{value == null ? 'Сверить' : <Money value={value} approx={i === 2 && !reserveVerified} kopecks />}</strong>
        </button>;
      })}
    </div>
    {children}
  </section>;
}

export function VoyageActions({ explore, openPrepay }: { explore: () => void; openPrepay: () => void }) {
  const set = useUi(s => s.set);
  return <div className="nv-actions">
    <Jump icon={FlaskConical} label="Что, если" tone="iris" onClick={explore}>Смоделировать</Jump>
    <Jump icon={ArrowDownLeft} label="Доходы" onClick={() => set({ workSheet: true })}>Зарплата и отпуск</Jump>
    <Jump icon={ArrowLeftRight} label="Счета" onClick={() => set({ finance: true })} />
    <Jump icon={Anchor} label="Досрочка" tone="amber" onClick={openPrepay} />
  </div>;
}

export function IconLabel({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return <span className="nv-overline"><Icon size={17} strokeWidth={1.7} aria-hidden="true" /> {children}</span>;
}

export const ActionArrow = () => <ArrowRight size={18} strokeWidth={1.8} aria-hidden="true" />;
