import { Routes } from '@angular/router';
import { GAMES } from './games';
import { Menu } from './menu/menu';

export const routes: Routes = [
  { path: '', component: Menu, title: '宝贝游戏' },
  ...GAMES.map((game) => ({
    path: game.path,
    loadComponent: game.load,
    title: game.title,
    data: { game },
  })),
  { path: '**', redirectTo: '' },
];
