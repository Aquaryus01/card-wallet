import { Injectable, computed, inject, signal } from '@angular/core';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { AndroidSettings, IOSSettings, NativeSettings } from 'capacitor-native-settings';
import { Card } from '../models/card';
import { LatLng, distanceM } from '../util/geo';
import { CardRepository } from './card-repository';

export interface Fix extends LatLng {
  accuracy: number;
  ts: number;
}

export interface NearbyMatch {
  card: Card;
  distance: number;
}

export type LocationStatus = 'unknown' | 'granted' | 'denied' | 'unavailable';

const MAX_AGE_MS = 2 * 60 * 1000;
const TIMEOUT_MS = 8000;

/**
 * Foreground-only location: refreshed on app open and on resume.
 * If permission is denied everything keeps working; `nearby` is simply empty.
 */
@Injectable({ providedIn: 'root' })
export class LocationService {
  private readonly repo = inject(CardRepository);

  readonly position = signal<Fix | null>(null);
  readonly status = signal<LocationStatus>('unknown');
  private inflight: Promise<Fix | null> | null = null;

  /** Cards with at least one saved location within its radius, nearest first. */
  readonly matches = computed<NearbyMatch[]>(() => {
    const pos = this.position();
    if (!pos) return [];
    const out: NearbyMatch[] = [];
    for (const card of this.repo.cards()) {
      let best = Infinity;
      for (const loc of card.locations) {
        const d = distanceM(pos, loc);
        if (d <= (loc.radiusM || 150) && d < best) best = d;
      }
      if (best < Infinity) out.push({ card, distance: best });
    }
    return out.sort((a, b) => a.distance - b.distance);
  });

  /** card id -> distance, for list sorting. */
  readonly nearbyMap = computed<ReadonlyMap<string, number>>(
    () => new Map(this.matches().map((m) => [m.card.id, m.distance])),
  );

  init(): void {
    void this.refresh();
    void App.addListener('resume', () => void this.refresh());
  }

  /**
   * Gets the current position. Reuses the last fix if it is under 2 minutes old,
   * unless `fresh` is set (e.g. for "I'm in this store now").
   */
  refresh(fresh = false): Promise<Fix | null> {
    const last = this.position();
    if (!fresh && last && Date.now() - last.ts < MAX_AGE_MS) return Promise.resolve(last);
    this.inflight ??= this.locate(fresh).finally(() => (this.inflight = null));
    return this.inflight;
  }

  /**
   * Opens the system screen that fixes the current problem: the app's permissions, or the device's
   * location switch when location services are off (Android only; iOS can only open the app's page).
   * The status updates by itself when the user comes back (refresh on resume).
   */
  async openSettings(): Promise<void> {
    const servicesOff = this.status() === 'unavailable';
    await NativeSettings.open({
      optionAndroid: servicesOff ? AndroidSettings.Location : AndroidSettings.ApplicationDetails,
      optionIOS: IOSSettings.App,
    });
  }

  private async locate(fresh: boolean): Promise<Fix | null> {
    if (!(await this.ensurePermission())) return null;
    try {
      const p = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: TIMEOUT_MS,
        maximumAge: fresh ? 0 : MAX_AGE_MS,
      });
      const fix: Fix = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, ts: p.timestamp || Date.now() };
      this.position.set(fix);
      this.status.set('granted');
      return fix;
    } catch (e) {
      const msg = String((e as { message?: string })?.message ?? e).toLowerCase();
      if (msg.includes('denied') || (e as { code?: number })?.code === 1) this.status.set('denied');
      else console.warn('Location unavailable', e);
      // Keep a recent previous fix if we have one.
      const last = this.position();
      return last && Date.now() - last.ts < MAX_AGE_MS ? last : null;
    }
  }

  private async ensurePermission(): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) return true; // browser prompts on getCurrentPosition
    try {
      let perm = await Geolocation.checkPermissions();
      if (perm.location === 'prompt' || perm.location === 'prompt-with-rationale') {
        perm = await Geolocation.requestPermissions({ permissions: ['location', 'coarseLocation'] });
      }
      const ok = perm.location === 'granted' || perm.coarseLocation === 'granted';
      this.status.set(ok ? 'granted' : 'denied');
      return ok;
    } catch (e) {
      // Thrown when location services are switched off on the device.
      console.warn('Location services unavailable', e);
      this.status.set('unavailable');
      return false;
    }
  }
}
