// Lot selection (HIFO / FIFO / LIFO / TAX_OPTIMIZED), holding periods, and the
// short- vs long-term split. The engine reads today's date, so the clock is frozen.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { makeEngine } from './testHelpers';

const TODAY = '2026-10-16T12:00:00Z';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(TODAY));
});
afterEach(() => vi.useRealTimers());

// Three lots, current price 40:
//   A  2024-01-10  100 @ 35  long-term  (gain/unit  5)
//   B  2026-05-01  100 @ 30  short-term (gain/unit 10)
//   C  2025-03-01  100 @ 20  long-term  (gain/unit 20)
const lot = (id, purchaseDate, quantity, cost) => ({
  id, purchaseDate, quantity, costBasisPerUnit: cost, totalCostBasis: quantity * cost,
});
const stock = (overrides = {}) => ({
  name: 'TEST',
  shares: 300,
  costBasis: 0,
  currentPrice: 40,
  useLotTracking: true,
  lots: [lot('A', '2024-01-10', 100, 35), lot('B', '2026-05-01', 100, 30), lot('C', '2025-03-01', 100, 20)],
  ...overrides,
});
const ids = (result) => result.selectedLots.map((l) => `${l.lotId}:${l.quantityToSell}`);

describe('holding period', () => {
  const { calculateHoldingPeriod } = makeEngine();

  it('is long-term well over a year, short-term well under', () => {
    expect(calculateHoldingPeriod('2020-01-01').isLongTerm).toBe(true);
    expect(calculateHoldingPeriod('2025-10-10').isLongTerm).toBe(true);
    expect(calculateHoldingPeriod('2025-10-25').isLongTerm).toBe(false);
    expect(calculateHoldingPeriod('2026-09-01').isLongTerm).toBe(false);
  });

  it('reports the number of days held', () => {
    expect(calculateHoldingPeriod('2026-10-06').days).toBeCloseTo(10.5, 1);
  });

  // KNOWN ISSUE. The IRS needs MORE than one year: a lot bought 2025-10-16 is still
  // short-term on 2026-10-16 and turns long-term on 2026-10-17. The engine's own
  // comment says the same, but it flips at the start of the anniversary date. This
  // test states the correct rule and is expected to fail until the engine is fixed;
  // when it is fixed Vitest will say so, and `.fails` can be removed.
  it.fails('treats a lot as short-term on its one-year anniversary date', () => {
    expect(calculateHoldingPeriod('2025-10-16').isLongTerm).toBe(false);
  });

  it('treats a lot as long-term the day after its anniversary', () => {
    expect(calculateHoldingPeriod('2025-10-15').isLongTerm).toBe(true);
  });
});

describe('lot metrics', () => {
  const { calculateLotMetrics } = makeEngine();
  it('computes current value and gain', () => {
    const m = calculateLotMetrics(lot('A', '2024-01-10', 100, 35), 40);
    expect(m.currentValue).toBe(4000);
    expect(m.gainLoss).toBe(500);
    expect(m.gainLossPerUnit).toBe(5);
    expect(m.isLongTerm).toBe(true);
  });
});

