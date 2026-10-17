// Whole-scenario results from calculateScenario. Expected figures are worked out by
// hand from tax-rules.json (the arithmetic is shown beside each one).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PROJECTED_IRMAA_BRACKETS, TAX_YEAR } from './taxConfig';
import { run, makeEngine, makeScenario } from './testHelpers';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-16T12:00:00Z'));
});
afterEach(() => vi.useRealTimers());

const ira = (amount) => ({ withdrawals: { traditionalIRA: amount } });

describe('federal ordinary income', () => {
  it('has no tax with no income', () => {
    const r = run();
    expect(r.totalTax).toBe(0);
    expect(r.totalTaxWithState).toBe(0);
    expect(r.effectiveRate).toBe(0);
  });

  it('single, under 65, $60,000 IRA: standard deduction only', () => {
    // taxable 60,000 - 16,100 = 43,900 -> 10% x 12,400 + 12% x 31,500
    const r = run({ personalInfo: { age: 60 } }, ira(60000));
    expect(r.standardDeduction).toBe(16100);
    expect(r.taxableIncome).toBe(43900);
    expect(r.ordinaryIncomeTax).toBeCloseTo(1240 + 3780, 6);
    expect(r.totalTax).toBeCloseTo(5020, 6);
  });

  it('single, 65, $60,000 IRA: adds the 65+ and senior deductions', () => {
    // deduction 16,100 + 2,050 (65+) + 6,000 (senior, MAGI under 75,000) = 24,150
    // taxable 35,850 -> 1,240 + 12% x 23,450 = 4,054
    const r = run({ personalInfo: { age: 65 } }, ira(60000));
    expect(r.additionalStandardDeduction).toBe(2050);
    expect(r.seniorDeduction).toBe(6000);
    expect(r.standardDeduction).toBe(24150);
    expect(r.ordinaryIncomeTax).toBeCloseTo(4054, 6);
  });

  it('phases the senior deduction out at 6 cents per dollar over the threshold', () => {
    // MAGI 85,000: 6,000 - 0.06 x (85,000 - 75,000) = 5,400
    const r = run({ personalInfo: { age: 65 } }, ira(85000));
    expect(r.seniorDeduction).toBeCloseTo(5400, 6);
    expect(run({ personalInfo: { age: 65 } }, ira(175000)).seniorDeduction).toBe(0);
  });

  it('married, both 65, $120,000: each spouse gets the extra deductions', () => {
    // deduction 32,200 + 2 x 1,650 + 2 x 6,000 = 47,500; taxable 72,500
    // tax = 10% x 24,800 + 12% x 47,700 = 8,204
    const r = run({ personalInfo: { age: 65, spouseAge: 65, filingStatus: 'married' } }, ira(120000));
    expect(r.standardDeduction).toBe(47500);
    expect(r.ordinaryIncomeTax).toBeCloseTo(8204, 6);
  });

  it('married, only one spouse 65: only one set of extra deductions', () => {
    const r = run({ personalInfo: { age: 65, spouseAge: 60, filingStatus: 'married' } }, ira(120000));
    expect(r.standardDeduction).toBe(32200 + 1650 + 6000);
  });

  it('married filing separately gets no senior deduction', () => {
    const r = run({ personalInfo: { age: 65, filingStatus: 'marriedFilingSeparately' } }, ira(60000));
    expect(r.seniorDeduction).toBe(0);
    expect(r.baseStandardDeduction).toBe(16100);
  });

  it('adds employment and pension income from the personal info', () => {
    // 3 months x 5,000 work; pension starts month 4 -> 9 months x 3,000
    const r = run({ personalInfo: { age: 60, workMonths: 3, monthlyWorkIncome: 5000, monthlyPension: 3000, pensionStartMonth: 4 } });
    expect(r.employmentIncome).toBe(15000);
    expect(r.pensionIncome).toBe(27000);
    expect(r.ordinaryIncome).toBe(42000);
  });

  it('counts Roth withdrawals and savings as tax-free', () => {
    const r = run({ personalInfo: { age: 60 } }, { withdrawals: { rothIRA: 50000, roth401k: 20000, savings: 10000 } });
    expect(r.taxFreeWithdrawals).toBe(80000);
    expect(r.totalTax).toBe(0);
  });

  it('taxes a Roth conversion at the marginal rate', () => {
    // $10,000 more inside the 12% bracket costs exactly $1,200
    const base = run({ personalInfo: { age: 60 } }, ira(40000));
    const converted = run({ personalInfo: { age: 60 } }, { ...ira(40000), rothConversion: 10000 });
    expect(converted.totalTax - base.totalTax).toBeCloseTo(1200, 6);
  });
});

