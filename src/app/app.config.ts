import { ApplicationConfig, provideBrowserGlobalErrorListeners, isDevMode } from '@angular/core';
import { provideRouter, withHashLocation } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Web Station 没有 SPA 回退规则，用 #/ 路由，刷新任何页面都不会 404
    provideRouter(routes, withHashLocation()),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      // 第一次打开就立刻注册，尽快把游戏缓存到 iPad 上
      registrationStrategy: 'registerImmediately',
    }),
  ],
};
