/**
 * 用微软 Edge 的神经网络语音（edge-tts，非官方接口）预先生成所有语音。
 *
 *   npm run voice:setup   # 第一次：在 .venv 里装 edge-tts
 *   npm run voice         # 生成缺少的音频，删除不再用的，更新 voice-files.ts
 *
 * 文件名是 声音+语速+文字 的哈希，所以换声音或改文字会自动重新生成。
 */
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { promisify } from 'node:util';
import * as prettier from 'prettier';
import { CHEER_LINES, VOICE_LINES } from '../src/app/voice-lines';

const NORMAL = { voice: 'zh-CN-XiaoxiaoNeural', rate: '-10%' };
const CHEER = { voice: 'zh-CN-XiaoyiNeural', rate: '-10%' };

const OUT_DIR = 'public/voice';
const MANIFEST = 'src/app/core/voice-files.ts';
const EDGE_TTS =
  process.env['EDGE_TTS'] ?? (existsSync('.venv/bin/edge-tts') ? '.venv/bin/edge-tts' : 'edge-tts');
/** 同时请求太多会被限流（429） */
const CONCURRENCY = 4;

const run = promisify(execFile);

const jobs = new Map<string, { text: string; voice: string; rate: string; file: string }>();
for (const [lines, { voice, rate }] of [
  [VOICE_LINES, NORMAL],
  [CHEER_LINES, CHEER],
] as const) {
  for (const text of lines) {
    const file =
      createHash('sha1').update(`${voice}|${rate}|${text}`).digest('hex').slice(0, 12) + '.mp3';
    // 同一句话同时出现在两边时，夸奖的声音优先
    jobs.set(text, { text, voice, rate, file });
  }
}

mkdirSync(OUT_DIR, { recursive: true });
const todo = [...jobs.values()].filter((j) => !existsSync(`${OUT_DIR}/${j.file}`));
console.log(`共 ${jobs.size} 句，需要生成 ${todo.length} 句`);

let done = 0;
async function worker(): Promise<void> {
  for (let job = todo.shift(); job; job = todo.shift()) {
    const args = [
      '--voice',
      job.voice,
      `--rate=${job.rate}`,
      '--text',
      job.text,
      '--write-media',
      `${OUT_DIR}/${job.file}`,
    ];
    for (let attempt = 1; ; attempt++) {
      try {
        await run(EDGE_TTS, args);
        break;
      } catch (e) {
        if (attempt === 3) throw new Error(`生成失败：${job.text}\n${(e as Error).message}`);
        await new Promise((r) => setTimeout(r, 2000 * attempt));
      }
    }
    console.log(`[${++done}] ${job.text}`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

const used = new Set([...jobs.values()].map((j) => j.file));
for (const f of readdirSync(OUT_DIR)) {
  if (!used.has(f)) {
    unlinkSync(`${OUT_DIR}/${f}`);
    console.log(`删除不再使用的 ${f}`);
  }
}

const entries = [...jobs.values()]
  .sort((a, b) => a.text.localeCompare(b.text, 'zh'))
  .map((j) => `  ${JSON.stringify(j.text)}: '${j.file}',`);
const source =
  `// 由 scripts/gen-voice.mts 生成（npm run voice），不要手改。\n` +
  `/** 文字 → public/voice/ 里的音频文件 */\n` +
  `export const VOICE_FILES: Record<string, string> = {\n${entries.join('\n')}\n};\n`;
// 先格式化好再一次写入，中途被打断也不会留下半个文件
const options = (await prettier.resolveConfig(MANIFEST)) ?? {};
writeFileSync(MANIFEST, await prettier.format(source, { ...options, filepath: MANIFEST }));
console.log(`已更新 ${MANIFEST}`);
