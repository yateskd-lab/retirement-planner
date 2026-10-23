// The Roth conversion optimizer: how much to convert before hitting a limit. First every
// branch with hand-worked numbers, then against the real tax engine.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { computeRothOptimization } from './rothOptimizer';
import { makeEngine, makeScenario } from './testHelpers';

// ------------------------- hand-worked cases -------------------------
// IRMAA tiers: 0-100k, 100-150k, 150-200k, 200k and up (no ceiling)
const tiers = [
  { magi: 0, magiMax: 100000 },
  { magi: 100000, magiMax: 150000 },
  { magi: 150000, magiMax: 200000 },
  { magi: 200000, magiMax: Infinity },
];
const base = (over = {}) => ({
  roomInBracket: 20000,              // room left in the current tax bracket
  roomToNextIRMAABracket: 30000,     // room left in the current IRMAA tier (the engine's name for it)
  currentIRMAABracket: tiers[0],
  magi: 70000,
  niitThreshold: 200000,
  currentBracket: { rate: 0.12 },
  ...over,
});
const funds = { traditionalIRA: 300000, traditional401k: 100000 };       // 400,000 available
const optimize = (strategy, over = {}, buffer = 0, accounts = funds) => computeRothOptimization({
  baselineResults: base(over), irmaaBrackets: tiers, irmaaBuffer: buffer, rothOptimizationStrategy: strategy, accounts,
});

describe('conservative: stay inside the current tax bracket', () => {
  it('suggests the room left in the bracket', () => {
    const r = optimize('conservative');
    expect(r.optimalAmount).toBe(20000);
    expect(r.limitingFactor).toBe('Tax Bracket');
    expect(r.reason).toBe('Fills your 12% tax bracket without jumping to the next bracket.');
  });
  it('rounds down to a whole dollar', () => {
    expect(optimize('conservative', { roomInBracket: 20000.9 }).optimalAmount).toBe(20000);
  });
  it('suggests nothing when the bracket is full or the room is negative', () => {
    [0, -500].forEach((room) => {
      const r = optimize('conservative', { roomInBracket: room });
      expect(r).toMatchObject({ optimalAmount: 0, limitingFactor: '', reason: '', taxBracketRoom: 0 });
    });
  });
  it('ignores the IRMAA buffer', () => {
    expect(optimize('conservative', {}, 99999).optimalAmount).toBe(20000);
  });
});

describe('irmaa: fill up to the IRMAA threshold, even across tax brackets', () => {
  it('suggests the room to the threshold, less the buffer', () => {
    const r = optimize('irmaa', {}, 5000);
    expect(r.optimalAmount).toBe(25000);
    expect(r.irmaaRoom).toBe(25000);
    expect(r.limitingFactor).toBe('IRMAA Threshold');
    expect(r.reason).toContain('buffer');
  });
  it('can suggest more than the tax bracket holds', () => {
    const r = optimize('irmaa', { roomInBracket: 10000 });
    expect(r.optimalAmount).toBe(30000);
    expect(r.taxBracketRoom).toBe(10000);
  });
  it('never lets a big buffer make the room negative', () => {
    expect(optimize('irmaa', {}, 50000).irmaaRoom).toBe(0);
  });
  it('falls back to the tax bracket when it is already at the threshold', () => {
    const r = optimize('irmaa', {}, 30000);          // buffer eats all 30,000
    expect(r.optimalAmount).toBe(20000);
    expect(r.limitingFactor).toBe('Tax Bracket');
    expect(r.reason).toContain('Already at IRMAA threshold');
  });
  it('suggests nothing when both are used up', () => {
    expect(optimize('irmaa', { roomInBracket: 0, roomToNextIRMAABracket: 0 }).optimalAmount).toBe(0);
  });
});

