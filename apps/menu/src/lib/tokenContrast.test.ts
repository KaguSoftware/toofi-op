/**
 * Measures the guest screen's real colours: every text pair at 4.5:1 and every control
 * boundary at 3:1, in the light and the dark theme. Reads the token files themselves
 * (@rop/tokens), so a changed token fails here, not in front of a diner.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (name: string) => readFileSync(fileURLToPath(new URL(`../../../../packages/tokens/${name}`, import.meta.url)), 'utf8');

/** `--name: value;` pairs of one CSS block. */
function declarations(css: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of css.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out.set(m[1]!, m[2]!.trim());
  return out;
}

const tokens = read('tokens.css');
const guest = read('guest.css');
const darkAt = guest.indexOf('@media (prefers-color-scheme: dark)');
const lightGuest = guest.slice(0, darkAt);
const darkGuest = guest.slice(darkAt);

const LIGHT = new Map([...declarations(tokens), ...declarations(lightGuest)]);
const DARK = new Map([...LIGHT, ...declarations(darkGuest)]);

function resolve(theme: Map<string, string>, name: string): string {
  let value = theme.get(name);
  if (value === undefined) throw new Error(`no token ${name}`);
  for (let i = 0; i < 8; i++) {
    const ref = /^var\((--[\w-]+)\)$/.exec(value);
    if (!ref) return value;
    value = theme.get(ref[1]!);
    if (value === undefined) throw new Error(`no token ${ref[1]}`);
  }
  throw new Error(`token loop at ${name}`);
}

/** oklch(L C H) to linear sRGB (Björn Ottosson's matrices). */
function linearRgb(value: string): [number, number, number] {
  const m = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*[\d.]+)?\)$/.exec(value);
  if (!m) throw new Error(`not an oklch colour: ${value}`);
  const [L, C, h] = [Number(m[1]), Number(m[2]), (Number(m[3]) * Math.PI) / 180];
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const mm = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const clamp = (x: number) => Math.min(1, Math.max(0, x));
  return [
    clamp(4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s),
    clamp(-1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s),
    clamp(-0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * s),
  ];
}
const luminance = ([r, g, b]: [number, number, number]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

function ratio(theme: Map<string, string>, fg: string, bg: string): number {
  const [a, b] = [luminance(linearRgb(resolve(theme, fg))), luminance(linearRgb(resolve(theme, bg)))];
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** [text colour, what it sits on, where it is used] */
const TEXT: Array<[string, string, string]> = [
  ['--rop-text', '--rop-bg', 'page text'],
  ['--rop-text', '--rop-raised', 'sheet and button text'],
  ['--rop-text', '--rop-row-card', 'dish name and price'],
  ['--rop-text-muted', '--rop-bg', 'hints'],
  ['--rop-text-muted', '--rop-raised', 'sheet hints'],
  ['--rop-text-muted', '--rop-surface', 'Your order, empty'],
  ['--rop-text-muted', '--rop-row-card', 'no-photo tile icon label'],
  ['--rop-brand-ink', '--rop-bg', 'section headings'],
  ['--rop-brand-ink', '--rop-raised', 'category tile icon and name'],
  ['--rop-brand-ink', '--rop-row-card', 'plus button'],
  ['--rop-on-brand', '--rop-brand', 'selected category tile'],
  ['--rop-on-charcoal', '--rop-charcoal', 'Call waiter, table plate'],
  ['--rop-copper-light', '--rop-charcoal', 'plate label, call-again time'],
  ['--rop-text', '--rop-warning-tint', 'waiting strip'],
  ['--rop-text', '--rop-success-tint', 'good-news strip'],
  ['--rop-olive', '--rop-row-card', 'count in the order'],
  ['--rop-success-text', '--rop-olive', 'filled plus'],
  ['--rop-on-terra', '--rop-terra', 'Your order with items (ticket 05)'],
  ['--rop-brand-ink', '--rop-surface', 'retry link'],
];

/** Control boundaries and drawn icons (not text): [colour, what it sits on, where it is used] */
const BOUNDARY: Array<[string, string, string]> = [
  ['--rop-border-strong', '--rop-bg', 'language button, reason tiles'],
  ['--rop-border-strong', '--rop-raised', 'category tiles'],
  ['--rop-brand-ink', '--rop-row-card', 'plus button ring'],
  ['--rop-charcoal-border', '--rop-bg', 'Call waiter edge'],
  ['--rop-copper-light', '--rop-brand', 'selected tile icon'],
  ['--rop-brand-ink', '--rop-raised', 'category and reason icons'],
];

describe.each([
  ['light', LIGHT],
  ['dark', DARK],
] as const)('contrast, %s theme', (_name, theme) => {
  it.each(TEXT)('%s on %s is at least 4.5:1 (%s)', (fg, bg) => {
    expect(ratio(theme, fg, bg)).toBeGreaterThanOrEqual(4.5);
  });
  it.each(BOUNDARY)('%s on %s is at least 3:1 (%s)', (fg, bg) => {
    // The Call waiter button is a solid fill: its own colour against the page also counts.
    const edge = ratio(theme, fg, bg);
    const fill = fg === '--rop-charcoal-border' ? ratio(theme, '--rop-charcoal', bg) : 0;
    expect(Math.max(edge, fill)).toBeGreaterThanOrEqual(3);
  });
});

describe('the contrast meter itself', () => {
  it('reads black on white as 21:1', () => {
    const t = new Map([['--w', 'oklch(1 0 0)'], ['--k', 'oklch(0 0 0)']]);
    expect(ratio(t, '--k', '--w')).toBeCloseTo(21, 0);
  });
});
