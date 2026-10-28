import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  isDevMode,
  signal,
  viewChild,
} from '@angular/core';
import { Celebration } from '../../core/celebration';
import { pick } from '../../core/random';
import { Sound } from '../../core/sound';
import { Speech } from '../../core/speech';
import { GameShell } from '../../shared/game-shell';
import { Journey, Sfx } from './journey';
import { PARTS, PartKind, TRAY } from './parts';
import { Preview, thumbnails } from './preview';
import {
  ALMOST_ALL,
  CAUSES,
  CHOOSE_MISSION,
  CLEAR_CONFIRM,
  DISASTER_EMOJI,
  FREE_COMBOS,
  FREE_CRACKS,
  FREE_MODE,
  freeBrief,
  freePowers,
  Friend,
  FRIENDS,
  Mission,
  MISSIONS,
  nameLine,
  Place,
  principles,
  PLACE_EMOJI,
  PROBLEM_LINES,
  STICKER_BOOK,
  STICKER_ORDER,
  Sticker,
  STICKERS,
  STONES_OFF,
  STONES_ON,
  TERRAIN_EMOJI,
  THANKS,
  TRY_REAL_TOY,
  WOBBLY,
} from './rescue-data';
import { Outcome, simulate, Terrain } from './sim';
import { assemble, check, COLS, emptyGrid, Grid, ROWS, vehicleName } from './vehicle';

const STORAGE_KEY = 'kids-games.rescue.v1';

type Screen = 'map' | 'brief' | 'build' | 'run' | 'result' | 'book';
type Tool = PartKind | 'erase';

interface Progress {
  /** 每一关最好的星星 */
  stars: Record<number, number>;
  stickers: Sticker[];
  /** 每个朋友救了几次 */
  rescued: Partial<Record<Friend, number>>;
  /** 上一次拼的车（回来接着拼） */
  grid: Grid | null;
  /** 车库：最近出发过的几台车，新的在前 */
  garage: { grid: Grid; img: string }[];
}

const GARAGE_SIZE = 6;
const NEW_PROGRESS: Progress = { stars: {}, stickers: [], rescued: {}, grid: null, garage: [] };

interface Result {
  outcome: Outcome;
  sticker: Sticker | null;
  /** 第几次因为同一个原因失败（1 起） */
  tries: number;
}

/** 起步时网格里就放好一辆最简单的车：车尾 + 轮子 + 车头 */
function starterGrid(): Grid {
  const g = emptyGrid();
  g[1][1] = 'truckTail';
  g[1][2] = 'wheels';
  g[1][3] = 'truckCab';
  return g;
}

@Component({
  selector: 'app-rescue',
  imports: [GameShell],
  templateUrl: './rescue.html',
  styleUrl: './rescue.scss',
})
export class Rescue {
  private readonly sound = inject(Sound);
  private readonly speech = inject(Speech);
  private readonly celebration = inject(Celebration);
  private readonly previewCanvas = viewChild<ElementRef<HTMLCanvasElement>>('preview');
  private readonly stageCanvas = viewChild.required<ElementRef<HTMLCanvasElement>>('stage');
  private readonly gridEl = viewChild<ElementRef<HTMLElement>>('board');

  protected readonly missions = MISSIONS;
  protected readonly friends = FRIENDS;
  protected readonly friendKeys = Object.keys(FRIENDS) as Friend[];
  protected readonly stickers = STICKERS;
  protected readonly stickerOrder = STICKER_ORDER;
  protected readonly terrainEmoji = TERRAIN_EMOJI;
  protected readonly disasterEmoji = DISASTER_EMOJI;
  protected readonly placeEmoji = PLACE_EMOJI;
  protected readonly tray = TRAY;
  protected readonly rows = [...Array(ROWS).keys()];
  protected readonly cols = [...Array(COLS).keys()];
  protected readonly parts = PARTS;

