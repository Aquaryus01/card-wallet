#!/usr/bin/env node
/**
 * Regenerates public/assets/merchants.json from OpenStreetMap's name-suggestion-index (NSI)
 * plus real store counts in Romania from the Overpass API.
 *
 *   node scripts/generate-merchants.mjs [--min-stores=3] [--no-overpass] [--overpass-url=URL] [--nsi-version=8.0.20261101] [--dry-run]
 *
 * Rules:
 *  - Only shop/* and customer-facing amenity categories (fuel, pharmacy, cafés, fast food, cinemas, ...).
 *  - A brand is kept if NSI lists Romania ("ro") in its locationSet, OR it has at least --min-stores
 *    mapped locations in Romania (this is how worldwide brands like H&M or Starbucks get in).
 *  - Existing entries in merchants.json are never dropped. Their id, name, colour and domain win;
 *    aliases are merged and the Wikidata id is added.
 *  - New entries get no colour: the app derives a stable one from the name.
 *
 * Data: NSI is BSD-3-Clause (https://github.com/osmlab/name-suggestion-index).
 * Store counts are OpenStreetMap data, ODbL (https://www.openstreetmap.org/copyright).
 * Overpass is a shared public service: run this occasionally, not in CI loops.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'public/assets/merchants.json');
const COUNTRY = 'ro';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);
const MIN_STORES = Number(args['min-stores'] ?? 3);
const USE_OVERPASS = !args['no-overpass'];
const DRY_RUN = !!args['dry-run'];
const OVERPASS_URL = args['overpass-url'] ?? 'https://overpass-api.de/api/interpreter';

/** Categories where loyalty cards make sense. */
const SHOP_EXCLUDE = new Set([
  'bookmaker',
  'lottery',
  'money_lender',
  'pawnbroker',
  'funeral_directors',
  'car',
  'car_repair',
  'car_parts',
  'tyres',
  'vacant',
  'mobile_phone', // telecom shops (Orange, Vodafone, ...) don't run loyalty cards
  'telecommunication',
]);

/** Aliases must be useful for Romanian autocomplete: Latin script, no "(Country)" variants. */
const usefulAlias = (s) => /^[\p{Script=Latin}\p{N}\s&'’.\-+!]+$/u.test(s) && !s.includes('(');
const AMENITY_INCLUDE = new Set(['fuel', 'pharmacy', 'cafe', 'fast_food', 'restaurant', 'ice_cream', 'cinema']);

function categoryOf(path) {
  const [, key, value] = path.split('/'); // brands/<key>/<value>
  if (key === 'shop') return SHOP_EXCLUDE.has(value) ? null : value;
  if (key === 'amenity') return AMENITY_INCLUDE.has(value) ? value : null;
  return null;
}

const norm = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

const slug = (s) =>
  String(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

async function getJson(url, init) {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json();
}

async function loadNsi() {
  const version = args['nsi-version'] ?? (await getJson('https://registry.npmjs.org/name-suggestion-index/latest')).version;
  const base = `https://cdn.jsdelivr.net/npm/name-suggestion-index@${version}/dist`;
  console.log(`NSI ${version}: downloading (~22 MB)...`);
  const [nsi, wikidata] = await Promise.all([
    getJson(`${base}/json/nsi.min.json`),
    getJson(`${base}/wikidata/wikidata.min.json`),
  ]);
  return { version, nsi: nsi.nsi, wikidata: wikidata.wikidata };
}

/** One query: brand:wikidata of every branded shop/amenity in Romania -> count per QID. */
async function loadStoreCounts() {
  const amenities = [...AMENITY_INCLUDE].join('|');
  const ql = `[out:csv("brand:wikidata";false)][timeout:300];
area["ISO3166-1"="${COUNTRY.toUpperCase()}"][admin_level=2]->.c;
nwr["brand:wikidata"]["shop"](area.c);
out tags;
nwr["brand:wikidata"]["amenity"~"^(${amenities})$"](area.c);
out tags;`;

  console.log('Overpass: counting branded stores in Romania (can take a minute)...');
  let delay = 5000;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'CardWallet-merchant-generator/1.0 (one-off dev script)',
      },
      body: 'data=' + encodeURIComponent(ql),
    });
    if (res.ok) {
      const counts = new Map();
      for (const line of (await res.text()).split('\n')) {
        // A value can hold several QIDs separated by ';'
        for (const qid of line.split(';').map((s) => s.trim()).filter((s) => /^Q\d+$/.test(s))) {
          counts.set(qid, (counts.get(qid) ?? 0) + 1);
        }
      }
      return counts;
    }
    if (![429, 502, 503, 504].includes(res.status) || attempt >= 3) {
      throw new Error(`Overpass HTTP ${res.status}. Re-run later, or use --no-overpass.`);
    }
    console.log(`Overpass busy (${res.status}), retrying in ${delay / 1000}s...`);
    await new Promise((r) => setTimeout(r, delay));
    delay *= 2;
  }
}

