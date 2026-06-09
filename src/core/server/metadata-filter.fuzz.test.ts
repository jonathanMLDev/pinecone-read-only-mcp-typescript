import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { MAX_FILTER_DEPTH, validateMetadataFilterDetailed } from './metadata-filter.js';

const primitiveArb = fc.oneof(fc.string(), fc.integer(), fc.boolean());

const validLeafArb: fc.Arbitrary<Record<string, unknown>> = fc
  .record({
    field: fc
      .string({ minLength: 1 })
      .filter((s) => !s.startsWith('$'))
      .map((name) => name || 'f'),
    op: fc.constantFrom('$eq', '$ne', '$gt', '$gte', '$lt', '$lte'),
    value: primitiveArb,
  })
  .map(({ field, op, value }) => ({ [field]: { [op]: value } }));

const { filter: validFilterArb } = fc.letrec<{ filter: fc.Arbitrary<Record<string, unknown>> }>(
  (tie) => ({
    filter: fc.oneof(
      validLeafArb,
      fc.array(tie('filter'), { minLength: 1, maxLength: 3 }).map((items) => ({ $and: items })),
      fc.array(tie('filter'), { minLength: 1, maxLength: 3 }).map((items) => ({ $or: items }))
    ),
  })
);

function deepAnd(levels: number): Record<string, unknown> {
  if (levels === 0) return { leaf: { $eq: 1 } };
  return { $and: [deepAnd(levels - 1)] };
}

describe('validateMetadataFilterDetailed fuzz', () => {
  it('never throws on arbitrary JSON-like input', () => {
    fc.assert(
      fc.property(fc.jsonValue(), (value) => {
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          expect(() =>
            validateMetadataFilterDetailed(value as Record<string, unknown>)
          ).not.toThrow();
        }
      }),
      { numRuns: 100 }
    );
  });

  it('returns structured errors for known malformed filters', () => {
    const malformed = [
      { year: { $regex: '^202' } },
      { tags: { $in: [] } },
      { tags: { $nin: [] } },
      { $and: [] },
      { $or: [] },
      { tags: { $in: [1, {} as unknown as number] } },
      { tags: { $and: 'not-array' } },
      { x: deepAnd(MAX_FILTER_DEPTH + 1) },
    ];

    for (const filter of malformed) {
      const result = validateMetadataFilterDetailed(filter);
      expect(result).not.toBeNull();
      expect(result!.message.length).toBeGreaterThan(0);
    }
  });

  it('accepts valid complex generated filters unchanged', () => {
    fc.assert(
      fc.property(validFilterArb, (filter) => {
        const result = validateMetadataFilterDetailed(filter);
        expect(result).toBeNull();
      }),
      { numRuns: 100 }
    );
  });

  it('accepts hand-crafted deeply nested valid filters within depth limit', () => {
    const valid = {
      $and: [
        { status: { $eq: 'published' } },
        {
          $or: [
            { year: { $gte: 2020 } },
            {
              tags: {
                $in: ['cpp', 'contracts'],
              },
            },
          ],
        },
      ],
    };
    expect(validateMetadataFilterDetailed(valid)).toBeNull();
    expect(validateMetadataFilterDetailed({ x: deepAnd(MAX_FILTER_DEPTH) })).toBeNull();
  });

  it('handles special field names without throwing', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 20 }), primitiveArb, (fieldName, value) => {
        const filter = { [fieldName]: { $eq: value } };
        expect(() => validateMetadataFilterDetailed(filter)).not.toThrow();
      }),
      { numRuns: 100 }
    );
  });

  it('rejects empty $in and accepts large primitive $in arrays', () => {
    expect(validateMetadataFilterDetailed({ tags: { $in: [] } })!.field).toBe('tags.$in');

    const largeIn = {
      tags: { $in: Array.from({ length: 1000 }, (_, i) => (i % 3 === 0 ? i : `v${i}`)) },
    };
    expect(validateMetadataFilterDetailed(largeIn)).toBeNull();

    expect(validateMetadataFilterDetailed({ tags: { $in: ['only'] } })).toBeNull();
  });
});