describe('capital gains in a scenario', () => {
  const plain = { name: 'S', shares: 1000, costBasis: 10, currentPrice: 110, useLotTracking: false, lots: [] };
  const sell = (shares) => ({ stockWithdrawals: [{ stockName: 'S', sharesToSell: shares }] });

  it('taxes long-term gains at the preferential rates', () => {
    // sell 1,000 shares: gain 100,000. Taxable 100,000 - 16,100 = 83,900, all preferential
    // -> 0% to 49,450, then 15% on 34,450 = 5,167.50
    const r = run({ personalInfo: { age: 60 }, stocks: [plain] }, sell(1000));
    expect(r.totalStockLongTermGains).toBe(100000);
    expect(r.taxableOrdinaryIncome).toBe(0);
    expect(r.capitalGainsTax).toBeCloseTo(5167.5, 6);
    expect(r.ordinaryIncomeTax).toBe(0);
    expect(r.totalTax).toBeCloseTo(5167.5, 6);
  });

  it('adds qualified dividends to the preferential income', () => {
    const r = run({ personalInfo: { age: 60, qualifiedDividends: 10000 } });
    expect(r.totalLongTermGainsWithQualDiv).toBe(10000);
  });

  it('limits a net capital loss to $3,000 against income and carries the rest', () => {
    const losing = { ...plain, costBasis: 200, currentPrice: 100 };
    const r = run({ personalInfo: { age: 60 }, stocks: [losing] }, { ...ira(50000), ...sell(100) });
    // loss 100 x (100 - 200) = 10,000
    expect(r.netCapitalGains).toBe(-10000);
    expect(r.capitalLossDeduction).toBe(3000);
    expect(r.excessCapitalLoss).toBe(7000);
    expect(r.ordinaryIncome).toBe(47000);
    expect(r.capitalGainsTax).toBe(0);
  });

  it('limits the loss deduction to $1,500 for married filing separately', () => {
    const losing = { ...plain, costBasis: 200, currentPrice: 100 };
    const r = run({ personalInfo: { age: 60, filingStatus: 'marriedFilingSeparately' }, stocks: [losing] }, sell(100));
    expect(r.capitalLossDeduction).toBe(1500);
    expect(r.excessCapitalLoss).toBe(8500);
  });

  it('records a stock sale with lots, using the frozen date for holding period', () => {
    const lotted = {
      name: 'S', shares: 200, costBasis: 0, currentPrice: 50, useLotTracking: true,
      lots: [
        { id: 1, purchaseDate: '2024-01-10', quantity: 100, costBasisPerUnit: 20, totalCostBasis: 2000 },
        { id: 2, purchaseDate: '2026-06-01', quantity: 100, costBasisPerUnit: 30, totalCostBasis: 3000 },
      ],
    };
    const r = run({ personalInfo: { age: 60 }, stocks: [lotted] },
      { stockWithdrawals: [{ stockName: 'S', sharesToSell: 200, selectionStrategy: 'FIFO' }] });
    expect(r.totalStockLongTermGains).toBe(3000);   // 100 x (50 - 20)
    expect(r.totalStockShortTermGains).toBe(2000);  // 100 x (50 - 30)
    expect(r.totalStockProceeds).toBe(10000);
    // short-term gains are taxed as ordinary income
    expect(r.ordinaryIncome).toBe(2000);
  });

  it('ignores a sale of a stock that is not in the portfolio', () => {
    const r = run({ personalInfo: { age: 60 } }, { stockWithdrawals: [{ stockName: 'NOPE', sharesToSell: 50 }] });
    expect(r.totalStockProceeds).toBe(0);
  });
});