function pickDomain(info) {
  const urls = [...(info?.officialWebsites ?? []), info?.identities?.website].filter(Boolean);
  const hosts = urls
    .map((u) => {
      try {
        return new URL(u).hostname.replace(/^www\./, '');
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  return hosts.find((h) => h.endsWith(`.${COUNTRY}`)) ?? hosts[0] ?? '';
}

function inCountry(item) {
  const inc = item.locationSet?.include ?? [];
  const exc = item.locationSet?.exclude ?? [];
  return inc.includes(COUNTRY) && !exc.includes(COUNTRY);
}

async function main() {
  const existing = JSON.parse(await readFile(OUT, 'utf8'));
  const { version, nsi, wikidata } = await loadNsi();
  const counts = USE_OVERPASS ? await loadStoreCounts() : new Map();
  if (USE_OVERPASS) console.log(`Overpass: ${counts.size} distinct brands mapped in Romania.`);

  // Collect candidate brands, grouped by Wikidata id (one brand can span several categories).
  const byQid = new Map();
  for (const [path, cat] of Object.entries(nsi)) {
    if (!path.startsWith('brands/')) continue;
    const category = categoryOf(path);
    if (!category) continue;
    for (const item of cat.items) {
      const qid = item.tags?.['brand:wikidata'];
      const brand = item.tags?.brand;
      if (!qid || !brand) continue;
      const stores = counts.get(qid) ?? 0;
      if (!(inCountry(item) || stores >= MIN_STORES)) continue;

      let entry = byQid.get(qid);
      if (!entry) {
        entry = { qid, brand, names: new Set(), category, stores, local: false };
        byQid.set(qid, entry);
      }
      entry.local ||= inCountry(item);
      for (const n of [item.displayName, item.tags.name, wikidata[qid]?.label]) if (n) entry.names.add(n);
    }
  }

  // Existing hand-curated entries take priority.
  const out = existing.map((m) => ({ ...m, aliases: [...(m.aliases ?? [])] }));
  const keyOf = new Map();
  out.forEach((m, i) => {
    for (const k of [m.name, m.osmBrand, ...m.aliases]) if (k) keyOf.set(norm(k), i);
  });
  const usedIds = new Set(out.map((m) => m.id));
  const stats = { matched: 0, added: 0 };

  for (const e of byQid.values()) {
    const aliases = [...e.names].filter((n) => norm(n) !== norm(e.brand) && usefulAlias(n));
    const idx = [e.brand, ...e.names].map((n) => keyOf.get(norm(n))).find((i) => i !== undefined);

    if (idx !== undefined) {
      const m = out[idx];
      // Several NSI brands can fold into one entry (IKEA + IKEA Restaurant): prefer the exact brand's id.
      const exact = norm(e.brand) === norm(m.name) || norm(e.brand) === norm(m.osmBrand);
      if (exact || !m.wikidata) m.wikidata = e.qid;
      m.stores = Math.max(m.stores ?? 0, e.stores);
      if (!m.domain) m.domain = pickDomain(wikidata[e.qid]);
      const seen = new Set([norm(m.name), ...m.aliases.map(norm)]);
      for (const a of aliases) if (!seen.has(norm(a))) (m.aliases.push(a), seen.add(norm(a)));
      stats.matched++;
      continue;
    }

    let id = slug(e.brand) || e.qid.toLowerCase();
    if (usedIds.has(id)) id = `${id}-${e.qid.toLowerCase()}`;
    usedIds.add(id);
    const m = {
      id,
      name: e.brand,
      aliases,
      domain: pickDomain(wikidata[e.qid]),
      osmBrand: e.brand,
      wikidata: e.qid,
      category: e.category,
      stores: e.stores,
    };
    out.push(m);
    for (const k of [m.name, ...m.aliases]) keyOf.set(norm(k), out.length - 1);
    stats.added++;
  }

  out.sort((a, b) => (b.stores ?? 0) - (a.stores ?? 0) || a.name.localeCompare(b.name));
  const json = '[\n' + out.map((m) => '  ' + JSON.stringify(m)).join(',\n') + '\n]\n';

  console.log(
    `NSI ${version}: ${byQid.size} brands qualified; ${stats.matched} matched existing entries, ${stats.added} added. Total ${out.length}.`,
  );
  if (DRY_RUN) {
    console.log('Dry run: top 25 by stores:\n' + out.slice(0, 25).map((m) => `  ${String(m.stores ?? 0).padStart(5)}  ${m.name}`).join('\n'));
    return;
  }
  await writeFile(OUT, json);
  console.log(`Wrote ${OUT}`);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
