// Pure: the receipt as a small 80 mm-friendly HTML document. Every figure is a server
// figure (compute_tab_totals / payments); nothing is recomputed here.
import { formatDateTime, formatIQD, makeT, type Locale } from '@rop/i18n';
import type { Method, Totals } from './tillLogic';

export interface ReceiptSettings {
  receipt_header_en: string;
  receipt_header_ar: string;
  receipt_footer_en: string;
  receipt_footer_ar: string;
}

export interface ReceiptTab {
  tableLabel: string | null;
  openedAt: string;
  closedAt: string | null;
}

export interface ReceiptLine {
  nameEn: string;
  nameAr: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  voided: boolean;
}

export interface ReceiptPayment {
  method: Method;
  amount: number;
  tendered: number | null;
  change: number;
}

export interface ReceiptInput {
  settings: ReceiptSettings | null;
  tab: ReceiptTab;
  lines: readonly ReceiptLine[];
  totals: Totals;
  payments: readonly ReceiptPayment[];
  locale: Locale;
}

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const STYLE = `@page{size:80mm auto;margin:0}
body{width:72mm;margin:0 auto;padding:4mm 0;font:13px/1.35 system-ui,sans-serif;color:#000}
h1{font-size:16px;text-align:center;margin:0 0 2mm}
p{margin:0}.c{text-align:center}
table{width:100%;border-collapse:collapse}
td{padding:1px 0;vertical-align:top}td.n{text-align:end;white-space:nowrap}
.total td{font-weight:bold;font-size:15px;border-top:1px solid #000}
hr{border:0;border-top:1px dashed #000;margin:2mm 0}`;

/** Receipt pages are static text and inline style; nothing may load or run. Mirrors the shell's print window. */
export const RECEIPT_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:";

export function buildReceiptHtml(i: ReceiptInput): string {
  const { locale, totals } = i;
  const tr = makeT(locale);
  const money = (n: number) => esc(formatIQD(n, locale));
  const header = (locale === 'ar' ? i.settings?.receipt_header_ar : i.settings?.receipt_header_en) ?? '';
  const footer = (locale === 'ar' ? i.settings?.receipt_footer_ar : i.settings?.receipt_footer_en) ?? '';
  const when = new Date(i.tab.closedAt ?? i.tab.openedAt);

  const lines = i.lines
    .filter((l) => !l.voided)
    .map((l) => {
      const name = locale === 'ar' ? l.nameAr : l.nameEn;
      return `<tr><td>${esc(name)}<br><small>${l.qty} × ${money(l.unitPrice)}</small></td><td class="n">${money(l.lineTotal)}</td></tr>`;
    })
    .join('');

  const row = (label: string, amount: number, cls = '') =>
    `<tr${cls ? ` class="${cls}"` : ''}><td>${esc(label)}</td><td class="n">${money(amount)}</td></tr>`;

  const totalRows = [
    totals.discount > 0 ? row(tr('till.receipt.subtotal'), totals.subtotal) : '',
    totals.discount > 0 ? row(tr('till.receipt.discount'), -totals.discount) : '',
    row(tr('till.receipt.total'), totals.total, 'total'),
    row(tr('till.receipt.taxIncluded'), totals.tax),
  ].join('');

  const payRows = i.payments
    .map((p) => {
      const label = tr(p.method === 'cash' ? 'till.method.cash' : 'till.method.card');
      return (
        row(label, p.amount) +
        (p.method === 'cash' && p.tendered != null ? row(tr('till.receipt.tendered'), p.tendered) : '') +
        (p.change > 0 ? row(tr('till.receipt.change'), p.change) : '')
      );
    })
    .join('');

  return `<!doctype html>
<html lang="${locale}" dir="${locale === 'ar' ? 'rtl' : 'ltr'}">
<head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${RECEIPT_CSP}"><title>${esc(tr('till.receipt.title'))}</title><style>${STYLE}</style></head>
<body>
${header ? `<h1>${esc(header)}</h1>` : ''}
${i.tab.tableLabel ? `<p>${esc(tr('till.receipt.table'))}: ${esc(i.tab.tableLabel)}</p>` : ''}
<p>${esc(formatDateTime(when, locale))}</p>
<hr>
<table>${lines}</table>
<hr>
<table>${totalRows}</table>
<hr>
<table>${payRows}</table>
${footer ? `<hr><p class="c">${esc(footer)}</p>` : ''}
</body>
</html>`;
}
