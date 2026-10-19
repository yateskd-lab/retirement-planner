// @vitest-environment jsdom
// Mounts the whole app and checks that it comes up, shows every section, and that the
// controls in the extracted input sections still reach the handlers in the main file.
// This is the safety net for splitting RetirementTaxPlanner.jsx further.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import App from './RetirementTaxPlanner';

// The PDF libraries are only used when the PDF button is clicked. In a test run their Node
// builds can need packages that are not installed (jsPDF wants 'atob'), so stand them in.
vi.mock('jspdf', () => ({ default: class FakeJsPDF {} }));
vi.mock('html2canvas-pro', () => ({ default: async () => ({}) }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container, root;

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 30)); });

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 16, 12));
  vi.spyOn(console, 'log').mockImplementation(() => {});      // the app logs while loading
  // Recharts warns that its container has no size because the test browser has no layout.
  // The chart is fine in a real browser; hide only that one message.
  for (const method of ['warn', 'error']) {
    const original = console[method].bind(console);
    vi.spyOn(console, method).mockImplementation((...args) => {
      if (String(args[0]).includes('of chart should be greater than 0')) return;
      original(...args);
    });
  }
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(<App />); });
  await settle();
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const headings = () => [...container.querySelectorAll('h2')].map((h) => h.textContent.trim());
const button = (label) => [...container.querySelectorAll('button')].find((b) => b.textContent.includes(label));
const click = (el) => act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
const text = () => container.textContent;

describe('the whole app', () => {
  it('mounts and shows every section', () => {
    const shown = headings();
    [
      'Withdrawal Scenarios', 'Personal Information', 'Account Balances', 'Social Security',
      'Brokerage Account - Individual Stocks', 'Cryptocurrency Holdings', 'Precious Metals Holdings',
      'Plan Your Withdrawals', 'Retirement & Savings Account Withdrawals',
      'Medicare IRMAA Analysis', 'Net Investment Income Tax (NIIT) Analysis', 'Federal Tax Analysis',
      'Utah State Tax Analysis', 'Combined Tax Summary (Federal + State)',
      'How Long-Term Gains Stack on Top of Ordinary Income',
    ].forEach((expected) => expect(shown.some((h) => h.includes(expected)), expected).toBe(true));
  });

  it('never shows NaN, undefined, or an infinite dollar amount', () => {
    // The tax-bracket table labels the open top bracket "$640,600 - ∞" on purpose;
    // what must never appear is an infinite amount of money.
    ['NaN', 'undefined', 'Infinity', '$∞'].forEach((bad) => expect(text()).not.toContain(bad));
  });

  it('calculates results from the default scenario', () => {
    expect(text()).toMatch(/Federal Tax Analysis/);
    expect(container.querySelectorAll('.pdf-section').length).toBeGreaterThan(5);
  });
});

describe('controls in the extracted sections', () => {
  it('Add Scenario adds a scenario', async () => {
    expect(text()).toContain('Add Scenario (1/');
    await click(button('Add Scenario'));
    expect(text()).toContain('Add Scenario (2/');
  });

  it('Add Stock, Add Crypto and Add Metal each add a row of inputs', async () => {
    const inputs = () => container.querySelectorAll('input').length;
    for (const label of ['Add Stock', 'Add Crypto', 'Add Metal']) {
      const before = inputs();
      await click(button(label));
      expect(inputs(), label).toBeGreaterThan(before);
    }
  });

  it('changing filing status to married shows the Spouse Age field', async () => {
    const labels = () => [...container.querySelectorAll('label')].map((l) => l.textContent.trim());
    expect(labels()).not.toContain('Spouse Age');
    const select = [...container.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.value === 'married'));
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, 'married');
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(labels()).toContain('Spouse Age');
  });
});

describe('stock prices', () => {
  const setInput = (input, value) => act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });

  it('Update Prices looks up a ticker and fills in the price, through the real buttons and state', async () => {
    const asked = [];
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      asked.push(url);
      return { status: 200, json: async () => ({ chart: { result: [{ meta: { regularMarketPrice: 123.456 } }] } }) };
    }));
    // "Stock 1" is not a ticker; rename it to one, as a user would
    const nameInput = [...container.querySelectorAll('input')].find((i) => i.value === 'Stock 1');
    await setInput(nameInput, 'AAPL');

    vi.useRealTimers();
    vi.useFakeTimers();                       // the lookup waits 1.2 s between stocks
    await click(button('Update Prices'));
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });

    expect(asked).toHaveLength(1);            // only the ticker-named stock is looked up
    expect(asked[0]).toContain('/AAPL?');
    expect(text()).toContain('Updated 1 of 1 prices!');
    expect([...container.querySelectorAll('input')].some((i) => i.value === '123.46')).toBe(true);
    vi.unstubAllGlobals();
  });
});
