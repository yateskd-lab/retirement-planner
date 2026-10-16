// Default state, defined once and used by BOTH the initial useState values and
// resetToDefaults. These used to be two hand-maintained copies, and they drifted:
// Reset omitted accounts.brokerage, the stocks' lot-tracking fields, and the
// scenario's brokerage withdrawal + rothConversion, so clicking Reset produced
// state the UI could not render. Factories (not shared constants) so every caller
// gets its own object and nothing aliases into state.
// Quantity actually held: rolled up from lots when lot tracking is on, otherwise the
// plain field (stocks use `shares`, crypto and metals use `units`).
export const assetQuantityOwned = (asset) => {
  if (!asset) return 0;
  const lots = Array.isArray(asset.lots) ? asset.lots : [];
  if (asset.useLotTracking && lots.length > 0) {
    return lots.reduce((sum, lot) => sum + (lot.quantity || 0), 0);
  }
  return asset.shares ?? asset.units ?? 0;
};

// Auto-generated asset names are used as the KEY that links a holding to its planned
// sale (stockWithdrawals/cryptoSales/metalSales are matched by name), so a duplicate
// makes two rows share one sale entry and both cards move together. `${list.length + 1}`
// collides as soon as anything has been removed: [Stock 1, Stock 2] -> remove Stock 1
// -> [Stock 2] -> the next add is "Stock 2" again. Skip past any name already taken.
export const nextAssetName = (prefix, list) => {
  const taken = new Set((Array.isArray(list) ? list : []).map(a => a?.name));
  let n = (Array.isArray(list) ? list.length : 0) + 1;
  while (taken.has(`${prefix} ${n}`)) n++;
  return `${prefix} ${n}`;
};

export const createDefaultPersonalInfo = () => ({
  age: 65,
  spouseAge: 65,
  filingStatus: 'single',
  // Only meaningful for marriedFilingSeparately: living apart from your spouse the
  // whole year switches Social Security and IRMAA to the single thresholds.
  livedApartFromSpouse: false,
  // Qualifying dependents, for the Utah taxpayer tax credit's personal exemption.
  dependents: 0,
  workMonths: 3,
  monthlyWorkIncome: 5000,
  monthlyPension: 3000,
  pensionStartMonth: 4,
  interestIncome: 0,
  qualifiedDividends: 0,
  ordinaryDividends: 0
});

export const createDefaultAccounts = () => ({
  savings: 50000,
  brokerage: 500000,
  traditionalIRA: 300000,
  rothIRA: 100000,
  traditional401k: 400000,
  roth401k: 50000
});

export const createDefaultStocks = () => ([
  {
    name: 'Stock 1',
    shares: 100,
    costBasis: 50,
    currentPrice: 75,
    useLotTracking: false,
    lots: [],
    skipPriceUpdate: false,
    excludeFromTotals: false
  },
  {
    name: 'Stock 2',
    shares: 50,
    costBasis: 100,
    currentPrice: 120,
    useLotTracking: false,
    lots: [],
    skipPriceUpdate: false,
    excludeFromTotals: false
  },
]);

export const createDefaultSocialSecurity = () => ({
  enabled: false,
  monthlyBenefit: 0,
  spouseMonthlyBenefit: 0
});

// New scenario ids are minted from scenarioCounter, so the counter must never sit
// below the highest id already in use. If it does, addScenario hands out a duplicate
// id -- and then getActiveScenario's find() returns only the first match while
// updateActiveScenario's map() writes to BOTH scenarios at once, and the <option>
// list renders duplicate React keys.
export const highestScenarioId = (list) =>
  (Array.isArray(list) ? list : []).reduce((max, s) => Math.max(max, Number(s?.id) || 0), 0);

export const createDefaultScenario = (id = 1, name = 'Scenario 1') => ({
  id,
  name,
  withdrawals: {
    savings: 0,
    brokerage: 0,
    traditionalIRA: 0,
    rothIRA: 0,
    traditional401k: 0,
    roth401k: 0
  },
  rothConversion: 0,
  stockWithdrawals: [],
  cryptoSales: [],
  metalSales: []
});

