export const GLYPH: Record<string, string> = { sun: '☉', moon: '☽', mercury: '☿', venus: '♀', mars: '♂', jupiter: '♃', saturn: '♄', uranus: '♅', neptune: '♆', pluto: '♇', node: '☊', snode: '☋', chiron: '⚷', lilith: '⚸', asc: 'Asc', mc: 'MC', dsc: 'Dsc', ic: 'IC', vertex: 'Vx', fortune: '⊗', spirit: '⊕' };
export const isTextGlyph = (id: string) => ['asc', 'mc', 'dsc', 'ic', 'vertex'].includes(id);
/** цвет планеты на небе и в колесе */
export const PCOLOR: Record<string, string> = {
  sun: 'var(--p-sun)', moon: 'var(--p-moon)', mercury: 'var(--p-mercury)', venus: 'var(--p-venus)', mars: 'var(--p-mars)', jupiter: 'var(--p-jupiter)', saturn: 'var(--p-saturn)', uranus: 'var(--p-uranus)', neptune: 'var(--p-neptune)', pluto: 'var(--p-pluto)', chiron: 'var(--p-chiron)', node: 'var(--p-node)', snode: 'var(--p-snode)', lilith: 'var(--p-lilith)', asc: 'var(--p-angle)', mc: 'var(--p-angle)', dsc: 'var(--p-angle)', ic: 'var(--p-angle)', vertex: 'var(--p-vertex)', fortune: 'var(--p-fortune)', spirit: 'var(--p-spirit)',
};
export const ASPECT_COLOR: Record<string, string> = { conj: 'var(--asp-conj)', soft: 'var(--asp-soft)', hard: 'var(--asp-hard)' };
