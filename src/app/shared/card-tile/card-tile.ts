import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Card } from '../../core/models/card';
import { LogoService } from '../../core/services/logo.service';
import { inkFor } from '../../core/util/color';
import { MerchantLogo } from '../merchant-logo/merchant-logo';

/**
 * A card rendered like a physical loyalty card: credit-card proportions, brand-coloured gradient.
 *  - 'full': logo + name across the top (the strip that stays visible when cards are stacked).
 *  - 'logo': just the logo centred (or the name, if there is no logo), for the grid list.
 */
@Component({
  selector: 'app-card-tile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MerchantLogo],
  host: { '[class.static]': '!interactive()' },
  template: `
    <div class="card" [class.logo-only]="variant() === 'logo'" [style.--c]="accent()" [style.color]="ink()">
      @if (variant() === 'logo') {
        @if (hasLogo()) {
          <app-merchant-logo class="center-logo" [name]="card().name" [merchantId]="card().merchantId" [color]="card().color" />
        } @else {
          <span class="center-name">{{ card().name }}</span>
        }
        @if (nearby()) {
          <span class="badge corner">Nearby</span>
        }
      } @else {
        <div class="top">
          <app-merchant-logo class="chip" [name]="card().name" [merchantId]="card().merchantId" [color]="card().color" />
          <span class="name">{{ card().name }}</span>
          @if (nearby()) {
            <span class="badge">Nearby</span>
          }
        </div>
        <div class="bottom">
          @if (masked(); as m) {
            <span class="num">{{ m }}</span>
          }
        </div>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
    }
    .card {
      position: relative;
      aspect-ratio: 1.586;
      border-radius: 18px;
      padding: 16px 18px;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      overflow: hidden;
      background:
        radial-gradient(120% 90% at 100% 0%, rgba(255, 255, 255, 0.18), transparent 55%),
        radial-gradient(80% 80% at 0% 100%, rgba(0, 0, 0, 0.18), transparent 60%),
        linear-gradient(135deg, var(--c), color-mix(in srgb, var(--c) 70%, #000));
      box-shadow:
        0 -6px 16px rgba(0, 0, 0, 0.22),
        0 1px 3px rgba(0, 0, 0, 0.25);
      transition: transform 0.18s ease;
    }
    /* subtle edge highlight so stacked cards separate on dark backgrounds */
    .card::after {
      content: '';
      position: absolute;
      inset: 0;
      border-radius: inherit;
      border: 1px solid rgba(255, 255, 255, 0.14);
      pointer-events: none;
    }
    :host(:not(.static):active) .card {
      transform: translateY(-6px);
    }
    :host(.static) {
      cursor: default;
    }
    :host(.static) .card {
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
    }
    .top {
      display: flex;
      align-items: center;
      gap: 12px;
      min-height: 40px;
    }
    .chip {
      --logo-size: 40px;
      flex-shrink: 0;
      border-radius: 12px;
      box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.85);
    }
    .name {
      flex: 1;
      font-size: 18px;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .badge {
      flex-shrink: 0;
      font-size: 11px;
      font-weight: 700;
      padding: 3px 8px;
      border-radius: 999px;
      background: var(--ion-color-success);
      color: var(--ion-color-success-contrast);
    }
    .bottom {
      display: flex;
      justify-content: flex-end;
    }
    /* Sizes in cqw (of the card) so the logo scales with the tile, including the transition's copy. */
    .card.logo-only {
      container-type: inline-size;
      border-radius: 20px;
      align-items: center;
      justify-content: center;
      padding: 10px;
      background: var(--c);
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
    }
    .card.logo-only::after {
      border-color: rgba(255, 255, 255, 0.12);
    }
    :host(.static) .card.logo-only {
      border-radius: 22px;
      box-shadow: 0 14px 32px color-mix(in srgb, var(--c) 22%, transparent);
    }
    .center-logo {
      --logo-size: 36cqw;
      border-radius: 10cqw;
      overflow: hidden;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
    }
    .center-name {
      max-width: 100%;
      font-family: var(--app-font-display);
      font-size: 9cqw;
      font-weight: 800;
      letter-spacing: -0.02em;
      text-align: center;
      line-height: 1.15;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      overflow-wrap: anywhere;
    }
    .badge.corner {
      position: absolute;
      top: 8px;
      right: 8px;
      font-size: 10px;
      padding: 2px 6px;
    }
    .num {
      font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
      font-size: 15px;
      letter-spacing: 0.12em;
      opacity: 0.9;
    }
  `,
})
export class CardTile {
  private readonly logos = inject(LogoService);

  readonly card = input.required<Card>();
  readonly nearby = input(false);
  /** false on the detail screen: no pointer cursor or press lift. */
  readonly interactive = input(true);
  readonly variant = input<'full' | 'logo'>('full');

  protected readonly accent = computed(() => {
    const c = this.card();
    return this.logos.tileColor(c.name, c.merchantId, c.color);
  });
  protected readonly ink = computed(() => inkFor(this.accent()));
  protected readonly hasLogo = computed(() => !!this.logos.logoUrl(this.card().merchantId));
  protected readonly masked = computed(() => {
    const code = this.card().code;
    if (!code) return null;
    return code.length <= 4 ? code : `•••• ${code.slice(-4)}`;
  });
}
