import { Injectable } from '@angular/core';

export interface ToneOptions {
  /** 时长（秒） */
  dur?: number;
  type?: OscillatorType;
  vol?: number;
  /** 延迟多少秒后播放 */
  when?: number;
  /** 频率在时长内滑动多少 Hz（负数为下滑） */
  slide?: number;
}

/** 音效：全部用 Web Audio 合成，不需要音频文件，离线可用 */
@Injectable({ providedIn: 'root' })
export class Sound {
  private ctx: AudioContext | null = null;

  constructor() {
    // iOS 只允许在用户触摸时开启声音
    for (const type of ['pointerdown', 'touchend']) {
      document.addEventListener(type, () => this.unlock(), { passive: true });
    }
  }

  unlock(): AudioContext | null {
    if (!this.ctx) {
      if (typeof AudioContext === 'undefined') return null;
      this.ctx = new AudioContext();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  tone(
    freq: number,
    { dur = 0.15, type = 'sine', vol = 0.25, when = 0, slide = 0 }: ToneOptions = {},
  ): void {
    const ctx = this.unlock();
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  tap(): void {
    this.tone(660, { dur: 0.08, type: 'triangle', vol: 0.15 });
  }

  pop(): void {
    this.tone(900, { dur: 0.12, type: 'square', vol: 0.12, slide: -700 });
    this.tone(1400, { dur: 0.05, type: 'triangle', vol: 0.15 });
  }

  good(): void {
    [523, 659, 784].forEach((f, i) =>
      this.tone(f, { dur: 0.18, type: 'triangle', when: i * 0.09 }),
    );
  }

  bad(): void {
    this.tone(220, { dur: 0.25, type: 'sine', vol: 0.2, slide: -80 });
  }

  flip(): void {
    this.tone(500, { dur: 0.07, type: 'triangle', vol: 0.12, slide: 300 });
  }

  win(): void {
    [523, 659, 784, 1047, 784, 1047].forEach((f, i) =>
      this.tone(f, { dur: 0.22, type: 'triangle', vol: 0.22, when: i * 0.12 }),
    );
  }
}
