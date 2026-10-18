import { Component, computed, inject, signal } from '@angular/core';
import { Celebration } from '../../core/celebration';
import { pick, randInt, shuffle } from '../../core/random';
import { Sound } from '../../core/sound';
import { Speech } from '../../core/speech';
import { GameShell } from '../../shared/game-shell';
import { COUNTING, Item, ITEMS, MAX_N, question, rightAnswer, TRY_AGAIN } from './count-data';

interface Thing {
  id: number;
  /** 点过之后显示的序号 */
  n: number | null;
}

@Component({
  selector: 'app-count',
  imports: [GameShell],
  templateUrl: './count.html',
  styleUrl: './count.scss',
})
export class Count {
  private readonly sound = inject(Sound);
  private readonly speech = inject(Speech);
  private readonly celebration = inject(Celebration);

  protected readonly buttonColors = ['var(--red)', 'var(--blue)', 'var(--green)'];
  protected readonly item = signal<Item>(ITEMS[0]);
  protected readonly things = signal<Thing[]>([]);
  protected readonly options = signal<number[]>([]);
  protected readonly shaking = signal<number | null>(null);
  protected readonly question = computed(() => (this.things().length ? question(this.item()) : ''));

  private answer = 0;
  private tapCount = 0;
  private streak = 0;
  private locked = false;
  private nextId = 0;

  /** 连续答对越多，数字越大（最多到 10） */
  private get maxN(): number {
    return Math.min(MAX_N, 5 + Math.floor(this.streak / 3));
  }

  protected begin(): void {
    // 等开场白读完再出题
    setTimeout(() => this.newRound(), 900);
  }

  protected repeat(): void {
    this.speech.say(this.question());
  }

  protected countThing(t: Thing): void {
    if (t.n || this.locked) return;
    const n = ++this.tapCount;
    this.things.update((list) => list.map((x) => (x === t ? { ...x, n } : x)));
    this.sound.tap();
    this.speech.say(COUNTING[n]);
  }

  protected choose(n: number): void {
    if (this.locked) return;
    if (n === this.answer) {
      this.locked = true;
      this.streak++;
      this.sound.good();
      this.celebration.confetti(20);
      this.speech.say(rightAnswer(n, this.item()));
      setTimeout(() => this.newRound(), 2400);
    } else {
      this.streak = Math.max(0, this.streak - 1);
      this.sound.bad();
      this.shaking.set(n);
      setTimeout(() => this.shaking.set(null), 400);
      this.speech.say(TRY_AGAIN);
    }
  }

  private newRound(): void {
    this.locked = false;
    this.tapCount = 0;
    this.answer = randInt(1, this.maxN);
    this.item.set(pick(ITEMS));
    this.things.set(Array.from({ length: this.answer }, () => ({ id: this.nextId++, n: null })));

    // 三个选项：正确答案 + 两个相近的数
    const opts = new Set([this.answer]);
    while (opts.size < 3) {
      const n = this.answer + pick([-2, -1, 1, 2]);
      if (n >= 1 && n <= MAX_N) opts.add(n);
    }
    this.options.set(shuffle([...opts]));
    this.speech.say(this.question());
  }
}
