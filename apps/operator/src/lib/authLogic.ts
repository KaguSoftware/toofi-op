import { isStaffRole, type StaffRole } from '@rop/core';

export interface StaffInfo {
  id: string;
  fullName: string;
  role: StaffRole;
  venueId: string;
}

export type StaffProblem = 'noStaff' | 'inactive';

interface StaffRow {
  id: string;
  full_name: string;
  role: string;
  venue_id: string;
  is_active: boolean;
}

/** A missing or inactive staff row (or an unknown role) means the person must be signed out. */
export function staffFromRow(row: StaffRow | null): { staff: StaffInfo } | { problem: StaffProblem } {
  if (!row || !isStaffRole(row.role)) return { problem: 'noStaff' };
  if (!row.is_active) return { problem: 'inactive' };
  return { staff: { id: row.id, fullName: row.full_name, role: row.role, venueId: row.venue_id } };
}
