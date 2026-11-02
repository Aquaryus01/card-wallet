import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';

const MAX_SCALE = 5;

/** Image with pinch-zoom, pan while zoomed, and double-tap to toggle zoom (pointer events). */
@Component({
  selector: 'app-zoomable-image',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(pointerdown)': 'down($event)',
    '(pointermove)': 'move($event)',
    '(pointerup)': 'up($event)',
    '(pointercancel)': 'up($event)',
    '[style.touch-action]': 'scale() > 1 ? "none" : "pan-x"',
  },
  template: `
    <img
      [src]="src()"
      [alt]="alt()"
      draggable="false"
      [style.transform]="'translate(' + tx() + 'px,' + ty() + 'px) scale(' + scale() + ')'"
      [class.animating]="animating()"
    />
  `,
  styles: `
    :host {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;
      overflow: hidden;
      user-select: none;
    }
    img {
      max-width: 100%;
      max-height: 100%;
      transform-origin: center center;
      will-change: transform;
    }
    img.animating {
      transition: transform 0.2s ease;
    }
  `,
})
export class ZoomableImage {
  readonly src = input.required<string>();
  readonly alt = input('');
  readonly zoomed = output<boolean>();

  protected readonly scale = signal(1);
  protected readonly tx = signal(0);
  protected readonly ty = signal(0);
  protected readonly animating = signal(false);

  private readonly pointers = new Map<number, { x: number; y: number }>();
  private pinchStart: { dist: number; scale: number } | null = null;
  private lastTap = 0;

  protected down(e: PointerEvent): void {
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.animating.set(false);
    if (this.pointers.size === 2) {
      this.pinchStart = { dist: this.distance(), scale: this.scale() };
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    } else if (this.pointers.size === 1) {
      const now = Date.now();
      if (now - this.lastTap < 300) {
        this.toggleZoom();
        this.lastTap = 0;
      } else {
        this.lastTap = now;
      }
    }
  }

  protected move(e: PointerEvent): void {
    const prev = this.pointers.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    this.pointers.set(e.pointerId, cur);

    if (this.pointers.size === 2 && this.pinchStart) {
      const next = clamp((this.pinchStart.scale * this.distance()) / this.pinchStart.dist, 1, MAX_SCALE);
      this.setScale(next);
    } else if (this.pointers.size === 1 && this.scale() > 1) {
      this.tx.update((v) => v + (cur.x - prev.x));
      this.ty.update((v) => v + (cur.y - prev.y));
    }
  }

  protected up(e: PointerEvent): void {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinchStart = null;
    if (this.pointers.size === 0 && this.scale() <= 1.02) this.reset();
  }

  private toggleZoom(): void {
    this.animating.set(true);
    if (this.scale() > 1) this.reset();
    else this.setScale(2.5);
  }

  private reset(): void {
    this.animating.set(true);
    this.tx.set(0);
    this.ty.set(0);
    this.setScale(1);
  }

  private setScale(s: number): void {
    const wasZoomed = this.scale() > 1;
    this.scale.set(s);
    if (wasZoomed !== s > 1) this.zoomed.emit(s > 1);
  }

  private distance(): number {
    const [a, b] = [...this.pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y) || 1;
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
