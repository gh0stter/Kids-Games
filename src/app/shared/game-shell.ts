import { Component, inject, input, output, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Sound } from '../core/sound';
import { Speech } from '../core/speech';
import { GameInfo } from '../games';

/**
 * 每个游戏的外壳：左上角回家按钮 + 开始画面。
 * 开始画面要点一下 ▶ 才开始，这一下同时解锁 iOS 的声音和语音。
 *
 * 用法：<app-game-shell (start)="start()"> 游戏内容 </app-game-shell>
 * 标题、图标、开场白从路由里的 GameInfo 读取。
 */
@Component({
  selector: 'app-game-shell',
  imports: [RouterLink],
  template: `
    <a class="home-btn paper" routerLink="/" (click)="sound.tap()" aria-label="回到菜单">🏠</a>
    @if (showStart() && !started()) {
      <div class="start-screen">
        <div class="big-icon" [style.--c]="game.color">{{ game.emoji }}</div>
        <h1 class="paper">{{ game.title }}</h1>
        <button class="play" aria-label="开始" (click)="begin()">▶</button>
      </div>
    }
    <ng-content />
  `,
  styles: `
    :host {
      display: contents;
    }

    .home-btn {
      position: fixed;
      top: calc(env(safe-area-inset-top) + 14px);
      left: calc(env(safe-area-inset-left) + 14px);
      z-index: 110;
      width: 72px;
      height: 72px;
      border-radius: 50%;
      font-size: 40px;
      line-height: 72px;
      text-align: center;
      text-decoration: none;

      &:active {
        transform: translateY(4px);
        box-shadow: 0 2px 0 var(--paper-edge);
      }
    }

    .start-screen {
      position: fixed;
      inset: 0;
      z-index: 100;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 28px;
      /* 和 body 一样的天空圆点背景，盖住下面的游戏 */
      background:
        radial-gradient(circle at 20px 20px, rgba(255, 255, 255, 0.55) 6px, transparent 7px) 0 0 /
          40px 40px,
        linear-gradient(var(--sky), #e6f6ee 70%);

      h1 {
        margin: 0;
        padding: 10px 48px 12px;
        border-radius: 999px / 70px 70px 90px 90px;
        font-size: 52px;
        font-weight: normal;
        letter-spacing: 4px;
      }
    }

    .big-icon {
      width: 240px;
      height: 240px;
      border-radius: 34%;
      display: grid;
      place-items: center;
      background: color-mix(in srgb, var(--c) 72%, white);
      box-shadow: var(--bevel), var(--shadow);
      font-size: 140px;
      animation: bob 1.6s ease-in-out infinite;
    }

    .play {
      width: 150px;
      height: 150px;
      padding-left: 14px;
      border-radius: 50%;
      background: var(--green);
      color: #fff;
      font-size: 72px;
      box-shadow:
        var(--bevel),
        0 8px 0 #4a9e77;

      &:active {
        transform: translateY(6px);
        box-shadow:
          var(--bevel),
          0 2px 0 #4a9e77;
      }
    }
  `,
})
export class GameShell {
  protected readonly sound = inject(Sound);
  private readonly speech = inject(Speech);
  protected readonly game = inject(ActivatedRoute).snapshot.data['game'] as GameInfo;

  /** 不需要开始画面的游戏（比如画画）设为 false */
  readonly showStart = input(true);
  readonly start = output<void>();
  protected readonly started = signal(false);

  protected begin(): void {
    this.sound.unlock();
    this.sound.good();
    this.speech.say(this.game.intro ?? this.game.title);
    this.started.set(true);
    this.start.emit();
  }
}
