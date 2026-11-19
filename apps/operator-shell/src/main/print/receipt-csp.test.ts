import { describe, expect, it } from 'vitest';
import { RECEIPT_CSP, withReceiptCsp } from './receipt-csp';

describe('withReceiptCsp', () => {
  it('injects the CSP meta at the start of an existing head', () => {
    const out = withReceiptCsp('<!doctype html><html><head><title>x</title></head><body>hi</body></html>');
    expect(out).toContain(`<head><meta http-equiv="Content-Security-Policy" content="${RECEIPT_CSP}"><title>`);
  });
  it('adds a head when there is none, and when there is no html at all', () => {
    expect(withReceiptCsp('<html><body>a</body></html>')).toMatch(/<html><head><meta http-equiv="Content-Security-Policy"/);
    expect(withReceiptCsp('<p>a</p>').startsWith('<head><meta http-equiv="Content-Security-Policy"')).toBe(true);
  });
  it('forbids scripts, remote loads and connections', () => {
    expect(RECEIPT_CSP).toBe("default-src 'none'; style-src 'unsafe-inline'; img-src data:");
  });
});
