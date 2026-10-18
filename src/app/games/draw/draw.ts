import { afterNextRender, Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { Sound } from '../../core/sound';
import { Speech } from '../../core/speech';
import { GameShell } from '../../shared/game-shell';
import { CLEARED, PEN_NAMES } from './draw-data';

interface Point {
  x: number;
  y: number;
}

/** 画纸颜色（橡皮擦也是画这个颜色） */
const BACKGROUND = '#fffdf4';

@Component({
  selector: 'app-draw',
  imports: [GameShell],
  templateUrl: './draw.html',
  styleUrl: './draw.scss',
  host: { '(window:resize)': 'resize()' },
})
export class Draw {
  private readonly sound = inject(Sound);
  private readonly speech = inject(Speech);
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');

  protected readonly colors = [
    '#ff5a5f',
    '#ff9f1c',
    '#ffd23f',
    '#3bceac',
    '#3a86ff',
    '#9b5de5',
    '#f15bb5',
    '#8d5524',
    '#222222',
  ];
  protected readonly sizes = [8, 18, 40];
  /** 颜色值，或者 'rainbow' / 'eraser' */
  protected readonly pen = signal<string>(this.colors[0]);
  protected readonly size = signal(18);

  private ctx!: CanvasRenderingContext2D;
  private hue = 0;
  /** 每根手指上一次的位置，支持多指同时画 */
  private readonly strokes = new Map<number, Point>();

  constructor() {
    afterNextRender(() => {
      this.ctx = this.canvas().nativeElement.getContext('2d')!;
      this.resize();
    });
  }

  protected choosePen(pen: string): void {
    this.sound.tap();
    this.pen.set(pen);
    const name = PEN_NAMES[pen];
    if (name) this.speech.say(name);
  }

  protected chooseSize(size: number): void {
    this.sound.tap();
    this.size.set(size);
  }

  protected clear(): void {
    const c = this.canvas().nativeElement;
    this.ctx.save();
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.fillStyle = BACKGROUND;
    this.ctx.fillRect(0, 0, c.width, c.height);
    this.ctx.restore();
    this.sound.pop();
    this.speech.say(CLEARED);
  }

  protected resize(): void {
    if (!this.ctx) return;
    const c = this.canvas().nativeElement;
    // 改尺寸会清空画布，先把已画的内容存起来
    const old = document.createElement('canvas');
    old.width = c.width;
    old.height = c.height;
    old.getContext('2d')!.drawImage(c, 0, 0);

    const dpr = devicePixelRatio || 1;
    const r = c.getBoundingClientRect();
    c.width = r.width * dpr;
    c.height = r.height * dpr;
    this.ctx.fillStyle = BACKGROUND;
    this.ctx.fillRect(0, 0, c.width, c.height);
    this.ctx.drawImage(old, 0, 0);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
  }

  protected down(e: PointerEvent): void {
    this.canvas().nativeElement.setPointerCapture(e.pointerId);
    const p = this.pos(e);
    this.strokes.set(e.pointerId, p);
    this.line(p, { x: p.x + 0.1, y: p.y });
  }

  protected move(e: PointerEvent): void {
    let prev = this.strokes.get(e.pointerId);
    if (!prev) return;
    // iPad 上用合并事件，画出来的线更顺滑
    for (const ce of e.getCoalescedEvents?.() ?? [e]) {
      const p = this.pos(ce);
      this.line(prev, p);
      prev = p;
    }
    this.strokes.set(e.pointerId, prev);
  }

  protected up(e: PointerEvent): void {
    this.strokes.delete(e.pointerId);
  }

  private pos(e: PointerEvent): Point {
    const r = this.canvas().nativeElement.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private line(a: Point, b: Point): void {
    const pen = this.pen();
    if (pen === 'rainbow') this.hue = (this.hue + 4) % 360;
    this.ctx.strokeStyle =
      pen === 'eraser' ? BACKGROUND : pen === 'rainbow' ? `hsl(${this.hue},90%,55%)` : pen;
    this.ctx.lineWidth = pen === 'eraser' ? this.size() * 2 : this.size();
    this.ctx.beginPath();
    this.ctx.moveTo(a.x, a.y);
    this.ctx.lineTo(b.x, b.y);
    this.ctx.stroke();
  }
}
