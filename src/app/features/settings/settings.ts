import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import {
  AlertController,
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonToggle,
  IonToolbar,
  ToastController,
} from '@ionic/angular';
import { BackupService, ImportMode } from '../../core/services/backup.service';
import { CardRepository } from '../../core/services/card-repository';
import { LocationService } from '../../core/services/location.service';
import { SettingsService } from '../../core/services/settings.service';

@Component({
  selector: 'app-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonButton,
    IonContent,
    IonList,
    IonItem,
    IonLabel,
    IonToggle,
    IonNote,
    IonIcon,
  ],
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
})
export class SettingsPage {
  private readonly settingsService = inject(SettingsService);
  private readonly location = inject(LocationService);
  private readonly backup = inject(BackupService);
  private readonly repo = inject(CardRepository);
  private readonly alerts = inject(AlertController);
  private readonly toasts = inject(ToastController);
  private readonly fileInput = viewChild.required<ElementRef<HTMLInputElement>>('fileInput');

  protected readonly settings = this.settingsService.settings;
  protected readonly cardCount = computed(() => this.repo.cards().length);
  protected readonly busy = signal(false);
  protected readonly locationOn = computed(() => this.location.status() === 'granted');
  protected readonly locationText = computed(() => {
    switch (this.location.status()) {
      case 'granted':
        return 'On';
      case 'denied':
        return 'Permission denied';
      case 'unavailable':
        return 'Location services off';
      default:
        return 'Not requested yet';
    }
  });

  /** Not asked yet: ask now. Refused or switched off: only the system settings can change it. */
  protected readonly locationFixLabel = computed(() => (this.location.status() === 'unknown' ? 'Turn on' : 'Open settings'));

  protected fixLocation(): void {
    if (this.location.status() === 'unknown') void this.location.refresh(true);
    else void this.location.openSettings();
  }

  protected setAutoOpen(value: boolean): void {
    void this.settingsService.update({ autoOpen: value });
  }

  protected setListLayout(value: 'grid' | 'stack'): void {
    void this.settingsService.update({ listLayout: value });
  }

  protected async exportAll(): Promise<void> {
    this.busy.set(true);
    try {
      await this.backup.exportAll();
    } catch (e) {
      // Closing the share sheet rejects on some platforms; that isn't an error worth showing.
      if (!String((e as Error)?.message ?? e).toLowerCase().includes('cancel')) {
        console.error(e);
        await this.toast('Export failed.');
      }
    } finally {
      this.busy.set(false);
    }
  }

  protected pickImportFile(): void {
    const input = this.fileInput().nativeElement;
    input.value = '';
    input.click();
  }

  protected async onFileChosen(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    let parsed: Awaited<ReturnType<BackupService['readBackup']>>;
    try {
      parsed = await this.backup.readBackup(file);
    } catch (e) {
      await this.toast((e as Error).message);
      return;
    }

    const n = parsed.manifest.cards.length;
    const alert = await this.alerts.create({
      header: 'Import backup',
      message: `${n} card${n === 1 ? '' : 's'} found. Merge them with your current cards, or replace everything?`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: 'Replace all', role: 'replace', cssClass: 'alert-button-danger' },
        { text: 'Merge', role: 'merge' },
      ],
    });
    await alert.present();
    const { role } = await alert.onDidDismiss();
    if (role !== 'replace' && role !== 'merge') return;
    const data: ImportMode = role;

    this.busy.set(true);
    try {
      const count = await this.backup.applyBackup(parsed.manifest, parsed.files, data);
      await this.toast(`Imported ${count} card${count === 1 ? '' : 's'}.`);
    } catch (e) {
      console.error(e);
      await this.toast('Import failed.');
    } finally {
      this.busy.set(false);
    }
  }

  private async toast(message: string): Promise<void> {
    const t = await this.toasts.create({ message, duration: 2500, position: 'bottom' });
    await t.present();
  }
}