describe('Social Security taxability', () => {
  const ss = { socialSecurity: { enabled: true, monthlyBenefit: 2000 } }; // 24,000 a year

  it('is untaxed when other income is low', () => {
    const r = run({ personalInfo: { age: 60 }, ...ss });
    expect(r.socialSecurityIncome).toBe(24000);
    expect(r.taxableSocialSecurity).toBe(0);
  });

  it('taxes up to 50% between the two thresholds (single)', () => {
    // provisional 20,000 + 12,000 = 32,000; 50% x (32,000 - 25,000) = 3,500
    expect(run({ personalInfo: { age: 60 }, ...ss }, ira(20000)).taxableSocialSecurity).toBeCloseTo(3500, 6);
  });

  it('taxes up to 85% above the upper threshold (single)', () => {
    // provisional 52,000: min(0.85 x 24,000, 0.85 x (52,000 - 34,000) + 4,500) = 19,800
    expect(run({ personalInfo: { age: 60 }, ...ss }, ira(40000)).taxableSocialSecurity).toBeCloseTo(19800, 6);
  });

  it('never taxes more than 85% of the benefit', () => {
    expect(run({ personalInfo: { age: 60 }, ...ss }, ira(100000)).taxableSocialSecurity).toBeCloseTo(0.85 * 24000, 6);
  });

  it('uses the higher married thresholds (32,000 / 44,000)', () => {
    // provisional 30,000 + 12,000 = 42,000; 50% x (42,000 - 32,000) = 5,000
    const r = run({ personalInfo: { age: 60, spouseAge: 60, filingStatus: 'married' }, ...ss }, ira(30000));
    expect(r.taxableSocialSecurity).toBeCloseTo(5000, 6);
  });

  it('adds the spouse benefit only on a joint return', () => {
    const both = { socialSecurity: { enabled: true, monthlyBenefit: 2000, spouseMonthlyBenefit: 1000 } };
    expect(run({ personalInfo: { age: 60, filingStatus: 'married' }, ...both }).socialSecurityIncome).toBe(36000);
    expect(run({ personalInfo: { age: 60, filingStatus: 'single' }, ...both }).socialSecurityIncome).toBe(24000);
  });

  it('married filing separately has a $0 base when living with the spouse', () => {
    // provisional 12,000 over a 0/0 threshold: 85% x 12,000 = 10,200
    const r = run({ personalInfo: { age: 60, filingStatus: 'marriedFilingSeparately' }, ...ss });
    expect(r.taxableSocialSecurity).toBeCloseTo(10200, 6);
  });

  it('married filing separately living apart all year uses the single thresholds', () => {
    const r = run({ personalInfo: { age: 60, filingStatus: 'marriedFilingSeparately', livedApartFromSpouse: true }, ...ss }, ira(20000));
    expect(r.taxableSocialSecurity).toBeCloseTo(3500, 6);
  });

  it('gives no taxable benefit when Social Security is switched off', () => {
    const r = run({ personalInfo: { age: 60 }, socialSecurity: { enabled: false, monthlyBenefit: 2000 } }, ira(60000));
    expect(r.socialSecurityIncome).toBe(0);
    expect(r.taxableSocialSecurity).toBe(0);
  });
});

describe('net investment income tax', () => {
  it('applies 3.8% to the lesser of investment income and MAGI over the threshold', () => {
    // MAGI 250,000 (150,000 IRA + 100,000 interest); threshold 200,000 -> base min(100,000, 50,000)
    const r = run({ personalInfo: { age: 60, interestIncome: 100000 } }, ira(150000));
    expect(r.magi).toBe(250000);
    expect(r.niitBase).toBe(50000);
    expect(r.niitTax).toBeCloseTo(1900, 6);
  });

  it('is zero below the threshold', () => {
    expect(run({ personalInfo: { age: 60, interestIncome: 50000 } }, ira(50000)).niitTax).toBe(0);
  });

  it('is limited to investment income when that is the smaller amount', () => {
    // MAGI 430,000 is 230,000 over the threshold, but only 30,000 is investment income
    const r = run({ personalInfo: { age: 60, interestIncome: 30000 } }, ira(400000));
    expect(r.niitBase).toBe(30000);
    expect(r.niitTax).toBeCloseTo(1140, 6);
  });

  it('counts net capital gains as investment income, and a net loss never makes it negative', () => {
    const stockOf = (cost) => ({ name: 'S', shares: 100, costBasis: cost, currentPrice: 100, useLotTracking: false, lots: [] });
    const sell = { stockWithdrawals: [{ stockName: 'S', sharesToSell: 100 }] };
    // gain 100 x (100 - 50) = 5,000 on top of a 300,000 IRA withdrawal
    const gain = run({ personalInfo: { age: 60 }, stocks: [stockOf(50)] }, { ...ira(300000), ...sell });
    expect(gain.niitBase).toBe(5000);
    const loss = run({ personalInfo: { age: 60 }, stocks: [stockOf(200)] }, { ...ira(300000), ...sell });
    expect(loss.niitTax).toBe(0);
  });

  it('uses the married threshold (250,000) on a joint return', () => {
    const r = run({ personalInfo: { age: 60, spouseAge: 60, filingStatus: 'married', interestIncome: 100000 } }, ira(150000));
    expect(r.niitThreshold).toBe(250000);
    expect(r.niitTax).toBe(0);
  });
});

