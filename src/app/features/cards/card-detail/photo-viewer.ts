import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, inject, input, signal, viewChild } from '@angular/core';
import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonToolbar, ModalController } from '@ionic/angular';
import { ZoomableImage } from '../../../shared/zoomable-image/zoomable-image';

export interface ViewerPhoto {
  url: string;
  label: string;
}

/** Fullscreen photo viewer: swipe between photos, pinch to zoom. Opened via ModalController. */
@Component({
  selector: 'app-photo-viewer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonHeader, IonToolbar, IonButtons, IonButton, IonIcon, IonContent, ZoomableImage],
  template: `
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <span class="label">{{ photos()[index()]?.label }}</span>
        <ion-buttons slot="end">
          <ion-button (click)="close()" aria-label="Close">
            <ion-icon slot="icon-only" name="close-outline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content [scrollY]="false">
      <div #track class="track" [class.locked]="zoomed()" (scroll)="onScroll()">
        @for (p of photos(); track p.url) {
          <div class="slide">
            <app-zoomable-image [src]="p.url" [alt]="p.label" (zoomed)="zoomed.set($event)" />
          </div>
        }
      </div>
      @if (photos().length > 1) {
        <div class="dots">
          @for (p of photos(); track p.url; let i = $index) {
            <span [class.on]="i === index()"></span>
          }
        </div>
      }
    </ion-content>
  `,
  styles: `
    ion-toolbar,
    ion-content {
      --background: #000;
      --color: #fff;
    }
    .label {
      padding-inline-start: 16px;
      color: #fff;
      font-weight: 600;
    }
    .track {
      display: flex;
      width: 100%;
      height: 100%;
      overflow-x: auto;
      scroll-snap-type: x mandatory;
      scrollbar-width: none;
    }
    .track::-webkit-scrollbar {
      display: none;
    }
    .track.locked {
      overflow-x: hidden;
    }
    .slide {
      flex: 0 0 100%;
      height: 100%;
      scroll-snap-align: center;
    }
    .dots {
      position: absolute;
      bottom: calc(24px + env(safe-area-inset-bottom));
      left: 0;
      right: 0;
      display: flex;
      justify-content: center;
      gap: 8px;
    }
    .dots span {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.4);
    }
    .dots span.on {
      background: #fff;
    }
  `,
})
export class PhotoViewer {
  readonly photos = input.required<ViewerPhoto[]>();
  readonly start = input(0);

  private readonly modal = inject(ModalController);
  private readonly track = viewChild.required<ElementRef<HTMLElement>>('track');

  protected readonly index = signal(0);
  protected readonly zoomed = signal(false);

  constructor() {
    afterNextRender(() => {
      const el = this.track().nativeElement;
      el.scrollLeft = this.start() * el.clientWidth;
      this.index.set(this.start());
    });
  }

  protected onScroll(): void {
    const el = this.track().nativeElement;
    this.index.set(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
  }

  protected close(): void {
    void this.modal.dismiss();
  }
}
