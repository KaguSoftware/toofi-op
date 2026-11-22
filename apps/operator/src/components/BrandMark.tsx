// The brand mark: a date-palm sprig with a terra cotta bud inside a double copper arch frame,
// drawn in line like the brand's palette marks. Decorative; the product name beside it is the label.
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      className={className ? `rop-mark ${className}` : 'rop-mark'}
      viewBox="0 0 40 48"
      aria-hidden="true"
      focusable="false"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect className="rop-mark__frame" x="2" y="2" width="36" height="44" rx="18" strokeWidth="1.6" />
      <rect className="rop-mark__frame rop-mark__frame--inner" x="5.5" y="5.5" width="29" height="37" rx="14.5" strokeWidth="1" />
      <path className="rop-mark__line" strokeWidth="1.6" d="M20 39V17" />
      <path className="rop-mark__line" strokeWidth="1.4" d="M20 34c-4.6-.4-7.4-3.3-7.6-7.4 4 .2 6.9 3 7.6 7.4ZM20 29.5c4.6-.4 7.4-3.3 7.6-7.4-4 .2-6.9 3-7.6 7.4ZM20 25c-3.8-.4-6.2-3-6.3-6.4 3.3.2 5.7 2.6 6.3 6.4ZM20 21c3.4-.4 5.4-2.6 5.5-5.6-2.9.2-5 2.3-5.5 5.6Z" />
      <circle className="rop-mark__bud" cx="20" cy="11.4" r="2.7" />
    </svg>
  );
}
