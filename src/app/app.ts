import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AppUpdate } from './core/app-update';
import { PlayTime } from './core/play-time';
import { RestScreen } from './shared/rest-screen';

@Component({
  imports: [RouterOutlet, RestScreen],
  selector: 'app-root',
  template: `
    <router-outlet />
    @if (playTime.timeUp()) {
      <app-rest-screen />
    }
  `,
})
export class App {
  protected readonly playTime = inject(PlayTime);

  constructor() {
    inject(AppUpdate).watch();
    this.playTime.start();
    // 禁止 iOS 双指缩放
    document.addEventListener('gesturestart', (e) => e.preventDefault());
  }
}