describe('Utah state tax', () => {
  it('single, 65, $60,000: flat rate less the taxpayer credit', () => {
    // before credit 60,000 x 4.45% = 2,670; credit base 16,100 + 2,050 = 18,150
    // initial credit 6% x 18,150 = 1,089, less 1.3% x (60,000 - 18,213) = 543.231 -> 545.769
    // Utah tax 2,670 - 545.769 = 2,124.231 (born 1961, after the 1952 retirement-credit cutoff)
    const r = run({ personalInfo: { age: 65 } }, ira(60000));
    expect(r.utahTaxBeforeCredit).toBeCloseTo(2670, 6);
    expect(r.utahTaxpayerCredit).toBeCloseTo(545.769, 3);
    expect(r.totalUtahTax).toBeCloseTo(2124.231, 3);
    expect(r.totalTaxWithState).toBeCloseTo(r.totalTax + r.totalUtahTax, 9);
  });

  it('has no Utah tax at or below the standard deduction', () => {
    const r = run({ personalInfo: { age: 60 } }, ira(10000));
    expect(r.utahExempt).toBe(true);
    expect(r.totalUtahTax).toBe(0);
  });

  it('gives the retirement credit to someone born in 1952 or earlier', () => {
    // age at year end = TAX_YEAR - 1952 -> eligible; credit 450, phased out above 25,000 of AGI
    const r = run({ personalInfo: { age: TAX_YEAR - 1952 } }, ira(30000));
    expect(r.utahRetirementEligible).toBe(1);
    expect(r.utahRetirementInitialCredit).toBe(450);
  });

  it('never goes negative', () => {
    [0, 5000, 20000, 60000, 300000, 2000000].forEach((amount) => {
      expect(run({ personalInfo: { age: 70 } }, ira(amount)).totalUtahTax).toBeGreaterThanOrEqual(0);
    });
  });
});

describe('IRMAA and Medicare', () => {
  const single = PROJECTED_IRMAA_BRACKETS.single;

  it('puts MAGI in the right bracket at every threshold (single)', () => {
    single.forEach((bracket, i) => {
      const r = run({ personalInfo: { age: 65 } }, ira(bracket.magi));
      expect(r.currentIRMAABracket.description).toBe(bracket.description);
      if (i > 0) {
        const below = run({ personalInfo: { age: 65 } }, ira(bracket.magi - 1));
        expect(below.currentIRMAABracket.description).toBe(single[i - 1].description);
      }
    });
  });

  it('reports the room to the next threshold', () => {
    const r = run({ personalInfo: { age: 65 } }, ira(60000));
    expect(r.roomToNextIRMAABracket).toBe(single[0].magiMax - 60000);
  });

  it('has no ceiling to measure in the top IRMAA bracket', () => {
    const top = single[single.length - 1];
    const r = run({ personalInfo: { age: 65 } }, ira(top.magi + 50000));
    expect(r.currentIRMAABracket.description).toBe(top.description);
    expect(r.roomToNextIRMAABracket).toBe(Infinity);
  });

  it('is only charged from the Medicare eligibility age', () => {
    expect(run({ personalInfo: { age: 64 } }, ira(60000)).medicare.eligible).toBe(false);
    const at65 = run({ personalInfo: { age: 65 } }, ira(60000)).medicare;
    expect(at65.eligible).toBe(true);
    expect(at65.total.annual).toBeCloseTo(at65.basePremiums.annual + at65.irmaa.annual, 6);
  });

  it('charges more at a higher MAGI', () => {
    const low = run({ personalInfo: { age: 65 } }, ira(60000)).medicare.total.annual;
    const high = run({ personalInfo: { age: 65 } }, ira(300000)).medicare.total.annual;
    expect(high).toBeGreaterThan(low);
  });

  it('uses the single table for married filing separately living apart', () => {
    const apart = run({ personalInfo: { age: 65, filingStatus: 'marriedFilingSeparately', livedApartFromSpouse: true } }, ira(150000));
    const alone = run({ personalInfo: { age: 65, filingStatus: 'single' } }, ira(150000));
    expect(apart.currentIRMAABracket.description).toBe(alone.currentIRMAABracket.description);
  });

  it('has a projected table that is contiguous and ascending', () => {
    ['single', 'married', 'marriedFilingSeparately'].forEach((status) => {
      const list = PROJECTED_IRMAA_BRACKETS[status];
      expect(list[0].magi).toBe(0);
      list.slice(1).forEach((b, i) => expect(b.magi).toBe(list[i].magiMax));
      list.slice(1).forEach((b, i) => expect(b.partB).toBeGreaterThanOrEqual(list[i].partB));
    });
  });
});

