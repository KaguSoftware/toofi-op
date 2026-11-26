import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../../components';
import { LocaleProvider } from '../../lib/i18n';

const upload = vi.fn();
const remove = vi.fn();
vi.mock('../../lib/supabase', () => ({
  supabase: { storage: { from: () => ({ getPublicUrl: (p: string) => ({ data: { publicUrl: `https://files.example.com/${p}` } }) }) } },
}));
vi.mock('./photoUpload', () => ({
  uploadItemPhoto: (...a: unknown[]) => upload(...a),
  removeItemPhoto: (...a: unknown[]) => remove(...a),
}));

import { ItemPhoto } from './ItemPhoto';
import type { Item } from './menuTypes';

const base: Item = { id: 'i1', category_id: 'c', name_en: 'Hummus', name_ar: 'حمص', price: 5000, tax_group_id: 't', is_active: true, sort: 1, photo_path: null };

function setup(item: Item) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <LocaleProvider>
        <ToastProvider>
          <ItemPhoto item={item} venueId="v1" name="Hummus" />
        </ToastProvider>
      </LocaleProvider>
    </QueryClientProvider>,
  );
  return userEvent.setup();
}

const fileInput = () => document.querySelector('input[type="file"]') as HTMLInputElement;

beforeEach(() => {
  upload.mockReset().mockResolvedValue('v1/items/i1/new.webp');
  remove.mockReset().mockResolvedValue(undefined);
});

describe('ItemPhoto', () => {
  it('a dish without a photo offers Add and shows the empty tile', () => {
    setup(base);
    expect(screen.getByRole('button', { name: 'Add a photo for Hummus' })).toBeTruthy();
    expect(screen.getByText('No photo')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Remove/ })).toBeNull();
  });

  it('a dish with a photo shows it from the bucket and offers Replace and Remove', () => {
    setup({ ...base, photo_path: 'v1/items/i1/old.webp' });
    expect(screen.getByRole('img', { name: 'Hummus' }).getAttribute('src')).toBe('https://files.example.com/v1/items/i1/old.webp');
    expect(screen.getByRole('button', { name: 'Replace the photo for Hummus' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove the photo for Hummus' })).toBeTruthy();
  });

  it('uploads the chosen picture with the venue, the dish and the old path', async () => {
    const user = setup({ ...base, photo_path: 'v1/items/i1/old.webp' });
    const file = new File(['x'], 'plate.jpg', { type: 'image/jpeg' });
    await user.upload(fileInput(), file);
    await waitFor(() => expect(upload).toHaveBeenCalledWith({ file, venueId: 'v1', itemId: 'i1', oldPath: 'v1/items/i1/old.webp' }));
  });

  it('refuses a file that is not a picture without sending anything', async () => {
    const user = setup(base);
    const input = fileInput();
    input.removeAttribute('accept'); // the browser's own filter is only a courtesy
    await user.upload(input, new File(['x'], 'menu.pdf', { type: 'application/pdf' }));
    expect(await screen.findByText('Choose a picture file.')).toBeTruthy();
    expect(upload).not.toHaveBeenCalled();
  });

  it('says so when the picture cannot be shrunk under the limit', async () => {
    upload.mockRejectedValue(new Error('PHOTO_TOO_LARGE'));
    const user = setup(base);
    await user.upload(fileInput(), new File(['x'], 'huge.png', { type: 'image/png' }));
    expect(await screen.findByText('This picture is still too large after shrinking. Try another one.')).toBeTruthy();
  });

  it('Remove clears the path and the object', async () => {
    const user = setup({ ...base, photo_path: 'v1/items/i1/old.webp' });
    await user.click(screen.getByRole('button', { name: 'Remove the photo for Hummus' }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith({ itemId: 'i1', oldPath: 'v1/items/i1/old.webp' }));
  });
});
