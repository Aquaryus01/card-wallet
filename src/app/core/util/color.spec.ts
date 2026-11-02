import { colorFromName, initials, inkFor } from './color';

describe('colorFromName', () => {
  it('is stable for the same name, ignoring case and outer spaces', () => {
    expect(colorFromName('Kaufland')).toBe(colorFromName('  kaufland '));
  });

  it('gives different names different colours', () => {
    expect(colorFromName('Kaufland')).not.toBe(colorFromName('Lidl'));
  });

  it('stays in the readable mid range (white text on top)', () => {
    for (const name of ['A', 'Mega Image', 'dm', 'Natural High', 'x'.repeat(40)]) {
      const [, h, s, l] = /^hsl\((\d+), (\d+)%, (\d+)%\)$/.exec(colorFromName(name))!.map(Number);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(360);
      expect(s).toBeGreaterThanOrEqual(60);
      expect(s).toBeLessThanOrEqual(70);
      expect(l).toBeGreaterThanOrEqual(45);
      expect(l).toBeLessThanOrEqual(55);
    }
  });
});

describe('inkFor', () => {
  it('uses dark text on light backgrounds', () => {
    expect(inkFor('#ffffff')).toBe('#1c1c1e');
    expect(inkFor('#f2c200')).toBe('#1c1c1e'); // dm yellow
    expect(inkFor('#fff')).toBe('#1c1c1e');
  });

  it('uses white text on dark or saturated backgrounds', () => {
    expect(inkFor('#000000')).toBe('#fff');
    expect(inkFor('#c8102e')).toBe('#fff'); // Mega Image red
    expect(inkFor('#0b4fa8')).toBe('#fff');
  });

  it('uses white for non-hex colours (generated hsl tiles)', () => {
    expect(inkFor('hsl(200, 65%, 50%)')).toBe('#fff');
  });
});

describe('initials', () => {
  it('takes the first letters of the first two words', () => {
    expect(initials('Mega Image')).toBe('MI');
    expect(initials('shop & go')).toBe('SG');
    expect(initials('dr-max')).toBe('DM');
  });

  it('takes two letters of a single word', () => {
    expect(initials('kaufland')).toBe('KA');
  });

  it('shows ? for an empty name', () => {
    expect(initials('   ')).toBe('?');
  });
});
