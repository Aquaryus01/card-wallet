import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal } from '@angular/core';
import { App } from '@capacitor/app';
import { PluginListenerHandle } from '@capacitor/core';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonTitle,
  IonToolbar,
  ModalController,
  NavController,
  ViewDidEnter,
  ViewWillLeave,
} from '@ionic/angular';
import { CardRepository } from '../../../core/services/card-repository';
import { CheckoutScreenService } from '../../../core/services/checkout-screen.service';
import { MembershipService, summarize } from '../../../core/services/membership.service';
import { PhotoService } from '../../../core/services/photo.service';
import { BarcodeView } from '../../../shared/barcode-view/barcode-view';
import { PhotoViewer, ViewerPhoto } from './photo-viewer';

@Component({
  selector: 'app-card-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonButton, IonIcon, IonContent, BarcodeView],
  templateUrl: './card-detail.html',
  styleUrl: './card-detail.scss',
})
export class CardDetail implements ViewDidEnter, ViewWillLeave {
  readonly id = input.required<string>();

  private readonly repo = inject(CardRepository);
  private readonly nav = inject(NavController);
  private readonly modals = inject(ModalController);
  private readonly photos = inject(PhotoService);
  private readonly screen = inject(CheckoutScreenService);
  private readonly memberships = inject(MembershipService);


  protected readonly card = computed(() => this.repo.cards().find((c) => c.id === this.id()));
  /** Gym cards whose QR is a link to the member page: show the subscription status under the code. */
  protected readonly membershipUrl = computed(() => this.memberships.pageUrl(this.card()));
  protected readonly membershipLoading = computed(() => !!this.memberships.loading()[this.id()]);
  protected readonly membershipFailed = computed(() => !!this.memberships.failed()[this.id()]);
  protected readonly membership = computed(() => {
    const m = this.memberships.info()[this.id()];
    return m ? { ...m, ...summarize(m), updatedLabel: timeAgo(m.fetchedAt) } : null;
  });
  protected readonly photoList = signal<ViewerPhoto[]>([]);
  /** Photos are inserted only after the page transition: decoding full-size JPEGs mid-animation causes jank. */
  protected readonly showPhotos = signal(false);

  private visible = false;
  private appListeners: PluginListenerHandle[] = [];

  constructor() {
    // Resolve photo URLs whenever the card's photo paths change (e.g. after editing).
    effect(() => {
      const c = this.card();
      const entries: [string | undefined, string][] = [
        [c?.frontPhoto, 'Front'],
        [c?.backPhoto, 'Back'],
      ];
      void Promise.all(
        entries.map(async ([path, label]) => (path ? { url: await this.photos.displayUrl(path), label } : null)),
      ).then((list) => this.photoList.set(list.filter((p): p is ViewerPhoto => !!p?.url)));
    });

    // Restore brightness if the app is backgrounded while the card is showing.
    void App.addListener('pause', () => void this.screen.leave()).then((h) => this.appListeners.push(h));
    void App.addListener('resume', () => this.visible && void this.screen.enter()).then((h) => this.appListeners.push(h));
    inject(DestroyRef).onDestroy(() => {
      this.appListeners.forEach((h) => void h.remove());
      void this.screen.leave();
    });
  }

  ionViewDidEnter(): void {
    if (!this.card()) {
      this.nav.navigateRoot('/');
      return;
    }
    this.visible = true;
    // Post-transition work is staggered so no long frame lands while something is moving:
    //  1. photos are fully decoded off-screen first, then shown (their 220 ms fade-in stays smooth);
    //  2. brightness/keep-awake change window flags, which forces a relayout: after the fade;
    //  3. markUsed re-sorts the (hidden) stack and persists: last.
    void this.decodePhotos().then(() => this.showPhotos.set(true));
    setTimeout(() => this.visible && void this.screen.enter(), 450);
    setTimeout(() => void this.repo.markUsed(this.id()), 700);
    const card = this.card();
    if (card && this.membershipUrl()) setTimeout(() => void this.memberships.refresh(card), 500);
  }

  protected refreshMembership(): void {
    const card = this.card();
    if (card) void this.memberships.refresh(card, true);
  }

  private async decodePhotos(): Promise<void> {
    await Promise.all(
      this.photoList().map((p) => {
        const img = new Image();
        img.src = p.url;
        return img.decode().catch(() => undefined);
      }),
    );
  }

  ionViewWillLeave(): void {
    this.visible = false;
    void this.screen.leave();
  }

  protected edit(): void {
    this.nav.navigateForward(['/card', this.id(), 'edit']);
  }

  protected async openPhoto(index: number): Promise<void> {
    const modal = await this.modals.create({
      component: PhotoViewer,
      componentProps: { photos: this.photoList(), start: index },
    });
    await modal.present();
  }
}

function timeAgo(ts: number): string {
  const min = Math.round((Date.now() - ts) / 60_000);
  if (min < 1) return 'Updated just now';
  if (min < 60) return `Updated ${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `Updated ${h} h ago`;
  return `Updated ${Math.round(h / 24)} d ago`;
}
