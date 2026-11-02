# CardWallet

**All your loyalty cards in one place. Private, offline, and fast at the checkout.**

CardWallet keeps your store cards, gym passes and membership QR codes on your phone. There are no accounts and no servers, and nothing about your cards leaves your device.

Built with Angular 22 (standalone, zoneless, signals), Ionic 9 and Capacitor 8 for Android, iOS and the web.

---

## Features

- **Scan any card.** Point the camera at a barcode or QR code, or pick a screenshot (for example a QR code you received by email).
- **All common formats.** QR, Code 128, EAN-13, EAN-8, UPC, Code 39/93, Codabar, ITF, PDF417, Aztec and Data Matrix, rendered crisp at any size.
- **Store logos and colours.** Pick from roughly 250 known merchants (mainly in Romania), or use any name and get a colour generated from it.
- **Checkout mode.** Opening a card turns the screen to full brightness and keeps it awake until you're done.
- **Auto-open in store.** With location turned on, the app opens the right card when you're at a matching shop. Store locations come from OpenStreetMap.
- **Memberships.** Gym passes show the entries left and the expiry date (Natural High is supported).
- **Card photos.** Keep the front and back of a card, with pinch to zoom.
- **Grid or stack layout.** Choose how the card list looks.
- **Backup.** Export every card and photo to a single zip file, then import it on another phone.
- **Works offline.** Your data is stored on the device only.

## Install

| Platform | How |
|---|---|
| **Android** | Download the APK from [Releases](../../releases) and open it (allow "install unknown apps" when asked). |
| **iPhone / web** | Open the web version in Safari, tap **Share**, then **Add to Home Screen**. |

> The web version can't use live camera scanning yet, and it can't change screen brightness. Type the card number instead, or use the Android app.

## Privacy

Card data, photos and backups stay on your device. The app only goes online to:

- **Find nearby stores.** When auto-open is on, your approximate position is sent to the public [OpenStreetMap Overpass API](https://overpass-api.de).
- **Fetch merchant logos.** The store's web domain (never your card) is sent to Google's favicon service.
- **Refresh gym memberships.** The app loads your member page from the gym's website.

There are no analytics, ads or trackers.

---

## Development

Node: `^22.22.3 || ^24.15.0 || >=26.0.0`.

```bash
npm install
npm start             # ng serve on http://localhost:4200
npm test              # unit tests (Vitest)
npm run lint
```

In the browser these features fall back: scanning shows a "use your phone" message, brightness and keep-awake do nothing, the camera opens a file picker, and photos are stored in IndexedDB.

### Native builds

```bash
npx ng build
npx cap sync          # copies dist/card-wallet/browser and updates native plugins
npx cap open android  # Android Studio
npx cap open ios      # Xcode (macOS only; run `cd ios/App && pod install` first)
```

Or run straight on a device: `npx cap run android` / `npx cap run ios`.

To recreate the platforms from scratch:

```bash
npx cap add android
npx cap add ios --packagemanager CocoaPods   # ML Kit supports only CocoaPods, not SPM
```

Platform config already applied:
- **Android** (`android/app/src/main/AndroidManifest.xml`): `CAMERA`, `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`, optional camera/GPS features, and the ML Kit `barcode_ui` meta-data so the Google code scanner module downloads at install time.
- **iOS** (`ios/App/App/Info.plist`): `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`, `NSLocationWhenInUseUsageDescription`. The deployment target is 15.5, which ML Kit requires.

### Tech stack

| Package | Version |
|---|---|
| Angular | 22.2.x |
| @ionic/angular | 9.0.x (standalone components are imported from `@ionic/angular`; Ionic 9 has no `/standalone` entry point) |
| @capacitor/* | 8.x |
| @capacitor-mlkit/barcode-scanning | 8.2.x |
| @capacitor-community/screen-brightness | 8.0.x |
| @capacitor-community/keep-awake | 8.0.x |
| bwip-js | 4.x (barcode rendering, lazy-loaded) |
| fflate | zip for backups |

### Project structure

```
src/app/
  core/
    models/      card.ts, merchant.ts
    services/    card-store (storage interface + Preferences impl), card-repository (signals),
                 photo, barcode, barcode-scanner, checkout-screen (brightness/keep-awake),
                 merchant, logo, location, overpass, membership, settings, backup
    util/        id, color, geo
  features/
    cards/       card-list, card-edit, card-detail (+ photo-viewer)
    settings/
  shared/        card-tile, merchant-logo, barcode-view, zoomable-image
public/assets/   merchants.json, logos/{id}.png (optional bundled logos)
```

**Swapping storage to SQLite.** `CardRepository` depends only on the `CARD_STORE` token (`load()` / `save()`). Implement `CardStore` with SQLite and provide it:

```ts
{ provide: CARD_STORE, useClass: SqliteCardStore }
```

**Bundled logos.** Drop `public/assets/logos/{merchantId}.png` (for example `kaufland.png`) and it takes priority over the downloaded favicon.

### Regenerating the merchant list

`public/assets/merchants.json` is generated from OpenStreetMap's [name-suggestion-index](https://github.com/osmlab/name-suggestion-index) (BSD-3), plus real store counts in Romania from Overpass (OSM data, ODbL):

```bash
npm run merchants                       # download NSI + count stores, rewrite merchants.json
npm run merchants -- --dry-run          # print the result without writing
npm run merchants -- --min-stores=5     # stricter cut-off for worldwide brands (default 3)
npm run merchants -- --no-overpass      # NSI only (brands NSI lists for Romania)
npm run merchants -- --overpass-url=https://overpass.kumi.systems/api/interpreter   # use a mirror
```

Hand-written entries are never dropped: their id, name, colour and domain are kept, and aliases plus a Wikidata id are merged in. New entries have no colour, so the app derives a stable one from the name. To change which categories count, edit `SHOP_EXCLUDE` / `AMENITY_INCLUDE` in `scripts/generate-merchants.mjs`. Overpass is a shared public service, so run this occasionally, not on every build.

---

## Credits

- Merchant names: [name-suggestion-index](https://github.com/osmlab/name-suggestion-index), BSD-3-Clause.
- Store locations and counts: © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), ODbL.
- Barcode rendering: [bwip-js](https://github.com/metafloor/bwip-js).

## License

Code: [MIT](LICENSE). Store names, logos and trademarks belong to their owners and are not covered by this license. CardWallet is not affiliated with or endorsed by any merchant.
