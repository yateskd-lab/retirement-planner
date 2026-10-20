// @vitest-environment jsdom
// Loading, saving, exporting, importing and resetting the planner's data. The browser
// pieces (window.storage, file download, FileReader, confirm/alert) are replaced or
// recorded so the tests see exactly what the code does with them.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  loadSavedData, saveData, exportData, importData, resetToDefaults,
} from './persistence';
import {
  createDefaultPersonalInfo, createDefaultAccounts, createDefaultStocks,
  createDefaultSocialSecurity, createDefaultScenario,
} from './defaults';

const KEY = 'retirement-planner-data';

// ---- setters that remember what they were given ----
const makeSetters = () => ({
  setPersonalInfo: vi.fn(), setAccounts: vi.fn(), setStocks: vi.fn(), setCrypto: vi.fn(), setMetals: vi.fn(),
  setSocialSecurity: vi.fn(), setApiKey: vi.fn(), setScenarios: vi.fn(), setActiveScenarioId: vi.fn(),
  setScenarioCounter: vi.fn(), setSaveStatus: vi.fn(), setIsLoading: vi.fn(),
});
const last = (fn) => fn.mock.calls[fn.mock.calls.length - 1][0];

const sample = () => ({
  personalInfo: { ...createDefaultPersonalInfo(), age: 71, filingStatus: 'married' },
  accounts: { ...createDefaultAccounts(), savings: 12345 },
  stocks: [{ name: 'AAPL', shares: 10, costBasis: 50, currentPrice: 90, useLotTracking: false, lots: [], skipPriceUpdate: false, excludeFromTotals: false }],
  crypto: [{ name: 'BTC', units: 1, costBasis: 100, currentPrice: 200, useLotTracking: false, lots: [], skipPriceUpdate: false, excludeFromTotals: false }],
  metals: [],
  socialSecurity: { ...createDefaultSocialSecurity(), enabled: true, monthlyBenefit: 2500 },
  apiKey: 'KEY123',
  scenarios: [{ ...createDefaultScenario(4, 'Plan A'), rothConversion: 5000 }],
  activeScenarioId: 4,
  scenarioCounter: 6,
});

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  window.storage = { get: vi.fn(), set: vi.fn(async () => {}), remove: vi.fn() };
  vi.stubGlobal('alert', vi.fn());
});
afterEach(() => {
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); delete window.storage;
});

