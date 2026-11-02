import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  EnvironmentInjector,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonFab,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonModal,
  IonSearchbar,
  IonToolbar,
  NavController,
  ViewDidEnter,
  ViewWillLeave,
} from '@ionic/angular';
import { walletTransition } from '../../../core/animations/wallet-transition';
import { Card } from '../../../core/models/card';
import { CardRepository } from '../../../core/services/card-repository';
import { LocationService } from '../../../core/services/location.service';
import { MembershipService, summarize } from '../../../core/services/membership.service';
import { SettingsService } from '../../../core/services/settings.service';
import { CardTile } from '../../../shared/card-tile/card-tile';
import { MerchantLogo } from '../../../shared/merchant-logo/merchant-logo';

@Component({
  selector: 'app-card-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    IonHeader,
    IonToolbar,
    IonButton,
    IonButtons,
    IonIcon,
    IonSearchbar,
    IonContent,
    IonFab,
    IonList,
    IonItem,
    IonLabel,
    IonModal,
    CardTile,
    MerchantLogo,
  ],
  templateUrl: './card-list.html',
  styleUrl: './card-list.scss',
})
export class CardList implements ViewDidEnter, ViewWillLeave {
  private readonly cdr = inject(ChangeDetectorRef);

  private readonly repo = inject(CardRepository);
  private readonly nav = inject(NavController);
  private readonly location = inject(LocationService);
  private readonly settings = inject(SettingsService);
  private readonly memberships = inject(MembershipService);

  protected readonly query = signal('');
  protected readonly nearby = this.location.nearbyMap;
  protected readonly matches = this.location.matches;
  protected readonly layout = computed(() => this.settings.settings().listLayout);
  protected readonly countLabel = computed(() => {
    const n = this.repo.cards().length;
    return n === 1 ? '1 card' : `${n} cards`;
  });

  /** The Cards | Memberships switch only appears once there is at least one membership. */
  protected readonly tab = signal<'cards' | 'memberships'>('cards');
  protected readonly hasMemberships = computed(() => this.repo.cards().some((c) => this.memberships.isMembership(c)));
  protected readonly activeTab = computed(() => (this.hasMemberships() ? this.tab() : 'cards'));

  /** Fixed order: the order cards were added (new ones at the end). Using or being near a card never moves it. */
  protected readonly visible = computed(() => {
    const q = this.query().trim().toLowerCase();
    const wantMemberships = this.activeTab() === 'memberships';
    return this.repo
      .cards()
      .filter((c) => this.memberships.isMembership(c) === wantMemberships)
      .filter((c) => !q || c.name.toLowerCase().includes(q));
  });

  /** Memberships tab rows: entries left and expiry, when the gym's page could be read. */
  protected readonly membershipRows = computed(() => {
    const info = this.memberships.info();
    return this.visible().map((card) => {
      const m = info[card.id];
      const s = m?.plan ? summarize(m) : null;
      let sub = 'Membership';
      if (s?.expired) sub = 'Expired';
      else if (s?.expiresLabel) sub = `Expires ${s.expiresLabel}${s.daysLabel ? ` · ${s.daysLabel}` : ''}`;
      else if (m && !m.plan) sub = 'No active subscription';
      else if (this.memberships.pageUrl(card) && !m) sub = 'Checking…';
      return { card, summary: s, sub };
    });
  });
  protected readonly hasCards = computed(() => this.repo.cards().length > 0);

  /** Identifies the current set of matching cards, so prompts fire once per store visit. */
  private readonly matchKey = computed(() =>
    this.matches()
      .map((m) => m.card.id)
      .sort()
      .join(','),
  );
  protected readonly bannerDismissed = signal<string | null>(null);
  protected readonly showBanner = computed(() => !!this.matchKey() && this.bannerDismissed() !== this.matchKey());
  protected readonly sheetOpen = signal(false);

  private readonly pageActive = signal(false);
  private handledKey: string | null = null;

  constructor() {
    effect(() => {
      const key = this.matchKey();
      const active = this.pageActive();
      if (!key) {
        this.handledKey = null; // left the store: the next visit prompts again
        return;
      }
      if (!active || key === this.handledKey) return;
      untracked(() => {
        this.handledKey = key;
        const matches = this.matches();
        if (matches.length === 1 && this.settings.settings().autoOpen) {
          this.open(matches[0].card);
        } else if (matches.length > 1) {
          this.sheetOpen.set(true);
        }
      });
    });

    /*
     * Ionic detaches change detection from this page while another page is on top, and re-attaches it
     * on return without re-rendering. Opening a card changes its "last used" time, so the stack order
     * would be stale, and Ionic builds the back animation (measuring card positions) before any
     * lifecycle hook runs. So keep the hidden stack rendered whenever the cards change; manual
     * detectChanges() works on a detached view. Deferred to a task so it never runs inside another
     * change-detection pass. Created with the app-level injector so it is a root effect: an effect
     * created with the component's injector only runs during that view's change detection, which never
     * happens while Ionic has the view detached.
     */
    let destroyed = false;
    const stackSync = effect(
      () => {
        this.visible();
        this.nearby();
        setTimeout(() => !destroyed && this.cdr.detectChanges());
      },
      { injector: inject(EnvironmentInjector), manualCleanup: true },
    );
    inject(DestroyRef).onDestroy(() => {
      destroyed = true;
      stackSync.destroy();
    });
  }

  ionViewDidEnter(): void {
    this.pageActive.set(true);
    // Refreshes are skipped when the status was fetched in the last few minutes.
    for (const card of this.repo.cards()) {
      if (this.memberships.pageUrl(card)) void this.memberships.refresh(card);
    }
  }

  ionViewWillLeave(): void {
    this.pageActive.set(false);
    this.sheetOpen.set(false);
  }

  protected open(card: Card): void {
    this.sheetOpen.set(false);
    // Wallet-style card fly-up; Ionic reuses it for the matching back navigation.
    this.nav.navigateForward(['/card', card.id], { animation: walletTransition });
  }

  protected bannerTap(): void {
    const m = this.matches();
    if (m.length === 1) this.open(m[0].card);
    else this.sheetOpen.set(true);
  }

  protected dismissBanner(event: Event): void {
    event.stopPropagation();
    this.bannerDismissed.set(this.matchKey());
  }

  protected add(): void {
    this.nav.navigateForward(['/card/new']);
  }

  protected openSettings(): void {
    this.nav.navigateForward(['/settings']);
  }

  protected distanceLabel(m: number): string {
    return m < 1000 ? `${Math.round(m)} m away` : `${(m / 1000).toFixed(1)} km away`;
  }
}
