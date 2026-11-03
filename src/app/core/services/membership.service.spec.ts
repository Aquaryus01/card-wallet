import { Card } from '../models/card';
import { MembershipService, parse, summarize } from './membership.service';

const MEMBER_URL = 'https://nhb.naturalhigh.ro/abonat/0123456789abcdef0123456789abcdef.html';

/** The member page as served on 2026-11-02 (trimmed to the parts that matter). */
const PAGE = `<!DOCTYPE HTML><html><head><title>Abonati NH Bucuresti</title></head><body>
<div class="container mt80"><div class="wrapper"><div class="twoCol column">
<!---aici cont-->
<div class="abonament "><span>Abonament: 8 intrari</span>6 intrari <span>Expira: 23.11.2026 </span>
</div></div></div></div></body></html>`;

function card(partial: Partial<Card>): Card {
  return { id: 'c1', name: 'Natural High', locations: [], createdAt: 0, lastUsedAt: null, ...partial };
}

describe('parse (Natural High member page)', () => {
  it('reads plan, entries left and expiry', () => {
    const info = parse(PAGE);
    expect(info.plan).toBe('8 intrari');
    expect(info.totalEntries).toBe(8);
    expect(info.remainingEntries).toBe(6);
    expect(info.expires).toBe('2026-11-23');
  });

  it('pads single-digit day and month', () => {
    const info = parse(PAGE.replace('23.11.2026', '3.1.2027'));
    expect(info.expires).toBe('2027-01-03');
  });

  it('handles an unlimited plan with no entry count', () => {
    const info = parse(
      '<div class="abonament"><span>Abonament: Nelimitat</span><span>Expira: 01.12.2026</span></div>',
    );
    expect(info.plan).toBe('Nelimitat');
    expect(info.totalEntries).toBeNull();
    expect(info.remainingEntries).toBeNull();
    expect(info.expires).toBe('2026-12-01');
  });

  it('reports no subscription when the block is missing', () => {
    const info = parse('<html><body><p>Nu aveti abonament activ</p></body></html>');
    expect(info.plan).toBeNull();
    expect(info.remainingEntries).toBeNull();
    expect(info.expires).toBeNull();
  });
});

describe('summarize', () => {
  afterEach(() => vi.useRealTimers());

  const base = { plan: '8 intrari', totalEntries: 8, remainingEntries: 6, expires: '2026-11-23', fetchedAt: 0 };

  it('counts calendar days left until the expiry date', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-02T12:00:00'));
    const s = summarize(base);
    expect(s.daysLabel).toBe('21 days left');
    vi.setSystemTime(new Date('2026-11-02T23:59:00'));
    expect(summarize(base).daysLabel).toBe('21 days left'); // same all day
    vi.setSystemTime(new Date('2026-10-20T09:00:00')); // across the late-October DST change
    expect(summarize(base).daysLabel).toBe('34 days left');
    expect(s.expired).toBe(false);
    expect(s.progress).toBeCloseTo(0.75);
  });

  it('says "Last day" on the expiry day and "1 day left" the day before', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-23T09:00:00'));
    expect(summarize(base).daysLabel).toBe('Last day');
    vi.setSystemTime(new Date('2026-11-22T09:00:00'));
    expect(summarize(base).daysLabel).toBe('1 day left');
  });

  it('flags an expired subscription', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-25T09:00:00'));
    const s = summarize(base);
    expect(s.daysLabel).toBe('Expired');
    expect(s.expired).toBe(true);
  });

  it('clamps progress and leaves it out when counts are unknown', () => {
    expect(summarize({ ...base, remainingEntries: 10 }).progress).toBe(1);
    expect(summarize({ ...base, remainingEntries: 0 }).progress).toBe(0);
    expect(summarize({ ...base, totalEntries: null }).progress).toBeNull();
    expect(summarize({ ...base, expires: null }).daysLabel).toBeNull();
  });
});

describe('MembershipService', () => {
  const service = new MembershipService();

  it('recognises Natural High member links, upgrading http to https', () => {
    expect(service.pageUrl(card({ code: MEMBER_URL }))).toBe(MEMBER_URL);
    expect(service.pageUrl(card({ code: MEMBER_URL.replace('https', 'http') }))).toBe(MEMBER_URL);
    expect(service.pageUrl(card({ code: `  ${MEMBER_URL}  ` }))).toBe(MEMBER_URL);
  });

  it('accepts member pages on other Natural High hosts', () => {
    const url = MEMBER_URL.replace('nhb.', 'abonati.');
    expect(service.pageUrl(card({ code: url }))).toBe(url);
  });

  it('ignores other codes and look-alike sites', () => {
    expect(service.pageUrl(card({ code: '9930003376806' }))).toBeNull();
    expect(service.pageUrl(card({ code: 'https://evil.example/abonat/0123456789abcdef.html' }))).toBeNull();
    expect(service.pageUrl(card({ code: 'https://nhb.naturalhigh.ro/abonat/../admin.html' }))).toBeNull();
    expect(service.pageUrl(card({ code: 'https://naturalhigh.ro.evil.example/abonat/0123456789abcdef.html' }))).toBeNull();
    expect(service.pageUrl(card({ code: 'https://evil.example/x.naturalhigh.ro/abonat/0123456789abcdef.html' }))).toBeNull();
    expect(service.pageUrl(undefined)).toBeNull();
  });

  it('treats detected links and hand-marked cards as memberships', () => {
    expect(service.isMembership(card({ code: MEMBER_URL }))).toBe(true);
    expect(service.isMembership(card({ code: '123', membership: true }))).toBe(true);
    expect(service.isMembership(card({ code: '123' }))).toBe(false);
  });
});
