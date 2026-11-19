/** A receipt is static text and inline style: nothing may load, run or connect. */
export const RECEIPT_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:";

const META = `<meta http-equiv="Content-Security-Policy" content="${RECEIPT_CSP}">`;

/** Put the CSP meta first in the receipt's <head> (creating a head when there is none). */
export function withReceiptCsp(html: string): string {
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m) => `${m}${META}`);
  if (/<html[^>]*>/i.test(html)) return html.replace(/<html[^>]*>/i, (m) => `${m}<head>${META}</head>`);
  return `<head>${META}</head>${html}`;
}
