import { useRef } from 'react';
import { Button, useToast } from '../../components';
import { errorMessage } from '../../lib/errors';
import { useLocale } from '../../lib/i18n';
import { supabase } from '../../lib/supabase';
import { isPhotoSource, photoErrorKey } from './photoLogic';
import { removeItemPhoto, uploadItemPhoto } from './photoUpload';
import { useRun } from './shared';
import type { Item } from './menuTypes';

/** The dish's photo in the item row: a thumbnail, and add, replace or remove for managers. */
export function ItemPhoto({ item, venueId, name }: { item: Item; venueId: string; name: string }) {
  const { tr, locale } = useLocale();
  const toast = useToast();
  const { busy, run } = useRun(['manage']);
  const input = useRef<HTMLInputElement>(null);
  const url = item.photo_path ? supabase.storage.from('menu-photos').getPublicUrl(item.photo_path).data.publicUrl : null;

  async function pick(file: File | undefined) {
    if (input.current) input.current.value = ''; // the same file can be chosen again
    if (!file) return;
    if (!isPhotoSource(file)) {
      toast(tr('guestSetup.photoNotPicture'), 'error');
      return;
    }
    const r = await run(() => uploadItemPhoto({ file, venueId, itemId: item.id, oldPath: item.photo_path }), 'guestSetup.photoSaved', { quiet: true });
    if (!r.ok) {
      const key = photoErrorKey(r.error);
      toast(key ? tr(key) : errorMessage(r.error, locale), 'error');
    }
  }

  return (
    <span className="manage__photo">
      {url ? <img className="manage__thumb" src={url} alt={name} loading="lazy" /> : <span className="manage__thumb manage__thumb--empty">{tr('guestSetup.photoNone')}</span>}
      <span className="manage__row">
        <Button busy={busy} aria-label={tr(item.photo_path ? 'guestSetup.photoReplaceFor' : 'guestSetup.photoAddFor', { name })} onClick={() => input.current?.click()}>
          {tr(item.photo_path ? 'guestSetup.photoReplace' : 'guestSetup.photoAdd')}
        </Button>
        {item.photo_path && (
          <Button
            disabled={busy}
            aria-label={tr('guestSetup.photoRemoveFor', { name })}
            onClick={() => void run(() => removeItemPhoto({ itemId: item.id, oldPath: item.photo_path ?? '' }), 'guestSetup.photoRemoved')}
          >
            {tr('guestSetup.photoRemove')}
          </Button>
        )}
        <input ref={input} type="file" accept="image/*" hidden tabIndex={-1} onChange={(e) => void pick(e.target.files?.[0])} />
      </span>
    </span>
  );
}
