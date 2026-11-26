'use client';

import { formatIQD, formatNumber } from '@rop/i18n/formatting';
import type { Locale } from '@rop/i18n';
import { MAX_QTY, NOTE_MAX, clipNote, noteCounter, type LineView, type Totals } from '@/lib/basketLogic';
import { fill, type GuestCopy } from '@/lib/copyLogic';
import { CategoryIcon, Icon } from './Icon';
import { Sheet } from './Sheet';

interface Props {
  copy: GuestCopy;
  locale: Locale;
  tableLabel: string | null;
  lines: LineView[];
  totals: Totals;
  note: string;
  /** The send is on its way and its outcome is not known: the sheet is locked. */
  sending: boolean;
  /** A send was started and never answered: the same key is held, so sending again is safe. */
  unclear: boolean;
  offline: boolean;
  /** Why the last send was refused, or why the last change was (20 of one dish). */
  error: string | null;
  onNote: (note: string) => void;
  onStep: (lineId: string, delta: 1 | -1) => void;
  onRemove: (lineId: string) => void;
  onSend: () => void;
  onClose: () => void;
}

/** Your order: the lines, the note, the total, Send order. The one terra cotta control while it is open. */
export function OrderSheet({ copy, locale, tableLabel, lines, totals, note, sending, unclear, offline, error, onNote, onStep, onRemove, onSend, onClose }: Props) {
  const counter = noteCounter(note);
  const marked = lines.some((l) => l.problem !== null);
  const aside = tableLabel !== null ? <span className="sheet__aside">{fill(copy.table.label, { label: tableLabel })}</span> : null;

  return (
    <Sheet title={copy.bar.yourOrder} closeLabel={copy.sheet.close} onClose={onClose} locked={sending} aside={aside}>
      {totals.empty ? (
        <p className="sheet__body">{copy.order.empty}</p>
      ) : (
        <ul className="lines">
          {lines.map((line) => (
            <li key={line.id} className={line.problem ? 'line line--marked' : 'line'}>
              {line.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="line__photo" src={line.photoUrl} alt="" width={44} height={44} loading="lazy" decoding="async" />
              ) : (
                <span className="line__photo line__photo--none" aria-hidden="true">
                  <CategoryIcon icon={line.icon} size={22} />
                </span>
              )}
              <div className="line__text">
                <span className="line__name">{line.name || copy.order.line.unavailable}</span>
                {line.optionNames.length > 0 && <span className="line__options">{line.optionNames.join(' · ')}</span>}
                {line.problem && <span className="line__problem">{line.problem === 'unavailable' ? copy.order.line.unavailable : copy.order.line.options}</span>}
              </div>
              {line.problem ? (
                <button type="button" className="line__remove" disabled={sending} aria-label={fill(copy.order.line.removeLabel, { name: line.name })} onClick={() => onRemove(line.id)}>
                  {copy.order.line.remove}
                </button>
              ) : (
                <>
                  <div className="line__stepper">
                    <button type="button" className="round" disabled={sending} aria-label={fill(copy.item.remove, { name: line.name })} onClick={() => onStep(line.id, -1)}>
                      <Icon name="minus" size={18} />
                    </button>
                    <bdi className="row__qty">{line.qty}</bdi>
                    <button
                      type="button"
                      className="round round--filled"
                      disabled={sending || line.qty >= MAX_QTY}
                      aria-label={fill(copy.item.add, { name: line.name })}
                      onClick={() => onStep(line.id, 1)}
                    >
                      <Icon name="plus" size={18} />
                    </button>
                  </div>
                  <bdi className="line__total">{formatNumber(line.lineTotal, locale)}</bdi>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {!totals.empty && (
        <>
          <label className="note">
            <span className="note__label">{copy.order.note.label}</span>
            <textarea
              className="note__input"
              rows={2}
              value={note}
              maxLength={NOTE_MAX * 2}
              readOnly={sending}
              placeholder={copy.order.note.placeholder}
              onChange={(e) => onNote(clipNote(e.target.value))}
            />
            {counter.show && (
              <span className="note__counter" aria-live="polite">
                {fill(copy.order.note.counter, { remaining: counter.remaining })}
              </span>
            )}
          </label>
          <div className="total">
            <span className="total__label">{copy.order.total}</span>
            <bdi className="total__amount">{formatIQD(totals.total, locale)}</bdi>
          </div>
        </>
      )}

      {offline && (
        <p className="sheet__note sheet__note--alert" role="status">
          {copy.offline}
        </p>
      )}
      {error && !offline && (
        <p className="sheet__note sheet__note--alert" role="alert">
          {error}
        </p>
      )}
      {sending && (
        <p className="sheet__note sheet__note--alert" role="status">
          {copy.order.sending}
        </p>
      )}
      {unclear && !sending && !offline && (
        <p className="sheet__note sheet__note--alert" role="status">
          {copy.order.unclear}
        </p>
      )}
      {marked && !sending && (
        <p className="sheet__note" role="status">
          {copy.order.fix}
        </p>
      )}

      <button type="button" className="action action--terra" disabled={!totals.canSend || sending || offline} aria-busy={sending} onClick={onSend}>
        {copy.order.send}
      </button>
      <p className="sheet__note">{copy.order.confirm}</p>
    </Sheet>
  );
}
