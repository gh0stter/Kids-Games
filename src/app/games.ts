import { Type } from '@angular/core';

/** 游戏注册表：菜单和路由都从这里生成。新增游戏只需要在这里加一项。 */
export interface GameInfo {
  /** 路由路径，例如 `balloon` → `#/balloon` */
  path: string;
  title: string;
  emoji: string;
  /** 菜单卡片颜色 */
  color: string;
  /** 开始画面点 ▶ 后读出的话，默认读标题 */
  intro?: string;
  load: () => Promise<Type<unknown>>;
}

export const GAMES: GameInfo[] = [
  {
    path: 'balloon',
    title: '气球爆爆',
    emoji: '🎈',
    color: 'var(--red)',
    intro: '点气球，啪！',
    load: () => import('./games/balloon/balloon').then((m) => m.Balloon),
  },
  {
    path: 'shapes',
    title: '形状回家',
    emoji: '🔺',
    color: 'var(--blue)',
    intro: '把形状送回家吧！',
    load: () => import('./games/shapes/shapes').then((m) => m.Shapes),
  },
  {
    path: 'count',
    title: '数一数',
    emoji: '🍎',
    color: 'var(--orange)',
    load: () => import('./games/count/count').then((m) => m.Count),
  },
  {
    path: 'memory',
    title: '翻翻乐',
    emoji: '🐼',
    color: 'var(--purple)',
    intro: '找一找一样的小动物',
    load: () => import('./games/memory/memory').then((m) => m.Memory),
  },
  {
    path: 'draw',
    title: '画画',
    emoji: '🖍️',
    color: 'var(--green)',
    load: () => import('./games/draw/draw').then((m) => m.Draw),
  },
  {
    path: 'tsunami',
    title: '海啸来啦',
    emoji: '🌊',
    color: 'var(--yellow)',
    intro: '盖高高的楼，挡住海啸！',
    load: () => import('./games/tsunami/tsunami').then((m) => m.Tsunami),
  },
  {
    path: 'rescue',
    title: '拼拼救援队',
    emoji: '🛟',
    color: 'var(--orange)',
    intro: '拼一台救援车，出发去救好朋友！',
    load: () => import('./games/rescue/rescue').then((m) => m.Rescue),
  },
];
