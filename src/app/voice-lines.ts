import * as playTime from './core/play-time-lines';
import { PRAISE } from './core/praise';
import { GAMES } from './games';
import * as balloon from './games/balloon/balloon-data';
import * as count from './games/count/count-data';
import * as draw from './games/draw/draw-data';
import * as memory from './games/memory/memory-data';
import * as shapes from './games/shapes/shapes-data';
import * as menu from './menu/menu-data';

/**
 * 游戏里会说的所有话。`npm run voice` 读取这里，预先生成音频到 public/voice/。
 * 新加一句话后记得重新跑一次；没生成的话会退回系统语音。
 */
export const VOICE_LINES: string[] = [
  ...GAMES.map((g) => g.intro ?? g.title),
  ...menu.VOICE_LINES,
  ...playTime.VOICE_LINES,
  ...balloon.VOICE_LINES,
  ...count.VOICE_LINES,
  ...draw.VOICE_LINES,
  ...memory.VOICE_LINES,
  ...shapes.VOICE_LINES,
];

/** 夸奖类的话，用更活泼的声音 */
export const CHEER_LINES: string[] = [
  ...PRAISE,
  ...balloon.CHEER_LINES,
  ...count.CHEER_LINES,
  ...memory.CHEER_LINES,
  ...shapes.CHEER_LINES,
];
