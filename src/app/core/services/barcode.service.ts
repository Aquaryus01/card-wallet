import { Injectable } from '@angular/core';
import { CodeFormat, codeFormatInfo } from '../models/card';

export interface RenderedBarcode {
  src: string;
  twoD: boolean;
  /** The selected format rejected the value, so Code 128 was used instead. */
  fellBack: boolean;
}

type ToSvg = (opts: Record<string, unknown>) => string;

/**
 * Barcode rendering with bwip-js. The library is large (~950 kB), so it is preloaded once the app is idle,
 * and results are cached per value+format. With the library loaded, renderSync() is synchronous, so the
 * detail screen has its barcode in the DOM before the page transition starts (no mid-animation work).
 */
@Injectable({ providedIn: 'root' })
export class BarcodeService {
  private toSvg: ToSvg | null = null;
  private loading: Promise<void> | null = null;
  private readonly cache = new Map<string, RenderedBarcode | null>();

  get ready(): boolean {
    return this.toSvg !== null;
  }

  load(): Promise<void> {
    this.loading ??= import('bwip-js/browser').then((m) => {
      this.toSvg = m.toSVG as unknown as ToSvg;
    });
    return this.loading;
  }

  /** Warm up in the background after startup, so the first card opened doesn't pay for it. */
  preloadWhenIdle(): void {
    const start = () => void this.load();
    if ('requestIdleCallback' in window) requestIdleCallback(start, { timeout: 3000 });
    else setTimeout(start, 1500);
  }

  /** Null result = could not be drawn in any format. Undefined = library not loaded yet. */
  renderSync(value: string, format: CodeFormat | undefined): RenderedBarcode | null | undefined {
    if (!this.toSvg) return undefined;
    const key = `${format ?? ''}|${value}`;
    if (this.cache.has(key)) return this.cache.get(key)!;

    const info = codeFormatInfo(format) ?? codeFormatInfo('CODE_128')!;
    const draw = (bcid: string, twoD: boolean) =>
      svgUrl(
        this.toSvg!({
          bcid,
          text: value,
          scale: 3,
          ...(twoD ? {} : { height: 18 }),
          paddingwidth: 0,
          paddingheight: 0,
          includetext: false,
        }),
      );

    let result: RenderedBarcode | null = null;
    try {
      result = { src: draw(info.bcid, info.twoD), twoD: info.twoD, fellBack: false };
    } catch {
      if (info.value !== 'CODE_128') {
        try {
          result = { src: draw('code128', false), twoD: false, fellBack: true };
        } catch {
          result = null;
        }
      }
    }
    this.cache.set(key, result);
    return result;
  }
}

function svgUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
