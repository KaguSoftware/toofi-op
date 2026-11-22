import { useState } from 'react';
import { formatIQD } from '@rop/i18n';
import { Button, Field, Icon, Modal, Money } from '../../components';
import { useLocale } from '../../lib/i18n';
import { MAX_QTY, linePrice, modifierErrors, toggleModifier, type ModifierGroup, type NewLine } from './basketLogic';

export interface SheetItem {
  id: string;
  nameEn: string;
  nameAr: string;
  price: number;
}

export interface ItemSheetProps {
  item: SheetItem;
  groups: ModifierGroup[];
  onAdd: (line: NewLine) => void;
  onClose: () => void;
}

/** Options, quantity and note for one menu item. Selection rules mirror add_items. */
export function ItemSheet({ item, groups, onAdd, onClose }: ItemSheetProps) {
  const { tr, locale } = useLocale();
  const [selected, setSelected] = useState<string[]>([]);
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState('');

  const pick = (nameEn: string, nameAr: string) => (locale === 'ar' ? nameAr : nameEn);
  const errors = modifierErrors(groups, selected);
  const chosen = groups.flatMap((g) => g.modifiers.filter((m) => selected.includes(m.id)));
  const price = linePrice(item.price, chosen, qty);

  function rule(g: ModifierGroup): string {
    if (g.minSelect === g.maxSelect) return tr('tab.required', { min: g.minSelect });
    if (g.minSelect === 0) return tr('tab.chooseUpTo', { max: g.maxSelect });
    return tr('tab.chooseBetween', { min: g.minSelect, max: g.maxSelect });
  }

  return (
    <Modal
      open
      title={tr('tab.itemChoose', { name: pick(item.nameEn, item.nameAr) })}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{tr('common.cancel')}</Button>
          <Button
            variant="primary"
            disabled={errors.length > 0}
            onClick={() =>
              onAdd({
                menuItemId: item.id,
                nameEn: item.nameEn,
                nameAr: item.nameAr,
                basePrice: item.price,
                modifiers: chosen,
                qty,
                note,
              })
            }
          >
            {tr('tab.addToBasket')} · {formatIQD(price, locale)}
          </Button>
        </>
      }
    >
      <div className="rop-form item-sheet">
        {groups.map((g) => {
          const count = g.modifiers.filter((m) => selected.includes(m.id)).length;
          const error = errors.find((e) => e.groupId === g.id);
          const single = g.minSelect === 1 && g.maxSelect === 1;
          return (
            <fieldset key={g.id} className="item-sheet__group">
              <legend>
                {pick(g.nameEn, g.nameAr)} <span className="item-sheet__rule">({rule(g)})</span>
              </legend>
              {g.modifiers.map((m) => {
                const on = selected.includes(m.id);
                return (
                  <label key={m.id} className="item-sheet__option">
                    <input
                      type={single ? 'radio' : 'checkbox'}
                      name={g.id}
                      checked={on}
                      disabled={!on && g.maxSelect > 1 && count >= g.maxSelect}
                      onChange={() => setSelected((s) => toggleModifier(g, s, m.id))}
                    />
                    <span>{pick(m.nameEn, m.nameAr)}</span>
                    {m.priceDelta !== 0 && (
                      <span className="item-sheet__delta">
                        {m.priceDelta > 0 ? '+' : ''}
                        {formatIQD(m.priceDelta, locale)}
                      </span>
                    )}
                  </label>
                );
              })}
              {error && (
                <p role="alert" className="rop-field__error">
                  {error.kind === 'min' ? tr('tab.needMin', { min: g.minSelect }) : tr('tab.tooMany', { max: g.maxSelect })}
                </p>
              )}
            </fieldset>
          );
        })}

        <div className="item-sheet__qty" role="group" aria-label={tr('tab.qty')}>
          <Button className="rop-btn--icon" aria-label={tr('tab.decrease')} disabled={qty <= 1} onClick={() => setQty((q) => Math.max(1, q - 1))}>
            <Icon name="minus" size={20} />
          </Button>
          <output aria-label={tr('tab.qty')}>{qty}</output>
          <Button className="rop-btn--icon" aria-label={tr('tab.increase')} disabled={qty >= MAX_QTY} onClick={() => setQty((q) => Math.min(MAX_QTY, q + 1))}>
            <Icon name="plus" size={20} />
          </Button>
        </div>

        <Field label={tr('tab.noteLabel')}>
          {(p) => <input {...p} type="text" autoComplete="off" value={note} onChange={(e) => setNote(e.target.value)} />}
        </Field>

        <p className="item-sheet__price">
          {tr('tab.linePrice')}: <Money amount={price} />
        </p>
      </div>
    </Modal>
  );
}
