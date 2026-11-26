'use client';

import { useEffect, useRef } from 'react';
import { CategoryIcon } from './Icon';

export interface RailTile {
  id: string;
  name: string;
  icon: string;
}

/** The sideways category rail. Tapping scrolls to the section; the selected tile follows the scroll. */
export function CategoryRail({ label, tiles, activeIndex, onPick }: { label: string; tiles: RailTile[]; activeIndex: number; onPick: (index: number) => void }) {
  const tileRefs = useRef<Array<HTMLAnchorElement | null>>([]);
  const first = useRef(true);

  useEffect(() => {
    // Nothing to follow on the first paint; after that keep the selected tile in view.
    if (first.current) {
      first.current = false;
      return;
    }
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    tileRefs.current[activeIndex]?.scrollIntoView?.({ inline: 'center', block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
  }, [activeIndex]);

  return (
    <nav className="rail" aria-label={label}>
      {tiles.map((tile, i) => (
        <a
          key={tile.id}
          ref={(el) => {
            tileRefs.current[i] = el;
          }}
          href={`#cat-${tile.id}`}
          className={i === activeIndex ? 'tile tile--on' : 'tile'}
          aria-current={i === activeIndex ? 'true' : undefined}
          onClick={(e) => {
            e.preventDefault();
            onPick(i);
          }}
        >
          <CategoryIcon icon={tile.icon} />
          <span>{tile.name}</span>
        </a>
      ))}
    </nav>
  );
}
