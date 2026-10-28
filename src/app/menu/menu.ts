import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { pick } from '../core/random';
import { Sound } from '../core/sound';
import { Speech } from '../core/speech';
import { GAMES } from '../games';
import { SettingsButton } from '../shared/settings-button';
import { GREETINGS } from './menu-data';

@Component({
  selector: 'app-menu',
  imports: [RouterLink, SettingsButton],
  template: `
    <header class="paper">
      <span class="name-tag">今天也一起玩吧</span>
      <span class="leaf">🍃</span>宝贝游戏<span class="leaf flip">🍃</span>
    </header>

    <nav class="grid">
      @for (game of games; track game.path) {
        <a class="app" [routerLink]="['/', game.path]" (click)="sound.tap()">
          <span class="icon" [style.--c]="game.color">{{ game.emoji }}</span>
          <span class="label paper">{{ game.title }}</span>
        </a>
      }
    </nav>

    <div class="ground"></div>
    <div class="deco tree">🌳</div>
    <div class="deco flower">🌷</div>

    <button class="guide" (click)="greet()">
      <span class="bubble paper"><span class="name-tag">小狸</span>{{ greeting() }}</span>
      <span class="who">🦝</span>
    </button>

    <app-settings-button />
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      align-items: center;
      height: 100%;
      padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom)
        env(safe-area-inset-left);
    }

    header {
      position: relative;
      z-index: 2;
      margin-top: 34px;
      padding: 12px 44px 14px;
      border-radius: 999px / 70px 70px 90px 90px;
      font-size: 46px;
      letter-spacing: 4px;
      display: flex;
      align-items: center;
      gap: 14px;

      .name-tag {
        position: absolute;
        left: 28px;
        top: -18px;
        background: var(--orange);
        letter-spacing: 1px;
        transform: rotate(-4deg);
      }
    }

    .leaf {
      font-size: 36px;
      transform: rotate(-15deg);

      &.flip {
        transform: scaleX(-1) rotate(-15deg);
      }
    }

    .grid {
      position: relative;
      z-index: 2;
      flex: 1;
      width: 100%;
      /* 横屏一排 4 个：7 个游戏正好两排 */
      max-width: 1100px;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
      gap: 28px 32px;
      padding: 32px 32px 150px;
      align-content: center;
      justify-items: center;
      overflow-y: auto;
    }

    /* 像 NookPhone 的 app 图标 */
    .app {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      text-decoration: none;
      color: inherit;

      &:active .icon {
        transform: translateY(6px) scale(0.97);
        box-shadow: var(--bevel), var(--shadow-pressed);
      }
    }

    .icon {
      position: relative;
      width: 170px;
      height: 170px;
      border-radius: 34%;
      display: grid;
      place-items: center;
      background: color-mix(in srgb, var(--c) 72%, white);
      box-shadow: var(--bevel), var(--shadow);
      font-size: 94px;
      animation: wobble 3.2s ease-in-out infinite;

      /* 高光 */
      &::after {
        content: '';
        position: absolute;
        left: 24px;
        top: 16px;
        width: 52px;
        height: 20px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.45);
        transform: rotate(-20deg);
      }
    }

    @for $i from 2 through 8 {
      .app:nth-child(#{$i}) .icon {
        animation-delay: -#{($i - 1) * 0.6}s;
      }
    }

    .label {
      padding: 6px 22px;
      border-radius: 999px;
      font-size: 28px;
    }

    @keyframes wobble {
      0%,
      100% {
        transform: rotate(-2deg) translateY(0);
      }
      50% {
        transform: rotate(2deg) translateY(-6px);
      }
    }

    .deco {
      position: fixed;
      bottom: 70px;
      pointer-events: none;
    }

    .tree {
      left: calc(env(safe-area-inset-left) + 24px);
      font-size: 90px;
    }

    .flower {
      left: calc(env(safe-area-inset-left) + 124px);
      bottom: 76px;
      font-size: 60px;
    }

    .guide {
      position: fixed;
      right: calc(env(safe-area-inset-right) + 28px);
      bottom: calc(env(safe-area-inset-bottom) + 24px);
      z-index: 3;
      display: flex;
      align-items: flex-end;
      gap: 8px;
      padding: 0;
      background: none;

      &:active .who {
        transform: scale(0.9) rotate(-8deg);
      }
    }

    .bubble {
      position: relative;
      padding: 16px 24px 12px;
      border-radius: 40px 40px 40px 10px;
      font-size: 26px;
      white-space: nowrap;

      .name-tag {
        position: absolute;
        top: -16px;
        left: 18px;
        font-size: 18px;
      }
    }

    .who {
      font-size: 76px;
      line-height: 1;
      transition: transform 0.15s;
    }
  `,
})
export class Menu {
  protected readonly sound = inject(Sound);
  private readonly speech = inject(Speech);
  protected readonly games = GAMES;
  protected readonly greeting = signal(GREETINGS[0]);

  protected greet(): void {
    const text = pick(GREETINGS.filter((g) => g !== this.greeting()));
    this.greeting.set(text);
    this.speech.say(text);
  }
}