// ============================ loading on startup ============================
describe('loadSavedData', () => {
  const load = async (saved, setters = makeSetters()) => {
    window.storage.get.mockResolvedValue(saved === undefined ? null : { value: JSON.stringify(saved) });
    await loadSavedData(setters);
    return setters;
  };

  it('stops the loading screen even when nothing was saved', async () => {
    const s = await load(undefined);
    expect(s.setIsLoading).toHaveBeenCalledWith(false);
    expect(s.setPersonalInfo).not.toHaveBeenCalled();
    expect(s.setScenarios).not.toHaveBeenCalled();
  });

  it('stops the loading screen when storage does not exist, or the saved text is broken', async () => {
    delete window.storage;
    let s = makeSetters(); await loadSavedData(s);
    expect(s.setIsLoading).toHaveBeenCalledWith(false);
    window.storage = { get: vi.fn(async () => ({ value: '{not json' })) };
    s = makeSetters(); await loadSavedData(s);
    expect(s.setIsLoading).toHaveBeenCalledWith(false);
    expect(s.setStocks).not.toHaveBeenCalled();
  });

  it('asks storage for the planner key', async () => {
    await load(sample());
    expect(window.storage.get).toHaveBeenCalledWith(KEY);
  });

  it('restores every section', async () => {
    const d = sample();
    const s = await load(d);
    expect(s.setAccounts).toHaveBeenCalledWith({ ...d.accounts, brokerage: d.accounts.brokerage ?? 500000 });
    expect(s.setStocks).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ name: 'AAPL', shares: 10 })]));
    expect(s.setCrypto).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ name: 'BTC' })]));
    expect(s.setMetals).toHaveBeenCalledWith([]);
    expect(s.setSocialSecurity).toHaveBeenCalledWith(expect.objectContaining({ enabled: true, monthlyBenefit: 2500 }));
    expect(s.setApiKey).toHaveBeenCalledWith('KEY123');
    expect(s.setActiveScenarioId).toHaveBeenCalledWith(4);
  });

  it('merges saved personal info over what is already there', async () => {
    const s = await load({ personalInfo: { age: 80 } });
    const update = last(s.setPersonalInfo);
    expect(update({ age: 65, filingStatus: 'single' })).toEqual({ age: 80, filingStatus: 'single' });
  });

  it('adds a brokerage balance to old accounts, and keeps one that is saved, even zero', async () => {
    let s = await load({ accounts: { savings: 1 } });
    expect(last(s.setAccounts)).toEqual({ savings: 1, brokerage: 500000 });
    s = await load({ accounts: { savings: 1, brokerage: 0 } });
    expect(last(s.setAccounts).brokerage).toBe(0);
  });

  it('brings old assets up to date', async () => {
    const s = await load({ stocks: [{ name: 'OLD', skipPriceUpdate: true }] });
    expect(last(s.setStocks)[0]).toMatchObject({ useLotTracking: false, lots: [], excludeFromTotals: true });
  });

  it('brings old crypto and metals up to date too', async () => {
    const s = await load({ crypto: [{ name: 'BTC', skipPriceUpdate: true }], metals: [{ name: 'Gold' }] });
    expect(last(s.setCrypto)[0]).toMatchObject({ useLotTracking: false, lots: [], excludeFromTotals: true });
    expect(last(s.setMetals)[0]).toMatchObject({ useLotTracking: false, lots: [], excludeFromTotals: false });
  });

  it('fills in Social Security fields added since the file was saved', async () => {
    const s = await load({ socialSecurity: { monthlyBenefit: 999 } });
    expect(last(s.setSocialSecurity)).toEqual({ ...createDefaultSocialSecurity(), monthlyBenefit: 999 });
  });

  it('only sets the API key if there is one', async () => {
    expect((await load({ apiKey: '' })).setApiKey).not.toHaveBeenCalled();
    expect((await load({ apiKey: 'K' })).setApiKey).toHaveBeenCalledWith('K');
  });

  describe('scenarios', () => {
    it('migrates each saved scenario and picks the saved active one', async () => {
      const s = await load({ scenarios: [{ id: 2, name: 'A' }, { id: 5, name: 'B' }], activeScenarioId: 5, scenarioCounter: 9 });
      const saved = last(s.setScenarios);
      expect(saved.map((x) => x.id)).toEqual([2, 5]);
      expect(saved[0].withdrawals.savings).toBe(0);
      expect(s.setActiveScenarioId).toHaveBeenCalledWith(5);
      expect(s.setScenarioCounter).toHaveBeenCalledWith(9);
    });

    it('falls back to the first scenario when no active id was saved', async () => {
      const s = await load({ scenarios: [{ id: 3 }, { id: 8 }] });
      expect(s.setActiveScenarioId).toHaveBeenCalledWith(3);
    });

    it('never lets the counter fall below the highest scenario id', async () => {
      expect((await load({ scenarios: [{ id: 3 }, { id: 8 }], scenarioCounter: 2 })).setScenarioCounter).toHaveBeenCalledWith(8);
      expect((await load({ scenarios: [{ id: 3 }], scenarioCounter: 'junk' })).setScenarioCounter).toHaveBeenCalledWith(3);
    });

    it('treats scenarios that are not a list as empty', async () => {
      const s = await load({ scenarios: 'oops', activeScenarioId: 2 });
      expect(last(s.setScenarios)).toEqual([]);
    });

    it('converts the old single-scenario format', async () => {
      const s = await load({ withdrawals: { traditionalIRA: 30000 }, stockWithdrawals: [{ stockName: 'A', sharesToSell: 1 }] });
      const [only] = last(s.setScenarios);
      expect(only.withdrawals.traditionalIRA).toBe(30000);
      expect(only.withdrawals.savings).toBe(0);
      expect(only.stockWithdrawals).toHaveLength(1);
      expect(s.setActiveScenarioId).toHaveBeenCalledWith(1);
      expect(s.setScenarioCounter).toHaveBeenCalledWith(1);
    });
  });
});

