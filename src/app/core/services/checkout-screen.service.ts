import { Injectable } from '@angular/core';
import { KeepAwake } from '@capacitor-community/keep-awake';
import { ScreenBrightness } from '@capacitor-community/screen-brightness';
import { Capacitor } from '@capacitor/core';

/** Max brightness + keep-awake while a card is shown at the till. No-ops in the browser. */
@Injectable({ providedIn: 'root' })
export class CheckoutScreenService {
  private previous: number | null = null;
  private active = false;

  async enter(): Promise<void> {
    if (this.active || !Capacitor.isNativePlatform()) return;
    this.active = true;
    try {
      const { brightness } = await ScreenBrightness.getBrightness();
      this.previous = brightness;
      await ScreenBrightness.setBrightness({ brightness: 1 });
    } catch (e) {
      console.warn('Brightness unavailable', e);
    }
    try {
      await KeepAwake.keepAwake();
    } catch (e) {
      console.warn('Keep-awake unavailable', e);
    }
  }

  async leave(): Promise<void> {
    if (!this.active) return;
    this.active = false;
    try {
      // Android: -1 hands control back to the system setting. iOS sets system brightness, so restore the saved level.
      const restore = Capacitor.getPlatform() === 'android' ? -1 : (this.previous ?? 0.5);
      await ScreenBrightness.setBrightness({ brightness: restore });
    } catch (e) {
      console.warn('Brightness restore failed', e);
    }
    try {
      await KeepAwake.allowSleep();
    } catch {
      // ignore
    }
  }
}
