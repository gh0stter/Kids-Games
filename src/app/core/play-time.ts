import { Injectable, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { TIME_UP, TIME_WARNING, WARN_SECONDS } from './play-time-lines';
import { Speech } from './speech';

interface Usage {
  /** 本地日期 YYYY-MM-DD，换天自动清零 */
  date: string;
  /** 今天在游戏里玩了多少秒 */
  seconds: number;
  /** 家长今天额外给的分钟数 */
  bonus: number;
}

const LIMIT_KEY = 'kids-games.dailyLimit';
const USAGE_KEY = 'kids-games.usage';

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 存不了就只在这次打开期间有效
  }
}

/**
 * 每日游玩时间限制。只在游戏页面、并且 iPad 屏幕上正在显示时计时（菜单不算）。
 * 时间到了回到菜单，App 会盖上休息画面，家长在设置里可以加时间。
 */
@Injectable({ providedIn: 'root' })
export class PlayTime {
  private readonly router = inject(Router);
  private readonly speech = inject(Speech);

  /** 每天能玩几分钟，0 = 不限制 */
  readonly limit = signal<number>(read(LIMIT_KEY, 0));
  private readonly usage = signal<Usage>(this.freshUsage(read(USAGE_KEY, null)));

  readonly usedMinutes = computed(() => Math.floor(this.usage().seconds / 60));
  /** 今天还剩多少秒；不限制时为 Infinity */
  readonly remaining = computed(() => {
    const limit = this.limit();
    if (!limit) return Infinity;
    const { seconds, bonus } = this.usage();
    return Math.max(0, (limit + bonus) * 60 - seconds);
  });
  readonly timeUp = computed(() => this.remaining() === 0);

  private inGame = false;

  start(): void {
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe((e) => {
      this.inGame = e.urlAfterRedirects !== '/';
    });
    setInterval(() => this.tick(), 1000);
  }

  setLimit(minutes: number): void {
    this.limit.set(minutes);
    write(LIMIT_KEY, minutes);
  }

  /** 家长给今天加时间 */
  addBonus(minutes: number): void {
    this.update((u) => ({ ...u, bonus: u.bonus + minutes }));
  }

  /** 今天重新计时 */
  resetToday(): void {
    this.update(() => this.freshUsage(null));
  }

  private tick(): void {
    // 换天了（比如 iPad 一直开着过了半夜）
    if (this.usage().date !== today()) this.resetToday();
    if (!this.inGame || document.visibilityState !== 'visible') return;
    // 家长把限制调低了，已经超时
    if (this.timeUp()) {
      void this.router.navigateByUrl('/');
      return;
    }

    const before = this.remaining();
    this.update((u) => ({ ...u, seconds: u.seconds + 1 }));
    const after = this.remaining();

    if (before > WARN_SECONDS && after <= WARN_SECONDS && after > 0) this.speech.say(TIME_WARNING);
    if (before > 0 && after === 0) {
      void this.router.navigateByUrl('/');
      this.speech.say(TIME_UP);
    }
  }

  private update(fn: (u: Usage) => Usage): void {
    this.usage.update(fn);
    write(USAGE_KEY, this.usage());
  }

  private freshUsage(saved: Usage | null): Usage {
    return saved?.date === today() ? saved : { date: today(), seconds: 0, bonus: 0 };
  }
}
