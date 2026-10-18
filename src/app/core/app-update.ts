import { Injectable, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { SwUpdate } from '@angular/service-worker';
import { filter } from 'rxjs';

/**
 * 新版本自动更新：Service Worker 在后台下载好新版本后，
 * 等孩子回到菜单时再刷新，不会打断正在玩的游戏。
 */
@Injectable({ providedIn: 'root' })
export class AppUpdate {
  private readonly sw = inject(SwUpdate);
  private readonly router = inject(Router);
  private ready = false;

  watch(): void {
    if (!this.sw.isEnabled) return;

    this.sw.versionUpdates.pipe(filter((e) => e.type === 'VERSION_READY')).subscribe(() => {
      this.ready = true;
      if (this.router.url === '/') location.reload();
    });

    this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe((e) => {
      if (this.ready && e.urlAfterRedirects === '/') location.reload();
    });

    // 缓存损坏时只能整页刷新恢复
    this.sw.unrecoverable.subscribe(() => location.reload());

    // 从后台切回来时检查一次更新
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.sw.checkForUpdate().catch(() => {});
    });
  }

  /** 设置里的"检查更新"：有新版本就装上并刷新 */
  async checkNow(): Promise<'updating' | 'latest' | 'offline' | 'disabled'> {
    if (!this.sw.isEnabled) return 'disabled';
    try {
      if (!(await this.sw.checkForUpdate())) return 'latest';
    } catch {
      return 'offline';
    }
    await this.sw.activateUpdate();
    location.reload();
    return 'updating';
  }

  /**
   * 设置里的"强制刷新"：注销 Service Worker、清空缓存，重新从服务器下载全部文件。
   * 先确认连得上服务器，不然清掉缓存后就打不开了。
   */
  async forceReload(): Promise<'offline' | void> {
    try {
      const res = await fetch(`index.html?ngsw-bypass=1&t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) return 'offline';
    } catch {
      return 'offline';
    }
    const regs = (await navigator.serviceWorker?.getRegistrations()) ?? [];
    await Promise.all(regs.map((r) => r.unregister()));
    const keys = (await globalThis.caches?.keys()) ?? [];
    await Promise.all(keys.map((k) => caches.delete(k)));
    location.reload();
  }
}