  protected readonly screen = signal<Screen>('map');
  protected readonly mission = signal<Mission>(MISSIONS[0]);
  protected readonly grid = signal<Grid>(starterGrid());
  protected readonly tool = signal<Tool>('wheels');
  protected readonly thumbs = signal<Record<string, string>>({});
  protected readonly progress = signal<Progress>(NEW_PROGRESS);
  protected readonly result = signal<Result | null>(null);
  protected readonly tug = signal<number | null>(null);
  /** 出问题的格子闪一闪 */
  protected readonly bad = signal<Set<string>>(new Set());
  /** 提示到第三级时，零件盘里这些零件闪光 */
  protected readonly glow = signal<Set<PartKind>>(new Set());
  protected readonly confirmClear = signal(false);

  protected readonly vehicle = computed(() => assemble(this.grid()));
  /** 地图、贴纸本、拼装是整页的，把 3D 场面整个盖住 */
  private readonly covered = computed(() => ['map', 'book', 'build'].includes(this.screen()));
  protected readonly checked = computed(() => check(this.grid()));
  protected readonly name = computed(() =>
    this.checked().problem ? '' : vehicleName(this.vehicle()),
  );

  private preview: Preview | null = null;
  private journey: Journey | null = null;
  /** 同一关同一个原因失败了几次：决定提示到第几级 */
  private fails = new Map<string, number>();
  private painting: { pointer: number; last: string; toggle: string | null } | null = null;
  private badTimer = 0;
  private confirmTimer = 0;
  private lines: number[] = [];
  private destroyed = false;

