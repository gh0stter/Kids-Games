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

  celebrate(text = pick(PRAISE)): void {
    this.sound.win();
    this.confetti();
    setTimeout(() => this.speech.say(text), 300);
  }
}
