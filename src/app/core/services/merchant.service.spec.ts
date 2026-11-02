import { Merchant } from '../models/merchant';
import { MerchantService, norm } from './merchant.service';

const MERCHANTS: Merchant[] = [
  { id: 'mega-image', name: 'Mega Image', aliases: ['mega', 'shop&go'], domain: 'mega-image.ro', osmBrand: 'Mega Image' },
  { id: 'kaufland', name: 'Kaufland', aliases: [], domain: 'kaufland.ro', osmBrand: 'Kaufland' },
  { id: 'carrefour-market', name: 'Carrefour Market', aliases: [], domain: '', osmBrand: 'Carrefour Market' },
  { id: 'natural-high', name: 'Natural High', aliases: ['natural high gym'], domain: '', osmBrand: 'Natural High' },
  { id: 'farmacia-tei', name: 'Farmacia Tei', aliases: [], domain: '', osmBrand: 'Farmacia Tei' },
];

async function loaded(): Promise<MerchantService> {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(MERCHANTS))));
  const service = new MerchantService();
  await service.init();
  return service;
}

describe('norm', () => {
  it('drops case, outer spaces and Romanian diacritics', () => {
    expect(norm('  Ștefan Mărăcineanu ')).toBe('stefan maracineanu');
    expect(norm('ÎNTRARE')).toBe('intrare');
  });
});

describe('MerchantService', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('loads the bundled catalogue', async () => {
    const service = await loaded();
    expect(service.merchants().length).toBe(MERCHANTS.length);
    expect(service.get('natural-high')?.name).toBe('Natural High');
    expect(service.get(undefined)).toBeUndefined();
  });

  it('keeps working with an empty list when the catalogue is missing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })));
    const service = new MerchantService();
    await service.init();
    expect(service.merchants()).toEqual([]);
    expect(service.search('mega')).toEqual([]);
  });

  it('finds by prefix first, then substring', async () => {
    const service = await loaded();
    const names = service.search('mar').map((m) => m.name);
    expect(names).toEqual(['Carrefour Market']); // substring only
    expect(service.search('na').map((m) => m.name)).toEqual(['Natural High']);
    expect(service.search('ca')[0].name).toBe('Carrefour Market');
  });

  it('matches aliases and ignores case', async () => {
    const service = await loaded();
    expect(service.search('SHOP&')[0].id).toBe('mega-image');
    expect(service.match('MEGA')?.id).toBe('mega-image');
    expect(service.match('natural high gym')?.id).toBe('natural-high');
    expect(service.match('Lidl')).toBeUndefined();
  });

  it('returns nothing for a blank query and respects the limit', async () => {
    const service = await loaded();
    expect(service.search('   ')).toEqual([]);
    expect(service.search('a', 2).length).toBe(2);
  });
});
