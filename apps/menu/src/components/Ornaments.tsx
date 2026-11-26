/** The guest screen's drawings, lifted from the approved mock (path data unchanged). Colours come from tokens via CSS classes. */

const PETALS = [0, 45, 90, 135, 180, 225, 270, 315];
const STAMENS = [22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5, 337.5];

/** One curved band from the top edge to the side edge, one eight-petal flower. Mirrors in Arabic (CSS). */
export function CornerOrnament() {
  return (
    <svg className="corner" aria-hidden="true" focusable="false" viewBox="0 0 180 128" width="180" height="128">
      <path className="o-olive" strokeWidth="0.9" d="M65 0V15A100 100 0 0 0 165 115H180" />
      <path className="o-soft" strokeWidth="1.1" strokeDasharray="0 5" opacity="0.6" d="M68.5 0V15A96.5 96.5 0 0 0 165 111.5H180" />
      <path className="o-copper" strokeWidth="0.6" d="M72 0V15A93 93 0 0 0 165 108H180" />
      <path className="o-copper" strokeWidth="0.5" opacity="0.55" d="M57 22A110 110 0 0 0 158 123" />
      <path className="o-copper" strokeWidth="1" d="M78 43C68 32 52 30 43 39C37 45 40 54 48 53C53 52 54 46 49 44M106 60C112 74 124 84 138 84C146 84 149 76 143 72C139 70 135 74 138 78" />
      <path
        className="o-copper"
        strokeWidth="0.75"
        d="M43 39C36 29 26 26 19 31C14 35 16 42 22 42C26 42 27 38 24 36M88 82C78 80 70 84 68 92C67 97 72 100 76 97M60 33C58 26 62 21 67 22C70 23 70 27 67 28M30 28C28 23 30 20 33 20M118 76C114 82 116 88 121 89C124 89 125 86 123 84M100 90C100 98 105 103 110 102C113 101 113 97 110 97"
      />
      <path
        className="o-olive o-olive-fill"
        strokeWidth="0.8"
        d="M64 31C59 23 51 20 44 22C48 30 56 34 64 31ZM70 54C62 55 56 61 54 68C62 68 68 62 70 54ZM33 28C29 22 23 20 18 22C21 28 27 31 33 28ZM118 64C126 63 134 67 138 73C130 75 122 72 118 64ZM92 88C84 90 78 96 76 104C84 103 90 97 92 88Z"
      />
      <path className="o-olive" strokeWidth="0.5" d="M62 30C56 27 50 24 46 23M68 56C63 60 58 64 56 66M31 27C27 25 22 23 19 22M120 65C126 67 132 70 136 72M90 90C85 94 80 99 78 102" />
      <circle className="o-copper" cx="96" cy="45" r="20.5" strokeWidth="1.1" strokeDasharray="0 4.3" opacity="0.8" />
      <circle className="o-copper" cx="96" cy="45" r="17" strokeWidth="0.7" />
      {PETALS.map((angle, i) => (
        <ellipse
          key={angle}
          className={i % 2 === 0 ? 'o-copper o-petal-fill' : 'o-copper'}
          cx="96"
          cy="37"
          rx="3.8"
          ry="7.5"
          strokeWidth={i % 2 === 0 ? 0.6 : 0.7}
          transform={angle === 0 ? undefined : `rotate(${angle} 96 45)`}
        />
      ))}
      {STAMENS.map((angle) => (
        <ellipse key={angle} className="o-stamen" cx="96" cy="41" rx="1.5" ry="3" transform={`rotate(${angle} 96 45)`} />
      ))}
      <circle className="o-copper" cx="96" cy="45" r="4.2" strokeWidth="0.6" />
      <circle className="o-olive-solid" cx="96" cy="45" r="2.4" />
      <path className="o-soft" strokeWidth="2.4" opacity="0.75" d="M49 44h.01M24 36h.01M138 78h.01M76 97h.01M67 28h.01M33 20h.01M123 84h.01M110 97h.01" />
    </svg>
  );
}

/** The scroll motif lying on its side inside every dish row. It never moves. */
export function RowOrnament() {
  return (
    <svg className="row-orn" aria-hidden="true" focusable="false" viewBox="0 0 100 60" width="90" height="54">
      <g transform="translate(100 0) rotate(90)">
        <path d="M30 4C36 14 40 20 30 32C20 20 24 14 30 4Z" stroke="none" />
        <path d="M30 96C36 86 40 80 30 68C20 80 24 86 30 96Z" stroke="none" />
        <path d="M30 40L36 50L30 60L24 50Z" stroke="none" />
        <path d="M36 50C44 44 52 46 56 50C52 54 44 56 36 50Z" stroke="none" />
        <path d="M24 50C16 44 8 46 4 50C8 54 16 56 24 50Z" stroke="none" />
        <path fill="none" d="M31 36C42 34 50 26 48 18C47 13 41 12 39 16C38 19 40 21 42 20" />
        <path fill="none" d="M29 36C18 34 10 26 12 18C13 13 19 12 21 16C22 19 20 21 18 20" />
        <path fill="none" d="M31 64C42 66 50 74 48 82C47 87 41 88 39 84C38 81 40 79 42 80" />
        <path fill="none" d="M29 64C18 66 10 74 12 82C13 87 19 88 21 84C22 81 20 79 18 80" />
      </g>
    </svg>
  );
}

const STAR = 'M6 .5l1.7 3.8 3.8 1.7-3.8 1.7L6 11.5 4.3 7.7.5 6l3.8-1.7z';

/** The four-point star: in the strip under the top bar and at the end of each section heading. */
export function Star({ size, tone }: { size: number; tone: 'copper' | 'olive' }) {
  return (
    <svg className={`star star--${tone}`} aria-hidden="true" focusable="false" viewBox="0 0 12 12" width={size} height={size}>
      <path d={STAR} />
    </svg>
  );
}

/** Rule fading in, copper star, short rule, olive star, rule fading out. */
export function StarStrip() {
  return (
    <div className="strip" aria-hidden="true">
      <span className="strip__rule strip__rule--in" />
      <Star size={11} tone="copper" />
      <span className="strip__rule strip__rule--short" />
      <Star size={11} tone="olive" />
      <span className="strip__rule strip__rule--out" />
    </div>
  );
}
