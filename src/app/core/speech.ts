import { Injectable, inject } from '@angular/core';
import { Sound } from './sound';
import { VOICE_FILES } from './voice-files';

/**
 * 中文语音：优先播放预先生成的神经网络语音（public/voice/，见 scripts/gen-voice.mts），
 * 跟着 service worker 一起缓存，离线可用。没有对应音频的话用 iPad 系统语音。
 */
@Injectable({ providedIn: 'root' })
export class Speech {
  private readonly sound = inject(Sound);
  private readonly buffers = new Map<string, Promise<AudioBuffer | null>>();
  private current: AudioBufferSourceNode | null = null;
  /** 每说一句加一；音频加载完时如果已经有新的一句了，就不再播放旧的 */
  private seq = 0;

  private readonly ttsSupported = 'speechSynthesis' in window;
  private ttsVoice: SpeechSynthesisVoice | null = null;

  constructor() {
    if (!this.ttsSupported) return;
    this.pickVoice();
    speechSynthesis.addEventListener('voiceschanged', () => this.pickVoice());
  }

  /** 说一句话，会打断正在说的话（避免排队越说越慢） */
  say(text: string): void {
    const seq = ++this.seq;
    this.stop();
    const file = VOICE_FILES[text];
    if (!file) {
      this.tts(text);
      return;
    }
    void this.load(file).then((buffer) => {
      if (seq !== this.seq) return;
      if (buffer) this.play(buffer);
      else this.tts(text);
    });
  }

  private stop(): void {
    this.current?.stop();
    this.current = null;
    if (this.ttsSupported) speechSynthesis.cancel();
  }

  private load(file: string): Promise<AudioBuffer | null> {
    let buffer = this.buffers.get(file);
    if (!buffer) {
      const ctx = this.sound.unlock();
      if (!ctx) return Promise.resolve(null);
      buffer = fetch(`voice/${file}`)
        .then((res) => {
          if (!res.ok) throw new Error(`${res.status} voice/${file}`);
          return res.arrayBuffer();
        })
        .then((data) => ctx.decodeAudioData(data))
        .catch(() => {
          // 下次再试
          this.buffers.delete(file);
          return null;
        });
      this.buffers.set(file, buffer);
    }
    return buffer;
  }

  private play(buffer: AudioBuffer): void {
    const ctx = this.sound.unlock();
    if (!ctx) return;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.onended = () => {
      if (this.current === source) this.current = null;
    };
    source.start();
    this.current = source;
  }

  private tts(text: string): void {
    if (!this.ttsSupported) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-CN';
    if (this.ttsVoice) u.voice = this.ttsVoice;
    u.rate = 0.9;
    speechSynthesis.speak(u);
  }

  private pickVoice(): void {
    const voices = speechSynthesis.getVoices();
    this.ttsVoice =
      voices.find((v) => v.lang === 'zh-CN') ?? voices.find((v) => v.lang.startsWith('zh')) ?? null;
  }
}
