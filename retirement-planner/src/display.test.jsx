// The screens that show "room left in the bracket". In the top income bracket, and the
// top IRMAA bracket, there is no next bracket and the engine reports Infinity. The
// screens must say so in words, never print an infinite dollar amount.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PROJECTED_IRMAA_BRACKETS } from './taxConfig';
import { createDefaultPersonalInfo, createDefaultSocialSecurity } from './defaults';
import { noIncome, makeEngine, makeScenario } from './testHelpers';
import TaxSummaryGrid from './components/TaxSummaryGrid';
import RothConversionImpact from './components/RothConversionImpact';
import IrmaaAnalysis from './components/IrmaaAnalysis';
import RetirementWithdrawals from './components/RetirementWithdrawals';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 16, 12, 0, 0));
});
afterEach(() => vi.useRealTimers());

const personalInfo = { ...createDefaultPersonalInfo(), ...noIncome, age: 66 };
const socialSecurity = { ...createDefaultSocialSecurity(), enabled: false };
const engine = makeEngine({ personalInfo });

// Renders one screen for a scenario and returns its text.
const render = (Component, scenario, extraProps = {}) => {
  const results = engine.calculateScenario(scenario);
  const props = {
    federalRules: engine.federalRules,
    getActiveScenario: () => scenario,
    activeScenario: scenario,
    calculateScenario: engine.calculateScenario,
    irmaaBracketsFor: engine.irmaaBracketsFor,
    irmaaFilingStatus: engine.irmaaFilingStatus,
    personalInfo,
    socialSecurity,
    results,
    ...extraProps,
  };
  return { results, html: renderToStaticMarkup(<Component {...props} />) };
};

const withIRA = (amount, extra = {}) => makeScenario({ withdrawals: { traditionalIRA: amount }, ...extra });
const noInfinity = (html) => {
  expect(html).not.toContain('∞');
  expect(html).not.toContain('Infinity');
  expect(html).not.toContain('NaN');
};

describe('income tax bracket room on screen', () => {
  it('shows a dollar amount when there is room', () => {
    const { results, html } = render(TaxSummaryGrid, withIRA(60000));
    expect(Number.isFinite(results.roomInBracket)).toBe(true);
    expect(html).toContain(Math.round(results.roomInBracket).toLocaleString());
    expect(html).not.toContain('In highest bracket');
  });

  it('says "In highest bracket" in the top bracket', () => {
    const { results, html } = render(TaxSummaryGrid, withIRA(900000));
    expect(results.roomInBracket).toBe(Infinity);
    expect(html).toContain('In highest bracket');
    noInfinity(html);
  });

  it('Roth screen: gives a no-limit message in the top bracket and no infinite suggestion', () => {
    const { html } = render(RothConversionImpact, withIRA(900000, { rothConversion: 20000 }));
    expect(html).toContain('No limit (top bracket)');
    expect(html).not.toContain('Good positioning');
    noInfinity(html);
  });

  it('Roth screen: tells you the top-bracket rate applies to further conversions', () => {
    const { results, html } = render(RothConversionImpact, withIRA(900000, { rothConversion: 20000 }));
    const rate = Math.round(results.currentBracket.rate * 100);
    expect(rate).toBe(37);
    expect(html).toContain('Top bracket:');
    expect(html).toContain(`already in the ${rate}% bracket`);
    expect(html).toContain(`additional conversions are taxed at ${rate}%`);
  });

  it('Roth screen: the top-bracket note does not appear when there is room left', () => {
    const { html } = render(RothConversionImpact, withIRA(60000, { rothConversion: 5000 }));
    expect(html).not.toContain('Top bracket:');
    expect(html).not.toContain('already in the');
  });

  it('Roth screen: a conversion that lands you in the top bracket triggers the note', () => {
    // 640,600 is where the single 37% bracket starts; this converts well past it
    const { results, html } = render(RothConversionImpact, withIRA(500000, { rothConversion: 400000 }));
    expect(results.currentBracket.rate).toBe(0.37);
    expect(html).toContain('already in the 37% bracket');
  });

  it('Roth screen: still suggests the remaining room when there is some', () => {
    const { results, html } = render(RothConversionImpact, withIRA(60000, { rothConversion: 5000 }));
    expect(Number.isFinite(results.roomInBracket)).toBe(true);
    expect(html).toContain('Room Remaining in Bracket');
    expect(html).toContain(Math.round(results.roomInBracket).toLocaleString());
    noInfinity(html);
  });
});

