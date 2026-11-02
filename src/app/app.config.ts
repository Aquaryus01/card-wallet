import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { RouteReuseStrategy, provideRouter, withComponentInputBinding } from '@angular/router';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular';
import { routes } from './app.routes';
import { BarcodeService } from './core/services/barcode.service';
import { CardRepository } from './core/services/card-repository';
import { LocationService } from './core/services/location.service';
import { MerchantService } from './core/services/merchant.service';
import { SettingsService } from './core/services/settings.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // useSetInputAPI: modal componentProps are applied via setInput(), so signal inputs work.
    provideIonicAngular({ useSetInputAPI: true, backButtonIcon: 'chevron-back', backButtonText: '' }),
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideRouter(routes, withComponentInputBinding()),
    provideAppInitializer(async () => {
      const location = inject(LocationService);
      const barcodes = inject(BarcodeService);
      await Promise.all([inject(CardRepository).init(), inject(MerchantService).init(), inject(SettingsService).init()]);
      // Not awaited: the first fix can take up to 8 s and must not block startup.
      location.init();
      // Warm up the barcode renderer so opening a card never pays for loading it mid-transition.
      barcodes.preloadWhenIdle();
    }),
  ],
};
