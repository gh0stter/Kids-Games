import { Component, inject, signal, WritableSignal } from '@angular/core';
import { Celebration } from '../../core/celebration';
import { shuffle } from '../../core/random';
import { Sound } from '../../core/sound';
import { Speech } from '../../core/speech';
import { GameShell } from '../../shared/game-shell';
import { ALL_FOUND, Animal, ANIMALS } from './memory-data';

type CardState = 'closed' | 'open' | 'matched';

interface Card {
  id: number;
  animal: Animal;
  state: WritableSignal<CardState>;
}

/** 关卡：配对数、列数 */
const LEVELS = [
  { pairs: 3, cols: 3 },
  { pairs: 4, cols: 4 },
  { pairs: 6, cols: 4 },
];
const GAP = 22;

@Component({
  selector: 'app-memory',
  imports: [GameShell],
  templateUrl: './memory.html',
  styleUrl: './memory.scss',
})
export class Memory {
  private readonly sound = inject(Sound);
  private readonly speech = inject(Speech);
  private readonly celebration = inject(Celebration);

  protected readonly cards = signal<Card[]>([]);
  protected readonly cols = signal(3);
  protected readonly size = signal(200);
  protected readonly gap = GAP;

  private level = 0;
  private open: Card[] = [];
  private matched = 0;
  private nextId = 0;

  protected newGame(): void {
    const { pairs, cols } = LEVELS[Math.min(this.level, LEVELS.length - 1)];
    const rows = Math.ceil((pairs * 2) / cols);
    // 根据屏幕大小算卡片尺寸，横竖屏都能放下
    const size = Math.min(
      (innerWidth - 60 - (cols - 1) * GAP) / cols,
      (innerHeight - 130 - (rows - 1) * GAP) / rows,
      220,
    );
    this.cols.set(cols);
    this.size.set(size);
    this.open = [];
    this.matched = 0;

    const chosen = shuffle(ANIMALS).slice(0, pairs);
    this.cards.set(
      shuffle([...chosen, ...chosen]).map((animal) => ({
        id: this.nextId++,
        animal,
        state: signal<CardState>('closed'),
      })),
    );
  }

  protected flip(card: Card): void {
    if (this.open.length >= 2 || card.state() !== 'closed') return;
    card.state.set('open');
    this.sound.flip();
    this.speech.say(card.animal.name);
    this.open.push(card);
    if (this.open.length < 2) return;

    const [a, b] = this.open;
    if (a.animal === b.animal) {
      setTimeout(() => {
        a.state.set('matched');
        b.state.set('matched');
        this.open = [];
        this.sound.good();
        if (++this.matched === this.cards().length / 2) {
          this.celebration.celebrate(ALL_FOUND);
          this.level++;
          setTimeout(() => this.newGame(), 3000);
        }
      }, 500);
    } else {
      setTimeout(() => {
        a.state.set('closed');
        b.state.set('closed');
        this.open = [];
      }, 1300);
    }
  }
}
