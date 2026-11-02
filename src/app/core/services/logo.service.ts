import { Injectable, inject, signal } from '@angular/core';
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Preferences } from '@capacitor/preferences';
import { colorFromName, dominantColor } from '../util/color';
import { MerchantService } from './merchant.service';
import { PhotoService, blobToBase64 } from './photo.service';

const LOGO_DIR = 'logos';
const MISS_KEY = 'logo-misses.v1';
const MISS_RETRY_MS = 7 * 24 * 3600 * 1000;
const COLOR_KEY = 'logo-colors.v1';

/**
 * Logo resolution, in order:
 *  1. bundled assets/logos/{id}.png
 *  2. Google favicon service, downloaded once and cached in Directory.Data/logos/{id}.png
 *  3. null -> callers show a coloured initials tile (see tileColor()).
 *
 * A resolved logo's dominant colour is cached (Preferences) and used as the card background
 * for merchants without a curated brand colour.
 */
@Injectable({ providedIn: 'root' })
export class LogoService {
  private readonly merchants = inject(MerchantService);
  private readonly files = inject(PhotoService);

  /** merchantId -> resolved URL (null = no logo). Missing key = not resolved yet. */
  private readonly urls = signal<Record<string, string | null>>({});
  private readonly started = new Set<string>();
  private misses: Record<string, number> | null = null;
  /** merchantId -> colour sampled from its logo. Persisted so cards don't flash on launch. */
  private readonly colors = signal<Record<string, string>>({});
  private readonly colorsLoaded = Preferences.get({ key: COLOR_KEY }).then(({ value }) => {
    try {
      if (value) this.colors.update((m) => ({ ...JSON.parse(value), ...m }));
    } catch {
      // corrupt cache: re-sample
    }
  });

  /** Reactive: returns null until resolved, then the URL. Safe to call from computed()/templates. */
  logoUrl(merchantId: string | undefined): string | null {
    if (!merchantId) return null;
    const known = this.urls()[merchantId];
    if (known !== undefined) return known;
    if (!this.started.has(merchantId)) {
      this.started.add(merchantId);
      // Resolve outside the current reactive read.
      queueMicrotask(() => void this.resolve(merchantId));
    }
    return null;
  }

  /**
   * Colour for the initials tile / card accent: explicit override, merchant colour,
   * colour sampled from the logo, or stable hash. Reactive, like logoUrl().
   */
  tileColor(name: string, merchantId?: string, override?: string): string {
    return override || this.merchants.get(merchantId)?.color || this.logoColor(merchantId) || colorFromName(name || '?');
  }

  private logoColor(merchantId: string | undefined): string | null {
    if (!merchantId) return null;
    this.logoUrl(merchantId); // kick off resolution; the colour is sampled once the logo is known
    return this.colors()[merchantId] ?? null;
  }

  private async resolve(id: string): Promise<void> {
    let url: string | null = null;
    try {
      url = (await this.bundled(id)) ?? (await this.cached(id)) ?? (await this.download(id));
    } catch (e) {
      console.warn('Logo resolution failed', id, e);
    }
    this.urls.update((m) => ({ ...m, [id]: url }));
    if (url) await this.sampleColor(id, url);
  }

  private async sampleColor(id: string, url: string): Promise<void> {
    await this.colorsLoaded;
    if (this.colors()[id]) return;
    const color = await dominantColor(url);
    if (!color) return;
    this.colors.update((m) => ({ ...m, [id]: color }));
    await Preferences.set({ key: COLOR_KEY, value: JSON.stringify(this.colors()) });
  }

  private async bundled(id: string): Promise<string | null> {
    const path = `assets/logos/${id}.png`;
    try {
      const res = await fetch(path);
      // Dev servers answer unknown paths with index.html, so check the content type too.
      return res.ok && (res.headers.get('content-type') ?? '').startsWith('image/') ? path : null;
    } catch {
      return null;
    }
  }

  private async cached(id: string): Promise<string | null> {
    const path = `${LOGO_DIR}/${id}.png`;
    try {
      await Filesystem.stat({ path, directory: Directory.Data });
    } catch {
      return null;
    }
    return this.files.displayUrl(path);
  }

  private async download(id: string): Promise<string | null> {
    const merchant = this.merchants.get(id);
    if (!merchant?.domain) return null;

    const misses = await this.loadMisses();
    if (Date.now() - (misses[id] ?? 0) < MISS_RETRY_MS) return null;

    const url = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(merchant.domain)}&sz=128`;
    let base64: string | null = null;
    try {
      if (Capacitor.isNativePlatform()) {
        // Native HTTP avoids CORS.
        const res = await CapacitorHttp.get({ url, responseType: 'blob' });
        if (res.status === 200 && typeof res.data === 'string') base64 = res.data;
      } else {
        const res = await fetch(url);
        if (res.ok) base64 = await blobToBase64(await res.blob());
      }
    } catch (e) {
      // Offline or CORS blocked (browser dev): fall back to initials, retry later.
      console.info('Favicon download unavailable for', id, e);
      return null;
    }

    if (!base64) {
      await this.recordMiss(id);
      return null;
    }
    const path = `${LOGO_DIR}/${id}.png`;
    await this.files.writeBase64(path, base64);
    return this.files.displayUrl(path);
  }

  private async loadMisses(): Promise<Record<string, number>> {
    if (!this.misses) {
      const { value } = await Preferences.get({ key: MISS_KEY });
      try {
        this.misses = value ? JSON.parse(value) : {};
      } catch {
        this.misses = {};
      }
    }
    return this.misses!;
  }

  private async recordMiss(id: string): Promise<void> {
    const misses = await this.loadMisses();
    misses[id] = Date.now();
    await Preferences.set({ key: MISS_KEY, value: JSON.stringify(misses) });
  }
}
