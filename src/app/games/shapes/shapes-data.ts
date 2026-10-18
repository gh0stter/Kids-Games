export interface ShapeDef {
  name: string;
  /** CSS 颜色，可以是 var(--red) 这样的变量 */
  color: string;
  /** SVG path，坐标系 0–100 */
  d: string;
}

function starPath(): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 20 : 47;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(`${(50 + r * Math.cos(a)).toFixed(1)} ${(52 + r * Math.sin(a)).toFixed(1)}`);
  }
  return `M${pts.join(' L')} Z`;
}

export const SHAPES: ShapeDef[] = [
  { name: '圆形', color: 'var(--red)', d: 'M5 50 A45 45 0 1 0 95 50 A45 45 0 1 0 5 50 Z' },
  {
    name: '正方形',
    color: 'var(--blue)',
    d: 'M14 8 H86 Q92 8 92 14 V86 Q92 92 86 92 H14 Q8 92 8 86 V14 Q8 8 14 8 Z',
  },
  { name: '三角形', color: 'var(--green)', d: 'M50 5 L96 92 L4 92 Z' },
  { name: '星星', color: 'var(--yellow)', d: starPath() },
  {
    name: '爱心',
    color: 'var(--pink)',
    d: 'M50 92 C18 68 2 46 14 24 C26 4 46 10 50 28 C54 10 74 4 86 24 C98 46 82 68 50 92Z',
  },
  { name: '菱形', color: 'var(--purple)', d: 'M50 2 L96 50 L50 98 L4 50 Z' },
  { name: '半圆', color: 'var(--orange)', d: 'M4 70 A46 46 0 0 1 96 70 Z' },
];

export const goneHome = (shape: ShapeDef): string => `${shape.name}，回家啦！`;
export const WRONG = '不对哦，再试试';

export const VOICE_LINES = [...SHAPES.map((s) => s.name), WRONG];
export const CHEER_LINES = SHAPES.map(goneHome);
