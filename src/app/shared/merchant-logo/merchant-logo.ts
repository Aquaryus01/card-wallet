import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { LogoService } from '../../core/services/logo.service';
import { initials } from '../../core/util/color';

/** Shows a merchant logo, or a coloured tile with the merchant's initials. */
@Component({
  selector: 'app-merchant-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (logoUrl(); as url) {
      <img [src]="url" [alt]="name()" (error)="broken.set(true)" />
    } @else {
      <span class="initials" [style.background]="tileColor()">{{ text() }}</span>
    }
  `,
  styles: `
    :host {
      display: block;
      width: var(--logo-size, 56px);
      height: var(--logo-size, 56px);
    }
    img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      border-radius: 12px;
      background: #fff;
      padding: 6px;
      box-sizing: border-box;
    }
    .initials {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;
      border-radius: 12px;
      color: #fff;
      font-weight: 700;
      font-size: calc(var(--logo-size, 56px) * 0.38);
      letter-spacing: 0.02em;
    }
  `,
})
export class MerchantLogo {
  private readonly logos = inject(LogoService);

  readonly name = input.required<string>();
  readonly merchantId = input<string | undefined>();
  readonly color = input<string | undefined>();

  protected readonly broken = signal(false);
  protected readonly logoUrl = computed(() => (this.broken() ? null : this.logos.logoUrl(this.merchantId())));
  protected readonly text = computed(() => initials(this.name()));
  protected readonly tileColor = computed(() => this.logos.tileColor(this.name(), this.merchantId(), this.color()));
}
