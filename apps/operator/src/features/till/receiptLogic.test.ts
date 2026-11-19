import { describe, expect, it } from 'vitest';
import { buildReceiptHtml, type ReceiptInput } from './receiptLogic';

const input: ReceiptInput = {
  settings: {
    receipt_header_en: 'Cafe <Nour>',
    receipt_header_ar: 'مقهى نور',
    receipt_footer_en: 'Thank you',
    receipt_footer_ar: 'شكرا لزيارتكم',
  },
  tab: { tableLabel: 'T5', openedAt: '2026-11-19T15:00:00Z', closedAt: '2026-11-19T17:30:00Z' },
  lines: [
    { nameEn: 'Tea', nameAr: 'شاي', qty: 2, unitPrice: 1500, lineTotal: 3000, voided: false },
    { nameEn: 'Burnt toast', nameAr: 'خبز محروق', qty: 1, unitPrice: 2000, lineTotal: 2000, voided: true },
  ],
  totals: { subtotal: 3000, discount: 300, tax: 0, total: 2700, paid: 2700, refunded: 0, due: 0 },
  payments: [{ method: 'cash', amount: 2700, tendered: 5000, change: 2300 }],
  locale: 'en',
};

describe('buildReceiptHtml', () => {
  it('renders the English receipt: header, table, lines, totals, payment and change', () => {
    const html = buildReceiptHtml(input);
    expect(html).toContain(`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">`);
    expect(html).toContain('lang="en"');
    expect(html).toContain('dir="ltr"');
    expect(html).toContain('Cafe &lt;Nour&gt;'); // escaped
    expect(html).toContain('Thank you');
    expect(html).toContain('T5');
    expect(html).toContain('Tea');
    expect(html).not.toContain('Burnt toast'); // voided lines are left off
    expect(html).toContain('2,700');
    expect(html).toContain('Discount');
    expect(html).toContain('Change');
    expect(html).toContain('2,300');
    expect(html).toContain('Cash');
  });

  it('shows the time in Asia/Baghdad (UTC+3)', () => {
    expect(buildReceiptHtml(input)).toContain('8:30');
  });

  it('renders the Arabic receipt right to left with Arabic header, footer and item names', () => {
    const html = buildReceiptHtml({ ...input, locale: 'ar' });
    expect(html).toContain('lang="ar"');
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('مقهى نور');
    expect(html).toContain('شكرا لزيارتكم');
    expect(html).toContain('شاي');
    expect(html).not.toContain('Cafe');
    expect(html).toContain('الباقي');
  });

  it('omits the discount row, change and empty header when there are none', () => {
    const html = buildReceiptHtml({
      ...input,
      settings: { receipt_header_en: '', receipt_header_ar: '', receipt_footer_en: 'Thank you', receipt_footer_ar: '' },
      totals: { ...input.totals, discount: 0, subtotal: 2700 },
      payments: [{ method: 'card', amount: 2700, tendered: null, change: 0 }],
    });
    expect(html).not.toContain('Discount');
    expect(html).not.toContain('Change');
    expect(html).toContain('Card');
  });
});
