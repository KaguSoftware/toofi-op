import { describe, expect, it } from 'vitest';
import { readAnswer } from './guestApi';

describe('readAnswer', () => {
  it('passes a success through', () => {
    expect(readAnswer(200, { ok: true, data: { call_id: 'c' } })).toEqual({ ok: true, data: { call_id: 'c' } });
  });

  it('keeps a known refusal with its code', () => {
    expect(readAnswer(409, { ok: false, result: 'too-soon', code: 'CALL_TOO_SOON' })).toEqual({ ok: false, result: 'too-soon', code: 'CALL_TOO_SOON' });
  });

  it('reads anything else as an error', () => {
    expect(readAnswer(500, null)).toEqual({ ok: false, result: 'error', code: null });
    expect(readAnswer(409, { ok: false, result: 'weird' })).toEqual({ ok: false, result: 'error', code: null });
    expect(readAnswer(500, { ok: true })).toEqual({ ok: false, result: 'error', code: null });
  });
});
