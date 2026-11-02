/** 32-bit FNV-1a hash: stable across launches and platforms. */
function hash(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Deterministic tile colour: saturation 60–70%, lightness 45–55%, so white text stays readable. */
export function colorFromName(name: string): string {
  const h = hash(name.trim().toLowerCase());
  const hue = h % 360;
  const sat = 60 + ((h >>> 9) % 11);
  const light = 45 + ((h >>> 17) % 11);
  return `hsl(${hue}, ${sat}%, ${light}%)`;
}

/**
 * Text colour that stays readable on `bg`. Hex colours are checked by luminance;
 * other formats (our generated hsl() tiles are always mid-lightness) get white.
 */
export function inkFor(bg: string): string {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(bg.trim());
  if (!m) return '#fff';
  const hex = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  const [r, g, b] = [0, 2, 4].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.45 ? '#1c1c1e' : '#fff';
}

export function initials(name: string): string {
  const words = name
    .trim()
    .split(/[\s\-_.&]+/)
    .filter((w) => w.length > 0);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/**
 * Dominant brand colour of a logo image as #rrggbb, or null if it can't be read or is blank.
 * Near-white and transparent pixels (favicon backgrounds) are ignored, and saturated
 * pixels outweigh greys, so a coloured mark on a white tile wins over its outline/text.
 */
export async function dominantColor(url: string): Promise<string | null> {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = url;
  try {
    await img.decode();
  } catch {
    return null;
  }

  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, size, size);
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, size, size).data;
  } catch {
    return null; // tainted canvas
  }

  // Bucket by 4 bits per channel; keep running sums to average the winning bucket.
  const buckets = new Map<number, { w: number; r: number; g: number; b: number }>();
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
    if (a < 128 || (r > 230 && g > 230 && b > 230)) continue;
    const max = Math.max(r, g, b);
    const sat = max === 0 ? 0 : (max - Math.min(r, g, b)) / max;
    const w = 1 + sat * 4;
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const s = buckets.get(key) ?? { w: 0, r: 0, g: 0, b: 0 };
    s.w += w;
    s.r += r * w;
    s.g += g * w;
    s.b += b * w;
    buckets.set(key, s);
  }

  let best: { w: number; r: number; g: number; b: number } | null = null;
  for (const s of buckets.values()) if (!best || s.w > best.w) best = s;
  // Too few coloured pixels: a mostly-blank image, not worth a background.
  if (!best || best.w < 8) return null;
  const hex = (v: number) => Math.round(v / best!.w).toString(16).padStart(2, '0');
  return `#${hex(best.r)}${hex(best.g)}${hex(best.b)}`;
}
