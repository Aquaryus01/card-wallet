export type CodeFormat =
  | 'QR_CODE'
  | 'EAN_13'
  | 'EAN_8'
  | 'UPC_A'
  | 'UPC_E'
  | 'CODE_128'
  | 'CODE_39'
  | 'CODE_93'
  | 'ITF'
  | 'CODABAR'
  | 'PDF_417'
  | 'AZTEC'
  | 'DATA_MATRIX';

export interface CodeFormatInfo {
  value: CodeFormat;
  label: string;
  /** bwip-js symbology id */
  bcid: string;
  /** 2D symbologies are rendered square */
  twoD: boolean;
}

/** Format values intentionally match @capacitor-mlkit/barcode-scanning's BarcodeFormat enum strings. */
export const CODE_FORMATS: readonly CodeFormatInfo[] = [
  { value: 'CODE_128', label: 'Code 128', bcid: 'code128', twoD: false },
  { value: 'EAN_13', label: 'EAN-13', bcid: 'ean13', twoD: false },
  { value: 'EAN_8', label: 'EAN-8', bcid: 'ean8', twoD: false },
  { value: 'UPC_A', label: 'UPC-A', bcid: 'upca', twoD: false },
  { value: 'UPC_E', label: 'UPC-E', bcid: 'upce', twoD: false },
  { value: 'CODE_39', label: 'Code 39', bcid: 'code39', twoD: false },
  { value: 'CODE_93', label: 'Code 93', bcid: 'code93', twoD: false },
  { value: 'ITF', label: 'ITF (Interleaved 2 of 5)', bcid: 'interleaved2of5', twoD: false },
  { value: 'CODABAR', label: 'Codabar', bcid: 'rationalizedCodabar', twoD: false },
  { value: 'QR_CODE', label: 'QR code', bcid: 'qrcode', twoD: true },
  { value: 'PDF_417', label: 'PDF417', bcid: 'pdf417', twoD: true },
  { value: 'AZTEC', label: 'Aztec', bcid: 'azteccode', twoD: true },
  { value: 'DATA_MATRIX', label: 'Data Matrix', bcid: 'datamatrix', twoD: true },
];

export function codeFormatInfo(format: CodeFormat | undefined): CodeFormatInfo | undefined {
  return CODE_FORMATS.find((f) => f.value === format);
}

/** Best guess for manually typed codes; the user can still override it. */
export function guessFormat(code: string): CodeFormat {
  // Links (e.g. a membership page from an email) only fit in a QR code.
  if (/^https?:\/\//i.test(code)) return 'QR_CODE';
  if (/^\d{13}$/.test(code)) return 'EAN_13';
  if (/^\d{8}$/.test(code)) return 'EAN_8';
  if (/^\d{12}$/.test(code)) return 'UPC_A';
  return 'CODE_128';
}

export const DEFAULT_RADIUS_M = 150;

export interface CardLocation {
  lat: number;
  lng: number;
  label: string;
  radiusM: number;
}

export interface Card {
  id: string;
  merchantId?: string;
  name: string;
  code?: string;
  codeFormat?: CodeFormat;
  /** Path relative to Directory.Data */
  frontPhoto?: string;
  /** Path relative to Directory.Data */
  backPhoto?: string;
  color?: string;
  notes?: string;
  /** Listed under Memberships (gym, pool, pass) even when its status can't be read automatically. */
  membership?: boolean;
  locations: CardLocation[];
  createdAt: number;
  /** null until the card is opened for the first time */
  lastUsedAt: number | null;
}

export type CardDraft = Omit<Card, 'id' | 'createdAt' | 'lastUsedAt'>;
