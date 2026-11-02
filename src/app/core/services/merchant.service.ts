import { Injectable, computed, signal } from '@angular/core';
import { Merchant } from '../models/merchant';

/** Bundled merchant catalogue (assets/merchants.json). */
@Injectable({ providedIn: 'root' })
export class MerchantService {
  private readonly _merchants = signal<Merchant[]>([]);
  readonly merchants = this._merchants.asReadonly();

  private readonly byId = computed(() => new Map(this._merchants().map((m) => [m.id, m])));

  async init(): Promise<void> {
    try {
      const res = await fetch('assets/merchants.json');
      if (res.ok) this._merchants.set((await res.json()) as Merchant[]);
    } catch (e) {
      console.warn('merchants.json not loaded', e);
    }
  }

  get(id: string | undefined): Merchant | undefined {
    return id ? this.byId().get(id) : undefined;
  }

  /** Exact (case/diacritic-insensitive) match on name or alias. */
  match(name: string): Merchant | undefined {
    const n = norm(name);
    if (!n) return undefined;
    return this._merchants().find((m) => norm(m.name) === n || m.aliases.some((a) => norm(a) === n));
  }

  /** Autocomplete: prefix matches first, then substring matches. */
  search(query: string, limit = 6): Merchant[] {
    const q = norm(query);
    if (!q) return [];
    const scored: [number, Merchant][] = [];
    for (const m of this._merchants()) {
      const names = [m.name, ...m.aliases].map(norm);
      if (names.some((n) => n.startsWith(q))) scored.push([0, m]);
      else if (names.some((n) => n.includes(q))) scored.push([1, m]);
    }
    return scored
      .sort((a, b) => a[0] - b[0] || a[1].name.localeCompare(b[1].name))
      .slice(0, limit)
      .map(([, m]) => m);
  }
}

export function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}
