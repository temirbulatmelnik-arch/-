// Заголовок, который проявляется слово за словом — из размытия, как звезда из тумана.
import { motion } from 'motion/react';

export function RevealTitle({ text, className = '', delay = 0 }: { text: string; className?: string; delay?: number }) {
  const words = text.split(' ');
  return (
    <h1 className={className} aria-label={text}>
      {words.map((w, i) => (
        <motion.span key={text + i} aria-hidden="true" className="inline-block whitespace-pre"
          initial={{ opacity: 0, y: 14, filter: 'blur(10px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ duration: 0.7, delay: delay + i * 0.09, ease: [0.23, 1, 0.32, 1] }}>
          {w}{i < words.length - 1 ? ' ' : ''}
        </motion.span>
      ))}
    </h1>
  );
}