describe('room left in the tax bracket', () => {
  it('matches the simple gap when nothing else interferes', () => {
    // taxable 30,000 - 16,100 = 13,900 in the 12% bracket (to 50,400): room 36,500
    const r = run({ personalInfo: { age: 60 } }, ira(30000));
    expect(r.currentBracket.rate).toBe(0.12);
    expect(r.roomInBracket).toBe(36500);
  });

  const cases = [
    ['single, 60, $30,000', { age: 60 }, 30000],
    ['single, 65, $70,000 (senior deduction about to phase out)', { age: 65 }, 70000],
    ['single, 65, $140,000', { age: 65 }, 140000],
    ['married, 66/66, $120,000', { age: 66, spouseAge: 66, filingStatus: 'married' }, 120000],
  ];
  it.each(cases)('converting exactly the room stays in the bracket, one dollar more leaves it: %s', (_n, info, amount) => {
    const engine = makeEngine({ personalInfo: info });
    const scenario = makeScenario(ira(amount));
    const base = engine.calculateScenario(scenario);
    const top = base.currentBracket.max;
    const atRoom = engine.calculateScenario({ ...scenario, rothConversion: base.roomInBracket });
    const over = engine.calculateScenario({ ...scenario, rothConversion: base.roomInBracket + 1 });
    expect(atRoom.taxableOrdinaryIncome).toBeLessThanOrEqual(top);
    expect(over.taxableOrdinaryIncome).toBeGreaterThan(top);
  });
});

describe('top tax bracket', () => {
  const top = () => run({ personalInfo: { age: 60 } }, ira(900000));

  it('identifies the top bracket', () => {
    expect(top().currentBracket.rate).toBe(0.37);
  });

  // The engine reports "no ceiling" as Infinity: the Roth optimizer relies on it, since
  // converting more inside the top bracket can never move you out of it. The screens
  // treat a non-finite value as "no next bracket" (see display.test.jsx).
  it('reports unlimited room as Infinity, not a number', () => {
    expect(top().roomInBracket).toBe(Infinity);
  });
});

describe('consistency rules that must always hold', () => {
  const people = [
    { age: 60 }, { age: 65 }, { age: 72, spouseAge: 70, filingStatus: 'married' },
    { age: 66, filingStatus: 'marriedFilingSeparately' }, { age: 66, filingStatus: 'hoh' },
  ];
  const amounts = [0, 1000, 25000, 60000, 120000, 250000, 900000];

  it('total tax is ordinary + capital gains + NIIT; with state adds Utah', () => {
    people.forEach((info) => amounts.forEach((amount) => {
      const r = run({ personalInfo: { ...info, interestIncome: 5000, qualifiedDividends: 3000 } }, ira(amount));
      expect(r.totalTax).toBeCloseTo(r.ordinaryIncomeTax + r.capitalGainsTax + r.niitTax, 6);
      expect(r.totalTaxWithState).toBeCloseTo(r.totalTax + r.totalUtahTax, 6);
    }));
  });

  it('never produces NaN or Infinity in a numeric result', () => {
    people.forEach((info) => amounts.forEach((amount) => {
      const r = run({ personalInfo: info, socialSecurity: { enabled: true, monthlyBenefit: 2500 } }, ira(amount));
      Object.entries(r).forEach(([key, value]) => {
        if (typeof value !== 'number') return;
        expect(Number.isNaN(value), `${key} is NaN`).toBe(false);
        // These two are Infinity in the top bracket by design (no ceiling above it).
        if (!['roomInBracket', 'roomToNextIRMAABracket'].includes(key)) {
          expect(Number.isFinite(value), `${key} is not finite`).toBe(true);
        }
      });
    }));
  });

  it('tax never exceeds income and the effective rate stays between 0 and 100', () => {
    people.forEach((info) => amounts.forEach((amount) => {
      const r = run({ personalInfo: info }, ira(amount));
      expect(r.totalTax).toBeLessThanOrEqual(Math.max(amount, 0) + 1e-6);
      expect(r.effectiveRate).toBeGreaterThanOrEqual(0);
      expect(r.effectiveRate).toBeLessThanOrEqual(100);
    }));
  });

  it('more income never lowers the tax (single, 60)', () => {
    let previous = 0;
    for (let amount = 0; amount <= 400000; amount += 1000) {
      const { totalTax } = run({ personalInfo: { age: 60 } }, ira(amount));
      expect(totalTax).toBeGreaterThanOrEqual(previous - 1e-9);
      previous = totalTax;
    }
  });

  it('tolerates missing optional personal-info fields without NaN', () => {
    const engine = makeEngine();
    const r = engine.calculateScenario(makeScenario(ira(50000)));
    expect(Number.isFinite(r.totalTaxWithState)).toBe(true);
  });
});