describe('aggressive: fill to the top of the NEXT IRMAA tier', () => {
  it('suggests the distance to the top of the next tier', () => {
    // next tier ends at 150,000; baseline MAGI 70,000
    const r = optimize('aggressive');
    expect(r.roomToNextIRMAABracket).toBe(80000);
    expect(r.optimalAmount).toBe(80000);
    expect(r.limitingFactor).toBe('Next IRMAA Bracket Threshold');
  });
  it('takes the buffer off', () => {
    expect(optimize('aggressive', {}, 10000).optimalAmount).toBe(70000);
  });
  it('when the tier above is the top one there is no ceiling, so the tax bracket limits it', () => {
    const r = optimize('aggressive', { currentIRMAABracket: tiers[2], magi: 170000 });
    expect(r.roomToNextIRMAABracket).toBe(Infinity);
    expect(r.optimalAmount).toBe(20000);
    expect(r.limitingFactor).toBe('Tax Bracket');
    expect(r.reason).toContain('no IRMAA bracket above');
  });
  it('with no tax room either, falls back to the current IRMAA room', () => {
    const r = optimize('aggressive', { currentIRMAABracket: tiers[2], magi: 170000, roomInBracket: 0 });
    expect(r.optimalAmount).toBe(30000);
    expect(r.limitingFactor).toBe('Current IRMAA Threshold');
  });
  it('already in the top tier: nothing above, so it uses the current room', () => {
    const r = optimize('aggressive', { currentIRMAABracket: tiers[3], magi: 250000, roomToNextIRMAABracket: 12000 });
    expect(r.roomToNextIRMAABracket).toBe(0);
    expect(r.optimalAmount).toBe(12000);
    expect(r.limitingFactor).toBe('Current IRMAA Threshold');
  });
  it('last resort is the tax bracket', () => {
    const r = optimize('aggressive', { currentIRMAABracket: tiers[3], magi: 250000, roomToNextIRMAABracket: 0 });
    expect(r.optimalAmount).toBe(20000);
    expect(r.reason).toContain('Already at IRMAA limits');
  });
  it('copes with no IRMAA tier at all', () => {
    const r = optimize('aggressive', { currentIRMAABracket: undefined });
    expect(r.roomToNextIRMAABracket).toBe(0);
    expect(r.optimalAmount).toBe(30000);
  });
  it('a buffer larger than the distance leaves no room in the next tier', () => {
    expect(optimize('aggressive', {}, 90000).roomToNextIRMAABracket).toBe(0);
  });
});

describe('available funds', () => {
  it('caps the suggestion at the Traditional IRA plus 401(k) balance', () => {
    const r = optimize('conservative', { roomInBracket: 500000 });
    expect(r.optimalAmount).toBe(400000);
    expect(r.limitingFactor).toBe('Available Funds');
    expect(r.reason).toContain('Traditional IRA/401(k)');
  });
  it('does not cap when the amount equals the balance', () => {
    const r = optimize('conservative', { roomInBracket: 400000 });
    expect(r.optimalAmount).toBe(400000);
    expect(r.limitingFactor).toBe('Tax Bracket');
  });
  it('treats "no ceiling" as limited only by the balance', () => {
    const r = optimize('conservative', { roomInBracket: Infinity });
    expect(r.optimalAmount).toBe(400000);
    expect(r.limitingFactor).toBe('Available Funds');
    const m = optimize('irmaa', { roomToNextIRMAABracket: Infinity }, 5000);
    expect(m.optimalAmount).toBe(400000);
  });
  it('suggests nothing when there is nothing to convert', () => {
    expect(optimize('conservative', {}, 0, { traditionalIRA: 0, traditional401k: 0 }).optimalAmount).toBe(0);
  });
});

describe('the other figures it reports', () => {
  it('NIIT room is the distance below the threshold, never negative', () => {
    expect(optimize('conservative', { magi: 150000 }).niitRoom).toBe(50000);
    expect(optimize('conservative', { magi: 200000 }).niitRoom).toBe(0);
    expect(optimize('conservative', { magi: 260000 }).niitRoom).toBe(0);
  });
  it('an unknown strategy suggests nothing', () => {
    expect(optimize('reckless')).toMatchObject({ optimalAmount: 0, limitingFactor: '', reason: '' });
  });
  it('returns every figure the screen shows', () => {
    expect(Object.keys(optimize('conservative')).sort()).toEqual(
      ['irmaaRoom', 'limitingFactor', 'niitRoom', 'optimalAmount', 'reason', 'roomToNextIRMAABracket', 'taxBracketRoom']);
  });
  it('does not change what it is given', () => {
    const frozen = Object.freeze({ ...base(), currentBracket: Object.freeze({ rate: 0.12 }) });
    expect(() => computeRothOptimization({
      baselineResults: frozen, irmaaBrackets: Object.freeze(tiers), irmaaBuffer: 0,
      rothOptimizationStrategy: 'aggressive', accounts: Object.freeze({ ...funds }),
    })).not.toThrow();
  });
});

