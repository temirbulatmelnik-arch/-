// Линейная графика для карточек блоков: профиль лица с линией овала и силуэт шеи с отвесом «ухо над плечом».
// Линии «рисуются» при появлении; золотом выделено то, над чем работает блок.

const stroke = { fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

export function FaceArt({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 260" className={className} aria-hidden>
      <g {...stroke} stroke="currentColor" strokeWidth={1.3} opacity={0.85}>
        {/* профиль: лоб, нос, губы, подбородок, угол под подбородком, шея */}
        <path className="draw" pathLength={1} d="M132 14 C104 14 84 32 80 58 C78 70 80 78 76 86 C72 96 64 108 58 118 C55 123 57 128 63 129 C66 130 67 133 65 137 C62 141 66 144 67 146 C64 150 66 154 69 156 C67 160 66 166 70 172 C74 180 84 183 96 182 C108 181 116 186 118 196 C120 212 118 232 112 256" />
        {/* затылок и задняя линия шеи */}
        <path className="draw" pathLength={1} style={{ animationDelay: '.25s' }} d="M132 14 C170 14 188 44 186 80 C184 104 176 120 168 134 C162 150 160 176 166 200 C172 224 184 240 196 252" />
        {/* ухо и глаз */}
        <path className="draw" pathLength={1} style={{ animationDelay: '.5s' }} d="M141 116 C151 110 158 121 153 131 C151 137 147 140 142 140" />
        <path className="draw" pathLength={1} style={{ animationDelay: '.6s' }} d="M90 84 C95 81 100 81 105 84" />
      </g>
      {/* линия овала — золотом */}
      <path className="draw" pathLength={1} style={{ animationDelay: '.8s' }} {...stroke} stroke="var(--gold)" strokeWidth={1.8}
        d="M70 172 C92 180 118 172 133 152 C139 143 141 133 140 124" />
      <circle cx="96" cy="182" r="2.4" fill="var(--gold)" className="draw" />
    </svg>
  );
}

export function PostureArt({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 260" className={className} aria-hidden>
      {/* отвес: ухо над плечом */}
      <path d="M124 6 L124 254" stroke="var(--gold)" strokeWidth={1} strokeDasharray="2 5" opacity={0.9} />
      <g {...stroke} stroke="currentColor" strokeWidth={1.3} opacity={0.85}>
        <path className="draw" pathLength={1} d="M100 20 C78 20 64 36 62 56 C61 64 62 70 58 76 C55 81 57 84 61 85 C61 90 62 94 66 96 C64 102 68 106 76 107 C84 108 90 112 92 120 C94 134 92 148 86 162 C80 176 74 198 74 232" />
        <path className="draw" pathLength={1} style={{ animationDelay: '.25s' }} d="M100 20 C124 20 140 38 140 60 C140 78 133 90 128 100 C124 110 124 124 130 136 C140 152 158 160 168 172 C178 184 181 210 177 252" />
        <path className="draw" pathLength={1} style={{ animationDelay: '.5s' }} d="M108 178 C120 162 150 162 158 186 C162 200 159 216 154 232" />
        <path className="draw" pathLength={1} style={{ animationDelay: '.6s' }} d="M74 56 C78 53 82 53 86 56" />
      </g>
      {/* шейный изгиб — золотом */}
      <path className="draw" pathLength={1} style={{ animationDelay: '.8s' }} {...stroke} stroke="var(--gold)" strokeWidth={1.8}
        d="M118 84 C112 100 110 118 114 134 C117 146 122 156 126 164" />
      <circle cx="124" cy="72" r="3" fill="var(--gold)" />
      <circle cx="124" cy="168" r="3" fill="var(--gold)" />
    </svg>
  );
}

/** Монограмма приложения: тонкая линия шеи и челюсти */
export function Mark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <path {...stroke} stroke="var(--gold)" strokeWidth={2.2} d="M22 10 C22 26 22 36 26 44 C30 52 40 54 46 50" />
      <path {...stroke} stroke="currentColor" strokeWidth={1.4} opacity={0.6} d="M14 54 L50 54" />
    </svg>
  );
}
