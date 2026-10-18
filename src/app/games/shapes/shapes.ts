import { Component, ElementRef, inject, signal, viewChildren, WritableSignal } from '@angular/core';
import { Celebration } from '../../core/celebration';
import { shuffle } from '../../core/random';
import { Sound } from '../../core/sound';
import { Speech } from '../../core/speech';
import { GameShell } from '../../shared/game-shell';
import { goneHome, ShapeDef, SHAPES, WRONG } from './shapes-data';

type PieceState = 'new' | 'idle' | 'dragging' | 'back' | 'done';

interface Piece {
  shape: ShapeDef;
  offset: WritableSignal<{ x: number; y: number }>;
  state: WritableSignal<PieceState>;
}

interface Slot {
  shape: ShapeDef;
  filled: boolean;
}

/** 形状中心离轮廓中心多近才算放进去（像素） */
const SNAP_DISTANCE = 120;

function center(el: Element): { x: number; y: number } {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

@Component({
  selector: 'app-shapes',
  imports: [GameShell],
  templateUrl: './shapes.html',
  styleUrl: './shapes.scss',
})
export class Shapes {
  private readonly sound = inject(Sound);
  private readonly speech = inject(Speech);
  private readonly celebration = inject(Celebration);
  private readonly slotEls = viewChildren('slot', { read: ElementRef });

  protected readonly slots = signal<Slot[]>([]);
  protected readonly pieces = signal<Piece[]>([]);

  private round = 0;
  private remaining = 0;
  private readonly dragStart = new Map<Piece, { x: number; y: number }>();

  protected newRound(): void {
    this.round++;
    const n = this.round <= 2 ? 3 : 4;
    const chosen = shuffle(SHAPES).slice(0, n);
    this.remaining = n;
    this.slots.set(chosen.map((shape) => ({ shape, filled: false })));
    this.pieces.set(
      shuffle(chosen).map((shape) => ({
        shape,
        offset: signal({ x: 0, y: 0 }),
        state: signal<PieceState>('new'),
      })),
    );
  }

  protected transform(p: Piece): string {
    const { x, y } = p.offset();
    return `translate(${x}px, ${y}px)${p.state() === 'dragging' ? ' scale(1.08)' : ''}`;
  }

  protected grab(p: Piece, e: PointerEvent): void {
    if (this.dragStart.has(p) || p.state() === 'done') return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    this.dragStart.set(p, { x: e.clientX, y: e.clientY });
    p.state.set('dragging');
    this.sound.tap();
    this.speech.say(p.shape.name);
  }

  protected move(p: Piece, e: PointerEvent): void {
    const start = this.dragStart.get(p);
    if (start) p.offset.set({ x: e.clientX - start.x, y: e.clientY - start.y });
  }

  protected drop(p: Piece, e: PointerEvent): void {
    const start = this.dragStart.get(p);
    if (!start) return;
    this.dragStart.delete(p);
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    const pc = center(e.currentTarget as Element);

    // 找最近的空轮廓
    let near: { slot: Slot; c: { x: number; y: number }; d: number } | null = null;
    const els = this.slotEls();
    for (const [i, slot] of this.slots().entries()) {
      if (slot.filled) continue;
      const c = center(els[i].nativeElement);
      const d = Math.hypot(c.x - pc.x, c.y - pc.y);
      if (!near || d < near.d) near = { slot, c, d };
    }

    if (near && near.d < SNAP_DISTANCE && near.slot.shape === p.shape) {
      // 放对了：吸附到轮廓上
      near.slot.filled = true;
      p.state.set('done');
      p.offset.set({ x: dx + near.c.x - pc.x, y: dy + near.c.y - pc.y });
      this.sound.good();
      this.speech.say(goneHome(p.shape));
      if (--this.remaining === 0) {
        setTimeout(() => {
          this.celebration.celebrate();
          setTimeout(() => this.newRound(), 2200);
        }, 600);
      }
    } else {
      if (near && near.d < SNAP_DISTANCE) {
        this.sound.bad();
        this.speech.say(WRONG);
      }
      p.state.set('back');
      p.offset.set({ x: 0, y: 0 });
    }
  }
}
