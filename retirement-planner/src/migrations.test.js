// The functions that bring old saved or exported files up to the current shape.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { migrateAsset, migrateScenario } from './migrations';

beforeEach(() => { vi.spyOn(console, 'log').mockImplementation(() => {}); });

describe('migrateAsset', () => {
  it('passes null and undefined through untouched', () => {
    expect(migrateAsset(null)).toBeNull();
    expect(migrateAsset(undefined)).toBeUndefined();
  });

  it('gives an old asset the lot-tracking fields it lacks', () => {
    const out = migrateAsset({ name: 'AAPL', shares: 10, costBasis: 50, currentPrice: 90 });
    expect(out).toMatchObject({
      name: 'AAPL', shares: 10, costBasis: 50, currentPrice: 90,
      useLotTracking: false, lots: [], skipPriceUpdate: false, excludeFromTotals: false,
    });
  });

  it('keeps every field it does not know about', () => {
    const out = migrateAsset({ name: 'X', custom: 'keep me', nested: { a: 1 } });
    expect(out.custom).toBe('keep me');
    expect(out.nested).toEqual({ a: 1 });
  });

  it('keeps existing lots, and replaces lots that are not a list', () => {
    const lots = [{ id: 'a', quantity: 5 }];
    expect(migrateAsset({ name: 'X', lots }).lots).toBe(lots);
    [undefined, null, 'oops', 7, {}].forEach((bad) => expect(migrateAsset({ name: 'X', lots: bad }).lots).toEqual([]));
  });

  it('keeps lot tracking and skip flags that are already set', () => {
    const out = migrateAsset({ name: 'X', useLotTracking: true, skipPriceUpdate: true, excludeFromTotals: false });
    expect(out.useLotTracking).toBe(true);
    expect(out.skipPriceUpdate).toBe(true);
  });

  describe('excludeFromTotals, split out from skipPriceUpdate', () => {
    it('defaults from the old skip flag so old files keep their totals', () => {
      expect(migrateAsset({ name: 'X', skipPriceUpdate: true }).excludeFromTotals).toBe(true);
      expect(migrateAsset({ name: 'X', skipPriceUpdate: false }).excludeFromTotals).toBe(false);
      expect(migrateAsset({ name: 'X' }).excludeFromTotals).toBe(false);
    });

    it('keeps an explicit false even when the skip flag is true', () => {
      expect(migrateAsset({ name: 'X', skipPriceUpdate: true, excludeFromTotals: false }).excludeFromTotals).toBe(false);
    });

    it('keeps an explicit true even when the skip flag is false', () => {
      expect(migrateAsset({ name: 'X', skipPriceUpdate: false, excludeFromTotals: true }).excludeFromTotals).toBe(true);
    });
  });

  it('does not change the object it was given', () => {
    const input = Object.freeze({ name: 'X', lots: Object.freeze([]) });
    expect(() => migrateAsset(input)).not.toThrow();
    expect(input).not.toHaveProperty('useLotTracking');
  });

  it('is stable: migrating twice gives the same result', () => {
    const once = migrateAsset({ name: 'X', skipPriceUpdate: true });
    expect(migrateAsset(once)).toEqual(once);
  });
});

describe('migrateScenario', () => {
  const ALL = ['savings', 'brokerage', 'traditionalIRA', 'rothIRA', 'traditional401k', 'roth401k'];

  it('passes null and undefined through untouched', () => {
    expect(migrateScenario(null)).toBeNull();
    expect(migrateScenario(undefined)).toBeUndefined();
  });

  it('fills every missing withdrawal with zero', () => {
    const out = migrateScenario({ id: 3, name: 'Old' });
    ALL.forEach((k) => expect(out.withdrawals[k]).toBe(0));
    expect(Object.keys(out.withdrawals).sort()).toEqual([...ALL].sort());
  });

  it('keeps the withdrawal amounts it has, including a real zero', () => {
    const out = migrateScenario({ withdrawals: {
      savings: 1234.5, brokerage: 111, traditionalIRA: 40000, rothIRA: 0, traditional401k: 222, roth401k: 333,
    } });
    expect(out.withdrawals).toEqual({
      savings: 1234.5, brokerage: 111, traditionalIRA: 40000, rothIRA: 0, traditional401k: 222, roth401k: 333,
    });
  });

  it('treats a null amount as zero and drops withdrawal fields it does not know', () => {
    const out = migrateScenario({ withdrawals: { savings: null, mystery: 99 } });
    expect(out.withdrawals.savings).toBe(0);
    expect(out.withdrawals).not.toHaveProperty('mystery');
  });

  it('defaults the Roth conversion to zero and keeps one that is set', () => {
    expect(migrateScenario({}).rothConversion).toBe(0);
    expect(migrateScenario({ rothConversion: 25000 }).rothConversion).toBe(25000);
  });

  it('defaults the three sale lists to empty, and keeps lists that exist', () => {
    const out = migrateScenario({});
    expect([out.stockWithdrawals, out.cryptoSales, out.metalSales]).toEqual([[], [], []]);
    const sales = [{ stockName: 'AAPL', sharesToSell: 5 }];
    expect(migrateScenario({ stockWithdrawals: sales }).stockWithdrawals).toBe(sales);
    [null, 'x', 4, {}].forEach((bad) => expect(migrateScenario({ cryptoSales: bad }).cryptoSales).toEqual([]));
  });

  it('keeps the scenario id, name and any other field', () => {
    const out = migrateScenario({ id: 7, name: 'Plan B', note: 'x' });
    expect(out).toMatchObject({ id: 7, name: 'Plan B', note: 'x' });
  });

  it('does not change the object it was given', () => {
    const input = Object.freeze({ id: 1, withdrawals: Object.freeze({ savings: 5 }) });
    expect(() => migrateScenario(input)).not.toThrow();
  });

  it('is stable: migrating twice gives the same result', () => {
    const once = migrateScenario({ id: 1, withdrawals: { savings: 5 } });
    expect(migrateScenario(once)).toEqual(once);
  });
});
