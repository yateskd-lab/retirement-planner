// Stock price lookup, with fetch replaced by a stand-in so nothing touches the network.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fetchStockPrice, updateAllStockPrices } from './stockPrices';

// ---- fake price services ----
const reply = (data, status = 200) => ({ status, json: async () => data });
const yahoo = (price) => reply({ chart: { result: [{ meta: { regularMarketPrice: price } }] } });
const twelve = (price) => reply({ price: String(price) });
const alpha = (price) => reply({ 'Global Quote': { '05. price': String(price) } });

let calls;
// routes: { 'yahoo': response | Error | (url) => response, ... } matched by URL text
const stubFetch = (routes) => {
  calls = [];
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    calls.push(url);
    const key = Object.keys(routes).find((k) => url.includes(k));
    if (!key) throw new Error(`no stand-in for ${url}`);
    const r = routes[key];
    if (r instanceof Error) throw r;
    return typeof r === 'function' ? r(url) : r;
  }));
};
const quiet = () => ({ addDebugLog: vi.fn() });

beforeEach(() => { vi.spyOn(console, 'log').mockImplementation(() => {}); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('fetchStockPrice', () => {
  it('uses Yahoo first and stops there', async () => {
    stubFetch({ yahoo: yahoo(123.45) });
    expect(await fetchStockPrice('AAPL', { apiKey: '', ...quiet() })).toBe(123.45);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('/AAPL?');
  });

  it('turns a text price into a number', async () => {
    stubFetch({ yahoo: yahoo('99.5') });
    expect(await fetchStockPrice('X', { apiKey: '', ...quiet() })).toBe(99.5);
  });

  it('falls back to Twelve Data when Yahoo has no price', async () => {
    stubFetch({ yahoo: reply({ chart: { result: null } }), twelvedata: twelve(50.25) });
    expect(await fetchStockPrice('MSFT', { apiKey: '', ...quiet() })).toBe(50.25);
    expect(calls).toHaveLength(2);
  });

  it('falls back when Yahoo throws, and logs why', async () => {
    stubFetch({ yahoo: new Error('network down'), twelvedata: twelve(10) });
    const log = quiet();
    expect(await fetchStockPrice('T', { apiKey: '', ...log })).toBe(10);
    expect(log.addDebugLog).toHaveBeenCalledWith(expect.stringContaining('Yahoo Finance failed for T: network down'));
  });

  it('only tries Alpha Vantage when there is an API key', async () => {
    stubFetch({ yahoo: reply({}), twelvedata: reply({}), alphavantage: alpha(77.7) });
    expect(await fetchStockPrice('F', { apiKey: '', ...quiet() })).toBeNull();
    expect(calls.some((u) => u.includes('alphavantage'))).toBe(false);

    expect(await fetchStockPrice('F', { apiKey: 'MYKEY', ...quiet() })).toBe(77.7);
    const av = calls.find((u) => u.includes('alphavantage'));
    expect(av).toContain('symbol=F');
    expect(av).toContain('apikey=MYKEY');
  });

  it('returns null, and says so, when every service fails', async () => {
    stubFetch({ yahoo: new Error('a'), twelvedata: new Error('b'), alphavantage: new Error('c') });
    const log = quiet();
    expect(await fetchStockPrice('ZZZ', { apiKey: 'K', ...log })).toBeNull();
    expect(log.addDebugLog).toHaveBeenCalledWith(expect.stringContaining('All methods failed for ZZZ'));
  });
});

// ---- a tiny stand-in for the component's state ----
const harness = (stocks, { apiKey = '' } = {}) => {
  const h = { stocks: stocks.map((s) => ({ ...s })), status: [], loading: [], debug: [], logCleared: 0 };
  h.stocksRef = { current: h.stocks };
  h.setStocks = (updater) => {
    h.stocks = typeof updater === 'function' ? updater(h.stocks) : updater;
    h.stocksRef.current = h.stocks;
  };
  h.edit = (fn) => h.setStocks((prev) => fn(prev.map((s) => ({ ...s }))));   // a user edit mid-run
  h.run = async () => {
    const done = updateAllStockPrices({
      stocksRef: h.stocksRef, setStocks: h.setStocks, apiKey,
      setSaveStatus: (v) => h.status.push(v),
      setLoadingPrices: (v) => h.loading.push(v),
      setDebugLog: () => { h.logCleared += 1; },
      addDebugLog: (m) => h.debug.push(m),
    });
    await vi.runAllTimersAsync();
    await done;
  };
  return h;
};
const stock = (name, extra = {}) => ({ name, currentPrice: 1, skipPriceUpdate: false, ...extra });
const priceOf = (h, name) => h.stocks.find((s) => s.name === name)?.currentPrice;
const tickerIn = (url) => url.match(/\/chart\/([A-Z]+)\?/)?.[1];

describe('updating all prices', () => {
  beforeEach(() => vi.useFakeTimers());

  it('updates every stock whose name is a ticker, rounded to cents', async () => {
    stubFetch({ yahoo: (u) => yahoo({ AAPL: 190.126, MSFT: 410 }[tickerIn(u)]) });
    const h = harness([stock('AAPL'), stock('MSFT')]);
    await h.run();
    expect(priceOf(h, 'AAPL')).toBe(190.13);
    expect(priceOf(h, 'MSFT')).toBe(410);
  });

  it('matches lower case and padded names, and applies the price to that same row', async () => {
    stubFetch({ yahoo: yahoo(55) });
    const h = harness([stock(' aapl ')]);
    await h.run();
    expect(calls[0]).toContain('/AAPL?');
    expect(h.stocks[0].currentPrice).toBe(55);
  });

  it('leaves names that are not tickers alone and never fetches them', async () => {
    stubFetch({ yahoo: yahoo(10) });
    const h = harness([stock('Berkshire Hathaway'), stock('BRK.B'), stock('my fund'), stock('TOOLONG'), stock('AAPL')]);
    await h.run();
    expect(calls).toHaveLength(1);
    expect(['Berkshire Hathaway', 'BRK.B', 'my fund', 'TOOLONG'].map((n) => priceOf(h, n))).toEqual([1, 1, 1, 1]);
    expect(priceOf(h, 'AAPL')).toBe(10);
  });

  it('does not update a stock marked to skip', async () => {
    stubFetch({ yahoo: yahoo(10) });
    const h = harness([stock('AAPL', { skipPriceUpdate: true }), stock('MSFT')]);
    await h.run();
    expect(priceOf(h, 'AAPL')).toBe(1);
    expect(priceOf(h, 'MSFT')).toBe(10);
    expect(calls).toHaveLength(1);
  });

  it('reads the skip box live: ticking it during the run is respected', async () => {
    const h = harness([stock('AAA'), stock('BBB')]);
    stubFetch({ yahoo: (u) => {
      if (tickerIn(u) === 'AAA') h.edit((rows) => { rows[1].skipPriceUpdate = true; return rows; });
      return yahoo(20);
    } });
    await h.run();
    expect(priceOf(h, 'AAA')).toBe(20);
    expect(priceOf(h, 'BBB')).toBe(1);
    expect(calls.some((u) => tickerIn(u) === 'BBB')).toBe(false);
  });

  it('keeps edits made while it runs instead of overwriting them with an old copy', async () => {
    const h = harness([stock('AAA', { shares: 10 }), stock('BBB', { shares: 10 })]);
    stubFetch({ yahoo: (u) => {
      if (tickerIn(u) === 'AAA') h.edit((rows) => { rows[1].shares = 999; rows[1].note = 'edited'; return rows; });
      return yahoo(20);
    } });
    await h.run();
    const bbb = h.stocks.find((s) => s.name === 'BBB');
    expect(bbb.shares).toBe(999);
    expect(bbb.note).toBe('edited');
    expect(bbb.currentPrice).toBe(20);
  });

  it('never puts a price on the wrong holding if the list is reordered mid-run', async () => {
    const own = { AAA: 20, BBB: 30 };
    const h = harness([stock('AAA'), stock('BBB')]);
    stubFetch({ yahoo: (u) => {
      if (tickerIn(u) === 'AAA') h.edit((rows) => rows.reverse());   // BBB is now first, AAA second
      return yahoo(own[tickerIn(u)]);
    } });
    await h.run();
    expect(h.stocks.map((s) => s.name)).toEqual(['BBB', 'AAA']);
    // a row may keep its old price (the update was dropped) but must never show another stock's price
    h.stocks.forEach((s) => expect([1, own[s.name]]).toContain(s.currentPrice));
  });

  it('does not apply a price to a row renamed mid-run', async () => {
    const h = harness([stock('AAA')]);
    stubFetch({ yahoo: () => { h.edit((rows) => { rows[0].name = 'RENAMED'; return rows; }); return yahoo(20); } });
    await h.run();
    expect(h.stocks[0].currentPrice).toBe(1);
  });
});

describe('progress and messages', () => {
  beforeEach(() => vi.useFakeTimers());

  it('reports how many succeeded out of those it actually tried', async () => {
    stubFetch({ yahoo: yahoo(5) });
    // one skipped and one not-a-ticker are never candidates
    const h = harness([stock('AAA'), stock('BBB'), stock('CCC', { skipPriceUpdate: true }), stock('not a ticker')]);
    await h.run();
    expect(h.status[0]).toBe('Fetching current prices...');
    expect(h.status).toContain('Updated 2 of 2 prices!');
  });

  it('reports a partial result and lists the failures', async () => {
    stubFetch({ yahoo: (u) => (tickerIn(u) === 'GOOD' ? yahoo(5) : reply({})), twelvedata: reply({}) });
    const h = harness([stock('GOOD'), stock('BAD')]);
    await h.run();
    expect(h.status).toContain('Updated 1 of 2 prices!');
    expect(h.debug).toContain('Failed tickers: BAD');
    expect(priceOf(h, 'BAD')).toBe(1);
  });

  it('says it failed when nothing could be fetched', async () => {
    stubFetch({ yahoo: reply({}), twelvedata: reply({}) });
    const h = harness([stock('AAA')]);
    await h.run();
    expect(h.status).toContain('Failed to fetch prices. Check debug log below.');
  });

  it.each([['zero', 0], ['negative', -5]])('treats a %s price as a failure', async (_label, bad) => {
    // Twelve Data hands back any non-empty text, so a bad number can reach the update loop
    stubFetch({ yahoo: reply({}), twelvedata: twelve(bad) });
    const h = harness([stock('AAA')]);
    await h.run();
    expect(priceOf(h, 'AAA')).toBe(1);
    expect(h.status).toContain('Failed to fetch prices. Check debug log below.');
    expect(h.debug).toContain('Failed tickers: AAA');
  });

  it('shows the busy flag while running and clears the old log first', async () => {
    stubFetch({ yahoo: yahoo(5) });
    const h = harness([stock('AAA')]);
    await h.run();
    expect(h.loading).toEqual([true, false]);
    expect(h.logCleared).toBe(1);
    expect(h.debug.some((m) => m.startsWith('=== COMPLETE: 1 succeeded, 0 failed'))).toBe(true);
  });

  it('clears the status message after five seconds', async () => {
    stubFetch({ yahoo: yahoo(5) });
    const h = harness([stock('AAA')]);
    await h.run();
    expect(h.status[h.status.length - 1]).toBe('');
  });
});

describe('pacing', () => {
  it('waits 1.2 seconds between lookups to stay under rate limits', async () => {
    vi.useFakeTimers();
    stubFetch({ yahoo: yahoo(5) });
    const h = harness([stock('AAA'), stock('BBB')]);
    const done = updateAllStockPrices({
      stocksRef: h.stocksRef, setStocks: h.setStocks, apiKey: '', setSaveStatus: () => {},
      setLoadingPrices: () => {}, setDebugLog: () => {}, addDebugLog: () => {},
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1100);
    expect(calls).toHaveLength(1);          // still waiting
    await vi.advanceTimersByTimeAsync(100);
    expect(calls).toHaveLength(2);          // 1.2 s have passed
    await vi.runAllTimersAsync();
    await done;
  });
});
