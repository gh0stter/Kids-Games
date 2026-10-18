import { Component } from '@angular/core';

/** 今天的游玩时间用完了：盖住整个页面。菜单的齿轮在它上面，家长可以加时间 */
@Component({
  selector: 'app-rest-screen',
  template: `
    <div class="rest">
      <div class="moon">🌙</div>
      <div class="bubble paper">
        <span class="name-tag">小狸</span>
        <h1>今天玩够啦</h1>
        <p>休息一下，明天再来吧！</p>
      </div>
      <div class="sleeper">🦝<span class="zzz">💤</span></div>
      <div class="ground night"></div>
    </div>
  `,
  styles: `
    .rest {
      position: fixed;
      inset: 0;
      z-index: 140;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 20px;
      /* 夜空 + 星星点点 */
      background:
        radial-gradient(circle at 30px 40px, rgba(255, 255, 255, 0.7) 2px, transparent 3px) 0 0 /
          120px 110px,
        radial-gradient(circle at 80px 20px, rgba(255, 240, 180, 0.6) 3px, transparent 4px) 0 0 /
          170px 150px,
        linear-gradient(#2e3566, #55508a 75%);
    }

    .moon {
      font-size: 130px;
      animation: bob 3s ease-in-out infinite;
    }

    .bubble {
      position: relative;
      padding: 26px 56px 22px;
      border-radius: 60px;
      text-align: center;

      .name-tag {
        position: absolute;
        top: -16px;
        left: 34px;
      }

      h1 {
        margin: 0 0 6px;
        font-size: 50px;
        font-weight: normal;
      }

      p {
        margin: 0;
        font-size: 28px;
        color: var(--ink-soft);
      }
    }

    .sleeper {
      position: relative;
      z-index: 1;
      font-size: 90px;
    }

    .zzz {
      position: absolute;
      right: -40px;
      top: -20px;
      font-size: 44px;
      animation: bob 2s ease-in-out infinite;
    }

    /* 夜里的草地暗一些 */
    .ground.night {
      --grass: #3f6b52;
      --grass-dark: #335a44;
    }
  `,
})
export class RestScreen {}
