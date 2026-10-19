import { Component, computed, inject } from '@angular/core';
import { PlayTime } from '../core/play-time';
import { WARN_SECONDS } from '../core/play-time-lines';

/** 左上角（回家按钮旁边）的游玩时间倒计时；家长设置了每天限时才显示 */
@Component({
  selector: 'app-time-left',
  template: `
    @if (text(); as t) {
      <div class="time paper" [class.last]="lastMinute()">⏳ {{ t }}</div>
    }
  `,
  styles: `
    .time {
      position: fixed;
      top: calc(env(safe-area-inset-top) + 24px);
      left: calc(env(safe-area-inset-left) + 100px);
      z-index: 120;
      padding: 6px 16px;
      border-radius: 999px;
      font-size: 24px;
      font-variant-numeric: tabular-nums;
      pointer-events: none;

      /* 最后一分钟：变红、一跳一跳 */
      &.last {
        background: var(--red);
        color: #fff;
        box-shadow: 0 6px 0 #c95a5a;
        animation: pulse 1s ease-in-out infinite;
      }
    }

    @keyframes pulse {
      50% {
        transform: scale(1.12);
      }
    }
  `,
})
export class TimeLeft {
  private readonly playTime = inject(PlayTime);

  protected readonly text = computed(() => {
    const left = this.playTime.remaining();
    if (!Number.isFinite(left) || left <= 0) return '';
    const s = Math.ceil(left);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  });
  protected readonly lastMinute = computed(() => this.playTime.remaining() <= WARN_SECONDS);
}
