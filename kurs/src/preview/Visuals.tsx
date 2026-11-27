import { GlassLens } from './GlassLens';
import {
  Anchor, ArrowDownLeft, ArrowLeftRight, ArrowRight, ChevronRight,
  FlaskConical, type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useUi } from '../store/ui';

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