// ============================ saving ============================
describe('saveData', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout'] }));

  it('writes everything to storage under the planner key, with a timestamp', async () => {
    const state = sample(); const setSaveStatus = vi.fn();
    await saveData({ ...state, setSaveStatus });
    const [key, json] = window.storage.set.mock.calls[0];
    expect(key).toBe(KEY);
    const written = JSON.parse(json);
    expect(written).toMatchObject(JSON.parse(JSON.stringify(state)));
    expect(new Date(written.savedAt).toString()).not.toBe('Invalid Date');
  });

  it('says it saved, then clears the message after three seconds', async () => {
    const setSaveStatus = vi.fn();
    await saveData({ ...sample(), setSaveStatus });
    expect(setSaveStatus).toHaveBeenLastCalledWith('Saved successfully!');
    vi.advanceTimersByTime(3000);
    expect(setSaveStatus).toHaveBeenLastCalledWith('');
  });

  it('reports an error instead of throwing when storage fails or is missing', async () => {
    const setSaveStatus = vi.fn();
    window.storage.set.mockRejectedValue(new Error('full'));
    await expect(saveData({ ...sample(), setSaveStatus })).resolves.toBeUndefined();
    expect(setSaveStatus).toHaveBeenLastCalledWith('Error saving data');
    delete window.storage;
    const again = vi.fn();
    await saveData({ ...sample(), setSaveStatus: again });
    expect(again).toHaveBeenLastCalledWith('Error saving data');
  });
});

// ============================ exporting ============================
const readBlob = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsText(blob);
});

describe('exportData', () => {
  let blobs, clicks;
  beforeEach(() => {
    blobs = []; clicks = [];
    URL.createObjectURL = vi.fn((b) => { blobs.push(b); return 'blob:fake'; });
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
      clicks.push({ href: this.href, download: this.download, attached: document.body.contains(this) });
    });
  });

  it('downloads a JSON file named with today\'s date', () => {
    exportData(sample());
    expect(clicks).toHaveLength(1);
    expect(clicks[0].download).toBe(`retirement-plan-${new Date().toISOString().split('T')[0]}.json`);
    expect(blobs[0].type).toBe('application/json');
  });

  it('clicks a link that is attached to the page, then removes it and frees the file', () => {
    exportData(sample());
    expect(clicks[0].attached).toBe(true);
    expect(document.querySelectorAll('a[download]')).toHaveLength(0);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake');
  });

  it('writes all the data, readable, with an export time', async () => {
    const state = sample();
    exportData(state);
    const text = await readBlob(blobs[0]);
    expect(text).toContain('\n  "personalInfo"');                 // indented for people to read
    const written = JSON.parse(text);
    expect(written).toMatchObject(JSON.parse(JSON.stringify(state)));
    expect(new Date(written.exportedAt).toString()).not.toBe('Invalid Date');
    expect(written).not.toHaveProperty('savedAt');
  });
});

// ============================ importing ============================
const fileEvent = (content) => ({
  target: { files: [new File([typeof content === 'string' ? content : JSON.stringify(content)], 'plan.json')] },
});
const runImport = async (content, setters = makeSetters()) => {
  importData(fileEvent(content), setters);
  await vi.waitFor(() => expect(setters.setSaveStatus).toHaveBeenCalled());
  return setters;
};

