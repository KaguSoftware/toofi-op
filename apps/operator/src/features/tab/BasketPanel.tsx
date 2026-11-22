import { Button, Field, Icon, Money } from '../../components';
import { useLocale } from '../../lib/i18n';
import { basketLinePrice, basketTotal, type Basket } from './basketLogic';

export interface BasketPanelProps {
  basket: Basket;
  sending: boolean;
  error?: string | null;
  /** Set after an unclear send: the basket is locked while we check whether the order went through. */
  check?: 'checking' | 'failed' | null;
  onRecheck?: () => void;
  onQty: (lineId: string, qty: number) => void;
  onRemove: (lineId: string) => void;
  onNote: (lineId: string, note: string) => void;
  onSend: () => void;
}

/** Unsent lines. Send is disabled while a send is in flight, so a double tap cannot double-send. */
export function BasketPanel({ basket, sending: sendingNow, error, check = null, onRecheck, onQty, onRemove, onNote, onSend }: BasketPanelProps) {
  const { tr, locale } = useLocale();
  const sending = sendingNow || check !== null; // locked: no edits, no send
  const empty = basket.lines.length === 0;
  const count = basket.lines.reduce((n, l) => n + l.qty, 0);
  return (
    <section className="basket" aria-labelledby="basket-title">
      <div className="basket__header">
        <h2 id="basket-title">{tr('tab.basket')}</h2>
        {!empty && (
          <span key={count} className="rop-badge basket__count" data-tone="terra">
            {count}
          </span>
        )}
      </div>
      {empty ? (
        <p className="basket__empty">{tr('tab.basketEmpty')}</p>
      ) : (
        <ul className="basket__lines">
          {basket.lines.map((l) => {
            const name = locale === 'ar' ? l.nameAr : l.nameEn;
            return (
              <li key={l.id} className="basket__line">
                <div className="basket__head">
                  <strong>{name}</strong>
                  <Money amount={basketLinePrice(l)} />
                </div>
                {l.modifiers.length > 0 && (
                  <p className="basket__mods">{l.modifiers.map((m) => (locale === 'ar' ? m.nameAr : m.nameEn)).join(', ')}</p>
                )}
                <div className="basket__row">
                <div className="basket__controls">
                  <Button className="rop-btn--icon" aria-label={`${tr('tab.decrease')}: ${name}`} disabled={sending} onClick={() => onQty(l.id, l.qty - 1)}>
                    <Icon name="minus" size={20} />
                  </Button>
                  <output aria-label={`${tr('tab.qty')}: ${name}`}>{l.qty}</output>
                  <Button className="rop-btn--icon" aria-label={`${tr('tab.increase')}: ${name}`} disabled={sending} onClick={() => onQty(l.id, l.qty + 1)}>
                    <Icon name="plus" size={20} />
                  </Button>
                </div>
                <Field label={`${tr('tab.noteLabel')}: ${name}`}>
                  {(p) => (
                    <input
                      {...p}
                      type="text"
                      autoComplete="off"
                      placeholder={tr('tab.addNote')}
                      disabled={sending}
                      defaultValue={l.note}
                      onBlur={(e) => e.target.value.trim() !== l.note && onNote(l.id, e.target.value)}
                    />
                  )}
                </Field>
                <Button className="basket__remove rop-btn--icon" aria-label={`${tr('tab.remove')}: ${name}`} disabled={sending} onClick={() => onRemove(l.id)}>
                  <Icon name="close" size={20} />
                </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {error && (
        <p role="alert" className="rop-field__error">
          {error}
        </p>
      )}
      {check === 'checking' && <p role="status">{tr('tab.checkingSend')}</p>}
      {check === 'failed' && (
        <p role="alert" className="rop-field__error">
          {tr('tab.checkFailed')} <Button onClick={onRecheck}>{tr('tab.recheck')}</Button>
        </p>
      )}
      <div className="basket__footer">
        <p className="basket__total">
          <span>{tr('tab.total')}</span> <Money amount={basketTotal(basket)} />
        </p>
        <Button className="basket__send" variant="primary" disabled={empty || sending} busy={sendingNow} onClick={onSend}>
          {!sendingNow && <Icon name="send" size={20} />}
          {sendingNow ? tr('tab.sending') : tr('tab.send')}
        </Button>
      </div>
    </section>
  );
}
