import { Injectable, inject, signal } from '@angular/core';
import { Card, CardDraft } from '../models/card';
import { uuid } from '../util/id';
import { CARD_STORE } from './card-store';

export type CardPatch = Partial<Omit<Card, 'id' | 'createdAt'>>;

@Injectable({ providedIn: 'root' })
export class CardRepository {
  private readonly store = inject(CARD_STORE);
  private readonly _cards = signal<Card[]>([]);
  /** Serialises writes so rapid edits can't persist out of order. */
  private writes: Promise<void> = Promise.resolve();

  readonly cards = this._cards.asReadonly();
  readonly loaded = signal(false);

  async init(): Promise<void> {
    try {
      const cards = await this.store.load();
      this._cards.set(cards.map(normalise));
    } catch (e) {
      console.error('Failed to load cards', e);
    } finally {
      this.loaded.set(true);
    }
  }

  byId(id: string): Card | undefined {
    return this._cards().find((c) => c.id === id);
  }

  async create(draft: CardDraft): Promise<Card> {
    const card: Card = normalise({ ...draft, id: uuid(), createdAt: Date.now(), lastUsedAt: null });
    await this.commit([...this._cards(), card]);
    return card;
  }

  async update(id: string, patch: CardPatch): Promise<void> {
    await this.commit(this._cards().map((c) => (c.id === id ? normalise({ ...c, ...patch }) : c)));
  }

  async remove(id: string): Promise<void> {
    await this.commit(this._cards().filter((c) => c.id !== id));
  }

  async markUsed(id: string): Promise<void> {
    await this.update(id, { lastUsedAt: Date.now() });
  }

  /** Used by import: replaces everything. */
  async replaceAll(cards: Card[]): Promise<void> {
    await this.commit(cards.map(normalise));
  }

  private commit(next: Card[]): Promise<void> {
    this._cards.set(next);
    this.writes = this.writes.then(() => this.store.save(next)).catch((e) => console.error('Failed to save cards', e));
    return this.writes;
  }
}

/** Defensive defaults so older/imported data always matches the model. */
function normalise(c: Card): Card {
  return {
    ...c,
    name: (c.name ?? '').trim(),
    locations: Array.isArray(c.locations) ? c.locations : [],
    lastUsedAt: c.lastUsedAt ?? null,
  };
}
