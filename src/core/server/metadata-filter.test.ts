import { describe, expect, it } from 'vitest';
import { validateMetadataFilter, validateMetadataFilterDetailed } from './metadata-filter.js';

describe('validateMetadataFilterDetailed', () => {
  it('returns null for a valid filter', () => {
    expect(
      validateMetadataFilterDetailed({
        year: { $gte: 2020, $lte: 2026 },
        tags: { $in: ['a', 'b'] },
      })
    ).toBeNull();
  });

  it('returns message and dot-path field for unknown nested operator', () => {
    const d = validateMetadataFilterDetailed({
      year: { $regex: '^202' },
    });
    expect(d).not.toBeNull();
    expect(d!.message).toContain('Unknown filter operator');
    expect(d!.field).toBe('year.$regex');
    expect(validateMetadataFilter({ year: { $regex: '^202' } })).toBe(d!.message);
  });

  it('returns field for invalid $in value', () => {
    const d = validateMetadataFilterDetailed({
      tags: { $in: 'not-an-array' },
    });
    expect(d!.field).toBe('tags.$in');
    expect(d!.message).toContain('primitive values');
  });

  it('returns field for null metadata value', () => {
    const d = validateMetadataFilterDetailed({
      author: null as unknown as Record<string, unknown>,
    });
    expect(d!.field).toBe('author');
    expect(d!.message).toContain('null');
  });

  it('returns field when nested $and value is not an array', () => {
    const d = validateMetadataFilterDetailed({
      tags: { $and: { $eq: 'x' } },
    });
    expect(d!.field).toBe('tags.$and');
  });

  it('returns field when nested $or array element is an array, not a filter object', () => {
    const d = validateMetadataFilterDetailed({
      tags: { $or: [[1]] },
    });
    expect(d!.field).toBe('tags.$or.0');
  });

  it('accepts filter at maximum nesting depth', () => {
    expect(validateMetadataFilterDetailed({ x: deepAnd(10) })).toBeNull();
  });

  it('rejects filter exceeding maximum nesting depth', () => {
    const d = validateMetadataFilterDetailed({ x: deepAnd(11) });
    expect(d).not.toBeNull();
    expect(d!.message).toContain('maximum depth');
    expect(d!.field).toBe('');
  });

  it('rejects empty $and at top level', () => {
    const d = validateMetadataFilterDetailed({ $and: [] });
    expect(d!.field).toBe('$and');
    expect(d!.message).toContain('at least one filter object');
  });

  it('rejects empty $or at top level', () => {
    const d = validateMetadataFilterDetailed({ $or: [] });
    expect(d!.field).toBe('$or');
    expect(d!.message).toContain('at least one filter object');
  });

  it('rejects empty $in', () => {
    const d = validateMetadataFilterDetailed({ tags: { $in: [] } });
    expect(d!.field).toBe('tags.$in');
    expect(d!.message).toContain('at least one value');
  });

  it('rejects empty $nin', () => {
    const d = validateMetadataFilterDetailed({ tags: { $nin: [] } });
    expect(d!.field).toBe('tags.$nin');
    expect(d!.message).toContain('at least one value');
  });
});

/** Build a filter nested `levels` deep via $and combinators. */
function deepAnd(levels: number): Record<string, unknown> {
  if (levels === 0) return { leaf: { $eq: 1 } };
  return { $and: [deepAnd(levels - 1)] };
}
