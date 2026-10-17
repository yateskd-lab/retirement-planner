// Two complete, realistic scenarios recorded in full. If any output field changes,
// the test fails and shows exactly which one. When a change is intended (a new rule,
// a fix), review the diff and accept it with:  npm test -- -u
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { run } from './testHelpers';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-16T12:00:00Z'));
});
afterEach(() => vi.useRealTimers());

const lot = (id, purchaseDate, quantity, cost) => ({
  id, purchaseDate, quantity, costBasisPerUnit: cost, totalCostBasis: quantity * cost,
});

const stock = {
  name: 'AAA', shares: 500, costBasis: 0, currentPrice: 80, useLotTracking: true,
  lots: [lot(1, '2021-03-15', 200, 40), lot(2, '2024-08-01', 200, 65), lot(3, '2026-04-20', 100, 90)],
};
const crypto = { name: 'BTC', units: 2, costBasis: 20000, currentPrice: 60000, useLotTracking: false, lots: [] };
const metal = { name: 'Gold', units: 50, costBasis: 1800, currentPrice: 2400, useLotTracking: false, lots: [] };

describe('full scenario snapshots', () => {
  it('single retiree: Social Security, IRA, lot-tracked sale, Roth conversion', () => {
    const r = run(
      {
        personalInfo: { age: 67, filingStatus: 'single', interestIncome: 4000, qualifiedDividends: 6000, ordinaryDividends: 1500 },
        stocks: [stock],
        socialSecurity: { enabled: true, monthlyBenefit: 2400 },
      },
      {
        withdrawals: { traditionalIRA: 45000, rothIRA: 10000 },
        rothConversion: 20000,
        stockWithdrawals: [{ stockName: 'AAA', sharesToSell: 300, selectionStrategy: 'HIFO' }],
      }
    );
    expect(r).toMatchSnapshot();
  });

  it('married couple: pension, both benefits, stock, crypto and metals', () => {
    const r = run(
      {
        personalInfo: {
          age: 71, spouseAge: 68, filingStatus: 'married', dependents: 0,
          monthlyPension: 2500, pensionStartMonth: 1, interestIncome: 3000, qualifiedDividends: 9000,
        },
        stocks: [stock], crypto: [crypto], metals: [metal],
        socialSecurity: { enabled: true, monthlyBenefit: 3100, spouseMonthlyBenefit: 1400 },
      },
      {
        withdrawals: { traditionalIRA: 30000, traditional401k: 20000, savings: 5000 },
        stockWithdrawals: [{ stockName: 'AAA', sharesToSell: 250, selectionStrategy: 'TAX_OPTIMIZED' }],
        cryptoSales: [{ cryptoName: 'BTC', unitsToSell: 0.5 }],
        metalSales: [{ metalName: 'Gold', unitsToSell: 10 }],
      }
    );
    expect(r).toMatchSnapshot();
  });
});

describe('crypto and metals', () => {
  it('add their gains and proceeds to the totals', () => {
    const r = run(
      { personalInfo: { age: 60 }, crypto: [crypto], metals: [metal] },
      { cryptoSales: [{ cryptoName: 'BTC', unitsToSell: 1 }], metalSales: [{ metalName: 'Gold', unitsToSell: 10 }] }
    );
    expect(r.totalCryptoGains).toBe(40000);          // 1 x (60,000 - 20,000)
    expect(r.totalMetalGains).toBe(6000);            // 10 x (2,400 - 1,800)
    expect(r.totalCryptoProceeds).toBe(60000);
    expect(r.totalMetalProceeds).toBe(24000);
    expect(r.totalCapitalGains).toBe(46000);
  });
});
