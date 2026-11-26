'use client';

import { useState } from 'react';
import { formatNumber } from '@rop/i18n/formatting';
import type { Locale } from '@rop/i18n';
import { MAX_QTY, selectionState, toggleOption, unitPriceOf } from '@/lib/basketLogic';
import { fill, type GuestCopy } from '@/lib/copyLogic';
import type { DishView, GroupView } from '@/lib/menuViewLogic';
import { Icon } from './Icon';
import { Sheet } from './Sheet';

interface Props {
  copy: GuestCopy;
  locale: Locale;
  dish: DishView;
  /** Why the last add was refused (20 of one dish, 40 lines). */
  error: string | null;
  onAdd: (modifierIds: string[], qty: number) => void;
  onClose: () => void;
}

/** What a group asks for, in words: "Choose 1", "Choose 1 to 3", "Optional, up to 2". */
function rule(copy: GuestCopy, g: GroupView): string {
  if (g.min === g.max) return fill(copy.order.options.exact, { n: g.max });
  if (g.min === 0) return fill(copy.order.options.upTo, { max: g.max });
  return fill(copy.order.options.range, { min: g.min, max: g.max });
}

/** One block per option group with its limits, options as tiles, a quantity, and Add to order. */
export function OptionsSheet({ copy, locale, dish, error, onAdd, onClose }: Props) {
  const [selected, setSelected] = useState<string[]>([]);
  const [qty, setQty] = useState(1);
  const complete = dish.groups.every((g) => selectionState(g, selected).ok);
  const total = unitPriceOf(dish, selected) * qty;

  return (
    <Sheet title={dish.name} closeLabel={copy.sheet.close} onClose={onClose}>
      {dish.groups.map((group) => {
        const state = selectionState(group, selected);
        return (
          <fieldset key={group.id} className="group">
            <legend className="group__legend">
              <span className="group__name">{group.name}</span>
              <span className="group__rule">{rule(copy, group)}</span>
            </legend>
            <div className="group__tiles">
              {group.options.map((option) => {
                const on = selected.includes(option.id);
                return (
                  <button
                    key={option.id}
                    type="button"
                    className={on ? 'opt opt--on' : 'opt'}
                    aria-pressed={on}
                    // At the maximum the unchosen tiles stop: a many-of group cannot take another.
                    disabled={!on && group.max > 1 && state.full}
                    onClick={() => setSelected((cur) => toggleOption(group, cur, option.id))}
                  >
                    <span className="opt__name">{option.name}</span>
                    {option.deltaText && <bdi className="opt__delta">{option.deltaText}</bdi>}
                    {on && <Icon name="check" size={18} />}
                  </button>
                );
              })}
            </div>
          </fieldset>
        );
      })}

      <div className="qty" role="group" aria-label={copy.order.options.quantity}>
        <span className="qty__label">{copy.order.options.quantity}</span>
        <div className="qty__stepper">
          <button type="button" className="round" aria-label={fill(copy.item.remove, { name: dish.name })} disabled={qty <= 1} onClick={() => setQty((q) => Math.max(1, q - 1))}>
            <Icon name="minus" size={20} />
          </button>
          <bdi className="row__qty" aria-live="polite">
            {qty}
          </bdi>
          <button type="button" className="round" aria-label={fill(copy.item.add, { name: dish.name })} disabled={qty >= MAX_QTY} onClick={() => setQty((q) => Math.min(MAX_QTY, q + 1))}>
            <Icon name="plus" size={20} />
          </button>
        </div>
      </div>

      {error && (
        <p className="sheet__note sheet__note--alert" role="alert">
          {error}
        </p>
      )}
      {!complete && (
        <p className="sheet__note" role="status">
          {copy.errors.byCode.MODIFIER_SELECTION_INVALID}
        </p>
      )}
      <button type="button" className="action action--brand" disabled={!complete} onClick={() => onAdd(selected, qty)}>
        <span>{copy.order.options.add}</span>
        <bdi className="action__sub">{formatNumber(total, locale)}</bdi>
      </button>
    </Sheet>
  );
}
