import { Injectable, inject } from '@angular/core';
import { PRAISE } from './praise';
import { pick, rand } from './random';
import { Sound } from './sound';
import { Speech } from './speech';

const CONFETTI = ['🎉', '⭐', '🌟', '🎈', '💖', '✨', '🍭'];

/** 庆祝效果：彩带 + 音乐 + 夸奖 */
@Injectable({ providedIn: 'root' })
export class Celebration {
  private readonly sound = inject(Sound);
  private readonly speech = inject(Speech);

  confetti(count = 40): void {
    for (let i = 0; i < count; i++) {
      const el = document.createElement('div');
      el.className = 'confetti';
      el.textContent = pick(CONFETTI);
      el.style.left = `${rand(0, 100)}vw`;
      el.style.animationDuration = `${rand(1.8, 3.2)}s`;
      el.style.animationDelay = `${rand(0, 0.6)}s`;
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 4000);
    }
  }

  /** 返回的 Promise 在夸奖的话说完（或被打断）时完成 */
  celebrate(text = pick(PRAISE)): Promise<void> {
    this.sound.win();
    this.confetti();
    return new Promise((resolve) =>
      setTimeout(() => void this.speech.say(text).then(resolve), 300),
    );
  }
}
