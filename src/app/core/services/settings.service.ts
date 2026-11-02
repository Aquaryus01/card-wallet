import { Injectable, signal } from '@angular/core';
import { Preferences } from '@capacitor/preferences';

export interface Settings {
  /** Navigate straight to the card when exactly one card matches the current store. */
  autoOpen: boolean;
  /** Card list layout: a grid of logo tiles, or a Google Wallet-style stack. */
  listLayout: 'grid' | 'stack';
}

const KEY = 'settings.v1';
const DEFAULTS: Settings = { autoOpen: false, listLayout: 'grid' };

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly _settings = signal<Settings>(DEFAULTS);
  readonly settings = this._settings.asReadonly();

  async init(): Promise<void> {
    try {
      const { value } = await Preferences.get({ key: KEY });
      if (value) this._settings.set({ ...DEFAULTS, ...JSON.parse(value) });
    } catch (e) {
      console.warn('Settings not loaded', e);
    }
  }

  async update(patch: Partial<Settings>): Promise<void> {
    const next = { ...this._settings(), ...patch };
    this._settings.set(next);
    await Preferences.set({ key: KEY, value: JSON.stringify(next) });
  }
}
