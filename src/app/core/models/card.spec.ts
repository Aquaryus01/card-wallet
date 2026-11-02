import { CODE_FORMATS, codeFormatInfo, guessFormat } from './card';

describe('guessFormat', () => {
  it('picks QR for web links, e.g. a gym membership page', () => {
    expect(guessFormat('https://nhb.naturalhigh.ro/abonat/0123456789abcdef0123456789abcdef.html')).toBe('QR_CODE');
    expect(guessFormat('http://example.com')).toBe('QR_CODE');
  });

  it('recognises EAN/UPC lengths', () => {
    expect(guessFormat('9930003376806')).toBe('EAN_13');
    expect(guessFormat('96385074')).toBe('EAN_8');
    expect(guessFormat('460044955986')).toBe('UPC_A');
  });

  it('falls back to Code 128 for anything else', () => {
    expect(guessFormat('ABC-123')).toBe('CODE_128');
    expect(guessFormat('12345')).toBe('CODE_128');
    expect(guessFormat('99300033768061')).toBe('CODE_128'); // 14 digits
  });
});

describe('codeFormatInfo', () => {
  it('marks 2D symbologies, which are drawn square', () => {
    expect(codeFormatInfo('QR_CODE')?.twoD).toBe(true);
    expect(codeFormatInfo('EAN_13')?.twoD).toBe(false);
  });

  it('returns undefined for no format', () => {
    expect(codeFormatInfo(undefined)).toBeUndefined();
  });

  it('has a renderer id for every format', () => {
    for (const f of CODE_FORMATS) expect(f.bcid).toBeTruthy();
  });
});
