'use client';

import { memo, useState } from 'react';
import { fill, type GuestCopy } from '@/lib/copyLogic';
import { CategoryIcon, Icon } from './Icon';
import { RowOrnament } from './Ornaments';

interface Props {
  copy: GuestCopy;
  /** Handed back to onAdd and onRemove, so one stable handler serves every row. */
  id: string;
  name: string;
  /** Already formatted: a plain number, no currency. */
  price: string;
  photoUrl: string | null;
  /** The category's icon key, drawn when the dish has no photo (or its photo fails). */
  icon: string;
  /** How many are in the order. 0: only the plus button shows. */
  qty?: number;
  /** The dish has option groups: the plus opens the options sheet instead of adding. */
  hasOptions?: boolean;
  /** Ordering is switched off: the row is only a menu entry, with no controls. */
  readOnly?: boolean;
  onAdd?: (id: string) => void;
  onRemove?: (id: string) => void;
}

/** A solid card: photo (or the no-photo tile), name, price, the fixed ornament, the controls at the inline end. */
// memo: the screen re-renders every second while a countdown shows; the rows must not.
export const DishRow = memo(function DishRow({ copy, id, name, price, photoUrl, icon, qty = 0, hasOptions = false, readOnly = false, onAdd, onRemove }: Props) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const inOrder = qty > 0;
  return (
    <li className="row">
      <div className="row__orn" aria-hidden="true">
        <RowOrnament />
      </div>
      {photoUrl && !photoFailed ? (
        // Plain img: photos are already small (1 MB limit, webp/jpeg) and the page's CSP allows images from the storage origin only.
        // eslint-disable-next-line @next/next/no-img-element
        <img className="row__photo" src={photoUrl} alt="" width={76} height={76} loading="lazy" decoding="async" onError={() => setPhotoFailed(true)} />
      ) : (
        <span className="row__photo row__photo--none" aria-hidden="true">
          <CategoryIcon icon={icon} size={28} />
        </span>
      )}
      <div className="row__text">
        <span className="row__name">{name}</span>
        <bdi className="row__price">{price}</bdi>
      </div>
      {!readOnly && (
        <div className="row__controls">
          {inOrder && (
            <>
              <button type="button" className="round" aria-label={fill(copy.item.remove, { name })} onClick={() => onRemove?.(id)}>
                <Icon name="minus" size={20} />
              </button>
              <bdi className="row__qty">{qty}</bdi>
            </>
          )}
          <button
            type="button"
            className={inOrder ? 'round round--plus round--filled' : 'round round--plus'}
            aria-label={fill(hasOptions ? copy.order.options.choose : copy.item.add, { name })}
            aria-haspopup={hasOptions ? 'dialog' : undefined}
            onClick={() => onAdd?.(id)}
          >
            <Icon name="plus" size={20} />
          </button>
        </div>
      )}
    </li>
  );
});
