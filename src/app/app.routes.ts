import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/cards/card-list/card-list').then((m) => m.CardList),
  },
  {
    path: 'card/new',
    loadComponent: () => import('./features/cards/card-edit/card-edit').then((m) => m.CardEdit),
  },
  {
    path: 'card/:id',
    loadComponent: () => import('./features/cards/card-detail/card-detail').then((m) => m.CardDetail),
  },
  {
    path: 'card/:id/edit',
    loadComponent: () => import('./features/cards/card-edit/card-edit').then((m) => m.CardEdit),
  },
  {
    path: 'settings',
    loadComponent: () => import('./features/settings/settings').then((m) => m.SettingsPage),
  },
  { path: '**', redirectTo: '' },
];