// ------------------------- against the real tax engine -------------------------
describe('with the real tax engine', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 9, 16, 12)); });
  afterEach(() => vi.useRealTimers());

  const BUFFER = 5000;
  const people = [
    ['single, 66, $60,000', { age: 66 }, 60000],
    ['single, 66, $120,000', { age: 66 }, 120000],
    ['single, 68, $190,000', { age: 68 }, 190000],
    ['single, 70, $400,000', { age: 70 }, 400000],
    ['married, 67/67, $150,000', { age: 67, spouseAge: 67, filingStatus: 'married' }, 150000],
    ['married, 70/68, $300,000', { age: 70, spouseAge: 68, filingStatus: 'married' }, 300000],
  ];
  const STRATEGIES = ['conservative', 'irmaa', 'aggressive'];

  const setup = (info, amount) => {
    const engine = makeEngine({ personalInfo: info });
    const scenario = makeScenario({ withdrawals: { traditionalIRA: amount } });
    const baseline = engine.calculateScenario({ ...scenario, rothConversion: 0 });
    const suggest = (strategy) => computeRothOptimization({
      baselineResults: baseline, irmaaBrackets: engine.irmaaBracketsFor(engine.irmaaFilingStatus),
      irmaaBuffer: BUFFER, rothOptimizationStrategy: strategy,
      accounts: { traditionalIRA: 1000000, traditional401k: 0 },
    });
    const converted = (amount2) => engine.calculateScenario({ ...scenario, rothConversion: amount2 });
    return { engine, baseline, suggest, converted };
  };

  it('single, 66, $60,000: fills the 12% bracket exactly', () => {
    // taxable 60,000 - (16,100 + 2,050 + 6,000) = 35,850; the 12% bracket ends at 50,400
    const { suggest, converted } = setup({ age: 66 }, 60000);
    const r = suggest('conservative');
    expect(r.optimalAmount).toBe(14550);
    expect(r.limitingFactor).toBe('Tax Bracket');
    expect(converted(r.optimalAmount).taxableOrdinaryIncome).toBe(50400);
    expect(converted(r.optimalAmount + 1).currentBracket.rate).toBe(0.22);
  });

  // CURRENT BEHAVIOUR, kept here so a change to it is deliberate. In the "irmaa" strategy, once
  // the room to the IRMAA threshold is smaller than the buffer, the optimizer gives up on IRMAA
  // and suggests filling the whole tax bracket. That can carry MAGI across several IRMAA tiers,
  // and it means being CLOSER to a threshold produces a BIGGER suggestion. The panel says
  // "Already at IRMAA threshold. Fills current tax bracket instead." Whether that is wanted is
  // a tax-strategy decision, not a coding one.
  it('irmaa strategy right under a threshold: suggests filling the tax bracket, crossing IRMAA tiers', () => {
    const { baseline, suggest, converted } = setup({ age: 66 }, 141000);
    const r = suggest('irmaa');
    expect(baseline.roomToNextIRMAABracket).toBeLessThan(BUFFER);          // inside the buffer
    expect(r.limitingFactor).toBe('Tax Bracket');
    expect(r.reason).toContain('Already at IRMAA threshold');
    const after = converted(r.optimalAmount);
    expect(after.currentIRMAABracket.magi).toBeGreaterThan(baseline.currentIRMAABracket.magi);
    expect(after.medicare.total.annual).toBeGreaterThan(baseline.medicare.total.annual);
    // and a little further from the threshold it suggests far LESS
    const further = setup({ age: 66 }, 138000).suggest('irmaa');
    expect(further.optimalAmount).toBeLessThan(r.optimalAmount);
  });

  describe.each(people)('%s', (_name, info, amount) => {
    it.each(STRATEGIES)('%s: a whole, non-negative amount within the balance', (strategy) => {
      const { suggest } = setup(info, amount);
      const { optimalAmount } = suggest(strategy);
      expect(Number.isFinite(optimalAmount)).toBe(true);
      expect(Number.isInteger(optimalAmount)).toBe(true);
      expect(optimalAmount).toBeGreaterThanOrEqual(0);
      expect(optimalAmount).toBeLessThanOrEqual(1000000);
    });

    it('conservative: converting the suggestion fills the bracket, and one more dollar leaves it', () => {
      const { baseline, suggest, converted } = setup(info, amount);
      const r = suggest('conservative');
      const top = baseline.currentBracket.max;
      if (r.optimalAmount === 0 || !Number.isFinite(top)) return;
      expect(converted(r.optimalAmount).taxableOrdinaryIncome).toBeLessThanOrEqual(top);
      // landing exactly on the top edge is allowed; the next dollar is what crosses it
      if (r.limitingFactor === 'Tax Bracket') {
        expect(converted(r.optimalAmount + 1).taxableOrdinaryIncome).toBeGreaterThan(top);
      }
    });

    it('irmaa: converting the suggestion keeps MAGI the buffer below the IRMAA threshold', () => {
      const { baseline, suggest, converted } = setup(info, amount);
      const r = suggest('irmaa');
      if (r.limitingFactor !== 'IRMAA Threshold') return;
      const after = converted(r.optimalAmount);
      expect(after.magi).toBe(baseline.magi + r.optimalAmount);       // a conversion adds dollar for dollar
      expect(after.magi + BUFFER).toBeLessThanOrEqual(baseline.currentIRMAABracket.magiMax);
      expect(after.currentIRMAABracket.description).toBe(baseline.currentIRMAABracket.description);
    });

    it('aggressive: converting the suggestion stops the buffer below the top of the next tier', () => {
      const { engine, baseline, suggest, converted } = setup(info, amount);
      const r = suggest('aggressive');
      if (r.limitingFactor !== 'Next IRMAA Bracket Threshold') return;
      const list = engine.irmaaBracketsFor(engine.irmaaFilingStatus);
      const i = list.findIndex((b) => b.magi === baseline.currentIRMAABracket.magi);
      expect(converted(r.optimalAmount).magi + BUFFER).toBeLessThanOrEqual(list[i + 1].magiMax);
    });
  });
});
