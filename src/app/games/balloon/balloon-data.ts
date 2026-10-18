/** 每爆一个气球读出分数，每 10 个夸一次 */
export const scoreLine = (score: number): string => String(score);
export const milestoneLine = (score: number): string => `${score}个气球！真棒！`;
export const isMilestone = (score: number): boolean => score % 10 === 0;

/** 预先生成语音到这个分数，更高的分数用系统语音 */
const VOICED_MAX = 100;
const SCORES = Array.from({ length: VOICED_MAX }, (_, i) => i + 1);

export const VOICE_LINES = SCORES.filter((s) => !isMilestone(s)).map(scoreLine);
export const CHEER_LINES = SCORES.filter(isMilestone).map(milestoneLine);
