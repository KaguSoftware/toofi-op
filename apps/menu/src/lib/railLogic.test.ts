import { describe, expect, it } from 'vitest';
import { RAIL_LEAD, activeSectionIndex } from './railLogic';

const tops = [0, 400, 900, 1500];

describe('activeSectionIndex', () => {
  it('is the first section at the top', () => {
    expect(activeSectionIndex(tops, 0, false)).toBe(0);
  });
  it('switches a little before a section reaches the top edge', () => {
    expect(activeSectionIndex(tops, 400 - RAIL_LEAD - 1, false)).toBe(0);
    expect(activeSectionIndex(tops, 400 - RAIL_LEAD, false)).toBe(1);
  });
  it('follows the scroll down the sections', () => {
    expect(activeSectionIndex(tops, 950, false)).toBe(2);
  });
  it('picks the last section at the very bottom even when it is too short to reach the top', () => {
    expect(activeSectionIndex(tops, 1200, true)).toBe(3);
  });
  it('copes with no sections', () => {
    expect(activeSectionIndex([], 0, false)).toBe(-1);
  });
});