  constructor() {
    this.progress.set(this.load());
    const saved = this.progress().grid;
    if (saved?.length === ROWS && saved.every((r) => r.length === COLS)) this.grid.set(saved);

    afterNextRender(() => {
      this.thumbs.set(thumbnails());
      this.journey = new Journey(this.stageCanvas().nativeElement, {
        say: (t) => this.speech.say(t),
        tug: (r) => this.tug.set(r),
        sfx: (k) => this.sfx(k),
      });
      this.journey.setup(this.vehicle(), this.mission());
      this.journey.paused = this.covered();
      // 开发模式下给测试脚本用：rescueJourney.timeScale = 3 可以让动画快一点
      if (isDevMode()) Object.assign(window, { rescue: this, rescueJourney: this.journey });
    });

    // 拼装画面出现时建转台，离开时拆掉
    effect(() => {
      const el = this.previewCanvas()?.nativeElement;
      if (el && !this.preview) {
        this.preview = new Preview(el);
        this.preview.setVehicle(this.vehicle());
      } else if (!el && this.preview) {
        this.preview.dispose();
        this.preview = null;
      }
    });
    effect(() => {
      const v = this.vehicle();
      const bad = [...this.bad()].map((k) => k.split(',').map(Number) as [number, number]);
      this.preview?.setVehicle(v, bad);
    });
    // 场面被盖住的时候不用画
    effect(() => {
      const covered = this.covered();
      if (this.journey) this.journey.paused = covered;
    });

    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      clearTimeout(this.badTimer);
      clearTimeout(this.confirmTimer);
      this.lines.forEach(clearTimeout);
      this.preview?.dispose();
      this.journey?.dispose();
    });
  }

  // ---------------------------------------------------------------- 地图

  protected start(): void {
    this.later(1600, () => this.speech.say(CHOOSE_MISSION));
  }

  protected stars(id: number): number {
    return this.progress().stars[id] ?? 0;
  }

  protected unlocked(id: number): boolean {
    return id === 1 || this.stars(id - 1) > 0;
  }

  protected openMission(m: Mission): void {
    if (!this.unlocked(m.id)) {
      this.sound.bad();
      return;
    }
    this.sound.tap();
    this.mission.set(m);
    this.showBrief();
  }

  protected openFree(): void {
    this.sound.tap();
    this.speech.say(FREE_MODE);
    this.rollFree();
    this.later(900, () => this.showBrief());
  }

  /** 🎲：随机抽地形、灾害和朋友 */
  protected rollFree(): void {
    this.sound.flip();
    const terrain = pick<Terrain>(['land', 'ocean', 'coast']);
    const disaster = pick(FREE_COMBOS[terrain]);
    const friend = pick(this.friendKeys);
    const high = terrain === 'land' && Math.random() < 0.35;
    const place: Place =
      terrain === 'ocean'
        ? pick<Place>(['island', 'iceberg', 'raft'])
        : terrain === 'coast'
          ? 'island'
          : high
            ? pick<Place>(['tree', 'roof'])
            : pick<Place>(['field', 'barn']);
    this.mission.set({
      id: 0,
      terrain,
      disaster,
      power: pick(freePowers(terrain, disaster)),
      spot: terrain === 'ocean' ? 'water' : high ? 'high' : 'ground',
      crack: disaster === 'quake' && !high ? pick(FREE_CRACKS) : 0,
      friend,
      place,
      brief: freeBrief(friend),
    });
    if (this.screen() === 'brief') {
      this.journey?.setup(this.vehicle(), this.mission());
      this.speech.say(this.mission().brief);
    }
  }

  protected openBook(): void {
    this.sound.tap();
    this.speech.say(STICKER_BOOK);
    this.screen.set('book');
  }

  protected saySticker(s: Sticker): void {
    if (!this.progress().stickers.includes(s)) {
      this.sound.bad();
      return;
    }
    this.sound.tap();
    this.speech.say(STICKERS[s].line);
  }

  protected toMap(): void {
    this.sound.tap();
    this.result.set(null);
    this.screen.set('map');
  }

  private showBrief(): void {
    this.screen.set('brief');
    this.journey?.setup(this.vehicle(), this.mission());
    this.speech.say(this.mission().brief);
  }

  // ---------------------------------------------------------------- 拼装

  protected toBuild(): void {
    this.sound.good();
    this.screen.set('build');
    this.updateGlow();
  }

  protected choose(tool: Tool): void {
    this.sound.tap();
    this.tool.set(tool);
    if (tool !== 'erase') this.speech.say(PARTS[tool].name);
  }

  protected onGridDown(e: PointerEvent): void {
    const cell = this.cellAt(e);
    if (!cell) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const [r, c] = cell;
    const here = this.grid()[r][c];
    // 已经放了自卸斗的格子，再用自卸斗点一下：装石头 / 倒掉
    const toggle =
      this.tool() === 'dumper' && (here === 'dumper' || here === 'dumperFull') ? `${r},${c}` : null;
    this.painting = { pointer: e.pointerId, last: `${r},${c}`, toggle };
    if (!toggle) this.paint(r, c);
  }

  protected onGridMove(e: PointerEvent): void {
    const p = this.painting;
    if (!p || p.pointer !== e.pointerId) return;
    const cell = this.cellAt(e);
    if (!cell || `${cell[0]},${cell[1]}` === p.last) return;
    // 手指划出去了，不算点
    if (p.toggle) {
      const [r, c] = p.toggle.split(',').map(Number);
      p.toggle = null;
      this.paint(r, c);
    }
    p.last = `${cell[0]},${cell[1]}`;
    this.paint(cell[0], cell[1]);
  }

  protected onGridUp(e: PointerEvent): void {
    const p = this.painting;
    if (!p || p.pointer !== e.pointerId) return;
    this.painting = null;
    if (p.toggle) {
      const [r, c] = p.toggle.split(',').map(Number);
      const full = this.grid()[r][c] === 'dumper';
      this.set(r, c, full ? 'dumperFull' : 'dumper');
      this.sound.pop();
      this.speech.say(full ? STONES_ON : STONES_OFF);
    }
  }

  private cellAt(e: PointerEvent): [number, number] | null {
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-cell]');
    if (!el || !this.gridEl()?.nativeElement.contains(el)) return null;
    const [r, c] = el.dataset['cell']!.split(',').map(Number);
    return [r, c];
  }

  private paint(r: number, c: number): void {
    const tool = this.tool();
    const kind = tool === 'erase' ? null : tool;
    const here = this.grid()[r][c];
    if (here === kind || (kind === 'dumper' && here === 'dumperFull')) return;
    if (!here && !kind) return;
    this.set(r, c, kind);
    if (kind) {
      // 咔嗒：吸上了
      this.sound.tone(1200, { dur: 0.04, type: 'square', vol: 0.08 });
      this.sound.tone(700 + r * 60, { dur: 0.1, type: 'triangle', vol: 0.16, when: 0.03 });
    } else {
      this.sound.tone(500, { dur: 0.1, type: 'triangle', vol: 0.12, slide: -250 });
    }
  }

  private set(r: number, c: number, kind: PartKind | null): void {
    const g = this.grid().map((row) => row.slice());
    g[r][c] = kind;
    this.grid.set(g);
    this.saveSoon();
  }

  protected clearAll(): void {
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
    this.grid.set(emptyGrid());
    this.saveSoon();
  }

  protected isBad(r: number, c: number): boolean {
    return this.bad().has(`${r},${c}`);
  }

  // ---------------------------------------------------------------- 出发

  protected go(): void {
    const { problem, cells } = this.checked();
    if (problem) {
      this.sound.bad();
      this.speech.say(PROBLEM_LINES[problem]);
      this.bad.set(new Set(cells.map(([r, c]) => `${r},${c}`)));
      clearTimeout(this.badTimer);
      this.badTimer = setTimeout(() => this.bad.set(new Set()), 1600);
      return;
    }
    this.park();
    void this.run();
  }

  /** 出发的车停进车库（一样的车只留一台），最多留 GARAGE_SIZE 台 */
  private park(): void {
    const img = this.preview?.snapshot();
    if (!img) return;
    const key = JSON.stringify(this.grid());
    const garage = [
      { grid: this.grid(), img },
      ...this.progress().garage.filter((g) => JSON.stringify(g.grid) !== key),
    ].slice(0, GARAGE_SIZE);
    this.progress.update((p) => ({ ...p, garage }));
    this.save();
  }

  /** 从车库里开出一台 */
  protected unpark(grid: Grid): void {
    this.sound.good();
    this.grid.set(grid.map((row) => row.slice()));
    const { problem } = check(grid);
    if (!problem) this.speech.say(nameLine(vehicleName(assemble(grid))));
    this.saveSoon();
  }

  private async run(): Promise<void> {
    const journey = this.journey;
    if (!journey) return;
    const m = this.mission();
    const v = this.vehicle();
    const outcome = simulate(v, m);
    this.speech.say(nameLine(this.name()));
    this.screen.set('run');
    journey.setup(v, m);
    await new Promise((r) => setTimeout(r, 1500));
    if (this.destroyed) return;
    await journey.run(m, outcome);
    if (!this.destroyed) this.finish(m, outcome);
  }

  private finish(m: Mission, o: Outcome): void {
    const key = `${m.id}:${m.terrain}:${m.disaster}:${o.cause}`;
    const tries = o.cause ? (this.fails.get(key) ?? 0) + 1 : 0;
    if (o.cause) this.fails.set(key, tries);
    let sticker: Sticker | null = null;
    const p = { ...this.progress(), stars: { ...this.progress().stars } };
    if (o.ok) {
      // 这一关的失败记录清掉，提示从头开始
      for (const k of [...this.fails.keys()]) if (k.startsWith(`${m.id}:`)) this.fails.delete(k);
      if (m.id) p.stars[m.id] = Math.max(p.stars[m.id] ?? 0, o.stars);
      p.rescued = { ...p.rescued, [m.friend]: (p.rescued[m.friend] ?? 0) + 1 };
      sticker = principles(o, m).find((s) => !p.stickers.includes(s)) ?? null;
      if (sticker) p.stickers = [...p.stickers, sticker];
      this.progress.set(p);
      this.save();
    }
    this.result.set({ outcome: o, sticker, tries });
    this.screen.set('result');

    if (o.ok) {
      this.celebration.celebrate(THANKS);
      if (sticker) this.later(2200, () => this.speech.say(STICKERS[sticker].line));
      else if (o.stars === 2) this.later(2200, () => this.speech.say(WOBBLY));
      if (m.id && o.stars === 3 && !sticker) this.later(2200, () => this.speech.say(TRY_REAL_TOY));
    } else {
      const info = CAUSES[o.cause!];
      // 第一次只说发生了什么（演出里说过了），第二次起问一个问题
      if (tries >= 2) this.later(300, () => this.speech.say(info.ask));
      else this.later(300, () => this.speech.say(ALMOST_ALL));
    }
  }

  protected hintParts(r: Result): PartKind[] {
    return r.outcome.cause ? CAUSES[r.outcome.cause].parts : [];
  }

  protected retry(): void {
    this.sound.good();
    this.result.set(null);
    this.screen.set('build');
    this.updateGlow();
  }

  protected next(): void {
    const m = this.mission();
    const n = MISSIONS.find((x) => x.id === m.id + 1);
    this.result.set(null);
    if (n) {
      this.sound.tap();
      this.mission.set(n);
      this.showBrief();
    } else this.toMap();
  }

  protected again(): void {
    this.sound.good();
    this.result.set(null);
    void this.run();
  }

  /** 第三次因为同一个原因失败：零件盘里有帮助的零件闪光 */
  private updateGlow(): void {
    const m = this.mission();
    const glow = new Set<PartKind>();
    for (const [key, n] of this.fails) {
      if (n < 3 || !key.startsWith(`${m.id}:${m.terrain}:${m.disaster}:`)) continue;
      const cause = key.split(':')[3] as keyof typeof CAUSES;
      CAUSES[cause].parts.forEach((p) => glow.add(p));
    }
    this.glow.set(glow);
  }

  private sfx(kind: Sfx): void {
    const s = this.sound;
    switch (kind) {
      case 'go':
        s.good();
        break;
      case 'wind':
        s.tone(180, { dur: 2.5, type: 'sawtooth', vol: 0.06, slide: 120 });
        s.tone(240, { dur: 2.5, type: 'triangle', vol: 0.06, slide: -100, when: 0.6 });
        break;
      case 'rumble':
        s.tone(70, { dur: 2.4, type: 'sawtooth', vol: 0.14, slide: -30 });
        break;
      case 'splash':
        s.tone(900, { dur: 0.25, type: 'triangle', vol: 0.12, slide: -700 });
        break;
      case 'whoosh':
        s.tone(300, { dur: 0.6, type: 'triangle', vol: 0.12, slide: 500 });
        break;
      case 'crash':
        s.bad();
        s.pop();
        break;
      case 'boing':
        s.tone(220, { dur: 0.3, type: 'sine', vol: 0.2, slide: 300 });
        break;
      case 'hop':
        s.flip();
        break;
      case 'pop':
        s.pop();
        break;
    }
  }

  private later(ms: number, fn: () => void): void {
    this.lines.push(setTimeout(fn, ms));
  }

  // ---------------------------------------------------------------- 存档

  private load(): Progress {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return { ...NEW_PROGRESS, ...JSON.parse(raw) };
    } catch {
      // 读不了就从头开始
    }
    return NEW_PROGRESS;
  }

  private saveTimer = 0;
  private saveSoon(): void {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.save(), 400);
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...this.progress(), grid: this.grid() }));
    } catch {
      // 存不了就只在这次有效
    }
  }
}