describe('IRMAA bracket room on screen', () => {
  const top = PROJECTED_IRMAA_BRACKETS.single[PROJECTED_IRMAA_BRACKETS.single.length - 1];

  it('shows the room to the next bracket when there is one', () => {
    const { results, html } = render(IrmaaAnalysis, withIRA(60000));
    expect(Number.isFinite(results.roomToNextIRMAABracket)).toBe(true);
    expect(html).toContain('Room to Next Bracket');
    noInfinity(html);
  });

  it('says "highest IRMAA bracket" in the top bracket', () => {
    const { results, html } = render(IrmaaAnalysis, withIRA(top.magi + 50000));
    expect(results.roomToNextIRMAABracket).toBe(Infinity);
    expect(html).toContain('highest IRMAA bracket');
    expect(html).not.toContain('Room to Next Bracket');
    noInfinity(html);
  });
});

describe('warning when the plan asks for more than the accounts hold', () => {
  const accounts = { savings: 0, brokerage: 0, traditionalIRA: 2000000, rothIRA: 0, traditional401k: 0, roth401k: 0 };
  const form = (withdrawal, conversion) => {
    const { html } = render(RetirementWithdrawals, withIRA(withdrawal, { rothConversion: conversion }), {
      accounts, irmaaBuffer: 5000, rothOptimizationStrategy: 'conservative',
      updateActiveScenario: () => {}, updateWithdrawal: () => {}, setIrmaaBuffer: () => {}, setRothOptimizationStrategy: () => {},
    });
    return html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');
  };

  it('warns, with the amount over, when withdrawals plus the conversion are too much', () => {
    // 900,000 withdrawn + 1,200,000 converted = 2,100,000 from a 2,000,000 account
    expect(form(900000, 1200000)).toMatch(/⚠ Your withdrawals plus this conversion are \$100,?000 more than your Traditional IRA\/401\(k\) balance\./);
  });
  it('says nothing when the plan fits, even exactly', () => {
    expect(form(900000, 1100000)).not.toContain('more than your Traditional IRA/401(k) balance');
    expect(form(900000, 500000)).not.toContain('⚠');
    expect(form(0, 0)).not.toContain('⚠');
  });
  it('also warns when the withdrawals alone are more than the balance', () => {
    expect(form(2100000, 0)).toMatch(/\$100,?000 more than your Traditional IRA\/401\(k\) balance/);
  });
});

describe('Roth optimizer suggestion box', () => {
  const accounts = { savings: 0, brokerage: 0, traditionalIRA: 2000000, rothIRA: 0, traditional401k: 0, roth401k: 0 };
  const panel = (income, strategy) => {
    const scenario = withIRA(income);
    return render(RetirementWithdrawals, scenario, {
      accounts, irmaaBuffer: 5000, rothOptimizationStrategy: strategy,
      updateActiveScenario: () => {}, updateWithdrawal: () => {}, setIrmaaBuffer: () => {}, setRothOptimizationStrategy: () => {},
    });
  };

  it('shows the suggested amount and the room figures normally', () => {
    const { html } = panel(60000, 'conservative');
    expect(html).toContain('Suggested Optimal Conversion');
    expect(html).toContain('Tax Bracket Room');
    expect(html).not.toContain('∞');
  });

  // In the top tax bracket there is no ceiling: the engine reports Infinity (the optimizer relies on
  // that) and the box says so in words.
  it('says "no limit" instead of an infinite dollar amount in the top bracket', () => {
    const { html } = panel(900000, 'conservative');
    expect(html).toContain('Suggested Optimal Conversion');
    expect(html).not.toContain('∞');
    expect(html).not.toContain('Infinity');
  });

  it('does not offer to convert money that is already being withdrawn', () => {
    // 2,000,000 in the account, 900,000 withdrawn: at most 1,100,000 can be converted
    const { html } = panel(900000, 'conservative');
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    expect(text).toMatch(/Suggested Optimal Conversion: \$1,?100,?000/);
    expect(text).toContain('balance left after your planned withdrawals');
    expect(text).not.toMatch(/\$2,?000,?000/);
  });

  it('"Max available" is the balance less the planned withdrawals, and says why', () => {
    const withWithdrawal = panel(900000, 'conservative').html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    expect(withWithdrawal).toMatch(/Max available: \$1,?100,?000 \(after your planned withdrawals\)/);
    const none = panel(0, 'conservative').html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    expect(none).toMatch(/Max available: \$2,?000,?000/);
    expect(none).not.toContain('after your planned withdrawals');
  });

  it('names the no-limit cases in words', () => {
    // Tax Bracket Room and IRMAA Room are both unlimited here (top tax bracket, top IRMAA tier)
    const { html } = panel(900000, 'conservative');
    expect(html).toContain('No limit (top bracket)');
    expect(html).toContain('No limit (top IRMAA bracket)');
  });
});
