import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, WritableSignal, computed, effect, inject, input, signal } from '@angular/core';
import {
  ActionSheetController,
  AlertController,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonSelect,
  IonSelectOption,
  IonTextarea,
  IonToggle,
  IonTitle,
  IonToolbar,
  NavController,
  ToastController,
} from '@ionic/angular';
import { CODE_FORMATS, Card, CardDraft, CardLocation, CodeFormat, DEFAULT_RADIUS_M, guessFormat } from '../../../core/models/card';
import { Merchant } from '../../../core/models/merchant';
import { BarcodeScannerService, ScanUnavailableError } from '../../../core/services/barcode-scanner.service';
import { CardRepository } from '../../../core/services/card-repository';
import { LocationService } from '../../../core/services/location.service';
import { MerchantService, norm } from '../../../core/services/merchant.service';
import { OverpassService } from '../../../core/services/overpass.service';
import { distanceM } from '../../../core/util/geo';
import { PhotoService, PhotoSource } from '../../../core/services/photo.service';
import { MembershipService } from '../../../core/services/membership.service';
import { SettingsService } from '../../../core/services/settings.service';
import { CardTile } from '../../../shared/card-tile/card-tile';
import { MerchantLogo } from '../../../shared/merchant-logo/merchant-logo';

type Side = 'front' | 'back';

const SWATCHES = [
  { value: '#c8102e', label: 'Red' },
  { value: '#ee7a00', label: 'Orange' },
  { value: '#f2c200', label: 'Yellow' },
  { value: '#1f9d5c', label: 'Green' },
  { value: '#0b4fa8', label: 'Blue' },
  { value: '#5b3fa0', label: 'Purple' },
] as const;

@Component({
  selector: 'app-card-edit',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonIcon,
    IonContent,
    IonList,
    IonItem,
    IonLabel,
    IonInput,
    IonSelect,
    IonSelectOption,
    IonTextarea,
    IonToggle,
    MerchantLogo,
    CardTile,
  ],
  templateUrl: './card-edit.html',
  styleUrl: './card-edit.scss',
})
export class CardEdit implements OnInit, OnDestroy {
  /** Route param (bound via withComponentInputBinding); undefined when creating. */
  readonly id = input<string>();

  private readonly repo = inject(CardRepository);
  private readonly nav = inject(NavController);
  private readonly alerts = inject(AlertController);
  private readonly sheets = inject(ActionSheetController);
  private readonly toasts = inject(ToastController);
  private readonly scanner = inject(BarcodeScannerService);
  private readonly photoService = inject(PhotoService);
  private readonly merchantService = inject(MerchantService);
  private readonly location = inject(LocationService);
  private readonly overpass = inject(OverpassService);
  private readonly settings = inject(SettingsService);
  private readonly memberships = inject(MembershipService);

  protected readonly locating = signal<'here' | 'search' | null>(null);
  /** Location can't work until the user changes a setting; null when it can. */
  protected readonly locationBlocked = computed(() => {
    switch (this.location.status()) {
      case 'denied':
        return "Location permission is off, so nearby cards won't be suggested.";
      case 'unavailable':
        return "Location is turned off on this phone, so nearby cards won't be suggested.";
      default:
        return null;
    }
  });

  /** Files written during this edit session; deleted again if the user leaves without saving. */
  private readonly newFiles = new Set<string>();
  /** Previously saved files the user replaced/removed; deleted only once the edit is saved. */
  private readonly replacedFiles = new Set<string>();
  private saved = false;

  protected readonly formats = CODE_FORMATS;
  protected readonly swatches = SWATCHES;

  protected readonly name = signal('');
  protected readonly merchantId = signal<string | undefined>(undefined);
  protected readonly code = signal('');
  protected readonly codeFormat = signal<CodeFormat | undefined>(undefined);
  protected readonly color = signal<string | undefined>(undefined);
  protected readonly notes = signal('');
  protected readonly membership = signal(false);
  /** Its status is read from the gym's page, so it is a membership whatever the toggle says. */
  protected readonly membershipDetected = computed(() => !!this.memberships.pageUrl({ code: this.code() } as Card));
  protected readonly frontPhoto = signal<string | undefined>(undefined);
  protected readonly backPhoto = signal<string | undefined>(undefined);
  protected readonly locations = signal<CardLocation[]>([]);

  protected readonly isNew = computed(() => !this.id());
  protected readonly saving = signal(false);
  protected readonly isCustomColor = computed(() => {
    const c = this.color();
    return !!c && !SWATCHES.some((s) => s.value === c);
  });
  /** The card as it will look once saved, for the live preview. */
  protected readonly previewCard = computed<Card>(() => ({
    id: this.id() ?? 'preview',
    name: this.name() || 'New card',
    merchantId: this.merchantId(),
    code: this.code() || undefined,
    // Neutral grey until there is something to derive a colour from.
    color: this.color() ?? (this.name() ? undefined : '#8e8e93'),
    locations: [],
    createdAt: 0,
    lastUsedAt: null,
  }));
  protected readonly previewVariant = computed(() => (this.settings.settings().listLayout === 'grid' ? 'logo' : 'full'));
  protected readonly nameFocused = signal(false);
  protected readonly suggestions = computed(() => {
    if (!this.nameFocused()) return [];
    const list = this.merchantService.search(this.name());
    // Hide the list once the typed name is exactly the linked merchant.
    const linked = this.merchantService.get(this.merchantId());
    return linked && list.length === 1 && list[0].id === linked.id ? [] : list;
  });
  protected readonly frontUrl = signal<string | null>(null);
  protected readonly backUrl = signal<string | null>(null);
  protected readonly scanning = signal(false);

