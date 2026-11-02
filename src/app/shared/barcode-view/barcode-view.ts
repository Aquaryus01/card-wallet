import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { CodeFormat } from '../../core/models/card';
import { BarcodeService } from '../../core/services/barcode.service';

/**
 * Renders a barcode/QR. When the renderer is already loaded (normally: it is preloaded at startup)
 * the image is produced synchronously during the first render, so it never pops in mid-transition.
 * If the chosen format rejects the value (e.g. bad EAN checksum) it falls back to Code 128,
 * and if that fails too, only the number is shown.
 */
@Component({
  selector: 'app-barcode-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (rendered(); as r) {
      <div class="sheet" [class.square]="r.twoD">
        <img [src]="r.src" alt="Barcode" decoding="sync" />
      </div>
      @if (r.fellBack) {
        <p class="warn">Shown as Code 128: the value isn't valid for the selected format.</p>
      }
    } @else if (rendered() === null) {
      <p class="warn">Couldn't draw this barcode. Show the number to the cashier.</p>
    } @else {
      <div class="sheet placeholder"></div>
    }
    @if (!isLink()) {
      <p class="text">{{ value() }}</p>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .sheet {
      background: #fff;
      border-radius: 12px;
      padding: 20px 16px;
      display: flex;
      justify-content: center;
    }
    .sheet img {
      width: 100%;
      height: 140px;
      object-fit: contain;
      image-rendering: pixelated;
    }
    .sheet.placeholder {
      height: 140px;
    }
    .sheet.square img {
      width: min(70vw, 280px);
      height: min(70vw, 280px);
    }
    .text {
      text-align: center;
      font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
      font-size: 22px;
      letter-spacing: 0.1em;
      margin: 12px 0 0;
      word-break: break-all;
      user-select: all;
    }
    .warn {
      text-align: center;
      font-size: 13px;
      color: var(--ion-color-warning-shade);
    }
  `,
})
export class BarcodeView {
  private readonly barcodes = inject(BarcodeService);

  readonly value = input.required<string>();
  readonly format = input<CodeFormat | undefined>();

  /** Flips once the renderer finishes loading (only matters if it wasn't preloaded yet). */
  private readonly loaded = signal(this.barcodes.ready);

  /** A QR that holds a web address (e.g. a gym membership page): the long URL isn't worth printing. */
  protected readonly isLink = computed(() => /^https?:\/\//i.test(this.value().trim()));

  protected readonly rendered = computed(() => {
    if (!this.loaded()) return undefined;
    return this.barcodes.renderSync(this.value(), this.format());
  });

  constructor() {
    if (!this.barcodes.ready) void this.barcodes.load().then(() => this.loaded.set(true));
  }
}