describe('importData', () => {
  it('does nothing when no file was chosen', () => {
    const s = makeSetters();
    importData({ target: { files: [] } }, s);
    expect(s.setSaveStatus).not.toHaveBeenCalled();
    expect(alert).not.toHaveBeenCalled();
  });

  it('merges imported sections over the defaults, so a field added later is never undefined', async () => {
    const s = await runImport({ personalInfo: { age: 77 }, accounts: { savings: 5 }, socialSecurity: { monthlyBenefit: 1 } });
    expect(last(s.setPersonalInfo)).toEqual({ ...createDefaultPersonalInfo(), age: 77 });
    expect(last(s.setAccounts)).toEqual({ ...createDefaultAccounts(), savings: 5 });
    expect(last(s.setSocialSecurity)).toEqual({ ...createDefaultSocialSecurity(), monthlyBenefit: 1 });
  });

  it('brings imported assets up to date', async () => {
    const s = await runImport({ stocks: [{ name: 'A', skipPriceUpdate: true }], crypto: [{ name: 'B' }], metals: [{ name: 'C' }] });
    expect(last(s.setStocks)[0]).toMatchObject({ excludeFromTotals: true, lots: [] });
    expect(last(s.setCrypto)[0]).toMatchObject({ name: 'B', useLotTracking: false });
    expect(last(s.setMetals)[0]).toMatchObject({ name: 'C', lots: [] });
  });

  it('leaves crypto and metals alone when absent, and empties them when they are not a list', async () => {
    let s = await runImport({ personalInfo: {} });
    expect(s.setCrypto).not.toHaveBeenCalled();
    expect(s.setMetals).not.toHaveBeenCalled();
    s = await runImport({ crypto: null, metals: 'x' });
    expect(last(s.setCrypto)).toEqual([]);
    expect(last(s.setMetals)).toEqual([]);
  });

  it('sets the API key when the file has one, even an empty one', async () => {
    expect(last((await runImport({ apiKey: '' })).setApiKey)).toBe('');
    expect((await runImport({ personalInfo: {} })).setApiKey).not.toHaveBeenCalled();
  });

  it('imports scenarios, the active one, and a counter that cannot be too low', async () => {
    const s = await runImport({ scenarios: [{ id: 2 }, { id: 6, name: 'B' }], activeScenarioId: 6, scenarioCounter: 3 });
    expect(last(s.setScenarios).map((x) => x.id)).toEqual([2, 6]);
    expect(last(s.setActiveScenarioId)).toBe(6);
    expect(last(s.setScenarioCounter)).toBe(6);
  });

  it('falls back to the first scenario when the file has no active id', async () => {
    const s = await runImport({ scenarios: [{ id: 4 }, { id: 9 }] });
    expect(last(s.setActiveScenarioId)).toBe(4);
  });

  it('converts the old single-scenario format', async () => {
    const s = await runImport({ withdrawals: { savings: 9 } });
    expect(last(s.setScenarios)[0].withdrawals.savings).toBe(9);
    expect(last(s.setActiveScenarioId)).toBe(1);
    expect(last(s.setScenarioCounter)).toBe(1);
  });

  it('leaves scenarios alone when the file has neither format', async () => {
    const s = await runImport({ personalInfo: { age: 70 } });
    expect(s.setScenarios).not.toHaveBeenCalled();
    expect(s.setActiveScenarioId).not.toHaveBeenCalled();
  });

  it('confirms success, then clears the message after three seconds', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    const s = await runImport(sample());
    expect(alert).toHaveBeenCalledWith('Data imported successfully!');
    expect(s.setSaveStatus).toHaveBeenLastCalledWith('Data imported successfully!');
    vi.advanceTimersByTime(3000);
    expect(s.setSaveStatus).toHaveBeenLastCalledWith('');
  });

  it('reports a file that is not valid JSON and changes nothing', async () => {
    const s = await runImport('this is not json');
    expect(alert).toHaveBeenCalledWith(expect.stringContaining('Error importing data'));
    expect(s.setSaveStatus).toHaveBeenLastCalledWith('Error importing data');
    expect(s.setPersonalInfo).not.toHaveBeenCalled();
    expect(s.setStocks).not.toHaveBeenCalled();
  });

  it('names the section that failed, and keeps what was already applied before it', async () => {
    const s = await runImport({ personalInfo: { age: 70 }, stocks: 5 });   // stocks must be a list
    expect(alert).toHaveBeenCalledWith(expect.stringContaining('Failed to set stocks'));
    expect(s.setSaveStatus).toHaveBeenLastCalledWith('Error importing data');
    expect(s.setPersonalInfo).toHaveBeenCalled();     // applied before the bad section
    expect(s.setCrypto).not.toHaveBeenCalled();       // never reached
  });
});

