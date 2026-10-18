import { Component, signal } from '@angular/core';
import { SettingsPanel } from './settings-panel';

/** 和 .holding 的动画时长一致 */
const HOLD_MS = 1500;

/** 右上角的小齿轮：要按住 1.5 秒才打开，避免小朋友误点 */
@Component({
  selector: 'app-settings-button',
  imports: [SettingsPanel],
  template: `
    <button
      class="gear"
      [class.holding]="holding()"
      aria-label="家长设置（按住）"
      (pointerdown)="hold()"
      (pointerup)="cancel()"
      (pointerleave)="cancel()"
      (pointercancel)="cancel()"
      (contextmenu)="$event.preventDefault()"
    >
      ⚙️
    </button>
    @if (open()) {
      <app-settings-panel (close)="open.set(false)" />
    }
  `,
  styles: `
    .gear {
      position: fixed;
      top: calc(env(safe-area-inset-top) + 14px);
      right: calc(env(safe-area-inset-right) + 14px);
      z-index: 150;
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: var(--paper);
      box-shadow: 0 4px 0 var(--paper-edge);
      font-size: 28px;
      opacity: 0.5;
      transition: opacity 0.2s;

      /* 按住时转起来，松手前转满一圈就打开 */
      &.holding {
        opacity: 1;
        animation: spin 1.5s linear;
      }
    }

    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }
  `,
})
export class SettingsButton {
  protected readonly holding = signal(false);
  protected readonly open = signal(false);
  private timer = 0;

  protected hold(): void {
    this.holding.set(true);
    this.timer = setTimeout(() => {
      this.holding.set(false);
      this.open.set(true);
    }, HOLD_MS);
  }

  protected cancel(): void {
    clearTimeout(this.timer);
    this.holding.set(false);
  }
}
