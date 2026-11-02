import { distanceM } from './geo';

describe('distanceM', () => {
  it('is zero for the same point', () => {
    expect(distanceM({ lat: 44.4467, lng: 26.097 }, { lat: 44.4467, lng: 26.097 })).toBe(0);
  });

  it('measures short distances to within a metre', () => {
    // 0.001° of latitude ≈ 111.2 m everywhere.
    expect(distanceM({ lat: 44.4467, lng: 26.097 }, { lat: 44.4477, lng: 26.097 })).toBeCloseTo(111.2, 0);
  });

  it('measures city-scale distances', () => {
    // Piața Romană → Piața Unirii, Bucharest: about 2.6 km.
    const d = distanceM({ lat: 44.4467, lng: 26.097 }, { lat: 44.4268, lng: 26.1025 });
    expect(d).toBeGreaterThan(2200);
    expect(d).toBeLessThan(2400);
  });

  it('is symmetric', () => {
    const a = { lat: 44.43, lng: 26.1 };
    const b = { lat: 45.75, lng: 21.23 };
    expect(distanceM(a, b)).toBeCloseTo(distanceM(b, a), 6);
  });
});
