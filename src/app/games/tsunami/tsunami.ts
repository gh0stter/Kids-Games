import {
  afterNextRender,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Celebration } from '../../core/celebration';
import { pick } from '../../core/random';
import { Sound } from '../../core/sound';
import { Speech } from '../../core/speech';
import { GameShell } from '../../shared/game-shell';
import { ITEM_TOOLS } from './models';
import {
  ALL_SAFE,
  EVENT_EMOJI,
  EVENT_LINES,
  EVENTS,
  floorLine,
  randomWaveHeight,
  REBUILD,
  SOME_LOST,
  TAIPEI,
  TAIPEI_101,
  BLOCKED,
  CLEAR_CONFIRM,
  CLEARED,
  waveLine,
} from './tsunami-data';
import { Tool, WaveResult, World } from './world';

type Phase = 'build' | 'event' | 'wave' | 'result';

@Component({
  selector: 'app-tsunami',
  imports: [GameShell],
  templateUrl: './tsunami.html',
  styleUrl: './tsunami.scss',
})
export class Tsunami {
  private readonly sound = inject(Sound);
  private readonly speech = inject(Speech);
  private readonly celebration = inject(Celebration);
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly label = viewChild.required<ElementRef<HTMLElement>>('label');

  protected readonly tools: { tool: Tool; emoji: string; name: string }[] = [
    { tool: 'build', emoji: '🧱', name: '盖楼' },
    { tool: 'road', emoji: '🛣️', name: '修路' },
    ...ITEM_TOOLS.map(({ kind, emoji, name }) => ({ tool: kind, emoji, name })),
    { tool: 'remove', emoji: '🧹', name: '拆掉' },
  ];
  protected readonly tool = signal<Tool>('build');
  protected readonly phase = signal<Phase>('build');
  protected readonly caption = signal('');
  protected readonly result = signal<WaveResult | null>(null);

  /** 清空要连按两次：第一次按下后变红，3 秒内再按才清空 */
  protected readonly confirmClear = signal(false);

  private world: World | null = null;
  private lastSpoken = 0;
  private confirmTimer = 0;

  constructor() {
    afterNextRender(() => {
      this.world = new World(this.canvas().nativeElement, {
        floor: (h) => this.onFloor(h),
        taipei: () => this.celebration.celebrate(TAIPEI),
        label: (pos, h) => this.moveLabel(pos, h),
        collapse: () => this.sound.pop(),
        blocked: () => this.speech.say(BLOCKED),
      });
    });
    inject(DestroyRef).onDestroy(() => this.world?.dispose());
  }

  protected choose(tool: Tool): void {
    this.sound.tap();
    this.tool.set(tool);
    this.world?.setTool(tool);
  }

  protected rotate(step: number): void {
    this.sound.tap();
    this.world?.rotate(step);
  }

  protected clear(): void {
    if (!this.confirmClear()) {
      this.sound.tap();
      this.speech.say(CLEAR_CONFIRM);
      this.confirmClear.set(true);
      this.confirmTimer = setTimeout(() => this.confirmClear.set(false), 3000);
      return;
    }
    clearTimeout(this.confirmTimer);
    this.confirmClear.set(false);
    this.sound.pop();
    this.speech.say(CLEARED);
    this.world?.clear();
  }

  /** 🌊：随机来一个事件，再来一道随机高度的海啸 */
  protected async tsunami(): Promise<void> {
    const world = this.world;
    if (!world || this.phase() !== 'build') return;
    world.setEnabled(false);
    const kind = pick(EVENTS);
    const dir = world.randomDir();
    const height = randomWaveHeight();

    this.phase.set('event');
    this.caption.set(`${EVENT_EMOJI[kind]} ${EVENT_LINES[kind]}`);
    this.speech.say(EVENT_LINES[kind]);
    this.sound.tone(80, { dur: 1.6, type: 'sawtooth', vol: 0.12, slide: -40 });
    await world.playEvent(kind, dir);

    this.phase.set('wave');
    this.caption.set(`🌊 ${waveLine(height)}`);
    this.speech.say(waveLine(height));
    this.sound.tone(120, { dur: 2.5, type: 'triangle', vol: 0.15, slide: -60 });
    const result = await world.runWave(height, dir);

    this.result.set(result);
    this.phase.set('result');
    if (result.lost === 0) this.celebration.celebrate(ALL_SAFE);
    else this.speech.say(SOME_LOST);
  }

  protected rebuild(): void {
    this.sound.good();
    this.speech.say(REBUILD);
    this.world?.rebuild();
    this.result.set(null);
    this.phase.set('build');
    // 等磁力片都飞回去再能盖
    setTimeout(() => this.world?.setEnabled(true), 1500);
  }

  private onFloor(height: number): void {
    if (!height) {
      this.sound.tap();
      return;
    }
    // 越高音越高
    this.sound.tone(240 + Math.min(height, TAIPEI_101) * 7, {
      dur: 0.08,
      type: 'triangle',
      vol: 0.14,
    });
    // 按住快速盖的时候不要每层都读，5 的倍数和 101 一定读
    const now = performance.now();
    if (now - this.lastSpoken > 450 || height % 5 === 0 || height === TAIPEI_101) {
      if (height !== TAIPEI_101) this.speech.say(floorLine(height));
      this.lastSpoken = now;
    }
  }

  private moveLabel(pos: { x: number; y: number } | null, height: number): void {
    const el = this.label().nativeElement;
    if (!pos || this.phase() !== 'build') {
      el.style.opacity = '0';
      return;
    }
    el.style.opacity = '1';
    el.style.transform = `translate(${pos.x}px, ${pos.y}px) translate(-50%, -100%)`;
    const text = String(height);
    if (el.textContent !== text) el.textContent = text;
  }
}
