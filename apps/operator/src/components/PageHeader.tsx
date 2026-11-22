import type { ReactNode } from 'react';

export interface PageHeaderProps {
  title: ReactNode;
  /** One quiet status line under the title: counts, times, who. */
  meta?: ReactNode;
  /** Screen-level controls, aligned to the inline end. */
  actions?: ReactNode;
  /** Something before the title, such as a back link. */
  lead?: ReactNode;
  /** A sub-navigation row under the title row. */
  children?: ReactNode;
  className?: string;
}

/** The top of every screen: title, status and the screen's own controls in one band. */
export function PageHeader({ title, meta, actions, lead, children, className }: PageHeaderProps) {
  return (
    <header className={className ? `rop-page-head ${className}` : 'rop-page-head'}>
      <div className="rop-page-head__row">
        {lead}
        <div className="rop-page-head__title">
          <h1>{title}</h1>
          {meta && <div className="rop-page-head__meta">{meta}</div>}
        </div>
        {actions && <div className="rop-page-head__actions">{actions}</div>}
      </div>
      {children}
    </header>
  );
}
