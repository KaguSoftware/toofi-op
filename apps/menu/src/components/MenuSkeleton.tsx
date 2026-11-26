/** Skeleton rows while the menu loads: the page keeps its shape, never a blank screen. */
export function MenuSkeleton({ label }: { label: string }) {
  return (
    <div className="skeleton" role="status" aria-busy="true" aria-label={label}>
      <div className="skeleton__rail">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="skeleton__tile" />
        ))}
      </div>
      <ul className="skeleton__rows" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <li key={i} className="skeleton__row">
            <span className="skeleton__photo" />
            <span className="skeleton__lines">
              <span />
              <span />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