describe('lot selection strategies', () => {
  const { selectLots } = makeEngine();

  it('HIFO sells the highest cost basis first', () => {
    const r = selectLots(stock(), 150, 'HIFO');
    expect(ids(r)).toEqual(['A:100', 'B:50']);
    expect(r.longTermGains).toBe(500);   // 100 x (40 - 35)
    expect(r.shortTermGains).toBe(500);  // 50 x (40 - 30)
    expect(r.totalProceeds).toBe(6000);
    expect(r.totalGains).toBe(1000);
  });

  it('FIFO sells the oldest lots first', () => {
    const r = selectLots(stock(), 150, 'FIFO');
    expect(ids(r)).toEqual(['A:100', 'C:50']);
    expect(r.longTermGains).toBe(500 + 1000);
    expect(r.shortTermGains).toBe(0);
  });

  it('LIFO sells the newest lots first', () => {
    const r = selectLots(stock(), 150, 'LIFO');
    expect(ids(r)).toEqual(['B:100', 'C:50']);
    expect(r.shortTermGains).toBe(1000); // 100 x (40 - 30)
    expect(r.longTermGains).toBe(1000);  // 50 x (40 - 20)
  });

  it('TAX_OPTIMIZED ranks lots by estimated tax per unit', () => {
    // cost per unit of gain: A 5 x 15% = 0.75, C 20 x 15% = 3.00, B 10 x 32% = 3.20
    const r = selectLots(stock(), 150, 'TAX_OPTIMIZED');
    expect(ids(r)).toEqual(['A:100', 'C:50']);
    expect(r.shortTermGains).toBe(0);
  });

  it('TAX_OPTIMIZED sells a lot at a loss before one at a gain', () => {
    const s = stock({ currentPrice: 25 });
    // at 25: A loses 10/unit, B loses 5/unit, C gains 5/unit
    const r = selectLots(s, 200, 'TAX_OPTIMIZED');
    expect(ids(r)).toEqual(['B:100', 'A:100']); // short-term loss ranks before long-term loss
  });

  it('falls back to HIFO for an unknown strategy', () => {
    expect(ids(selectLots(stock(), 150, 'SPECIFIC'))).toEqual(ids(selectLots(stock(), 150, 'HIFO')));
    expect(ids(selectLots(stock(), 150))).toEqual(ids(selectLots(stock(), 150, 'HIFO')));
  });

  it('does not change the order of the asset lots', () => {
    const s = stock();
    const before = s.lots.map((l) => l.id);
    selectLots(s, 150, 'FIFO');
    expect(s.lots.map((l) => l.id)).toEqual(before);
  });

  it('gains split exactly into short-term plus long-term for every strategy', () => {
    ['HIFO', 'FIFO', 'LIFO', 'TAX_OPTIMIZED'].forEach((strategy) => {
      [1, 50, 100, 150, 299, 300].forEach((qty) => {
        const r = selectLots(stock(), qty, strategy);
        expect(r.shortTermGains + r.longTermGains).toBeCloseTo(r.totalGains, 9);
        expect(r.quantitySold).toBe(qty);
        expect(r.totalProceeds).toBeCloseTo(qty * 40, 9);
      });
    });
  });
});

describe('quantities and edge cases', () => {
  const { selectLots } = makeEngine();

  it('never sells more than is held', () => {
    const r = selectLots(stock(), 500, 'HIFO');
    expect(r.quantitySold).toBe(300);
    expect(r.requestedQuantity).toBe(500);
    expect(r.totalProceeds).toBe(300 * 40);
  });

  it('returns nothing for zero, negative, or a missing asset', () => {
    [selectLots(stock(), 0), selectLots(stock(), -5), selectLots(null, 10)].forEach((r) => {
      expect(r.quantitySold).toBe(0);
      expect(r.totalProceeds).toBe(0);
      expect(r.selectedLots).toEqual([]);
    });
  });

  it('without lot tracking, treats the whole position as long-term at the average basis', () => {
    const plain = { name: 'P', shares: 100, costBasis: 50, currentPrice: 75, useLotTracking: false, lots: [] };
    const r = selectLots(plain, 40, 'HIFO');
    expect(r.longTermGains).toBe(40 * 25);
    expect(r.shortTermGains).toBe(0);
    expect(r.totalProceeds).toBe(3000);
  });

  it('with lot tracking on but no lots entered, falls back to the average basis', () => {
    const s = stock({ lots: [], shares: 100, costBasis: 10 });
    expect(selectLots(s, 10).longTermGains).toBe(10 * 30);
  });

  it('records a loss as a negative gain', () => {
    const s = stock({ currentPrice: 10 });
    const r = selectLots(s, 100, 'HIFO'); // lot A: 100 x (10 - 35)
    expect(r.longTermGains).toBe(-2500);
  });
});
