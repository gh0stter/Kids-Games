import { Component, DestroyRef, ElementRef, inject, signal, viewChild } from '@angular/core';
import { Celebration } from '../../core/celebration';
import { pick, rand } from '../../core/random';
import { Sound } from '../../core/sound';
import { Speech } from '../../core/speech';
import { GameShell } from '../../shared/game-shell';
import { isMilestone, milestoneLine, scoreLine } from './balloon-data';

interface BalloonItem {
  id: number;
  color: string;
  face: string;
  x: number;
  y: number;
  /** 上升速度（像素/秒），慢一点方便小朋友点 */
  speed: number;
  wobble: number;
}

interface Burst {
  id: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
  char: string;
}

const COLORS = [
  'var(--red)',
  'var(--orange)',
  'var(--yellow)',
  'var(--green)',
  'var(--blue)',
  'var(--purple)',
  'var(--pink)',
];
const FACES = ['', '', '', '😊', '⭐', '🐱', '🐶', '🐰'];
const MAX_BALLOONS = 7;
const BALLOON_W = 130;
const BALLOON_H = 160;

@Component({
  selector: 'app-balloon',
  imports: [GameShell],
  templateUrl: './balloon.html',
  styleUrl: './balloon.scss',
})
export class Balloon {
  private readonly sound = inject(Sound);
  private readonly speech = inject(Speech);
  private readonly celebration = inject(Celebration);
  private readonly sky = viewChild.required<ElementRef<HTMLElement>>('sky');

  protected readonly balloons = signal<BalloonItem[]>([]);
  protected readonly bursts = signal<Burst[]>([]);
  protected readonly score = signal(0);

  private nextId = 0;
  private raf = 0;
  private last = 0;
  private spawnTimer = 0;

  constructor() {
    inject(DestroyRef).onDestroy(() => cancelAnimationFrame(this.raf));
  }

  protected start(): void {
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  protected transform(b: BalloonItem): string {
    return `translate(${b.x + Math.sin(b.wobble) * 14}px, ${b.y}px)`;
  }

  protected pop(b: BalloonItem, event: Event): void {
    event.preventDefault();
    this.balloons.update((list) => list.filter((x) => x !== b));
    this.burst(b.x + BALLOON_W / 2, b.y + BALLOON_H / 2);
    this.sound.pop();

    const score = this.score() + 1;
    this.score.set(score);
    if (isMilestone(score)) this.celebration.celebrate(milestoneLine(score));
    else this.speech.say(scoreLine(score));
  }

  private frame(t: number): void {
    const dt = this.last ? Math.min(0.05, (t - this.last) / 1000) : 0;
    this.last = t;
    const { clientWidth: w, clientHeight: h } = this.sky().nativeElement;

    let list = this.balloons();
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && list.length < MAX_BALLOONS) {
      list = [...list, this.spawn(w, h)];
      this.spawnTimer = rand(0.7, 1.4);
    }
    for (const b of list) {
      b.y -= b.speed * dt;
      b.wobble += dt * 2;
    }
    this.balloons.set(list.filter((b) => b.y > -260));
    this.raf = requestAnimationFrame((next) => this.frame(next));
  }

  private spawn(w: number, h: number): BalloonItem {
    return {
      id: this.nextId++,
      color: pick(COLORS),
      face: pick(FACES),
      x: rand(10, Math.max(10, w - BALLOON_W - 10)),
      y: h + 20,
      speed: rand(70, 140),
      wobble: rand(0, Math.PI * 2),
    };
  }

  private burst(cx: number, cy: number): void {
    const parts: Burst[] = [];
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      parts.push({
        id: this.nextId++,
        x: cx - 20,
        y: cy - 20,
        dx: Math.cos(ang) * 110,
        dy: Math.sin(ang) * 110,
        char: pick(['✨', '⭐', '💥']),
      });
    }
    this.bursts.update((list) => [...list, ...parts]);
    setTimeout(() => this.bursts.update((list) => list.filter((p) => !parts.includes(p))), 550);
  }
}
