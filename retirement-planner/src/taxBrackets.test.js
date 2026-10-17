// Bracket math, checked against a separate calculation built straight from
// tax-rules.json, so the engine is never just agreeing with itself.
import { describe, it, expect } from 'vitest';
import rules from './tax-rules.json';
import { makeEngine } from './testHelpers';

const federal = rules.years[rules.activeYear].federal;
const STATUSES = ['single', 'married', 'marriedFilingSeparately', 'hoh', 'qualifyingSurvivingSpouse'];

// Same fallback the app documents: a status with no table of its own uses "married".
const table = (tables, status) =>
  (tables[status] ?? tables.married).map((b) => ({ ...b, max: b.max ?? Infinity }));

// Tax on `income` taking each bracket's slice in turn.
const walkOrdinary = (income, status) =>
  table(federal.ordinaryBrackets, status).reduce(
    (tax, b) => (income > b.min ? tax + (Math.min(income, b.max) - b.min) * b.rate : tax),
    0
  );

// Tax on everything from 0 up to x at the preferential rates.
const cgUpTo = (x, status) =>
  table(federal.capitalGainsBrackets, status).reduce(
    (tax, b) => (x > b.min ? tax + (Math.min(x, b.max) - b.min) * b.rate : tax),
    0
  );

const { calculateTax, calculateCapitalGainsTax } = makeEngine();

const sweep = [0, 1, 500, 9999, 12400, 12401, 30000, 50400, 50401, 75000, 105700, 150000,
  201775, 256225, 400000, 640600, 640601, 1000000, 5000000];

describe('ordinary income tax (calculateTax)', () => {
  it('is zero on zero income', () => {
    STATUSES.forEach((s) => expect(calculateTax(0, s)).toBe(0));
  });

  it('matches hand-worked figures', () => {
    // single, $50,000: 10% of 12,400 + 12% of (50,000 - 12,400)
    expect(calculateTax(50000, 'single')).toBeCloseTo(1240 + 4512, 6);
    // married, $100,000: 10% of 24,800 + 12% of (100,000 - 24,800)
    expect(calculateTax(100000, 'married')).toBeCloseTo(2480 + 9024, 6);
    // single, exactly at the top of the 10% bracket
    expect(calculateTax(12400, 'single')).toBeCloseTo(1240, 6);
  });

  it.each(STATUSES)('agrees with an independent bracket walk for %s', (status) => {
    sweep.forEach((income) => {
      expect(calculateTax(income, status)).toBeCloseTo(walkOrdinary(income, status), 6);
    });
  });

  it.each(STATUSES)('never decreases as income rises, and no dollar costs more than 37 cents (%s)', (status) => {
    let previous = 0;
    for (let income = 0; income <= 800000; income += 250) {
      const tax = calculateTax(income, status);
      expect(tax).toBeGreaterThanOrEqual(previous);
      expect(tax - previous).toBeLessThanOrEqual(250 * 0.37 + 1e-9);
      previous = tax;
    }
  });

  it('charges a married couple no more than a single filer on the same income', () => {
    sweep.forEach((income) => {
      expect(calculateTax(income, 'married')).toBeLessThanOrEqual(calculateTax(income, 'single') + 1e-9);
    });
  });

  it('uses the married table for a status with no table of its own', () => {
    expect(calculateTax(120000, 'somethingNew')).toBe(calculateTax(120000, 'married'));
  });
});

describe('capital gains tax (calculateCapitalGainsTax)', () => {
  it('is zero when there are no gains or a loss', () => {
    expect(calculateCapitalGainsTax(0, 50000, 'single')).toBe(0);
    expect(calculateCapitalGainsTax(-5000, 50000, 'single')).toBe(0);
  });

  it('matches hand-worked figures', () => {
    // single, no other income: 0% up to 49,450, then 15%
    expect(calculateCapitalGainsTax(100000, 0, 'single')).toBeCloseTo(0.15 * (100000 - 49450), 6);
    // single, 40,000 of ordinary income: 9,450 of room at 0%, the other 10,550 at 15%
    expect(calculateCapitalGainsTax(20000, 40000, 'single')).toBeCloseTo(0.15 * 10550, 6);
    // married, 600,000 ordinary: 13,700 at 15% up to 613,700, the other 86,300 at 20%
    expect(calculateCapitalGainsTax(100000, 600000, 'married')).toBeCloseTo(0.15 * 13700 + 0.2 * 86300, 6);
  });

  it.each(STATUSES)('equals the tax on (ordinary + gains) minus the tax on ordinary alone (%s)', (status) => {
    [0, 20000, 49450, 100000, 300000, 700000].forEach((ordinary) => {
      [1, 5000, 60000, 250000, 900000].forEach((gains) => {
        const expected = cgUpTo(ordinary + gains, status) - cgUpTo(ordinary, status);
        expect(calculateCapitalGainsTax(gains, ordinary, status)).toBeCloseTo(expected, 6);
      });
    });
  });

  it('never taxes gains above 20 percent in total', () => {
    expect(calculateCapitalGainsTax(1000000, 2000000, 'single')).toBeCloseTo(0.2 * 1000000, 6);
  });
});

describe('the rules file itself', () => {
  it.each(STATUSES)('has contiguous ordinary brackets for %s, ending open', (status) => {
    const list = table(federal.ordinaryBrackets, status);
    expect(list[0].min).toBe(0);
    list.slice(1).forEach((b, i) => expect(b.min).toBe(list[i].max));
    expect(list[list.length - 1].max).toBe(Infinity);
    list.slice(1).forEach((b, i) => expect(b.rate).toBeGreaterThan(list[i].rate));
  });

  it.each(STATUSES)('has 0%, 15% and 20% capital gains rates for %s', (status) => {
    expect(table(federal.capitalGainsBrackets, status).map((b) => b.rate)).toEqual([0, 0.15, 0.2]);
  });
});
