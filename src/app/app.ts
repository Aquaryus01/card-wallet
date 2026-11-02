import { ChangeDetectionStrategy, Component } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  add,
  barcodeOutline,
  cameraOutline,
  checkmark,
  chevronBack,
  chevronForward,
  closeOutline,
  createOutline,
  downloadOutline,
  imageOutline,
  imagesOutline,
  locateOutline,
  locationOutline,
  optionsOutline,
  refreshOutline,
  scanOutline,
  searchOutline,
  settingsOutline,
  shareOutline,
  trashOutline,
  walletOutline,
} from 'ionicons/icons';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonApp, IonRouterOutlet],
  template: `
    <ion-app>
      <ion-router-outlet />
    </ion-app>
  `,
})
export class App {
  constructor() {
    addIcons({
      add,
      barcodeOutline,
      cameraOutline,
      checkmark,
      chevronBack,
      chevronForward,
      closeOutline,
      createOutline,
      downloadOutline,
      imageOutline,
      imagesOutline,
      locateOutline,
      locationOutline,
      optionsOutline,
      refreshOutline,
      scanOutline,
      searchOutline,
      settingsOutline,
      shareOutline,
      trashOutline,
      walletOutline,
    });
  }
}
