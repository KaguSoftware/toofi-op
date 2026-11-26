import { beforeEach, describe, expect, it, vi } from 'vitest';

const upload = vi.fn();
const remove = vi.fn();
const rpc = vi.fn();
vi.mock('../../lib/supabase', () => ({
  supabase: { storage: { from: (bucket: string) => ({ upload: (...a: unknown[]) => upload(bucket, ...a), remove: (...a: unknown[]) => remove(bucket, ...a) }) } },
}));
vi.mock('../../lib/appRpc', () => ({ appRpc: (...a: unknown[]) => rpc(...a) }));
vi.mock('./photoResize', () => ({ resizeToWebp: async () => new Blob(['x'], { type: 'image/webp' }) }));

import { removeItemPhoto, uploadItemPhoto } from './photoUpload';

const file = new File(['x'], 'dish.jpg', { type: 'image/jpeg' });
const NEW_PATH = /^v1\/items\/i1\/[0-9A-HJKMNP-TV-Z]{26}\.webp$/;

beforeEach(() => {
  upload.mockReset().mockResolvedValue({ error: null });
  remove.mockReset().mockResolvedValue({ error: null });
  rpc.mockReset().mockResolvedValue({});
});

describe('uploadItemPhoto', () => {
  it('uploads to menu-photos under the venue and item, then records the path', async () => {
    const path = await uploadItemPhoto({ file, venueId: 'v1', itemId: 'i1', oldPath: null });
    expect(path).toMatch(NEW_PATH);
    expect(upload).toHaveBeenCalledWith('menu-photos', path, expect.any(Blob), { contentType: 'image/webp', cacheControl: '31536000', upsert: false });
    expect(rpc).toHaveBeenCalledWith('set_menu_item_photo', { p_item_id: 'i1', p_photo_path: path });
    expect(upload.mock.invocationCallOrder[0]).toBeLessThan(rpc.mock.invocationCallOrder[0] ?? 0);
    expect(remove).not.toHaveBeenCalled();
  });

  it('removes the old object only after the new path is recorded', async () => {
    await uploadItemPhoto({ file, venueId: 'v1', itemId: 'i1', oldPath: 'v1/items/i1/old.webp' });
    expect(remove).toHaveBeenCalledWith('menu-photos', ['v1/items/i1/old.webp']);
    expect(rpc.mock.invocationCallOrder[0]).toBeLessThan(remove.mock.invocationCallOrder[0] ?? 0);
  });

  it('keeps the old photo when the upload fails', async () => {
    upload.mockResolvedValue({ error: { message: 'nope' } });
    await expect(uploadItemPhoto({ file, venueId: 'v1', itemId: 'i1', oldPath: 'v1/items/i1/old.webp' })).rejects.toThrow('nope');
    expect(rpc).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it('deletes the new object and keeps the old photo when recording the path fails', async () => {
    rpc.mockRejectedValue(new Error('PHOTO_PATH_INVALID'));
    await expect(uploadItemPhoto({ file, venueId: 'v1', itemId: 'i1', oldPath: 'v1/items/i1/old.webp' })).rejects.toThrow('PHOTO_PATH_INVALID');
    expect(remove).toHaveBeenCalledTimes(1);
    const removed = (remove.mock.calls[0]?.[1] as string[])[0];
    expect(removed).toMatch(NEW_PATH);
    expect(removed).not.toBe('v1/items/i1/old.webp');
  });

  it('still succeeds when the old object cannot be removed', async () => {
    remove.mockRejectedValue(new Error('offline'));
    await expect(uploadItemPhoto({ file, venueId: 'v1', itemId: 'i1', oldPath: 'v1/items/i1/old.webp' })).resolves.toMatch(NEW_PATH);
  });
});

describe('removeItemPhoto', () => {
  it('clears the path, then removes the object', async () => {
    await removeItemPhoto({ itemId: 'i1', oldPath: 'v1/items/i1/old.webp' });
    expect(rpc).toHaveBeenCalledWith('set_menu_item_photo', { p_item_id: 'i1', p_photo_path: null });
    expect(remove).toHaveBeenCalledWith('menu-photos', ['v1/items/i1/old.webp']);
    expect(rpc.mock.invocationCallOrder[0]).toBeLessThan(remove.mock.invocationCallOrder[0] ?? 0);
  });
  it('keeps the object when clearing the path fails', async () => {
    rpc.mockRejectedValue(new Error('FORBIDDEN'));
    await expect(removeItemPhoto({ itemId: 'i1', oldPath: 'p' })).rejects.toThrow('FORBIDDEN');
    expect(remove).not.toHaveBeenCalled();
  });
});