// ============================ round trip ============================
describe('export then import', () => {
  it('restores exactly the data that was exported', async () => {
    const blobs = [];
    URL.createObjectURL = vi.fn((b) => { blobs.push(b); return 'blob:x'; });
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    const original = sample();
    exportData(original);
    const json = await readBlob(blobs[0]);

    const restored = {};
    const store = (name) => vi.fn((v) => { restored[name] = v; });
    const setters = {
      setPersonalInfo: store('personalInfo'), setAccounts: store('accounts'), setStocks: store('stocks'),
      setCrypto: store('crypto'), setMetals: store('metals'), setSocialSecurity: store('socialSecurity'),
      setApiKey: store('apiKey'), setScenarios: store('scenarios'), setActiveScenarioId: store('activeScenarioId'),
      setScenarioCounter: store('scenarioCounter'), setSaveStatus: vi.fn(),
    };
    await runImport(json, setters);

    expect(restored.personalInfo).toEqual(original.personalInfo);
    expect(restored.accounts).toEqual(original.accounts);
    expect(restored.socialSecurity).toEqual(original.socialSecurity);
    expect(restored.apiKey).toBe(original.apiKey);
    expect(restored.activeScenarioId).toBe(original.activeScenarioId);
    expect(restored.scenarioCounter).toBe(original.scenarioCounter);
    expect(restored.stocks).toEqual(original.stocks);
    expect(restored.crypto).toEqual(original.crypto);
    expect(restored.metals).toEqual(original.metals);
    expect(restored.scenarios).toEqual(original.scenarios);
  });
});

// ============================ resetting ============================
describe('resetToDefaults', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout'] }));

  it('asks first, and changes nothing if you say no', () => {
    vi.stubGlobal('confirm', vi.fn(() => false));
    const s = makeSetters();
    resetToDefaults(s);
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('reset all data'));
    Object.values(s).forEach((fn) => expect(fn).not.toHaveBeenCalled());
    expect(window.storage.remove).not.toHaveBeenCalled();
  });

  it('puts everything back to the starting values when you say yes', () => {
    vi.stubGlobal('confirm', vi.fn(() => true));
    const s = makeSetters();
    resetToDefaults(s);
    expect(last(s.setPersonalInfo)).toEqual(createDefaultPersonalInfo());
    expect(last(s.setAccounts)).toEqual(createDefaultAccounts());
    expect(last(s.setStocks)).toEqual(createDefaultStocks());
    expect(last(s.setCrypto)).toEqual([]);
    expect(last(s.setMetals)).toEqual([]);
    expect(last(s.setSocialSecurity)).toEqual(createDefaultSocialSecurity());
    expect(last(s.setApiKey)).toBe('');
    expect(last(s.setScenarios)).toEqual([createDefaultScenario()]);
    expect(last(s.setActiveScenarioId)).toBe(1);
    expect(last(s.setScenarioCounter)).toBe(1);
  });

  it('clears the saved copy and says so, then removes the message after three seconds', () => {
    vi.stubGlobal('confirm', vi.fn(() => true));
    const s = makeSetters();
    resetToDefaults(s);
    expect(window.storage.remove).toHaveBeenCalledWith(KEY);
    expect(s.setSaveStatus).toHaveBeenLastCalledWith('Reset to default values!');
    vi.advanceTimersByTime(3000);
    expect(s.setSaveStatus).toHaveBeenLastCalledWith('');
  });

  it('still resets when there is no storage to clear', () => {
    vi.stubGlobal('confirm', vi.fn(() => true));
    delete window.storage;
    const s = makeSetters();
    expect(() => resetToDefaults(s)).not.toThrow();
    expect(last(s.setStocks)).toEqual(createDefaultStocks());
  });
});
