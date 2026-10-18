import { Component, computed, inject, output, signal } from '@angular/core';
import { AppUpdate } from '../core/app-update';
import { PlayTime } from '../core/play-time';
import { randInt } from '../core/random';

const LIMIT_OPTIONS = [0, 15, 20, 30, 45, 60];

/** 家长设置：先答一道乘法题（小朋友答不出来），再显示设置 */
@Component({
  selector: 'app-settings-panel',
  template: `
    <div class="backdrop" (pointerdown)="$event.stopPropagation()">
      <div class="panel">
        <button class="close" aria-label="关闭" (click)="close.emit()">✕</button>

        @if (!unlocked()) {
          <h2>家长确认</h2>
          <p class="question">{{ a }} × {{ b }} = {{ input() || '?' }}</p>
          <div class="keypad">
            @for (k of keys; track k) {
              <button (click)="press(k)">{{ k }}</button>
            }
          </div>
        } @else {
          <h2>设置</h2>

          <section>
            <h3>每天游玩时间</h3>
            <div class="chips">
              @for (m of limitOptions; track m) {
                <button [class.on]="playTime.limit() === m" (click)="playTime.setLimit(m)">
                  {{ m ? m + ' 分钟' : '不限制' }}
                </button>
              }
            </div>
            <p class="note">{{ usage() }}</p>
            @if (playTime.limit()) {
              <div class="row">
                <button (click)="playTime.addBonus(10)">今天再玩 10 分钟</button>
                <button (click)="playTime.resetToday()">今天重新计时</button>
              </div>
            }
          </section>

          <section>
            <h3>版本更新</h3>
            <div class="row">
              <button [disabled]="busy()" (click)="check()">检查更新</button>
              <button [disabled]="busy()" (click)="forceReload()">强制刷新</button>
            </div>
            <p class="note">
              {{ status() || '强制刷新会清掉缓存，从服务器重新下载全部文件（需要连上家里的网络）' }}
            </p>
          </section>
        }
      </div>
    </div>
  `,
  styles: `
    .backdrop {
      position: fixed;
      inset: 0;
      z-index: 200;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      background: rgba(114, 93, 66, 0.45);
    }

    .panel {
      position: relative;
      width: min(560px, 100%);
      max-height: 100%;
      overflow-y: auto;
      padding: 28px 32px;
      border-radius: var(--radius);
      background: var(--paper);
      box-shadow: 0 8px 0 var(--paper-edge);
      font-size: 20px;
    }

    h2 {
      margin: 0 0 16px;
      text-align: center;
    }

    h3 {
      margin: 20px 0 10px;
      font-size: 20px;
    }

    .close {
      position: absolute;
      top: 12px;
      right: 12px;
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: #f1e8cf;
      font-size: 22px;
    }

    .question {
      margin: 0 0 16px;
      text-align: center;
      font-size: 44px;
      font-weight: 700;
    }

    .keypad {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;

      button {
        height: 64px;
        border-radius: 16px;
        background: #f1e8cf;
        font-size: 28px;
        font-weight: 700;

        &:active {
          background: #e7dcc0;
        }
      }
    }

    .chips,
    .row {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;

      button {
        padding: 10px 18px;
        border-radius: 999px;
        background: #f1e8cf;

        &.on {
          background: var(--green);
          color: #fff;
        }

        &:disabled {
          opacity: 0.5;
        }
      }
    }

    .note {
      margin: 10px 0;
      color: var(--ink-soft);
      font-size: 16px;
    }
  `,
})
export class SettingsPanel {
  protected readonly playTime = inject(PlayTime);
  private readonly appUpdate = inject(AppUpdate);
  readonly close = output<void>();

  protected readonly keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', 'OK'];
  protected readonly limitOptions = LIMIT_OPTIONS;
  protected readonly unlocked = signal(false);
  protected readonly input = signal('');
  protected readonly busy = signal(false);
  protected readonly status = signal('');
  protected a = 0;
  protected b = 0;

  constructor() {
    this.newQuestion();
  }

  protected readonly usage = computed(() => {
    const used = `今天玩了 ${this.playTime.usedMinutes()} 分钟`;
    if (!this.playTime.limit()) return used;
    return `${used}，还剩 ${Math.ceil(this.playTime.remaining() / 60)} 分钟`;
  });

  protected press(k: string): void {
    if (k === '⌫') this.input.update((s) => s.slice(0, -1));
    else if (k !== 'OK') this.input.update((s) => (s + k).slice(0, 3));
    else if (Number(this.input()) === this.a * this.b) this.unlocked.set(true);
    else this.newQuestion();
  }

  protected async check(): Promise<void> {
    this.busy.set(true);
    this.status.set('正在检查…');
    const result = await this.appUpdate.checkNow();
    this.status.set(
      {
        updating: '发现新版本，正在刷新…',
        latest: '已经是最新版本',
        offline: '连不上服务器，请检查网络',
        disabled: '开发模式下没有自动更新',
      }[result],
    );
    this.busy.set(false);
  }

  protected async forceReload(): Promise<void> {
    this.busy.set(true);
    this.status.set('正在刷新…');
    if ((await this.appUpdate.forceReload()) === 'offline') {
      this.status.set('连不上服务器，没有清缓存，请连上网络再试');
      this.busy.set(false);
    }
  }

  private newQuestion(): void {
    this.a = randInt(3, 9);
    this.b = randInt(6, 9);
    this.input.set('');
  }
}
