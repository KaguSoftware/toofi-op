import { describe, expect, it } from 'vitest';
import { staffFromRow } from './authLogic';

const row = { id: 'u1', full_name: 'Sara', role: 'waiter', venue_id: 'v1', is_active: true };

describe('staffFromRow', () => {
  it('accepts an active staff row', () => {
    expect(staffFromRow(row)).toEqual({ staff: { id: 'u1', fullName: 'Sara', role: 'waiter', venueId: 'v1' } });
  });
  it('flags a missing row', () => expect(staffFromRow(null)).toEqual({ problem: 'noStaff' }));
  it('flags an inactive row', () => expect(staffFromRow({ ...row, is_active: false })).toEqual({ problem: 'inactive' }));
  it('flags an unknown role', () => expect(staffFromRow({ ...row, role: 'chef' })).toEqual({ problem: 'noStaff' }));
});
