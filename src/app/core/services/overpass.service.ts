import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { CardLocation, DEFAULT_RADIUS_M } from '../models/card';
import { LatLng, distanceM } from '../util/geo';

const ENDPOINT = 'https://overpass-api.de/api/interpreter';
const SEARCH_RADIUS_M = 500;
const CACHE_KEY = 'overpass-cache.v1';
const CACHE_TTL_MS = 7 * 24 * 3600 * 1000;

interface CacheEntry {
  ts: number;
  center: LatLng;
  results: CardLocation[];
}

interface OverpassElement {
  type: string;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

/** Finds a merchant's stores near a point with the OpenStreetMap Overpass API. No API key needed. */
@Injectable({ providedIn: 'root' })
export class OverpassService {
  /**
   * @param cacheKey merchant id (or normalised name for custom cards)
   * @param patterns names to match against `brand` / `name` (case-insensitive)
   */
  async findStores(cacheKey: string, patterns: string[], at: LatLng): Promise<CardLocation[]> {
    const cache = await this.readCache();
    const hit = cache[cacheKey];
    // Cached per merchant for 7 days; only reused when we're still in the same area.
    if (hit && Date.now() - hit.ts < CACHE_TTL_MS && distanceM(hit.center, at) < SEARCH_RADIUS_M / 2) {
      return hit.results;
    }

    const results = await this.query(patterns, at);
    cache[cacheKey] = { ts: Date.now(), center: at, results };
    await Preferences.set({ key: CACHE_KEY, value: JSON.stringify(pruned(cache)) });
    return results;
  }

  private async query(patterns: string[], at: LatLng): Promise<CardLocation[]> {
    const unique = [...new Set(patterns.map((p) => p.trim()).filter(Boolean))];
    if (unique.length === 0) return [];
    // Prefix match with a word boundary, so "dm" matches "dm drogerie" but not "Dmitri".
    const regex = `^(${unique.map(escapeRegex).join('|')})([^a-z0-9]|$)`;
    const around = `(around:${SEARCH_RADIUS_M},${at.lat},${at.lng})`;
    // Shops plus amenities (fuel stations, pharmacies, cinemas, cafés) whose brand or name matches.
    const ql = `[out:json][timeout:20];
(
  nwr[~"^(shop|amenity)$"~"."]["brand"~"${regex}",i]${around};
  nwr[~"^(shop|amenity)$"~"."]["name"~"${regex}",i]${around};
);
out center tags;`;

    const json = (await this.post(ql)) as { elements?: OverpassElement[] };

    const out: CardLocation[] = [];
    for (const el of json.elements ?? []) {
      const lat = el.lat ?? el.center?.lat;
      const lng = el.lon ?? el.center?.lon;
      if (lat === undefined || lng === undefined) continue;
      if (out.some((o) => distanceM(o, { lat, lng }) < 30)) continue; // node + building duplicates
      const t = el.tags ?? {};
      const street = [t['addr:street'], t['addr:housenumber']].filter(Boolean).join(' ');
      const label = [t['name'] || t['brand'] || 'Store', street].filter(Boolean).join(', ');
      out.push({ lat, lng, label, radiusM: DEFAULT_RADIUS_M });
    }
    return out.sort((a, b) => distanceM(at, a) - distanceM(at, b));
  }

  /** POST with exponential backoff on rate-limit/overload responses, as the public endpoint asks. */
  private async post(ql: string): Promise<unknown> {
    let delay = 1000;
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(ql),
        signal: AbortSignal.timeout(30000),
      });
      if (res.ok) return res.json();
      const retryable = res.status === 429 || res.status === 503 || res.status === 504;
      if (!retryable || attempt >= 2) throw new Error(`Overpass HTTP ${res.status}`);
      await new Promise((r) => setTimeout(r, delay));
      delay *= 2;
    }
  }

  private async readCache(): Promise<Record<string, CacheEntry>> {
    try {
      const { value } = await Preferences.get({ key: CACHE_KEY });
      return value ? JSON.parse(value) : {};
    } catch {
      return {};
    }
  }
}

function pruned(cache: Record<string, CacheEntry>): Record<string, CacheEntry> {
  const now = Date.now();
  return Object.fromEntries(Object.entries(cache).filter(([, e]) => now - e.ts < CACHE_TTL_MS));
}

/**
 * Escapes regex metacharacters, then escapes for an Overpass QL string literal
 * (QL processes backslash escapes itself, so regex backslashes must be doubled).
 */
export function escapeRegex(s: string): string {
  return s
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');
}