  constructor() {
    effect(() => this.resolveThumb(this.frontPhoto(), this.frontUrl));
    effect(() => this.resolveThumb(this.backPhoto(), this.backUrl));
  }

  ngOnInit(): void {
    const id = this.id();
    if (!id) return;
    const card = this.repo.byId(id);
    if (!card) {
      this.nav.navigateRoot('/');
      return;
    }
    this.name.set(card.name);
    this.merchantId.set(card.merchantId);
    this.code.set(card.code ?? '');
    this.codeFormat.set(card.codeFormat);
    this.color.set(card.color);
    this.notes.set(card.notes ?? '');
    this.membership.set(!!card.membership);
    this.frontPhoto.set(card.frontPhoto);
    this.backPhoto.set(card.backPhoto);
    this.locations.set(card.locations);
  }

  protected cancel(): void {
    this.nav.back();
  }

  protected onNameInput(value: string | null | undefined): void {
    const name = value ?? '';
    this.name.set(name);
    // Keep the merchant link only while the name still matches a known merchant.
    this.merchantId.set(this.merchantService.match(name)?.id);
  }

  protected pickMerchant(m: Merchant): void {
    this.name.set(m.name);
    this.merchantId.set(m.id);
    this.nameFocused.set(false);
  }

  protected onNameBlur(): void {
    // Delay so a tap on a suggestion registers before the list disappears.
    setTimeout(() => this.nameFocused.set(false), 150);
  }

  protected onCodeInput(value: string | number | null | undefined): void {
    const v = String(value ?? '');
    this.code.set(v);
    if (v && !this.codeFormat()) {
      this.codeFormat.set(guessFormat(v));
    }
  }

  protected onColorPicked(event: Event): void {
    this.color.set((event.target as HTMLInputElement).value);
  }

  ngOnDestroy(): void {
    if (!this.saved) {
      this.newFiles.forEach((p) => void this.photoService.delete(p));
    }
  }

