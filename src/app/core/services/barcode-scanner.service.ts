import { Injectable } from '@angular/core';
import { Barcode, BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { CODE_FORMATS, CodeFormat } from '../models/card';
import { blobToBase64 } from './photo.service';

export interface ScanOutcome {
  value: string;
  format: CodeFormat;
}

export class ScanUnavailableError extends Error {}

@Injectable({ providedIn: 'root' })
export class BarcodeScannerService {
  /** Null when the user cancelled. Throws ScanUnavailableError with a user-facing message otherwise. */
  async scan(): Promise<ScanOutcome | null> {
    if (!Capacitor.isNativePlatform()) {
      throw new ScanUnavailableError('Scanning works on a phone. In the browser, type the number instead.');
    }
    const { supported } = await BarcodeScanner.isSupported();
    if (!supported) {
      throw new ScanUnavailableError('This device does not support barcode scanning.');
    }

    if (Capacitor.getPlatform() === 'android') {
      // scan() on Android uses the Google code scanner module, which may need a one-time download.
      const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
      if (!available) {
        await BarcodeScanner.installGoogleBarcodeScannerModule();
        throw new ScanUnavailableError('Downloading the scanner module. Try again in a few seconds.');
      }
    } else {
      const { camera } = await BarcodeScanner.requestPermissions();
      if (camera !== 'granted' && camera !== 'limited') {
        throw new ScanUnavailableError('Camera permission denied. Enable it in Settings to scan.');
      }
    }

    try {
      const { barcodes } = await BarcodeScanner.scan();
      return toOutcome(barcodes);
    } catch (e) {
      const msg = String((e as { message?: string })?.message ?? e).toLowerCase();
      if (msg.includes('cancel')) return null;
      throw e;
    }
  }

  /**
   * Reads a code from a picture, e.g. a screenshot of a QR code received by email.
   * The file comes from a plain <input type="file">: the Camera plugin's gallery picker left its
   * loading screen stuck on top of the app. Throws ScanUnavailableError when the picture has no code.
   */
  async scanImage(file: Blob): Promise<ScanOutcome> {
    const outcome = toOutcome(Capacitor.isNativePlatform() ? await readNative(file) : await readWeb(file));
    if (!outcome) throw new ScanUnavailableError('No barcode or QR code found in that picture. Try a closer screenshot.');
    return outcome;
  }
}

/** The native reader only takes a file path, so the picture goes through a temporary cache file. */
async function readNative(file: Blob): Promise<Barcode[]> {
  const path = `scan-${Date.now()}`;
  await Filesystem.writeFile({ path, data: await blobToBase64(file), directory: Directory.Cache });
  try {
    const { uri } = await Filesystem.getUri({ path, directory: Directory.Cache });
    return (await BarcodeScanner.readBarcodesFromImage({ path: uri })).barcodes;
  } finally {
    await Filesystem.deleteFile({ path, directory: Directory.Cache }).catch(() => undefined);
  }
}

async function readWeb(file: Blob): Promise<Barcode[]> {
  return (await BarcodeScanner.readBarcodesFromImage({ blob: file })).barcodes;
}

function toOutcome(barcodes: Barcode[]): ScanOutcome | null {
  const first = barcodes[0];
  const value = first?.rawValue ?? first?.displayValue;
  if (!first || !value) return null;
  const known = CODE_FORMATS.some((f) => f.value === first.format);
  return { value, format: known ? (first.format as CodeFormat) : 'CODE_128' };
}
