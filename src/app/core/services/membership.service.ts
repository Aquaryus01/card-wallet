import { Injectable, signal } from '@angular/core';
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { Card } from '../models/card';

export interface MembershipInfo {
  /** Plan as the gym names it, e.g. "8 intrari". Null when the page shows no active subscription. */
  plan: string | null;
  totalEntries: number | null;
  remainingEntries: number | null;
  /** ISO date (yyyy-mm-dd). */
  expires: string | null;
  fetchedAt: number;
}

const CACHE_KEY = 'membership.v1';
const STALE_MS = 5 * 60 * 1000;

/** Natural High member pages: the QR code on the membership email encodes this URL. */
const NATURAL_HIGH = /^https?:\/\/nhb\.naturalhigh\.ro\/abonat\/[0-9a-f]{16,64}\.html$/i;

/**
 * Subscription status for gym cards whose code is a link to the member's status page.
 * The page is read-only for members (staff tick entries on it), so we just fetch and parse it.
 * The last result is kept so the card still shows it offline.
 */
@Injectable({ providedIn: 'root' })
export class MembershipService {
  /** cardId -> last known info. */
  readonly info = signal<Record<string, MembershipInfo>>({});
  readonly loading = signal<Record<string, boolean>>({});
  readonly failed = signal<Record<string, boolean>>({});
  private loaded: Promise<void> | null = null;

  /** Listed under Memberships: its status can be read from a member page, or the user marked it as one. */
  isMembership(card: Card): boolean {
    return !!card.membership || !!this.pageUrl(card);
  }

  /** The member page URL for this card, or null if the card isn't a supported membership. */
  pageUrl(card: Card | undefined): string | null {
    const code = card?.code?.trim();
    return code && NATURAL_HIGH.test(code) ? code.replace(/^http:/i, 'https:') : null;
  }

  /** Loads the cached info, then refreshes it from the page unless it was fetched moments ago. */
  async refresh(card: Card, force = false): Promise<void> {
    const url = this.pageUrl(card);
    if (!url) return;
    await this.loadCache();
    const last = this.info()[card.id];
    if (!force && last && Date.now() - last.fetchedAt < STALE_MS) return;

    this.loading.update((m) => ({ ...m, [card.id]: true }));
    try {
      const info = parse(await this.download(url));
      this.info.update((m) => ({ ...m, [card.id]: info }));
      this.failed.update((m) => ({ ...m, [card.id]: false }));
      await Preferences.set({ key: CACHE_KEY, value: JSON.stringify(this.info()) });
    } catch (e) {
      console.warn('Membership page unavailable', e);
      this.failed.update((m) => ({ ...m, [card.id]: true }));
    } finally {
      this.loading.update((m) => ({ ...m, [card.id]: false }));
    }
  }

  private async download(url: string): Promise<string> {
    // Native HTTP: the gym's site sends no CORS headers, so the WebView's fetch would be blocked.
    if (Capacitor.isNativePlatform()) {
      const res = await CapacitorHttp.get({ url, responseType: 'text', connectTimeout: 10000, readTimeout: 10000 });
      if (res.status !== 200 || typeof res.data !== 'string') throw new Error(`HTTP ${res.status}`);
      return res.data;
    }
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  }

  private loadCache(): Promise<void> {
    this.loaded ??= Preferences.get({ key: CACHE_KEY }).then(({ value }) => {
      try {
        if (value) this.info.update((m) => ({ ...JSON.parse(value), ...m }));
      } catch {
        // corrupt cache: refetch
      }
    });
    return this.loaded;
  }
}

export interface MembershipSummary {
  remaining: number | null;
  total: number | null;
  /** remaining / total, 0–1; null when either is unknown. */
  progress: number | null;
  expiresLabel: string | null;
  daysLabel: string | null;
  expired: boolean;
}

/** Display values shared by the Memberships list and the card screen. */
export function summarize(m: MembershipInfo): MembershipSummary {
  // Whole calendar days from today to the expiry date: 0 on the last valid day, negative once expired.
  // Rounded, not floored, so a daylight-saving hour in between doesn't shift the count.
  const expiry = m.expires ? new Date(`${m.expires}T00:00:00`) : null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = expiry ? Math.round((expiry.getTime() - today.getTime()) / 86_400_000) : null;
  return {
    remaining: m.remainingEntries,
    total: m.totalEntries,
    progress: m.totalEntries && m.remainingEntries !== null ? Math.max(0, Math.min(1, m.remainingEntries / m.totalEntries)) : null,
    expiresLabel: expiry?.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) ?? null,
    daysLabel: days === null ? null : days < 0 ? 'Expired' : days === 0 ? 'Last day' : days === 1 ? '1 day left' : `${days} days left`,
    expired: days !== null && days < 0,
  };
}

/**
 * The page holds one block:
 *   <div class="abonament"><span>Abonament: 8 intrari</span>6 intrari <span>Expira: 23.11.2026</span></div>
 * i.e. the plan, the entries left (bare text), and the expiry date.
 */
export function parse(html: string): MembershipInfo {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const block = doc.querySelector('.abonament');
  const empty: MembershipInfo = { plan: null, totalEntries: null, remainingEntries: null, expires: null, fetchedAt: Date.now() };
  if (!block) return empty;

  const spans = Array.from(block.querySelectorAll('span')).map((s) => clean(s.textContent));
  const planSpan = spans.find((s) => /^abonament/i.test(s));
  const expirySpan = spans.find((s) => /^expir/i.test(s));
  const bare = clean(
    Array.from(block.childNodes)
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent)
      .join(' '),
  );

  const plan = planSpan ? clean(planSpan.replace(/^abonament\s*:?/i, '')) || null : null;
  const date = /(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(expirySpan ?? '');
  return {
    plan,
    totalEntries: firstNumber(plan),
    remainingEntries: firstNumber(bare),
    expires: date ? `${date[3]}-${date[2].padStart(2, '0')}-${date[1].padStart(2, '0')}` : null,
    fetchedAt: Date.now(),
  };
}

function clean(s: string | null | undefined): string {
  return (s ?? '').replace(/\s+/g, ' ').trim();
}

function firstNumber(s: string | null): number | null {
  const m = /\d+/.exec(s ?? '');
  return m ? Number(m[0]) : null;
}
