import { useMemo } from 'react';
import { makeT } from '@rop/i18n';
import { productName } from '../../lib/brand';
import { QR_INK, QR_PAPER, qrModules, qrPath, qrScale, QUIET_MODULES } from './qrLogic';

// A6 portrait, 105 × 148 mm at 4 units per mm.
const W = 420;
const H = 592;
const BOX = 232;
const BOX_X = (W - BOX) / 2;
const BOX_Y = 240;

const en = makeT('en');
const ar = makeT('ar');

/**
 * The card for one table: restaurant name, "Table" and its label, the code, and what to do, in
 * both languages whatever the app's language is. The code is black on white and never takes a
 * brand colour; everything around it uses the tokens, so the card reads as part of the app.
 */
export function QrCard({ label, url }: { label: string; url: string }) {
  const { d, size } = useMemo(() => qrPath(qrModules(url)), [url]);
  const scale = qrScale(size, BOX);
  const labelSize = label.length <= 3 ? 88 : label.length <= 6 ? 60 : 40;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`${en('guestSetup.cardTable')} ${label}`}
      className="qr-card"
    >
      <rect width={W} height={H} rx="18" className="qr-card__paper" />
      <path d={`M0 18a18 18 0 0 1 18-18h${W - 36}a18 18 0 0 1 18 18v74H0z`} className="qr-card__band" />
      <text x={W / 2} y="58" textAnchor="middle" className="qr-card__name">
        {productName}
      </text>
      <text x={W / 2} y="140" textAnchor="middle" className="qr-card__word">
        {en('guestSetup.cardTable')} · <tspan lang="ar">{ar('guestSetup.cardTable')}</tspan>
      </text>
      <text x={W / 2} y={140 + labelSize * 0.9} textAnchor="middle" fontSize={labelSize} className="qr-card__label">
        {label}
      </text>
      {/* The plate and the modules are fixed colours on purpose: a machine-readable mark, not a brand surface. */}
      <rect x={BOX_X - 10} y={BOX_Y - 10} width={BOX + 20} height={BOX + 20} rx="10" fill={QR_PAPER} />
      <g transform={`translate(${BOX_X + QUIET_MODULES * scale} ${BOX_Y + QUIET_MODULES * scale}) scale(${scale})`}>
        <path d={d} fill={QR_INK} shapeRendering="crispEdges" />
      </g>
      <text x={W / 2} y={BOX_Y + BOX + 50} textAnchor="middle" className="qr-card__scan">
        {en('guestSetup.cardScan')}
      </text>
      <text x={W / 2} y={BOX_Y + BOX + 82} textAnchor="middle" className="qr-card__scan" direction="rtl" lang="ar">
        {ar('guestSetup.cardScan')}
      </text>
    </svg>
  );
}
