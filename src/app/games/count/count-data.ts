export interface Item {
  emoji: string;
  name: string;
}

export const ITEMS: Item[] = [
  { emoji: '🍎', name: '苹果' },
  { emoji: '🍌', name: '香蕉' },
  { emoji: '🍓', name: '草莓' },
  { emoji: '🐟', name: '小鱼' },
  { emoji: '🐥', name: '小鸡' },
  { emoji: '🚗', name: '小汽车' },
  { emoji: '⭐', name: '星星' },
  { emoji: '🌸', name: '花' },
  { emoji: '🐞', name: '瓢虫' },
  { emoji: '🧁', name: '蛋糕' },
];

export const MAX_N = 10;
/** 量词读法：两个苹果 */
const AMOUNT = ['零', '一', '两', '三', '四', '五', '六', '七', '八', '九', '十'];
/** 数数读法：一、二、三 */
export const COUNTING = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

export const question = (item: Item): string => `有几个${item.name}？`;
export const rightAnswer = (n: number, item: Item): string => `对啦！${AMOUNT[n]}个${item.name}！`;
export const TRY_AGAIN = '再数一数吧';

const NUMBERS = Array.from({ length: MAX_N }, (_, i) => i + 1);

export const VOICE_LINES = [...ITEMS.map(question), ...NUMBERS.map((n) => COUNTING[n]), TRY_AGAIN];
export const CHEER_LINES = ITEMS.flatMap((item) => NUMBERS.map((n) => rightAnswer(n, item)));
