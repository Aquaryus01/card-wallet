import { InjectionToken } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { Card } from '../models/card';

/**
 * Storage backend for cards. CardRepository only talks to this interface,
 * so switching to SQLite means providing a different CARD_STORE.
 */
export interface CardStore {
  load(): Promise<Card[]>;
  save(cards: Card[]): Promise<void>;
}

const KEY = 'cards.v1';

export class PreferencesCardStore implements CardStore {
  async load(): Promise<Card[]> {
    const { value } = await Preferences.get({ key: KEY });
    if (!value) return [];
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as Card[]) : [];
    } catch {
      console.error('Corrupt card data in preferences; starting empty');
      return [];
    }
  }

  async save(cards: Card[]): Promise<void> {
    await Preferences.set({ key: KEY, value: JSON.stringify(cards) });
  }
}

export const CARD_STORE = new InjectionToken<CardStore>('CardStore', {
  providedIn: 'root',
  factory: () => new PreferencesCardStore(),
});
