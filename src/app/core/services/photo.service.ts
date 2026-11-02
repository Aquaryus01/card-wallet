import { Injectable } from '@angular/core';
import { Camera, MediaResult, MediaTypeSelection } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { uuid } from '../util/id';

export type PhotoSource = 'camera' | 'gallery';

const PHOTO_DIR = 'photos';

/**
 * Card photos live in Directory.Data/photos; cards store only the relative path.
 */
@Injectable({ providedIn: 'root' })
export class PhotoService {
  private readonly urlCache = new Map<string, Promise<string | null>>();

  /** Returns the saved relative path, or null if the user cancelled. */
  async capture(source: PhotoSource): Promise<string | null> {
    const common = { quality: 80, targetWidth: 1600, targetHeight: 1600, correctOrientation: true };
    let media: MediaResult | undefined;
    try {
      if (source === 'camera') {
        media = await Camera.takePhoto({ ...common, webUseInput: !Capacitor.isNativePlatform() });
      } else {
        const res = await Camera.chooseFromGallery({ ...common, mediaType: MediaTypeSelection.Photo, allowMultipleSelection: false });
        media = res.results[0];
      }
    } catch (e) {
      if (isCancel(e)) return null;
      throw e;
    }
    if (!media) return null;
    return this.store(media);
  }

  /** URL usable in <img src>. Cached per path. */
  displayUrl(path: string): Promise<string | null> {
    let p = this.urlCache.get(path);
    if (!p) {
      p = this.resolveUrl(path).catch((e) => {
        console.warn('Photo not readable', path, e);
        this.urlCache.delete(path);
        return null;
      });
      this.urlCache.set(path, p);
    }
    return p;
  }

  async delete(path: string | undefined): Promise<void> {
    if (!path) return;
    this.urlCache.delete(path);
    try {
      await Filesystem.deleteFile({ path, directory: Directory.Data });
    } catch {
      // already gone
    }
  }

  async readBase64(path: string): Promise<string> {
    const { data } = await Filesystem.readFile({ path, directory: Directory.Data });
    return typeof data === 'string' ? data : blobToBase64(data);
  }

  async writeBase64(path: string, base64: string): Promise<void> {
    this.urlCache.delete(path);
    await Filesystem.writeFile({ path, data: base64, directory: Directory.Data, recursive: true });
  }

  newPhotoPath(ext = 'jpg'): string {
    return `${PHOTO_DIR}/${uuid()}.${ext}`;
  }

  private async store(media: MediaResult): Promise<string> {
    const path = this.newPhotoPath();

    // Native: copy the file directly, avoiding a base64 round trip.
    if (Capacitor.isNativePlatform() && media.uri?.startsWith('file:')) {
      try {
        await Filesystem.mkdir({ path: PHOTO_DIR, directory: Directory.Data, recursive: true }).catch(() => undefined);
        await Filesystem.copy({ from: media.uri, to: path, toDirectory: Directory.Data });
        return path;
      } catch (e) {
        console.warn('Direct copy failed, falling back to base64', e);
      }
    }

    let base64: string;
    if (media.webPath) {
      const blob = await (await fetch(media.webPath)).blob();
      base64 = await blobToBase64(blob);
    } else if (media.thumbnail) {
      base64 = media.thumbnail.replace(/^data:[^,]+,/, '');
    } else {
      throw new Error('Camera returned no image data');
    }
    await this.writeBase64(path, base64);
    return path;
  }

  private async resolveUrl(path: string): Promise<string | null> {
    if (Capacitor.isNativePlatform()) {
      const { uri } = await Filesystem.getUri({ path, directory: Directory.Data });
      return Capacitor.convertFileSrc(uri);
    }
    // Web: Filesystem is backed by IndexedDB, so read the data back.
    const { data } = await Filesystem.readFile({ path, directory: Directory.Data });
    if (typeof data !== 'string') return URL.createObjectURL(data);
    return `data:${mimeFor(path)};base64,${data}`;
  }
}

function mimeFor(path: string): string {
  if (path.endsWith('.png')) return 'image/png';
  if (path.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

function isCancel(e: unknown): boolean {
  const msg = String((e as { message?: string })?.message ?? e).toLowerCase();
  return msg.includes('cancel') || msg.includes('no image') || msg.includes('dismiss');
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]+,/, ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
