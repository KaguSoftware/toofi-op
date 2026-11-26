// Pure logic for the printed table cards: the address in the code, its production guard,
// and the code's geometry. No react, no supabase.
// Imports qrcode's pure encoder, not the package entry: the entry pulls the Node renderers.
import { create } from 'qrcode/lib/core/qrcode';

export interface QrModules {
  size: number;
  /** Row-major, 1 = dark module. */
  data: ArrayLike<number>;
}

/** Encode text at error-correction level M and return the module matrix. */
export function qrModules(text: string): QrModules {
  const qr = create(text, { errorCorrectionLevel: 'M' });
  return { size: qr.modules.size, data: qr.modules.data };
}

/** The code is black on white, always: a brand colour once made a table code unreadable. */
export const QR_INK = 'black';
export const QR_PAPER = 'white';
/** The white margin a scanner needs around the code, in modules. */
export const QUIET_MODULES = 4;

/**
 * One path for the dark modules as horizontal runs, not one square per module: a printer that
 * rounds each square leaves hairline seams a scanner cannot read through.
 */
export function qrPath(modules: QrModules): { d: string; size: number } {
  const { size, data } = modules;
  let d = '';
  for (let y = 0; y < size; y++) {
    let x = 0;
    while (x < size) {
      if (!data[y * size + x]) {
        x++;
        continue;
      }
      let run = 1;
      while (x + run < size && data[y * size + x + run]) run++;
      d += `M${x} ${y}h${run}v1h-${run}z`;
      x += run;
    }
  }
  return { d, size };
}

/** Card units per module, so the modules and their quiet zone fill `box`. */
export function qrScale(size: number, box: number): number {
  return box / (size + QUIET_MODULES * 2);
}

const LOCAL_HOST =
  /^(localhost|0\.0\.0\.0|127(\.\d{1,3}){3}|\[::1\]|10(\.\d{1,3}){3}|192\.168(\.\d{1,3}){2}|172\.(1[6-9]|2\d|3[01])(\.\d{1,3}){2}|169\.254(\.\d{1,3}){2})$|\.(local|localhost|internal)$/i;

export type MenuSite = { ok: true; base: string } | { ok: false; reason: 'missing' | 'invalid' | 'local' };

/**
 * The guest site's address as printed on cards. A card is screwed to a table, so a wrong
 * address is a dead card for months: a missing or unreadable address is always refused, and a
 * production build also refuses localhost, a private network and a one-word host. A development
 * build allows a local address so a card can be tried on a phone.
 */
export function menuSiteBase(raw: string | undefined, isProduction: boolean): MenuSite {
  const value = raw?.trim();
  if (!value) return { ok: false, reason: 'missing' };
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { ok: false, reason: 'invalid' };
  const host = url.hostname;
  const oneWord = !host.includes('.') && !host.startsWith('[');
  if (isProduction && (LOCAL_HOST.test(host) || oneWord)) return { ok: false, reason: 'local' };
  return { ok: true, base: url.origin + url.pathname.replace(/\/+$/, '') };
}

/** The address a table's code carries. */
export function tableUrl(base: string, token: string): string {
  return `${base}/t/${token}`;
}

const byLabel = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** Tables in the order people read them: T2 before T10. */
export function sortForPrint<T extends { label: string }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => byLabel.compare(a.label, b.label));
}
