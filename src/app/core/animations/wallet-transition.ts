import { Animation, AnimationBuilder, createAnimation, mdTransitionAnimation } from '@ionic/angular';

/**
 * Google Wallet-style shared-element transition between the card stack and a card's detail screen.
 *
 * Forward: a copy of the tapped card flies from its place in the stack to the top of the detail screen,
 * the other cards slide away, and the detail content (barcode, photos) rises into place.
 * Back: the reverse. Ionic reuses the forward animation for the matching back navigation,
 * including the hardware back button and the iOS swipe-back gesture.
 *
 * Elements: list tiles carry `data-card-id`; the detail screen's card is `app-card-tile.face`
 * and the content under it is `.after-face`. Anything else falls back to the default transition.
 */

const DURATION = 480;
const EASING = 'cubic-bezier(0.2, 0, 0, 1)'; // Material "emphasized decelerate"

interface Opts {
  enteringEl: HTMLElement;
  leavingEl?: HTMLElement;
  direction?: 'forward' | 'back' | 'root';
}

export const walletTransition: AnimationBuilder = (baseEl: HTMLElement, rawOpts?: unknown): Animation => {
  const opts = rawOpts as Opts;
  const fallback = () => mdTransitionAnimation(baseEl, rawOpts as never);
  const back = opts.direction === 'back';
  const listPage = back ? opts.enteringEl : opts.leavingEl;
  const detailPage = back ? opts.leavingEl : opts.enteringEl;

  if (!listPage || !detailPage || matchMedia('(prefers-reduced-motion: reduce)').matches) return fallback();

  const face = detailPage.querySelector<HTMLElement>('app-card-tile.face');
  const cardId = face?.dataset['cardId'];
  const tile = cardId ? listPage.querySelector<HTMLElement>(`app-card-tile[data-card-id="${CSS.escape(cardId)}"]`) : null;
  const faceCard = face?.querySelector<HTMLElement>('.card');
  const tileCard = tile?.querySelector<HTMLElement>('.card');
  if (!face || !tile || !faceCard || !tileCard) return fallback();

  // The entering page is laid out (only opacity: 0) at this point, so both rects are measurable.
  const tileRect = tileCard.getBoundingClientRect();
  const faceRect = faceCard.getBoundingClientRect();
  if (!tileRect.width || !faceRect.width) return fallback();

  const from = back ? faceRect : tileRect;
  const to = back ? tileRect : faceRect;

  /*
   * In the stack the tapped card is partly covered by the cards after it; only its top strip shows.
   * The flying copy is cut to that strip while it is "in the stack" and revealed while the neighbours
   * move away (forward, first 30%) or back over it (back, last 30%), so the handover between copy
   * and real card is seamless at both ends.
   *
   * The cut uses only transforms, so the whole flight runs on the compositor and stays smooth even
   * if the main thread is busy: an overflow:hidden window moves up by `hidden` px while the card
   * inside moves down by the same amount. The card stays put and its bottom is masked.
   * (Animating clip-path instead repaints on the main thread every frame, and stutters.)
   */
  const allTiles = Array.from(listPage.querySelectorAll<HTMLElement>('app-card-tile[data-card-id]'));
  // Only a stacked neighbour (starting below this card's top but above its bottom) covers it; grid neighbours don't.
  const next = allTiles[allTiles.indexOf(tile) + 1];
  const nextTop = next?.getBoundingClientRect().top;
  const covered = nextTop !== undefined && nextTop > tileRect.top + 1 && nextTop < tileRect.bottom;
  const visibleInStack = covered ? nextTop - tileRect.top : tileRect.height;
  const hidden = Math.round(to.height * (1 - visibleInStack / tileRect.height)); // in the window's own box units

  const dx = from.left - to.left;
  const dy = from.top - to.top;
  const s = from.width / to.width;
  // Window transform at eased progress p with mask amount c. Linear in p, so splitting into keyframes is seamless.
  const windowAt = (p: number, c: number) =>
    `translate(${(dx * (1 - p)).toFixed(2)}px, ${(dy * (1 - p)).toFixed(2)}px) scale(${(s + (1 - s) * p).toFixed(4)}) translateY(${-c}px)`;
  const cardAt = (c: number) => `translateY(${c}px)`;

  const flyer = document.createElement('div');
  /*
   * If the list tile and the face have different layouts, the copy carries both,
   * the tile's on top, and cross-fades between them in flight.
   */
  const morph = tileCard.classList.contains('logo-only') !== faceCard.classList.contains('logo-only');
  let flyerCard: HTMLElement;
  let tileLayer: HTMLElement | null = null;
  if (morph) {
    flyerCard = document.createElement('div');
    flyerCard.style.position = 'relative';
    const layers = [faceCard, tileCard].map((el) => {
      const c = el.cloneNode(true) as HTMLElement;
      Object.assign(c.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', margin: '0' });
      flyerCard.appendChild(c);
      return c;
    });
    tileLayer = layers[1];
    tileLayer.style.opacity = back ? '0' : '1';
  } else {
    flyerCard = (back ? faceCard : tileCard).cloneNode(true) as HTMLElement;
  }
  flyer.appendChild(flyerCard);
  const startMask = back ? 0 : hidden;
  Object.assign(flyer.style, {
    position: 'fixed',
    left: `${to.left}px`,
    top: `${to.top}px`,
    width: `${to.width}px`,
    height: `${to.height}px`,
    overflow: 'hidden',
    zIndex: '10000',
    pointerEvents: 'none',
    transformOrigin: 'top left',
    willChange: 'transform',
    transform: windowAt(0, startMask), // correct from the first frame it is in the DOM
  });
  Object.assign(flyerCard.style, {
    width: '100%',
    height: '100%',
    margin: '0',
    willChange: 'transform',
    transform: cardAt(startMask),
  });

  const windowAnim = createAnimation()
    .addElement(flyer)
    .keyframes(
      back
        ? [
            { offset: 0, transform: windowAt(0, 0) },
            { offset: 0.7, transform: windowAt(0.7, 0) },
            { offset: 1, transform: windowAt(1, hidden) },
          ]
        : [
            { offset: 0, transform: windowAt(0, hidden) },
            { offset: 0.3, transform: windowAt(0.3, 0) },
            { offset: 1, transform: windowAt(1, 0) },
          ],
    );
  const cardAnim = createAnimation()
    .addElement(flyerCard)
    .keyframes(
      back
        ? [
            { offset: 0, transform: cardAt(0) },
            { offset: 0.7, transform: cardAt(0) },
            { offset: 1, transform: cardAt(hidden) },
          ]
        : [
            { offset: 0, transform: cardAt(hidden) },
            { offset: 0.3, transform: cardAt(0) },
            { offset: 1, transform: cardAt(0) },
          ],
    );

  const morphAnim = createAnimation();
  if (tileLayer) {
    morphAnim.addElement(tileLayer).keyframes(
      back
        ? [
            { offset: 0, opacity: '0' },
            { offset: 0.45, opacity: '0' },
            { offset: 0.85, opacity: '1' },
            { offset: 1, opacity: '1' },
          ]
        : [
            { offset: 0, opacity: '1' },
            { offset: 0.15, opacity: '1' },
            { offset: 0.55, opacity: '0' },
            { offset: 1, opacity: '0' },
          ],
    );
  }

  /*
   * Static setup is done directly on the DOM: Ionic skips before/after hooks on child animations
   * that have no keyframes, so a "styles only" child animation would silently do nothing.
   *  - the real cards are hidden while the copy is in flight;
   *  - the detail page's content background is transparent, so the list stays crisp behind it
   *    (both pages share the same background colour) instead of the two screens cross-fading.
   */
  const detailContent = detailPage.querySelector<HTMLElement>('ion-content');
  const setup = () => {
    document.body.appendChild(flyer);
    tile.style.visibility = 'hidden';
    face.style.visibility = 'hidden';
    detailContent?.style.setProperty('--background', 'transparent');
    listPage.classList.remove('ion-page-invisible');
    detailPage.classList.remove('ion-page-invisible');
  };
  const cleanup = () => {
    flyer.remove();
    tile.style.removeProperty('visibility');
    face.style.removeProperty('visibility');
    detailContent?.style.removeProperty('--background');
  };

  /*
   * The rest of the stack moves away in the first 30% (forward) or returns in the last 30% (back).
   * It travels exactly the hidden height of the tapped card, at the same moments as the clip,
   * so the next card's top edge tracks the clip line and appears to slide off / over the moving card.
   * It is fully faded out while the detail content rises in, so nothing ghosts behind it.
   */
  const others = allTiles.filter((t) => t !== tile);
  const shift = covered ? tileRect.height - visibleInStack : Math.round(window.innerHeight * 0.25);
  const away = `translateY(${Math.round(shift)}px)`;
  const stackAnim = createAnimation()
    .addElement(others)
    .keyframes(
      back
        ? [
            { offset: 0, transform: away, opacity: '0' },
            { offset: 0.7, transform: away, opacity: '0' },
            { offset: 0.8, opacity: '1' },
            { offset: 1, transform: 'translateY(0)', opacity: '1' },
          ]
        : [
            { offset: 0, transform: 'translateY(0)', opacity: '1' },
            { offset: 0.2, opacity: '1' },
            { offset: 0.3, transform: away, opacity: '0' },
            { offset: 1, transform: away, opacity: '0' },
          ],
    )
    .afterClearStyles(['transform', 'opacity']);

  // Only the headers cross-fade, early and quickly; the card and the stack carry the motion.
  const headerIn = [
    { offset: 0, opacity: '0' },
    { offset: 0.35, opacity: '1' },
    { offset: 1, opacity: '1' },
  ];
  const headerOut = [
    { offset: 0, opacity: '1' },
    { offset: 0.35, opacity: '0' },
    { offset: 1, opacity: '0' },
  ];
  const detailHeader = createAnimation()
    .addElement(detailPage.querySelectorAll<HTMLElement>('ion-header'))
    .keyframes(back ? headerOut : headerIn)
    .afterClearStyles(['opacity']);
  const listHeader = createAnimation()
    .addElement(listPage.querySelectorAll<HTMLElement>('ion-header'))
    .keyframes(back ? headerIn : headerOut)
    .afterClearStyles(['opacity']);
  // FAB and in-store banner belong to the list only.
  const listChrome = createAnimation()
    .addElement(listPage.querySelectorAll<HTMLElement>('ion-fab, .banner'))
    .keyframes(back ? headerIn : headerOut)
    .afterClearStyles(['opacity']);

  // Content under the detail card (barcode, photos, notes) rises into place once the card has mostly arrived.
  const contentAnim = createAnimation()
    .addElement(detailPage.querySelectorAll<HTMLElement>('.after-face'))
    .keyframes(
      back
        ? [
            { offset: 0, transform: 'translateY(0)', opacity: '1' },
            { offset: 0.4, transform: 'translateY(24px)', opacity: '0' },
            { offset: 1, transform: 'translateY(24px)', opacity: '0' },
          ]
        : [
            { offset: 0, transform: 'translateY(32px)', opacity: '0' },
            { offset: 0.45, transform: 'translateY(32px)', opacity: '0' },
            { offset: 1, transform: 'translateY(0)', opacity: '1' },
          ],
    )
    .afterClearStyles(['transform', 'opacity']);

  // Elements that animate in start hidden, so nothing flashes between setup and the first frame.
  const incoming: HTMLElement[] = back
    ? [...listPage.querySelectorAll<HTMLElement>('ion-header, ion-fab, .banner'), ...others]
    : [...detailPage.querySelectorAll<HTMLElement>('ion-header, .after-face')];

  setup();
  incoming.forEach((el) => (el.style.opacity = '0'));
  return createAnimation()
    .duration(DURATION)
    .easing(EASING)
    .addAnimation([windowAnim, cardAnim, morphAnim, stackAnim, detailHeader, listHeader, listChrome, contentAnim])
    .onFinish((step) => {
      cleanup();
      incoming.forEach((el) => el.style.removeProperty('opacity'));
      // After a completed "back", Ionic removes the detail page one frame later. Restoring its styles above
      // would make it flash on top of the list for that frame, so keep it invisible until it is gone.
      // (step 0 = a cancelled swipe-back: the detail page stays, so it must stay visible.)
      if (back && step === 1) detailPage.style.opacity = '0';
    });
};