  /** 'camera': live scanner. 'image': read the code from a picture (screenshot, saved email attachment). */
  /** Picture button: the chosen file (screenshot, saved email attachment) is read for a code. */
  protected onCodeImagePicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // so picking the same file again still fires (change)
    if (file) void this.scan(file);
  }

  /** No argument: live camera scanner. A file: read the code from that picture. */
  protected async scan(image?: Blob): Promise<void> {
    const from = image ? 'image' : 'camera';
    this.scanning.set(true);
    try {
      const result = image ? await this.scanner.scanImage(image) : await this.scanner.scan();
      if (result) {
        this.code.set(result.value);
        this.codeFormat.set(result.format);
      }
    } catch (e) {
      const fallback = from === 'camera' ? 'Scanning failed. Enter the number manually.' : "Couldn't read that picture. Try another one.";
      await this.toast(e instanceof ScanUnavailableError ? e.message : fallback);
      if (!(e instanceof ScanUnavailableError)) console.error(e);
    } finally {
      this.scanning.set(false);
    }
  }

  protected async choosePhoto(side: Side): Promise<void> {
    const current = side === 'front' ? this.frontPhoto() : this.backPhoto();
    const sheet = await this.sheets.create({
      header: side === 'front' ? 'Front of card' : 'Back of card',
      buttons: [
        { text: 'Take photo', icon: 'camera-outline', data: 'camera' },
        { text: 'Choose from gallery', icon: 'images-outline', data: 'gallery' },
        ...(current ? [{ text: 'Remove photo', icon: 'trash-outline', role: 'destructive', data: 'remove' }] : []),
        { text: 'Cancel', role: 'cancel' },
      ],
    });
    await sheet.present();
    const { data } = await sheet.onWillDismiss<PhotoSource | 'remove'>();
    if (!data) return;

    if (data === 'remove') {
      this.setPhoto(side, undefined);
      return;
    }
    try {
      const path = await this.photoService.capture(data);
      if (path) {
        this.newFiles.add(path);
        this.setPhoto(side, path);
      }
    } catch (e) {
      console.error(e);
      await this.toast('Could not get the photo. Check camera/photo permissions.');
    }
  }

  /** "I'm in this store now": save the current position. */
  protected async addCurrentLocation(): Promise<void> {
    this.locating.set('here');
    try {
      const fix = await this.location.refresh(true);
      if (!fix) {
        await this.locationErrorToast();
        return;
      }
      if (this.locations().some((l) => distanceM(l, fix) < 50)) {
        await this.toast('This location is already saved.');
        return;
      }
      const date = new Date().toLocaleDateString();
      this.locations.update((ls) => [
        ...ls,
        { lat: fix.lat, lng: fix.lng, label: `${this.name().trim() || 'Store'} (saved ${date})`, radiusM: DEFAULT_RADIUS_M },
      ]);
      await this.toast('Location added. Remember to save.');
    } finally {
      this.locating.set(null);
    }
  }

  /** "Find stores automatically": look up this merchant's stores within 500 m via Overpass. */
  protected async findStores(): Promise<void> {
    const name = this.name().trim();
    if (!name) {
      await this.toast('Enter the store name first.');
      return;
    }
    this.locating.set('search');
    try {
      const fix = await this.location.refresh();
      if (!fix) {
        await this.locationErrorToast();
        return;
      }
      const merchant = this.merchantService.get(this.merchantId());
      const patterns = merchant ? [merchant.osmBrand, merchant.name, ...merchant.aliases] : [name];
      const found = await this.overpass.findStores(merchant?.id ?? `name:${norm(name)}`, patterns, fix);
      const fresh = found.filter((f) => !this.locations().some((l) => distanceM(l, f) < 50));
      if (fresh.length === 0) {
        await this.toast(found.length ? 'Those stores are already saved.' : `No ${name} stores found within 500 m.`);
        return;
      }
      this.locations.update((ls) => [...ls, ...fresh]);
      await this.toast(`Added ${fresh.length} store${fresh.length > 1 ? 's' : ''}. Remember to save.`);
    } catch (e) {
      console.error(e);
      await this.toast('Store lookup failed. Check your connection and try again.');
    } finally {
      this.locating.set(null);
    }
  }

  protected removeLocation(index: number): void {
    this.locations.update((ls) => ls.filter((_, i) => i !== index));
  }

  private setPhoto(side: Side, path: string | undefined): void {
    const target = side === 'front' ? this.frontPhoto : this.backPhoto;
    const old = target();
    if (old) {
      // Files from this session can go now; previously saved ones wait until Save.
      if (this.newFiles.delete(old)) void this.photoService.delete(old);
      else this.replacedFiles.add(old);
    }
    target.set(path);
  }

  private resolveThumb(path: string | undefined, out: WritableSignal<string | null>): void {
    if (!path) {
      out.set(null);
      return;
    }
    void this.photoService.displayUrl(path).then((url) => out.set(url));
  }

  protected async save(): Promise<void> {
    const name = this.name().trim();
    if (!name) {
      await this.toast('Store name is required');
      return;
    }
    const code = this.code().trim();
    const draft: CardDraft = {
      name,
      merchantId: this.merchantId(),
      code: code || undefined,
      codeFormat: code ? (this.codeFormat() ?? guessFormat(code)) : undefined,
      color: this.color(),
      notes: this.notes().trim() || undefined,
      membership: this.membership() || undefined,
      frontPhoto: this.frontPhoto(),
      backPhoto: this.backPhoto(),
      locations: this.locations(),
    };

    this.saving.set(true);
    try {
      this.saved = true;
      this.replacedFiles.forEach((p) => void this.photoService.delete(p));
      const id = this.id();
      if (id) {
        await this.repo.update(id, draft);
        this.nav.back();
      } else {
        const card = await this.repo.create(draft);
        // Replace /card/new so "back" from the detail screen returns to the list.
        this.nav.navigateForward(['/card', card.id], { replaceUrl: true });
      }
    } finally {
      this.saving.set(false);
    }
  }

  protected async confirmDelete(): Promise<void> {
    const id = this.id();
    if (!id) return;
    const alert = await this.alerts.create({
      header: 'Delete card?',
      message: `“${this.name()}” will be removed from this device.`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: 'Delete', role: 'destructive', handler: () => void this.delete(id) },
      ],
    });
    await alert.present();
  }

  private async delete(id: string): Promise<void> {
    const card = this.repo.byId(id);
    await this.repo.remove(id);
    for (const p of [card?.frontPhoto, card?.backPhoto, ...this.newFiles]) {
      void this.photoService.delete(p);
    }
    this.saved = true; // nothing left to clean up in ngOnDestroy
    this.nav.navigateRoot('/');
  }

  protected openLocationSettings(): void {
    void this.location.openSettings();
  }

  private async locationErrorToast(): Promise<void> {
    const status = this.location.status();
    if (status === 'denied' || status === 'unavailable') {
      const message = status === 'denied' ? 'Location permission is off.' : 'Location is turned off.';
      await this.toast(message, { text: 'Open settings', handler: () => this.openLocationSettings() });
    } else {
      await this.toast("Couldn't get your location. Try again.");
    }
  }

  private async toast(message: string, action?: { text: string; handler: () => void }): Promise<void> {
    const t = await this.toasts.create({
      message,
      // Longer when there's a button to reach.
      duration: action ? 5000 : 2000,
      position: 'bottom',
      buttons: action ? [{ text: action.text, handler: action.handler }] : undefined,
    });
    await t.present();
  }
}
