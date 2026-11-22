import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

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
  /** A coloured tile before the title that names the screen at a glance. */
  icon?: IconName;
  /** Service screens are forest; business and setup screens are terra cotta. */
  tone?: 'brand' | 'accent';
}

/** The top of every screen: title, status and the screen's own controls in one band. */
export function PageHeader({ title, meta, actions, lead, children, className, icon, tone = 'brand' }: PageHeaderProps) {
  return (
    <header className={className ? `rop-page-head ${className}` : 'rop-page-head'}>
      <div className="rop-page-head__row">
        {lead}
        {icon && (
          <span className="rop-page-head__badge" data-tone={tone} aria-hidden="true">
            <span className="rop-page-head__icon">
              <Icon name={icon} />
            </span>
          </span>
        )}
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
