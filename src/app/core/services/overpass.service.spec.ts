import { escapeRegex } from './overpass.service';

describe('escapeRegex (for Overpass QL string literals)', () => {
  it('leaves plain names alone', () => {
    expect(escapeRegex('Mega Image')).toBe('Mega Image');
  });

  it('escapes regex metacharacters with a doubled backslash for QL', () => {
    expect(escapeRegex('Dr. Max')).toBe('Dr\\\\. Max');
    expect(escapeRegex('C&A (Outlet)')).toBe('C&A \\\\(Outlet\\\\)');
  });

  it('escapes double quotes so the QL string stays closed', () => {
    expect(escapeRegex('Say "hi"')).toBe('Say \\"hi\\"');
  });
});
