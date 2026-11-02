import { Injectable, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
import { Card } from '../models/card';
import { CardRepository } from './card-repository';
import { PhotoService } from './photo.service';

interface BackupManifest {
  app: 'cardwallet';
  version: 1;
  exportedAt: string;
  cards: Card[];
}

export type ImportMode = 'merge' | 'replace';

/** Backup = zip containing cards.json plus every referenced photo under its stored path. */
@Injectable({ providedIn: 'root' })
export class BackupService {
  private readonly repo = inject(CardRepository);
  private readonly photos = inject(PhotoService);

  async exportAll(): Promise<void> {
    const cards = this.repo.cards();
    const manifest: BackupManifest = { app: 'cardwallet', version: 1, exportedAt: new Date().toISOString(), cards };
    const entries: Record<string, Uint8Array> = { 'cards.json': strToU8(JSON.stringify(manifest, null, 2)) };

    for (const path of cards.flatMap((c) => [c.frontPhoto, c.backPhoto])) {
      if (!path || entries[path]) continue;
      try {
        entries[path] = base64ToBytes(await this.photos.readBase64(path));
      } catch (e) {
        console.warn('Skipping unreadable photo', path, e);
      }
    }

    // Photos are already JPEG-compressed; store them, deflate only the JSON.
    const zip = zipSync(
      Object.fromEntries(Object.entries(entries).map(([k, v]) => [k, [v, { level: k.endsWith('.json') ? 6 : 0 }]])),
    );
    const filename = `cardwallet-backup-${new Date().toISOString().slice(0, 10)}.zip`;

    if (Capacitor.isNativePlatform()) {
      const { uri } = await Filesystem.writeFile({ path: filename, data: bytesToBase64(zip), directory: Directory.Cache });
      await Share.share({ title: 'CardWallet backup', files: [uri] });
    } else {
      const url = URL.createObjectURL(new Blob([zip as BlobPart], { type: 'application/zip' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    }
  }

  /** Reads and validates a backup without applying it. */
  async readBackup(file: Blob): Promise<{ manifest: BackupManifest; files: Record<string, Uint8Array> }> {
    let files: Record<string, Uint8Array>;
    try {
      files = unzipSync(new Uint8Array(await file.arrayBuffer()));
    } catch {
      throw new Error('This file is not a valid zip archive.');
    }
    const json = files['cards.json'];
    if (!json) throw new Error('cards.json is missing. This is not a CardWallet backup.');
    const manifest = JSON.parse(strFromU8(json)) as BackupManifest;
    if (manifest.app !== 'cardwallet' || !Array.isArray(manifest.cards)) {
      throw new Error('Unrecognised backup format.');
    }
    return { manifest, files };
  }

  async applyBackup(manifest: BackupManifest, files: Record<string, Uint8Array>, mode: ImportMode): Promise<number> {
    const incoming = manifest.cards.filter((c) => c && typeof c.id === 'string' && typeof c.name === 'string');

    // Restore photos first, only for safe relative paths inside photos/.
    for (const card of incoming) {
      for (const key of ['frontPhoto', 'backPhoto'] as const) {
        const path = card[key];
        if (!path) continue;
        const data = files[path];
        if (!data || !/^photos\/[\w.-]+$/.test(path)) {
          card[key] = undefined;
          continue;
        }
        await this.photos.writeBase64(path, bytesToBase64(data));
      }
    }

    if (mode === 'replace') {
      const keep = new Set(incoming.flatMap((c) => [c.frontPhoto, c.backPhoto]));
      for (const old of this.repo.cards()) {
        for (const p of [old.frontPhoto, old.backPhoto]) if (p && !keep.has(p)) await this.photos.delete(p);
      }
      await this.repo.replaceAll(incoming);
    } else {
      const byId = new Map(this.repo.cards().map((c) => [c.id, c]));
      for (const c of incoming) byId.set(c.id, c);
      await this.repo.replaceAll([...byId.values()]);
    }
    return incoming.length;
  }
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}
