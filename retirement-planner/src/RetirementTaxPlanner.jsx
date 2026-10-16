import React, { useState, useEffect, useRef } from 'react';
import { Calculator, DollarSign, TrendingDown, AlertCircle, Save, Download, Upload, RotateCcw, Users, FileText, Eye, EyeOff } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell, ResponsiveContainer, ReferenceLine, ReferenceArea, Label } from 'recharts';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import taxRulesFile from './tax-rules.json';

// ===== TAX RULES =====
// Every year-specific number (brackets, deductions, thresholds, IRMAA tiers, the
// Utah rate) lives in tax-rules.json, so a new tax year is a data edit, not a code
// change. The file is checked on load: a hand-edited typo that left a gap between
// brackets or a missing field would otherwise produce plausible-looking but wrong
// tax figures, so it fails loudly and names the offending field instead.

const requireNumber = (value, path) => {
  if (typeof value !== 'number' || !isFinite(value)) {
    throw new Error(`tax-rules.json: ${path} must be a number (got ${JSON.stringify(value)})`);
  }
};

// Brackets must start at 0, be contiguous, and end in exactly one open-ended
// (null) bracket. JSON has no Infinity, so null stands in for it.
const validateBrackets = (list, path, minKey, maxKey, valueKeys) => {
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error(`tax-rules.json: ${path} must be a non-empty list`);
  }
  list.forEach((bracket, i) => {
    const at = `${path}[${i}]`;
    requireNumber(bracket[minKey], `${at}.${minKey}`);
    valueKeys.forEach(key => requireNumber(bracket[key], `${at}.${key}`));
    if (i === 0 && bracket[minKey] !== 0) {
      throw new Error(`tax-rules.json: ${at}.${minKey} must be 0`);
    }
    if (i > 0 && bracket[minKey] !== list[i - 1][maxKey]) {
      throw new Error(`tax-rules.json: ${at}.${minKey} is ${bracket[minKey]} but the previous bracket's ${maxKey} is ${list[i - 1][maxKey]}`);
    }
    const isLast = i === list.length - 1;
    if (isLast && bracket[maxKey] !== null) {
      throw new Error(`tax-rules.json: ${at}.${maxKey} must be null (the top bracket has no upper limit)`);
    }
    if (!isLast) requireNumber(bracket[maxKey], `${at}.${maxKey}`);
  });
};

// Keys starting with "_" are notes for whoever edits the file, not filing statuses.
const bracketLists = (table) => Object.entries(table).filter(([key]) => !key.startsWith('_'));

const validateBracketTable = (table, path, minKey, maxKey, valueKeys) => {
  ['single', 'married'].forEach(status => {
    if (!table?.[status]) throw new Error(`tax-rules.json: ${path}.${status} is missing`);
  });
  bracketLists(table).forEach(([status, list]) =>
    validateBrackets(list, `${path}.${status}`, minKey, maxKey, valueKeys));
};

const withInfiniteTop = (table, maxKey) => Object.fromEntries(
  bracketLists(table).map(([status, list]) => [
    status,
    list.map(bracket => ({ ...bracket, [maxKey]: bracket[maxKey] === null ? Infinity : bracket[maxKey] }))
  ])
);

const loadTaxRules = (file) => {
  const year = file.activeYear;
  const rules = file.years?.[year];
  if (!rules) throw new Error(`tax-rules.json: activeYear ${year} has no entry under "years"`);
  const p = `years.${year}`;
  const { federal, utah } = rules;

  validateBracketTable(federal?.ordinaryBrackets, `${p}.federal.ordinaryBrackets`, 'min', 'max', ['rate']);
  validateBracketTable(federal?.capitalGainsBrackets, `${p}.federal.capitalGainsBrackets`, 'min', 'max', ['rate']);
  ['single', 'married'].forEach(status => {
    requireNumber(federal.standardDeduction?.[status], `${p}.federal.standardDeduction.${status}`);
    requireNumber(federal.capitalLossDeductionLimit?.[status], `${p}.federal.capitalLossDeductionLimit.${status}`);
    requireNumber(federal.socialSecurityTaxabilityThresholds?.[status]?.base, `${p}.federal.socialSecurityTaxabilityThresholds.${status}.base`);
    requireNumber(federal.socialSecurityTaxabilityThresholds?.[status]?.adjusted, `${p}.federal.socialSecurityTaxabilityThresholds.${status}.adjusted`);
    requireNumber(federal.niit?.thresholds?.[status], `${p}.federal.niit.thresholds.${status}`);
  });
  requireNumber(federal.niit.rate, `${p}.federal.niit.rate`);
  const aged = federal.agedAdditionalStandardDeduction;
  requireNumber(aged?.age, `${p}.federal.agedAdditionalStandardDeduction.age`);
  ['single', 'married'].forEach(status =>
    requireNumber(aged.perPerson?.[status], `${p}.federal.agedAdditionalStandardDeduction.perPerson.${status}`));
  // The senior deduction is temporary (2025-2028), so a year may set it to null.
  const senior = federal.seniorDeduction;
  if (senior !== null) {
    const at = `${p}.federal.seniorDeduction`;
    requireNumber(senior?.age, `${at}.age`);
    requireNumber(senior.perPerson, `${at}.perPerson`);
    requireNumber(senior.phaseOutRate, `${at}.phaseOutRate`);
    ['single', 'married'].forEach(status =>
      requireNumber(senior.phaseOutMagiThreshold?.[status], `${at}.phaseOutMagiThreshold.${status}`));
    if (!Array.isArray(senior.ineligibleFilingStatuses)) {
      throw new Error(`tax-rules.json: ${at}.ineligibleFilingStatuses must be a list (use [] for none)`);
    }
  }
  requireNumber(federal.rmdStartAge?.default, `${p}.federal.rmdStartAge.default`);
  requireNumber(federal.rmdStartAge?.bornIn1960OrLater, `${p}.federal.rmdStartAge.bornIn1960OrLater`);
  requireNumber(utah?.flatRate, `${p}.utah.flatRate`);
  const utahCredit = utah.taxpayerCredit;
  ['amountsYear', 'creditRate', 'personalExemption', 'phaseOutRate'].forEach(key =>
    requireNumber(utahCredit?.[key], `${p}.utah.taxpayerCredit.${key}`));
  ['single', 'married'].forEach(status =>
    requireNumber(utahCredit.basePhaseOut?.[status], `${p}.utah.taxpayerCredit.basePhaseOut.${status}`));
  const utahRetirement = utah.retirementCredit;
  ['perPerson', 'bornOnOrBefore', 'phaseOutRate'].forEach(key =>
    requireNumber(utahRetirement?.[key], `${p}.utah.retirementCredit.${key}`));
  ['single', 'married'].forEach(status =>
    requireNumber(utahRetirement.phaseOutThreshold?.[status], `${p}.utah.retirementCredit.phaseOutThreshold.${status}`));
  const utahSSCredit = utah.socialSecurityCredit;
  requireNumber(utahSSCredit?.phaseOutRate, `${p}.utah.socialSecurityCredit.phaseOutRate`);
  ['single', 'married'].forEach(status =>
    requireNumber(utahSSCredit.phaseOutThreshold?.[status], `${p}.utah.socialSecurityCredit.phaseOutThreshold.${status}`));

  return {
    year: Number(year),
    federal: {
      ...federal,
      ordinaryBrackets: withInfiniteTop(federal.ordinaryBrackets, 'max'),
      capitalGainsBrackets: withInfiniteTop(federal.capitalGainsBrackets, 'max')
    },
    utah
  };
};

const TAX_RULES = loadTaxRules(taxRulesFile);
const TAX_YEAR = TAX_RULES.year;

// 0.0455 -> "4.55%", 0.038 -> "3.8%"
const formatRate = (rate) => `${+(rate * 100).toFixed(2)}%`;

// ===== MEDICARE PREMIUMS AND IRMAA =====
// Premiums and IRMAA tables are keyed by the year they apply to, not by tax year:
// CMS publishes each year's table the November before, and IRMAA for this year's
// income is set by the table lookbackYears later. Use that table if it has been
// published; otherwise project the newest published table forward only the
// missing years -- so each November's update shortens the projection.

const loadMedicareRules = (medicare) => {
  const p = 'medicare';
  if (!medicare) throw new Error('tax-rules.json: the top-level "medicare" section is missing');
  requireNumber(medicare.eligibilityAge, `${p}.eligibilityAge`);
  requireNumber(medicare.lookbackYears, `${p}.lookbackYears`);

  const projection = medicare.projection;
  ['thresholdInflationRate', 'thresholdRounding', 'topThresholdFixedThrough', 'partBGrowthRate', 'partDGrowthRate']
    .forEach(key => requireNumber(projection?.[key], `${p}.projection.${key}`));
  const statutory = projection.statutoryThresholdsSingle;
  if (!Array.isArray(statutory) || statutory.length === 0) {
    throw new Error(`tax-rules.json: ${p}.projection.statutoryThresholdsSingle must be a non-empty list`);
  }
  statutory.forEach((amount, i) => requireNumber(amount, `${p}.projection.statutoryThresholdsSingle[${i}]`));

  const years = Object.keys(medicare.premiumYears || {}).filter(key => !key.startsWith('_'));
  if (years.length === 0) throw new Error(`tax-rules.json: ${p}.premiumYears needs at least one year`);

  // Single and joint tables have one bracket per statutory threshold, plus the
  // no-surcharge and top brackets; married filing separately always has three.
  const tierCount = statutory.length + 2;
  const premiumYears = {};
  years.forEach(year => {
    const at = `${p}.premiumYears.${year}`;
    const entry = medicare.premiumYears[year];
    requireNumber(entry.partBStandardMonthlyPremium, `${at}.partBStandardMonthlyPremium`);
    requireNumber(entry.partDEstimatedMonthlyPremium, `${at}.partDEstimatedMonthlyPremium`);
    validateBracketTable(entry.irmaaBrackets, `${at}.irmaaBrackets`, 'magi', 'magiMax', ['partB', 'partD']);
    const { single, married, marriedFilingSeparately } = entry.irmaaBrackets;
    if (single.length !== tierCount || married.length !== tierCount) {
      throw new Error(`tax-rules.json: ${at}.irmaaBrackets single and married must each have ${tierCount} brackets`);
    }
    if (marriedFilingSeparately?.length !== 3) {
      throw new Error(`tax-rules.json: ${at}.irmaaBrackets.marriedFilingSeparately must have 3 brackets`);
    }
    premiumYears[Number(year)] = { ...entry, irmaaBrackets: withInfiniteTop(entry.irmaaBrackets, 'magiMax') };
  });

  return { ...medicare, premiumYears };
};

// SSA sets each lower threshold as round(statutory amount x one CPI index). Recover
// an index consistent with every published threshold -- the overlap of the ranges
// each rounded value allows -- so projecting that index reproduces SSA's per-tier
// rounding. Compounding the already-rounded thresholds drifts $1,000 at some tiers.
const impliedThresholdIndex = (singleBrackets, statutory, rounding) => {
  const published = statutory.map((_, i) => singleBrackets[i + 1].magi);
  let low = -Infinity;
  let high = Infinity;
  published.forEach((value, i) => {
    low = Math.max(low, (value - rounding / 2) / statutory[i]);
    high = Math.min(high, (value + rounding / 2) / statutory[i]);
  });
  // No common index (e.g. a hand-edited table): fall back to the average ratio.
  return low <= high
    ? (low + high) / 2
    : published.reduce((sum, value, i) => sum + value / statutory[i], 0) / published.length;
};

const toCents = (amount) => Math.round(amount * 100) / 100;

// Brackets and base premiums for targetYear, from the published premium year
// sourceYear. Thresholds follow CPI (rounded as SSA does; the top one is fixed by
// law through topThresholdFixedThrough); surcharges and premiums follow Medicare
// cost growth, separately for Part B and Part D.
const projectPremiumYear = (source, sourceYear, targetYear, projection) => {
  const years = Math.max(0, targetYear - sourceYear);
  const partBFactor = Math.pow(1 + projection.partBGrowthRate, years);
  const partDFactor = Math.pow(1 + projection.partDGrowthRate, years);
  const partB = toCents(source.partBStandardMonthlyPremium * partBFactor);
  const partD = toCents(source.partDEstimatedMonthlyPremium * partDFactor);
  const basePremiums = { partB, partD, monthly: toCents(partB + partD), annual: toCents((partB + partD) * 12) };
  if (years === 0) return { brackets: source.irmaaBrackets, basePremiums };

  const { single, married, marriedFilingSeparately } = source.irmaaBrackets;
  const { statutoryThresholdsSingle: statutory, thresholdRounding: rounding } = projection;
  const roundThreshold = (amount) => Math.round(amount / rounding) * rounding;

  const index = impliedThresholdIndex(single, statutory, rounding) *
    Math.pow(1 + projection.thresholdInflationRate, years);
  const singleLowers = statutory.map(amount => roundThreshold(amount * index));
  const topYears = Math.max(0, targetYear - Math.max(sourceYear, projection.topThresholdFixedThrough));
  const topFactor = Math.pow(1 + projection.thresholdInflationRate, topYears);
  const singleTop = roundThreshold(single[single.length - 1].magi * topFactor);
  const marriedTop = roundThreshold(married[married.length - 1].magi * topFactor);

  const rebuild = (brackets, lowerBounds) => brackets.map((bracket, i) => ({
    ...bracket,
    magi: lowerBounds[i],
    magiMax: i === brackets.length - 1 ? Infinity : lowerBounds[i + 1],
    partB: toCents(bracket.partB * partBFactor),
    partD: toCents(bracket.partD * partDFactor)
  }));

  // Joint thresholds are twice the single ones (except the top). Married filing
  // separately: nothing up to the single base threshold, one tier up to the single
  // top minus that base, then the top tier (sec. 1839(i)(3)(C)).
  const base = singleLowers[0];
  return {
    brackets: {
      single: rebuild(single, [0, ...singleLowers, singleTop]),
      married: rebuild(married, [0, ...singleLowers.map(amount => 2 * amount), marriedTop]),
      marriedFilingSeparately: rebuild(marriedFilingSeparately, [0, base, singleTop - base])
    },
    basePremiums
  };
};

const MEDICARE_RULES = loadMedicareRules(taxRulesFile.medicare);
const LOOKBACK_YEARS = MEDICARE_RULES.lookbackYears;
const IRMAA_YEAR = TAX_YEAR + LOOKBACK_YEARS;
const IRMAA_SOURCE_YEAR = (() => {
  const published = Object.keys(MEDICARE_RULES.premiumYears).map(Number);
  const notLater = published.filter(year => year <= IRMAA_YEAR);
  return notLater.length > 0 ? Math.max(...notLater) : Math.min(...published);
})();
const IRMAA_PROJECTION_YEARS = Math.max(0, IRMAA_YEAR - IRMAA_SOURCE_YEAR);
const IRMAA_PROJECTED = IRMAA_PROJECTION_YEARS > 0;
const { brackets: PROJECTED_IRMAA_BRACKETS, basePremiums: PROJECTED_BASE_PREMIUMS } = projectPremiumYear(
  MEDICARE_RULES.premiumYears[IRMAA_SOURCE_YEAR], IRMAA_SOURCE_YEAR, IRMAA_YEAR, MEDICARE_RULES.projection
);

// Shown wherever the brackets are, so it's clear how much to trust them.
const IRMAA_BASIS_TEXT = (() => {
  if (!IRMAA_PROJECTED) return `Using the published ${IRMAA_YEAR} IRMAA table from CMS.`;
  const pr = MEDICARE_RULES.projection;
  const topNote = IRMAA_SOURCE_YEAR < pr.topThresholdFixedThrough || IRMAA_YEAR <= pr.topThresholdFixedThrough
    ? ` (the top threshold is fixed by law through ${pr.topThresholdFixedThrough})`
    : '';
  const plural = IRMAA_PROJECTION_YEARS === 1 ? '' : 's';
  return `Projected from the published ${IRMAA_SOURCE_YEAR} table over ${IRMAA_PROJECTION_YEARS} year${plural}: ` +
    `income thresholds +${formatRate(pr.thresholdInflationRate)}/yr, rounded to the nearest $1,000 as SSA does${topNote}; ` +
    `surcharges +${formatRate(pr.partBGrowthRate)}/yr (Part B) and +${formatRate(pr.partDGrowthRate)}/yr (Part D). ` +
    `Each November CMS publishes the next year's table; adding it to tax-rules.json shortens or removes this projection.`;
})();
// ===== END MEDICARE PREMIUMS AND IRMAA =====

// Filing statuses without their own entry (e.g. hoh in most tables) use the
// married-filing-jointly figures, matching how the planner has always behaved.
const forFilingStatus = (table, filingStatus) => table[filingStatus] ?? table.married;

const FILING_STATUS_LABELS = {
  single: 'Single',
  married: 'Married Filing Jointly',
  marriedFilingSeparately: 'Married Filing Separately',
  hoh: 'Head of Household',
  qualifyingSurvivingSpouse: 'Qualifying Surviving Spouse'
};
// ===== END TAX RULES =====

function PriceInput({
  value,
  onChange,
  step = 0.01,
  decimals = 2,
  showDollarSign = false,
  inputClassName = "w-24 px-2 py-1 pr-5 border border-gray-300 rounded text-sm",
}) {
  const [text, setText] = useState((value ?? 0).toFixed(decimals));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText((value ?? 0).toFixed(decimals));
  }, [value, focused, decimals]);

  const commit = (newNum) => {
    const safe = isNaN(newNum) ? 0 : newNum;
    onChange(safe);
    setText(safe.toFixed(decimals));
  };

  // toFixed(decimals) here only strips floating-point noise; it must match the
  // field's precision or the step gets rounded away (e.g. a 0.0001 step at 2dp).
  const nudge = (direction) => commit(+((value ?? 0) + direction * step).toFixed(decimals));

  return (
    // inline-flex, not flex: the wrapper must hug the input, because the spinner
    // below is positioned against it. A block-level flex wrapper fills the whole
    // table cell and the arrows drift off to the right of the input.
    <div className="relative inline-flex items-center">
      {showDollarSign && (
        <span className="absolute left-2 text-gray-500 text-xs z-10">$</span>
      )}
      <input
        type="text"
        inputMode="decimal"
        value={text}
        onFocus={() => setFocused(true)}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => { setFocused(false); commit(parseFloat(text)); }}
        className={`${inputClassName} ${showDollarSign ? "pl-5" : ""}`}
      />
      <div className="absolute right-1 flex flex-col leading-none">
        <button type="button" tabIndex={-1}
          onClick={() => nudge(1)}
          className="text-[10px] hover:text-blue-600">▲</button>
        <button type="button" tabIndex={-1}
          onClick={() => nudge(-1)}
          className="text-[10px] hover:text-blue-600">▼</button>
      </div>
    </div>
  );
}

// Default state, defined once and used by BOTH the initial useState values and
// resetToDefaults. These used to be two hand-maintained copies, and they drifted:
// Reset omitted accounts.brokerage, the stocks' lot-tracking fields, and the
// scenario's brokerage withdrawal + rothConversion, so clicking Reset produced
// state the UI could not render. Factories (not shared constants) so every caller
// gets its own object and nothing aliases into state.
// Quantity actually held: rolled up from lots when lot tracking is on, otherwise the
// plain field (stocks use `shares`, crypto and metals use `units`).
const assetQuantityOwned = (asset) => {
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
const nextAssetName = (prefix, list) => {
  const taken = new Set((Array.isArray(list) ? list : []).map(a => a?.name));
  let n = (Array.isArray(list) ? list.length : 0) + 1;
  while (taken.has(`${prefix} ${n}`)) n++;
  return `${prefix} ${n}`;
};

const createDefaultPersonalInfo = () => ({
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

const createDefaultAccounts = () => ({
  savings: 50000,
  brokerage: 500000,
  traditionalIRA: 300000,
  rothIRA: 100000,
  traditional401k: 400000,
  roth401k: 50000
});

const createDefaultStocks = () => ([
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

const createDefaultSocialSecurity = () => ({
  enabled: false,
  monthlyBenefit: 0,
  spouseMonthlyBenefit: 0
});

// New scenario ids are minted from scenarioCounter, so the counter must never sit
// below the highest id already in use. If it does, addScenario hands out a duplicate
// id -- and then getActiveScenario's find() returns only the first match while
// updateActiveScenario's map() writes to BOTH scenarios at once, and the <option>
// list renders duplicate React keys.
const highestScenarioId = (list) =>
  (Array.isArray(list) ? list : []).reduce((max, s) => Math.max(max, Number(s?.id) || 0), 0);

const createDefaultScenario = (id = 1, name = 'Scenario 1') => ({
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

export default function RetirementTaxPlanner() {
  // Load saved data from storage on mount
  const [isLoading, setIsLoading] = useState(true);

  const [personalInfo, setPersonalInfo] = useState(createDefaultPersonalInfo);

  const [accounts, setAccounts] = useState(createDefaultAccounts);

  const [stocks, setStocks] = useState(createDefaultStocks);

  // Use a ref to always have access to the latest stocks
  const stocksRef = useRef(stocks);
  useEffect(() => {
    stocksRef.current = stocks;
  }, [stocks]);

  const [crypto, setCrypto] = useState([]);
  
  const [metals, setMetals] = useState([]);

  // Scenario management - supports up to 5 independent withdrawal scenarios
  const MAX_SCENARIOS = 5;
  const [scenarios, setScenarios] = useState(() => [createDefaultScenario()]);
  const [activeScenarioId, setActiveScenarioId] = useState(1);
  const [scenarioCounter, setScenarioCounter] = useState(1);

  const [saveStatus, setSaveStatus] = useState('');
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [debugLog, setDebugLog] = useState([]);

  // Lot management modal state
  const [lotModal, setLotModal] = useState({
    isOpen: false,
    assetIndex: null,
    assetType: null, // 'stocks', 'crypto', 'metals'
    assetName: ''
  });

  // CSV import modal state
  const [csvImportModal, setCSVImportModal] = useState({
    isOpen: false,
    assetIndex: null,
    assetType: null,
    csvText: ''
  });

  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [pdfReportMode, setPdfReportMode] = useState('full'); // 'full' or 'summary'
  const [rothOptimizationStrategy, setRothOptimizationStrategy] = useState('irmaa'); // 'conservative', 'irmaa', 'aggressive'
  const [irmaaBuffer, setIrmaaBuffer] = useState(5000);

  const [socialSecurity, setSocialSecurity] = useState(createDefaultSocialSecurity);

  // Add debug message helper
  const addDebugLog = (message) => {
    setDebugLog(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
    console.log(message);
  };

  // Scenario helper functions
  const getActiveScenario = () => {
    return scenarios.find(s => s.id === activeScenarioId) || scenarios[0];
  };

  const updateActiveScenario = (updates) => {
    setScenarios(scenarios.map(s =>
      s.id === activeScenarioId ? { ...s, ...updates } : s
    ));
  };

  const addScenario = () => {
    if (scenarios.length >= MAX_SCENARIOS) return;
    // Take the counter OR the highest live id, whichever is greater, so a stale or
    // corrupt counter can still never collide with an existing scenario.
    const newId = Math.max(scenarioCounter, highestScenarioId(scenarios)) + 1;
    setScenarioCounter(newId);
    setScenarios([...scenarios, createDefaultScenario(newId, `Scenario ${newId}`)]);
    setActiveScenarioId(newId);
  };

  const deleteScenario = (id) => {
    if (scenarios.length === 1) return; // Keep at least one
    const newScenarios = scenarios.filter(s => s.id !== id);
    setScenarios(newScenarios);
    if (activeScenarioId === id) {
      setActiveScenarioId(newScenarios[0].id);
    }
  };

  const renameScenario = (id, newName) => {
    setScenarios(scenarios.map(s =>
      s.id === id ? { ...s, name: newName } : s
    ));
  };

  // Fetch current stock price using multiple fallback APIs
  const fetchStockPrice = async (ticker) => {
    try {
      // Try method 1: Yahoo Finance (most reliable, no API key needed)
      try {
        const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`;
        addDebugLog(`    → Trying Yahoo Finance for ${ticker}`);
        const yahooResponse = await fetch(yahooUrl);
        addDebugLog(`    → Yahoo response status: ${yahooResponse.status}`);
        const yahooData = await yahooResponse.json();
        addDebugLog(`    → Yahoo data received: ${JSON.stringify(yahooData).substring(0, 100)}...`);

        if (yahooData?.chart?.result?.[0]?.meta?.regularMarketPrice) {
          const price = parseFloat(yahooData.chart.result[0].meta.regularMarketPrice);
          addDebugLog(`    ✓ Yahoo Success for ${ticker}: $${price}`);
          return price;
        } else {
          addDebugLog(`    ✗ Yahoo data structure invalid for ${ticker}`);
        }
      } catch (e) {
        addDebugLog(`    ✗ Yahoo Finance failed for ${ticker}: ${e.message}`);
      }

      // Try method 2: Twelve Data (backup)
      try {
        const twelveUrl = `https://api.twelvedata.com/price?symbol=${ticker}&apikey=demo`;
        addDebugLog(`    → Trying Twelve Data for ${ticker}`);
        const twelveResponse = await fetch(twelveUrl);
        addDebugLog(`    → Twelve Data response status: ${twelveResponse.status}`);
        const twelveData = await twelveResponse.json();
        addDebugLog(`    → Twelve Data returned: ${JSON.stringify(twelveData)}`);

        if (twelveData?.price) {
          const price = parseFloat(twelveData.price);
          addDebugLog(`    ✓ Twelve Data Success for ${ticker}: $${price}`);
          return price;
        } else {
          addDebugLog(`    ✗ Twelve Data has no price field for ${ticker}`);
        }
      } catch (e) {
        addDebugLog(`    ✗ Twelve Data failed for ${ticker}: ${e.message}`);
      }

      // Try method 3: Alpha Vantage (if user provided API key)
      if (apiKey && apiKey.length > 0) {
        try {
          const avUrl = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${ticker}&apikey=${apiKey}`;
          addDebugLog(`    → Trying Alpha Vantage for ${ticker} with your API key`);
          const avResponse = await fetch(avUrl);
          addDebugLog(`    → Alpha Vantage response status: ${avResponse.status}`);
          const avData = await avResponse.json();
          addDebugLog(`    → Alpha Vantage returned: ${JSON.stringify(avData).substring(0, 200)}...`);

          if (avData && avData['Global Quote'] && avData['Global Quote']['05. price']) {
            const price = parseFloat(avData['Global Quote']['05. price']);
            addDebugLog(`    ✓ Alpha Vantage Success for ${ticker}: $${price}`);
            return price;
          } else {
            addDebugLog(`    ✗ Alpha Vantage has no valid price for ${ticker}`);
          }
        } catch (e) {
          addDebugLog(`    ✗ Alpha Vantage failed for ${ticker}: ${e.message}`);
        }
      }

      addDebugLog(`    ✗ All methods failed for ${ticker}`);
      return null;
    } catch (error) {
      addDebugLog(`    ✗ Error fetching price for ${ticker}: ${error.message}`);
      return null;
    }
  };

  // Update all stock prices
  const updateAllStockPrices = async () => {
    setDebugLog([]); // Clear previous logs
    setLoadingPrices(true);
    setSaveStatus('Fetching current prices...');

    // Get current stocks from ref
    const stocksToUpdate = [...stocksRef.current];
    addDebugLog(`Starting price update for ${stocksToUpdate.length} stocks: ${stocksToUpdate.map(s => s.name).join(', ')}`);

    let successCount = 0;
    let attemptedCount = 0;
    let failedTickers = [];

    // The row as it exists RIGHT NOW, matched by position and confirmed by name so a
    // reorder or rename during the run can never apply a price to the wrong holding.
    const liveStockAt = (index, expectedName) => {
      const current = stocksRef.current[index];
      return current && current.name === expectedName ? current : null;
    };

    for (let i = 0; i < stocksToUpdate.length; i++) {
      const stock = stocksToUpdate[i];
      const ticker = stock.name.trim().toUpperCase();

      addDebugLog(`[${i + 1}/${stocksToUpdate.length}] Processing: ${ticker}`);

      // Read the skip flag from live state, not the pre-loop snapshot: this loop
      // runs for ~14s on a full portfolio and the user may tick Skip Update during it.
      if ((liveStockAt(i, stock.name) || stock).skipPriceUpdate) {
        addDebugLog(`  → ${ticker} has skip flag, skipping price update`);
        continue;
      }

      // Only fetch if the name looks like a ticker (1-5 characters, letters only)
      const isTicker = /^[A-Z]{1,5}$/.test(ticker);

      if (isTicker) {
        addDebugLog(`  → ${ticker} is valid ticker format, fetching...`);
        attemptedCount++;
        const price = await fetchStockPrice(ticker);
        addDebugLog(`  → ${ticker} fetch returned: $${price}`);

        if (price && price > 0) {
          const fetchedPrice = parseFloat(price.toFixed(2));
          successCount++;
          addDebugLog(`  ✓ ${ticker} updated to $${price}`);

          // Merge the new price into CURRENT state rather than re-publishing the
          // snapshot taken before the loop. Publishing the stale array overwrote
          // every edit made while "Updating..." was running -- including ticking
          // Skip Update, whose own click was then undone.
          setStocks(prev => prev.map((s, idx) =>
            idx === i && s.name === stock.name ? { ...s, currentPrice: fetchedPrice } : s
          ));
          addDebugLog(`  → State updated, continuing...`);
        } else {
          failedTickers.push(ticker);
          addDebugLog(`  ✗ ${ticker} failed (returned: ${price})`);
        }

        // Add delay to avoid rate limiting (Alpha Vantage requires 1 second between requests)
        addDebugLog(`  → Waiting 1.2 seconds before next fetch...`);
        await new Promise(resolve => setTimeout(resolve, 1200));
      } else {
        addDebugLog(`  → Skipping ${ticker} (not valid ticker format)`);
      }
    }

    addDebugLog(`=== COMPLETE: ${successCount} succeeded, ${failedTickers.length} failed ===`);
    setLoadingPrices(false);

    // Count only the tickers actually attempted -- skipped holdings were never
    // candidates, so including them reported "Updated 2 of 5" for a run of 2.
    if (successCount > 0) {
      setSaveStatus(`Updated ${successCount} of ${attemptedCount} prices!`);
    } else {
      setSaveStatus(`Failed to fetch prices. Check debug log below.`);
    }

    if (failedTickers.length > 0) {
      addDebugLog(`Failed tickers: ${failedTickers.join(', ')}`);
    }

    setTimeout(() => setSaveStatus(''), 5000);
  };

  // Migrate legacy asset to include lot tracking fields
  const migrateAsset = (asset) => {
    if (!asset) return asset;

    // Ensure lot tracking fields exist
    const migratedAsset = {
      ...asset,
      useLotTracking: asset.useLotTracking || false,
      lots: Array.isArray(asset.lots) ? asset.lots : [],
      skipPriceUpdate: asset.skipPriceUpdate || false,
      // New flag, split out from skipPriceUpdate. Default it from the old flag so
      // existing saved files keep the totals they had; ?? (not ||) so an explicit
      // false is preserved rather than falling back to skipPriceUpdate.
      excludeFromTotals: asset.excludeFromTotals ?? asset.skipPriceUpdate ?? false
    };

    console.log('Migrating asset:', asset.name, '→', migratedAsset);
    return migratedAsset;
  };

  // Migrate scenario to ensure all required fields exist
  const migrateScenario = (scenario) => {
    if (!scenario) return scenario;

    const migratedScenario = {
      ...scenario,
      withdrawals: {
        savings: scenario.withdrawals?.savings ?? 0,
        brokerage: scenario.withdrawals?.brokerage ?? 0,
        traditionalIRA: scenario.withdrawals?.traditionalIRA ?? 0,
        rothIRA: scenario.withdrawals?.rothIRA ?? 0,
        traditional401k: scenario.withdrawals?.traditional401k ?? 0,
        roth401k: scenario.withdrawals?.roth401k ?? 0
      },
      rothConversion: scenario.rothConversion ?? 0,
      stockWithdrawals: Array.isArray(scenario.stockWithdrawals) ? scenario.stockWithdrawals : [],
      cryptoSales: Array.isArray(scenario.cryptoSales) ? scenario.cryptoSales : [],
      metalSales: Array.isArray(scenario.metalSales) ? scenario.metalSales : []
    };

    console.log('Migrating scenario:', scenario.name, '→', migratedScenario);
    return migratedScenario;
  };

  // Load data from storage on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const result = await window.storage.get('retirement-planner-data');
        if (result && result.value) {
          const data = JSON.parse(result.value);
          if (data.personalInfo) setPersonalInfo(prev => ({ ...prev, ...data.personalInfo }));
          if (data.accounts) {
            // Migrate accounts to include brokerage field if missing
            setAccounts({
              ...data.accounts,
              brokerage: data.accounts.brokerage ?? 500000
            });
          }

          // Migrate assets to include lot tracking fields
          if (data.stocks) setStocks(data.stocks.map(migrateAsset));
          if (data.crypto) setCrypto(data.crypto.map(migrateAsset));
          if (data.metals) setMetals(data.metals.map(migrateAsset));

          if (data.socialSecurity) setSocialSecurity({ ...createDefaultSocialSecurity(), ...data.socialSecurity });
          if (data.apiKey) setApiKey(data.apiKey);

          // Handle scenarios - migrate old format if needed
          if (data.scenarios) {
            // New format with scenarios - migrate each scenario to ensure required fields exist
            const migratedScenarios = Array.isArray(data.scenarios)
              ? data.scenarios.map(migrateScenario)
              : [];
            setScenarios(migratedScenarios);
            setActiveScenarioId(data.activeScenarioId || (migratedScenarios[0] ? migratedScenarios[0].id : 1));
            setScenarioCounter(Math.max(Number(data.scenarioCounter) || 0, highestScenarioId(migratedScenarios)));
          } else {
            // Old format - migrate to scenario structure
            setScenarios([migrateScenario({
              ...createDefaultScenario(),
              withdrawals: data.withdrawals,
              stockWithdrawals: data.stockWithdrawals,
              cryptoSales: data.cryptoSales,
              metalSales: data.metalSales
            })]);
            setActiveScenarioId(1);
            setScenarioCounter(1);
          }
        }
      } catch (error) {
        console.log('No saved data found or error loading:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  // Auto-fetch prices on load - DISABLED for now to prevent data corruption
  // useEffect(() => {
  //   if (!isLoading && stocks.length > 0) {
  //     // Small delay to ensure UI has rendered
  //     setTimeout(() => {
  //       updateAllStockPrices();
  //     }, 500);
  //   }
  // }, [isLoading]);

  // Save data to storage
  const saveData = async () => {
    try {
      const data = {
        personalInfo,
        accounts,
        stocks,
        crypto,
        metals,
        socialSecurity,
        apiKey,
        scenarios,
        activeScenarioId,
        scenarioCounter,
        savedAt: new Date().toISOString()
      };

      await window.storage.set('retirement-planner-data', JSON.stringify(data));
      setSaveStatus('Saved successfully!');
      setTimeout(() => setSaveStatus(''), 3000);
    } catch (error) {
      setSaveStatus('Error saving data');
      setTimeout(() => setSaveStatus(''), 3000);
    }
  };

  // Export data as JSON file
  const exportData = () => {
    const data = {
      personalInfo,
      accounts,
      stocks,
      crypto,
      metals,
      socialSecurity,
      apiKey,
      scenarios,
      activeScenarioId,
      scenarioCounter,
      exportedAt: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `retirement-plan-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Generate PDF Report
  const generatePDFReport = async () => {
    try {
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      let yPosition = 20;
      const margin = 15;

      // Get current scenario data
      const activeScenario = scenarios.find(s => s.id === activeScenarioId) || scenarios[0];
      const results = activeScenario ? calculateScenario(activeScenario) : null;

      if (!results) {
        alert('No scenario data available to generate report');
        return;
      }

      // Helper function to add section image to PDF
      const addSectionToPDF = async (selector, title) => {
        const element = document.querySelector(selector);
        if (!element) {
          console.warn(`Section not found: ${selector}`);
          return false;
        }

        try {
          const canvas = await html2canvas(element, {
            scale: 2,
            backgroundColor: '#ffffff',
            logging: false,
            useCORS: true
          });

          const imgData = canvas.toDataURL('image/png');
          const imgWidth = pageWidth - 2 * margin;
          const imgHeight = (canvas.height * imgWidth) / canvas.width;

          // Check if we need a new page
          if (yPosition + imgHeight > pageHeight - 20) {
            pdf.addPage();
            yPosition = 20;
          }

          // Add title if provided
          if (title) {
            pdf.setFontSize(14);
            pdf.setFont('helvetica', 'bold');
            pdf.text(title, margin, yPosition);
            yPosition += 8;
          }

          pdf.addImage(imgData, 'PNG', margin, yPosition, imgWidth, imgHeight);
          yPosition += imgHeight + 10;

          return true;
        } catch (error) {
          console.error(`Error capturing ${selector}:`, error);
          return false;
        }
      };

      // Title Page
      pdf.setFontSize(20);
      pdf.setFont('helvetica', 'bold');
      const reportTitle = pdfReportMode === 'summary'
        ? 'Retirement Tax Planning Report (Summary)'
        : 'Retirement Tax Planning Report (Full)';
      pdf.text(reportTitle, pageWidth / 2, yPosition, { align: 'center' });
      yPosition += 10;

      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Scenario: ${activeScenario.name}`, pageWidth / 2, yPosition, { align: 'center' });
      yPosition += 5;
      pdf.text(`Generated: ${new Date().toLocaleDateString()}`, pageWidth / 2, yPosition, { align: 'center' });
      yPosition += 15;

      // Capture all webpage sections
      console.log('Generating PDF report...');

      // Find all results sections and capture them
      let sections;
      if (pdfReportMode === 'summary') {
        // Exclude detail sections in summary mode
        sections = Array.from(document.querySelectorAll('.pdf-section')).filter(
          section => !section.classList.contains('pdf-detail-only')
        );
      } else {
        sections = document.querySelectorAll('.pdf-section');
      }

      for (const section of sections) {
        try {
          const canvas = await html2canvas(section, {
            scale: 2,
            backgroundColor: '#ffffff',
            logging: false,
            useCORS: true
          });

          const imgData = canvas.toDataURL('image/png');
          const topMargin = 20;
          const bottomMargin = 20;
          const maxImgHeight = pageHeight - topMargin - bottomMargin;

          let imgWidth = pageWidth - 2 * margin;
          let imgHeight = (canvas.height * imgWidth) / canvas.width;

          // Start a new page if this section will not fit in what is left.
          if (yPosition + imgHeight > pageHeight - bottomMargin) {
            pdf.addPage();
            yPosition = topMargin;
          }

          // A section taller than a whole page still will not fit after the page
          // break. Previously it was drawn at full height anyway: addImage clipped
          // everything past the bottom edge, and yPosition advanced beyond
          // pageHeight so the NEXT section started off-page too. Scale it down to
          // fit instead, keeping the aspect ratio and centring the narrower image.
          if (imgHeight > maxImgHeight) {
            imgWidth = (imgWidth * maxImgHeight) / imgHeight;
            imgHeight = maxImgHeight;
          }

          const imgX = (pageWidth - imgWidth) / 2;
          pdf.addImage(imgData, 'PNG', imgX, yPosition, imgWidth, imgHeight);
          yPosition += imgHeight + 10;
        } catch (error) {
          console.error('Error capturing section:', error);
        }
      }

      // Save PDF
      pdf.save(`retirement-tax-report-${activeScenario.name}-${new Date().toISOString().split('T')[0]}.pdf`);
      console.log('PDF generated successfully');

    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Error generating PDF report. Please check the console for details.');
    }
  };

  // Import data from JSON file
  const importData = (event) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target.result);
          console.log('=== STARTING IMPORT ===');
          console.log('Import data:', data);

          try {
            if (data.personalInfo) {
              console.log('Setting personalInfo');
              // Merge over the defaults rather than replacing wholesale: a file
              // exported before a field existed would otherwise leave it undefined
              // and crash the render that formats it.
              setPersonalInfo({ ...createDefaultPersonalInfo(), ...data.personalInfo });
            }
          } catch (err) {
            console.error('Error setting personalInfo:', err);
            throw new Error('Failed to set personalInfo: ' + err.message);
          }

          try {
            if (data.accounts) {
              console.log('Setting accounts');
              // Same here -- notably accounts.brokerage, which the UI formats unguarded.
              setAccounts({ ...createDefaultAccounts(), ...data.accounts });
            }
          } catch (err) {
            console.error('Error setting accounts:', err);
            throw new Error('Failed to set accounts: ' + err.message);
          }

          // Migrate assets to include lot tracking fields
          try {
            if (data.stocks) {
              console.log('Migrating stocks:', data.stocks);
              const migratedStocks = data.stocks.map(migrateAsset);
              console.log('Migrated stocks:', migratedStocks);
              setStocks(migratedStocks);
              console.log('Stocks set successfully');
            }
          } catch (err) {
            console.error('Error setting stocks:', err);
            throw new Error('Failed to set stocks: ' + err.message);
          }

          try {
            if (data.crypto !== undefined) {
              console.log('Migrating crypto:', data.crypto);
              const migratedCrypto = Array.isArray(data.crypto) ? data.crypto.map(migrateAsset) : [];
              setCrypto(migratedCrypto);
              console.log('Crypto set successfully');
            }
          } catch (err) {
            console.error('Error setting crypto:', err);
            throw new Error('Failed to set crypto: ' + err.message);
          }

          try {
            if (data.metals !== undefined) {
              console.log('Migrating metals:', data.metals);
              const migratedMetals = Array.isArray(data.metals) ? data.metals.map(migrateAsset) : [];
              setMetals(migratedMetals);
              console.log('Metals set successfully');
            }
          } catch (err) {
            console.error('Error setting metals:', err);
            throw new Error('Failed to set metals: ' + err.message);
          }

          try {
            if (data.socialSecurity) {
              console.log('Setting socialSecurity');
              setSocialSecurity({ ...createDefaultSocialSecurity(), ...data.socialSecurity });
            }
          } catch (err) {
            console.error('Error setting socialSecurity:', err);
            throw new Error('Failed to set socialSecurity: ' + err.message);
          }

          try {
            if (data.apiKey !== undefined) {
              console.log('Setting apiKey');
              setApiKey(data.apiKey);
            }
          } catch (err) {
            console.error('Error setting apiKey:', err);
            throw new Error('Failed to set apiKey: ' + err.message);
          }

          // Handle scenarios - migrate old format if needed
          try {
            if (data.scenarios) {
              // New format with scenarios - migrate each scenario to ensure required fields exist
              console.log('Migrating scenarios:', data.scenarios);
              const migratedScenarios = Array.isArray(data.scenarios)
                ? data.scenarios.map(migrateScenario)
                : [];
              console.log('Migrated scenarios:', migratedScenarios);
              setScenarios(migratedScenarios);
              console.log('Scenarios set successfully');

              const activeId = data.activeScenarioId || (migratedScenarios[0] ? migratedScenarios[0].id : 1);
              console.log('Setting activeScenarioId:', activeId);
              setActiveScenarioId(activeId);

              const counter = Math.max(Number(data.scenarioCounter) || 0, highestScenarioId(migratedScenarios));
              console.log('Setting scenarioCounter:', counter);
              setScenarioCounter(counter);
            } else if (data.withdrawals) {
              // Old format - migrate to scenario structure
              console.log('Migrating old format to scenarios');
              setScenarios([migrateScenario({
                ...createDefaultScenario(),
                withdrawals: data.withdrawals,
                stockWithdrawals: data.stockWithdrawals,
                cryptoSales: data.cryptoSales,
                metalSales: data.metalSales
              })]);
              setActiveScenarioId(1);
              setScenarioCounter(1);
              console.log('Old format migrated successfully');
            }
          } catch (err) {
            console.error('Error setting scenarios:', err);
            throw new Error('Failed to set scenarios: ' + err.message);
          }

          console.log('=== IMPORT COMPLETED SUCCESSFULLY ===');
          alert('Data imported successfully!');
          setSaveStatus('Data imported successfully!');
          setTimeout(() => setSaveStatus(''), 3000);
        } catch (error) {
          console.error('=== IMPORT FAILED ===');
          console.error('Import error:', error);
          alert('Error importing data: ' + error.message);
          setSaveStatus('Error importing data');
          setTimeout(() => setSaveStatus(''), 3000);
        }
      };
      reader.readAsText(file);
    }
  };

  // Reset all data to default values
  const resetToDefaults = () => {
    const confirmed = window.confirm(
      'Are you sure you want to reset all data to default values? This will clear all your inputs and cannot be undone.'
    );

    if (confirmed) {
      // Reset all state to default values. These come from the same factories the
      // initial useState values use, so Reset cannot drift from them again.
      setPersonalInfo(createDefaultPersonalInfo());
      setAccounts(createDefaultAccounts());
      setStocks(createDefaultStocks());

      setCrypto([]);
      setMetals([]);

      setSocialSecurity(createDefaultSocialSecurity());

      setApiKey('');

      setScenarios([createDefaultScenario()]);

      setActiveScenarioId(1);
      setScenarioCounter(1);

      // Clear localStorage
      try {
        window.storage.remove('retirement-planner-data');
      } catch (error) {
        console.error('Error clearing storage:', error);
      }

      setSaveStatus('Reset to default values!');
      setTimeout(() => setSaveStatus(''), 3000);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto p-6 bg-gray-50">
        <div className="bg-white rounded-lg shadow-lg p-6 text-center">
          <p className="text-gray-600">Loading your saved data...</p>
        </div>
      </div>
    );
  }

  // Year-specific rules come from tax-rules.json (see TAX_RULES at the top).
  const federalRules = TAX_RULES.federal;
  const utahTaxRate = TAX_RULES.utah.flatRate;
  const ordinaryBracketsFor = (filingStatus) => forFilingStatus(federalRules.ordinaryBrackets, filingStatus);
  const capitalGainsBracketsFor = (filingStatus) => forFilingStatus(federalRules.capitalGainsBrackets, filingStatus);
  const irmaaBracketsFor = (filingStatus) => forFilingStatus(PROJECTED_IRMAA_BRACKETS, filingStatus);

  // Married filing separately normally has its own, much harsher, IRMAA table and
  // a $0 Social Security base amount -- but both switch to the single figures if
  // the couple lived apart the entire year (CMS; IRS Pub 915). CMS has only joint,
  // separate and individual tables; head of household and qualifying surviving
  // spouse use the individual one (SSA POMS HI 01101.020, Table 1).
  const livedApartMFS = personalInfo.filingStatus === 'marriedFilingSeparately' && personalInfo.livedApartFromSpouse;
  const usesIndividualIRMAATable = livedApartMFS ||
    personalInfo.filingStatus === 'hoh' || personalInfo.filingStatus === 'qualifyingSurvivingSpouse';
  const irmaaFilingStatus = usesIndividualIRMAATable ? 'single' : personalInfo.filingStatus;
  const socialSecurityFilingStatus = livedApartMFS ? 'marriedFilingSeparatelyLivedApart' : personalInfo.filingStatus;

  const calculateTax = (taxableIncome, filingStatus) => {
    const brackets = ordinaryBracketsFor(filingStatus);
    let tax = 0;

    for (let i = 0; i < brackets.length; i++) {
      const bracket = brackets[i];
      if (taxableIncome > bracket.min) {
        const taxableInBracket = Math.min(taxableIncome, bracket.max) - bracket.min;
        tax += taxableInBracket * bracket.rate;
      }
    }

    return tax;
  };

  // Calculate long-term capital gains tax using proper brackets (0%, 15%, 20%)
  const calculateCapitalGainsTax = (longTermGains, taxableOrdinaryIncome, filingStatus) => {
    if (longTermGains <= 0) return 0;

    const capitalGainsBrackets = capitalGainsBracketsFor(filingStatus);

    // Capital gains "stack" on top of taxable ordinary income
    let tax = 0;
    let currentIncome = taxableOrdinaryIncome;
    let remaining = longTermGains;

    for (const bracket of capitalGainsBrackets) {
      if (remaining <= 0) break;

      const roomInBracket = Math.max(0, bracket.max - currentIncome);
      if (roomInBracket > 0) {
        const taxableInBracket = Math.min(remaining, roomInBracket);
        tax += taxableInBracket * bracket.rate;
        remaining -= taxableInBracket;
        currentIncome += taxableInBracket;
      }
    }

    return tax;
  };

  // ===== LOT SELECTION ALGORITHMS =====

  // Helper: Calculate holding period for a lot
  const calculateHoldingPeriod = (purchaseDate) => {
    const purchase = new Date(purchaseDate);
    const today = new Date();
    const diffInDays = (today - purchase) / (1000 * 60 * 60 * 24);

    // The IRS test is "more than one year", measured to the calendar anniversary --
    // not ">= 365 days". Buy Jan 2 and sell the following Jan 2 and it is still
    // short-term; you must hold to Jan 3. Comparing against the anniversary date
    // also stays correct across leap years, which a flat 365 does not.
    const anniversary = new Date(purchase);
    anniversary.setFullYear(anniversary.getFullYear() + 1);

    return {
      days: diffInDays,
      isLongTerm: today > anniversary
    };
  };

  // Helper: Add metrics to lot (current value, gain/loss, holding period)
  const calculateLotMetrics = (lot, currentPrice) => {
    const currentValue = lot.quantity * currentPrice;
    const gainLoss = currentValue - lot.totalCostBasis;
    const holdingPeriod = calculateHoldingPeriod(lot.purchaseDate);
    return {
      ...lot,
      currentValue,
      gainLoss,
      gainLossPerUnit: currentPrice - lot.costBasisPerUnit,
      ...holdingPeriod
    };
  };

  // Allocate quantity across sorted lots, calculate short/long-term gains
  const allocateQuantityToLots = (sortedLots, quantityToSell, currentPrice) => {
    let remaining = quantityToSell;
    let shortTermGains = 0;
    let longTermGains = 0;
    let totalProceeds = 0;
    const selectedLots = [];

    for (const lot of sortedLots) {
      if (remaining <= 0) break;

      const lotMetrics = calculateLotMetrics(lot, currentPrice);
      const qtyFromLot = Math.min(lot.quantity, remaining);
      const proceeds = qtyFromLot * currentPrice;
      const costBasis = qtyFromLot * lot.costBasisPerUnit;
      const gain = proceeds - costBasis;

      selectedLots.push({
        lotId: lot.id,
        quantityToSell: qtyFromLot,
        costBasisPerUnit: lot.costBasisPerUnit,
        proceeds,
        gain,
        isLongTerm: lotMetrics.isLongTerm
      });

      if (lotMetrics.isLongTerm) {
        longTermGains += gain;
      } else {
        shortTermGains += gain;
      }

      totalProceeds += proceeds;
      remaining -= qtyFromLot;
    }

    return {
      selectedLots,
      shortTermGains,
      longTermGains,
      totalProceeds,
      totalGains: shortTermGains + longTermGains
    };
  };

  // Lot selection strategies, each defined PURELY by its ordering over all lots.
  //
  // The dropdown labels ("Highest Cost First" / "First In First Out" / "Last In
  // First Out") are a promise about which lots get sold, so nothing may be filtered
  // out before sorting. These three functions previously shared an "eligibility"
  // pre-filter that dropped every short-term lot holding a gain. That:
  //   - inverted LIFO, whose newest lots are exactly the ones the filter removed,
  //     so "sell newest first" sold the oldest shares instead;
  //   - made results non-monotonic, because a fallback re-added ALL lots once the
  //     eligible quantity ran short -- so selling 101 units could choose a
  //     completely different set than selling 100, and report a smaller total gain.
  //
  // Tax-loss harvesting is a legitimate thing to want, but it is a separate strategy
  // and belongs behind its own dropdown option, not silently inside these three.

  // Undated or unparseable lots sort as oldest rather than poisoning the comparator
  // with NaN, which would leave the sort order unspecified.
  const lotPurchaseTime = (lot) => {
    const t = new Date(lot.purchaseDate).getTime();
    return isNaN(t) ? 0 : t;
  };

  // Each entry is a factory taking the asset's current price and returning the
  // comparator, because TAX_OPTIMIZED needs the price to know which lots are at a
  // loss. The other three ignore it.
  const LOT_SORTERS = {
    // Highest cost basis first -> smallest taxable gain per unit sold
    HIFO: () => (a, b) => b.costBasisPerUnit - a.costBasisPerUnit,
    // Oldest purchase first
    FIFO: () => (a, b) => lotPurchaseTime(a) - lotPurchaseTime(b),
    // Newest purchase first
    LIFO: () => (a, b) => lotPurchaseTime(b) - lotPurchaseTime(a),

    // Minimise the tax on THIS sale by ranking each lot on its estimated tax cost
    // per unit: gain per unit x the rate its holding period attracts. Cheapest
    // (most negative) first.
    //
    // One continuous ranking handles every case, which a tier-based ordering does
    // not. Losses come first automatically, since a negative gain yields a negative
    // cost -- and a short-term loss outranks a long-term one, correctly, because it
    // offsets income taxed at the higher rate. Gains then follow in ascending tax
    // cost, so a $60/unit long-term gain (~$9 of tax) is preferred over a $30/unit
    // short-term gain (~$9.60) even though the gain itself is larger. Ordering by
    // holding period alone gets that backwards whenever the long-term gain is big
    // enough, and pays more tax as a result.
    //
    // These rates are estimates used ONLY to rank lots. The tax actually reported
    // is computed downstream by calculateScenario from the real brackets, so an
    // imperfect estimate here changes which lots are chosen, never the accuracy of
    // the figures shown.
    TAX_OPTIMIZED: (currentPrice) => {
      const ESTIMATED_ORDINARY_RATE = 0.32;
      const ESTIMATED_LONG_TERM_RATE = 0.15;
      const taxCostPerUnit = (lot) => {
        const gainPerUnit = (currentPrice || 0) - (lot.costBasisPerUnit || 0);
        const rate = calculateHoldingPeriod(lot.purchaseDate).isLongTerm
          ? ESTIMATED_LONG_TERM_RATE
          : ESTIMATED_ORDINARY_RATE;
        return gainPerUnit * rate;
      };
      return (a, b) => taxCostPerUnit(a) - taxCostPerUnit(b);
    },
  };

  // Main lot selection function
  const selectLots = (asset, requestedQuantity, strategy = 'HIFO') => {
    const empty = {
      selectedLots: [],
      shortTermGains: 0,
      longTermGains: 0,
      totalProceeds: 0,
      totalGains: 0,
      requestedQuantity: requestedQuantity || 0,
      quantitySold: 0
    };

    if (!asset || requestedQuantity <= 0) return empty;

    // Never sell more than is actually held. Unclamped, the legacy path computed a
    // full tax plan on a position you do not own, while the lot-tracked path just
    // ran out of lots and silently under-reported -- two different wrong answers
    // from one input. The inputs' max= attribute is not enforced for typed values.
    const owned = assetQuantityOwned(asset);
    const quantityToSell = Math.min(requestedQuantity, owned);
    if (quantityToSell <= 0) return empty;

    // Use lot tracking if enabled and lots exist
    if (asset.useLotTracking && asset.lots && asset.lots.length > 0) {
      // SPECIFIC has no per-lot picker in the UI yet, so it falls back to HIFO,
      // as does any unrecognised strategy.
      const makeSorter = LOT_SORTERS[strategy] || LOT_SORTERS.HIFO;
      const sorted = [...asset.lots].sort(makeSorter(asset.currentPrice));
      return {
        ...allocateQuantityToLots(sorted, quantityToSell, asset.currentPrice),
        requestedQuantity,
        quantitySold: quantityToSell
      };
    }

    // Legacy calculation (no lot tracking)
    const proceeds = quantityToSell * asset.currentPrice;
    const costBasis = quantityToSell * asset.costBasis;
    const gain = proceeds - costBasis;

    return {
      selectedLots: [],
      shortTermGains: 0,
      longTermGains: gain, // Assume all long-term for legacy
      totalProceeds: proceeds,
      totalGains: gain,
      requestedQuantity,
      quantitySold: quantityToSell
    };
  };

  // ===== END LOT SELECTION ALGORITHMS =====

  // measureBracketRoom is turned off only for the probe runs that measure it, so
  // measuring does not recurse.
  const calculateScenario = (scenario, { measureBracketRoom = true } = {}) => {
    // Destructure withdrawal data from the scenario
    const { withdrawals, stockWithdrawals, cryptoSales, metalSales, rothConversion = 0 } = scenario;

    // Calculate employment income (3 months)
    const employmentIncome = personalInfo.workMonths * personalInfo.monthlyWorkIncome;

    // Calculate pension income (0 means no pension this year, 1-12 is the start month)
    const pensionMonths = personalInfo.pensionStartMonth === 0 ? 0 : (12 - personalInfo.pensionStartMonth + 1);
    const pensionIncome = pensionMonths * personalInfo.monthlyPension;

    // Calculate capital gains from stock sales with lot tracking
    let totalStockProceeds = 0;
    let totalStockShortTermGains = 0;
    let totalStockLongTermGains = 0;

    stockWithdrawals.forEach(sw => {
      const stock = stocks.find(s => s.name === sw.stockName);
      if (stock && sw.sharesToSell > 0) {
        const lotSelection = selectLots(stock, sw.sharesToSell, sw.selectionStrategy || 'HIFO');

        totalStockProceeds += lotSelection.totalProceeds;
        totalStockShortTermGains += lotSelection.shortTermGains;
        totalStockLongTermGains += lotSelection.longTermGains;
      }
    });

    // Calculate capital gains from crypto sales with lot tracking
    let totalCryptoProceeds = 0;
    let totalCryptoShortTermGains = 0;
    let totalCryptoLongTermGains = 0;

    cryptoSales.forEach(cs => {
      const cryptoAsset = crypto.find(c => c.name === cs.cryptoName);
      if (cryptoAsset && cs.unitsToSell > 0) {
        const lotSelection = selectLots(cryptoAsset, cs.unitsToSell, cs.selectionStrategy || 'HIFO');

        totalCryptoProceeds += lotSelection.totalProceeds;
        totalCryptoShortTermGains += lotSelection.shortTermGains;
        totalCryptoLongTermGains += lotSelection.longTermGains;
      }
    });

    // Calculate capital gains from precious metals sales with lot tracking
    let totalMetalProceeds = 0;
    let totalMetalShortTermGains = 0;
    let totalMetalLongTermGains = 0;

    metalSales.forEach(ms => {
      const metalAsset = metals.find(m => m.name === ms.metalName);
      if (metalAsset && ms.unitsToSell > 0) {
        const lotSelection = selectLots(metalAsset, ms.unitsToSell, ms.selectionStrategy || 'HIFO');

        totalMetalProceeds += lotSelection.totalProceeds;
        totalMetalShortTermGains += lotSelection.shortTermGains;
        totalMetalLongTermGains += lotSelection.longTermGains;
      }
    });

    // Calculate total short-term and long-term gains
    const totalShortTermGains = totalStockShortTermGains + totalCryptoShortTermGains + totalMetalShortTermGains;
    const totalLongTermGains = totalStockLongTermGains + totalCryptoLongTermGains + totalMetalLongTermGains;

    // Social Security income
    let socialSecurityIncome = 0;
    if (socialSecurity.enabled) {
      // The spouse's benefit is only on this return when filing jointly. The input
      // is hidden for other statuses, but its old value stays in state.
      const spouseBenefit = personalInfo.filingStatus === 'married' ? socialSecurity.spouseMonthlyBenefit : 0;
      socialSecurityIncome = (socialSecurity.monthlyBenefit * 12) + (spouseBenefit * 12);
    }

    // Calculate net capital gains/losses and apply IRS loss deduction rules
    // Step 1: Net short-term and long-term gains together
    const netCapitalGains = totalShortTermGains + totalLongTermGains;

    // Step 2: Apply capital loss deduction rules
    let capitalLossDeduction = 0;
    let excessCapitalLoss = 0;
    let taxableShortTermGains = totalShortTermGains;
    let taxableLongTermGains = totalLongTermGains;

    const capitalLossDeductionLimit = forFilingStatus(federalRules.capitalLossDeductionLimit, personalInfo.filingStatus);

    if (netCapitalGains < 0) {
      // Net capital loss: Can deduct up to $3,000 ($1,500 MFS) from ordinary income
      const netLoss = Math.abs(netCapitalGains);
      capitalLossDeduction = Math.min(netLoss, capitalLossDeductionLimit);
      excessCapitalLoss = Math.max(0, netLoss - capitalLossDeductionLimit);

      // No taxable capital gains since we have net losses
      taxableShortTermGains = 0;
      taxableLongTermGains = 0;
    } else if (totalShortTermGains < 0 && totalLongTermGains > 0) {
      // Short-term losses offset long-term gains
      taxableShortTermGains = 0;
      taxableLongTermGains = netCapitalGains; // Already netted
    } else if (totalLongTermGains < 0 && totalShortTermGains > 0) {
      // Long-term losses offset short-term gains
      taxableLongTermGains = 0;
      taxableShortTermGains = netCapitalGains; // Already netted
    }

    // Ordinary income excluding Social Security (employment + pension + traditional
    // withdrawals + Roth conversion + interest + ordinary dividends)
    const nonSocialSecurityOrdinaryIncome = employmentIncome + pensionIncome +
      withdrawals.traditionalIRA + withdrawals.traditional401k + rothConversion +
      (personalInfo.interestIncome || 0) + (personalInfo.ordinaryDividends || 0);

    // How much of Social Security is taxable (IRS Pub 915).
    // Provisional income = AGI excluding SS (which DOES include capital gains and
    // qualified dividends) + tax-exempt interest + 50% of the gross benefit.
    // This app has no tax-exempt interest field, so that term is zero.
    const agiExcludingSocialSecurity = nonSocialSecurityOrdinaryIncome +
      Math.max(0, taxableShortTermGains) + Math.max(0, taxableLongTermGains) +
      (personalInfo.qualifiedDividends || 0) - capitalLossDeduction;
    const provisionalIncome = agiExcludingSocialSecurity + (socialSecurityIncome * 0.5);

    // MFS while living with a spouse gets a $0 base, which drives the full 85%.
    const ssThresholds = forFilingStatus(federalRules.socialSecurityTaxabilityThresholds, socialSecurityFilingStatus);

    let taxableSocialSecurity = 0;
    if (socialSecurityIncome > 0) {
      if (provisionalIncome > ssThresholds.adjusted) {
        // Above the upper threshold: 85% of the excess, plus whatever the 50% tier held,
        // capped at 85% of the benefit.
        const lowerTierAmount = Math.min(
          0.5 * socialSecurityIncome,
          0.5 * (ssThresholds.adjusted - ssThresholds.base)
        );
        taxableSocialSecurity = Math.min(
          0.85 * socialSecurityIncome,
          0.85 * (provisionalIncome - ssThresholds.adjusted) + lowerTierAmount
        );
      } else if (provisionalIncome > ssThresholds.base) {
        // Between the thresholds: 50% of the excess, capped at 50% of the benefit.
        taxableSocialSecurity = Math.min(
          0.5 * (provisionalIncome - ssThresholds.base),
          0.5 * socialSecurityIncome
        );
      }
      // At or below the base threshold none of the benefit is taxable.
    }

    // Add short-term capital gains (taxed as ordinary income) and subtract capital loss deduction
    const ordinaryIncomeBeforeCapital = nonSocialSecurityOrdinaryIncome + taxableSocialSecurity;
    const ordinaryIncome = ordinaryIncomeBeforeCapital + Math.max(0, taxableShortTermGains) - capitalLossDeduction;

    // Tax-free withdrawals (Roth accounts and savings)
    const taxFreeWithdrawals = withdrawals.rothIRA + withdrawals.roth401k + withdrawals.savings;

    // Long-term capital gains (includes qualified dividends, taxed at preferential 0%/15%/20% rates)
    const totalLongTermGainsWithQualDiv = Math.max(0, taxableLongTermGains) + (personalInfo.qualifiedDividends || 0);

    // AGI: ordinaryIncome already carries taxable Social Security and short-term gains
    // net of the capital loss deduction; long-term gains and qualified dividends are
    // taxed separately but still count toward AGI.
    const agi = ordinaryIncome + totalLongTermGainsWithQualDiv;

    // Deductions. Both 65+ amounts are taken after AGI, so they lower taxable income
    // but not MAGI -- IRMAA, NIIT and Social Security taxability are unaffected.
    // 'married' is married filing jointly here, so only then does the spouse count.
    const filingStatus = personalInfo.filingStatus;
    const peopleAtOrAboveAge = (minAge) => (personalInfo.age >= minAge ? 1 : 0) +
      (filingStatus === 'married' && personalInfo.spouseAge >= minAge ? 1 : 0);

    const baseStandardDeduction = forFilingStatus(federalRules.standardDeduction, filingStatus);
    const agedRules = federalRules.agedAdditionalStandardDeduction;
    const additionalStandardDeduction = peopleAtOrAboveAge(agedRules.age) * forFilingStatus(agedRules.perPerson, filingStatus);

    // Schedule 1-A Part V: each qualifying person gets perPerson, reduced by
    // phaseOutRate of the (joint, if MFJ) MAGI over the threshold. This app has no
    // foreign or Puerto Rico exclusions, so MAGI here is simply AGI.
    const seniorRules = federalRules.seniorDeduction;
    let seniorDeduction = 0;
    if (seniorRules && !seniorRules.ineligibleFilingStatuses.includes(filingStatus)) {
      const threshold = forFilingStatus(seniorRules.phaseOutMagiThreshold, filingStatus);
      const perPerson = Math.max(0, seniorRules.perPerson - seniorRules.phaseOutRate * Math.max(0, agi - threshold));
      seniorDeduction = peopleAtOrAboveAge(seniorRules.age) * perPerson;
    }

    const deduction = baseStandardDeduction + additionalStandardDeduction + seniorDeduction;

    // Form 1040 order: deductions come off total income, and the Qualified Dividends
    // and Capital Gain Tax Worksheet then treats long-term gains and qualified
    // dividends as the top slice of taxable income. So deductions offset ordinary
    // income first and any excess shelters the preferential income -- flooring
    // ordinary income at zero on its own would throw that excess away.
    const taxableIncome = Math.max(0, agi - deduction);
    const taxablePreferentialIncome = Math.min(taxableIncome, totalLongTermGainsWithQualDiv);
    const taxableOrdinaryIncome = taxableIncome - taxablePreferentialIncome;

    // Total capital gains (for tracking purposes - before loss deduction)
    const totalCapitalGains = totalShortTermGains + totalLongTermGains;

    // Calculate capital gains tax - only on long-term gains using proper brackets
    // Short-term gains already included in ordinary income above
    const capitalGainsTax = calculateCapitalGainsTax(taxablePreferentialIncome, taxableOrdinaryIncome, personalInfo.filingStatus);

    // Calculate ordinary income tax (now includes short-term gains)
    const ordinaryIncomeTax = calculateTax(taxableOrdinaryIncome, personalInfo.filingStatus);
    
    // Utah income tax, TC-40 lines 9-22. Utah has no standard deduction: it taxes
    // Utah taxable income (federal AGI plus additions minus subtractions; none are
    // modeled here) at the flat rate, then subtracts the taxpayer tax credit -- 6% of
    // the federal standard deduction INCLUDING the 65+ extra (Form 1040 line 12e; not
    // the senior deduction, which is on line 13b) plus the personal exemption per
    // dependent, reduced by 1.3% of Utah taxable income above a base phase-out amount.
    const utahCredit = TAX_RULES.utah.taxpayerCredit;
    const utahTaxableIncome = Math.max(0, agi);                                          // line 9
    const utahTaxBeforeCredit = utahTaxableIncome * utahTaxRate;                         // line 10
    const utahCreditBase = baseStandardDeduction + additionalStandardDeduction +
      (personalInfo.dependents || 0) * utahCredit.personalExemption;                    // line 15
    const utahInitialCredit = utahCredit.creditRate * utahCreditBase;                    // line 16
    const utahCreditPhaseOut = utahCredit.phaseOutRate *
      Math.max(0, utahTaxableIncome - forFilingStatus(utahCredit.basePhaseOut, filingStatus)); // line 19
    // Line 21: no Utah tax if federal AGI is at or below the standard deduction
    // without the 65+ extras, plus the senior deduction.
    const utahExempt = agi <= baseStandardDeduction + seniorDeduction;
    const utahTaxpayerCredit = utahExempt
      ? 0
      : Math.min(utahTaxBeforeCredit, Math.max(0, utahInitialCredit - utahCreditPhaseOut)); // line 20
    const utahTaxAfterTaxpayerCredit = utahExempt ? 0 : utahTaxBeforeCredit - utahTaxpayerCredit; // line 22

    // Social Security benefits credit (TC-40A code AH): the Utah rate on the taxable
    // benefits, reduced by 2.5% of modified AGI above the threshold. Modified AGI adds
    // tax-exempt interest to AGI; this app has none. Nonrefundable, so it can only
    // absorb the tax left after the taxpayer credit.
    const utahSSRules = TAX_RULES.utah.socialSecurityCredit;
    const utahSSInitialCredit = utahTaxRate * taxableSocialSecurity;
    const utahSSPhaseOut = utahSSRules.phaseOutRate *
      Math.max(0, agi - forFilingStatus(utahSSRules.phaseOutThreshold, filingStatus));
    const utahSSUsable = Math.min(utahTaxAfterTaxpayerCredit, Math.max(0, utahSSInitialCredit - utahSSPhaseOut));

    // Retirement credit (TC-40A code 18): perPerson for each filer -- and spouse, on
    // a joint return -- born on or before the cutoff year (birth year = tax year - age
    // at year end), phased out at 2.5% of modified AGI above the threshold. Utah
    // allows only one of this and the Social Security credit, so use the larger.
    const utahRetirementRules = TAX_RULES.utah.retirementCredit;
    const bornByCutoff = (personAge) => personAge > 0 && TAX_YEAR - personAge <= utahRetirementRules.bornOnOrBefore;
    const utahRetirementEligible = (bornByCutoff(personalInfo.age) ? 1 : 0) +
      (filingStatus === 'married' && bornByCutoff(personalInfo.spouseAge) ? 1 : 0);
    const utahRetirementInitialCredit = utahRetirementRules.perPerson * utahRetirementEligible;
    const utahRetirementPhaseOut = utahRetirementRules.phaseOutRate *
      Math.max(0, agi - forFilingStatus(utahRetirementRules.phaseOutThreshold, filingStatus));
    const utahRetirementUsable = Math.min(utahTaxAfterTaxpayerCredit, Math.max(0, utahRetirementInitialCredit - utahRetirementPhaseOut));

    const useUtahRetirementCredit = utahRetirementUsable > utahSSUsable;
    const utahSocialSecurityCredit = useUtahRetirementCredit ? 0 : utahSSUsable;
    const utahRetirementCredit = useUtahRetirementCredit ? utahRetirementUsable : 0;
    const totalUtahTax = utahTaxAfterTaxpayerCredit - utahSocialSecurityCredit - utahRetirementCredit;

    // MAGI for IRMAA = AGI + tax-exempt interest (no tax-exempt field in this app).
    // AGI must include long-term gains and qualified dividends -- omitting them
    // understates MAGI and hides IRMAA brackets.
    const magi = agi;

    // Determine IRMAA bracket (keep for backward compatibility and display)
    const irmaaBrackets = irmaaBracketsFor(irmaaFilingStatus);
    let currentIRMAABracket = null;
    let roomToNextIRMAABracket = 0;
    let roomToLowerIRMAABracket = 0;

    for (let i = 0; i < irmaaBrackets.length; i++) {
      const bracket = irmaaBrackets[i];
      if (magi >= bracket.magi && magi < bracket.magiMax) {
        currentIRMAABracket = bracket;
        roomToNextIRMAABracket = bracket.magiMax - magi;

        // Calculate room to move to lower bracket
        if (i > 0) {
          roomToLowerIRMAABracket = magi - irmaaBrackets[i-1].magiMax;
        }
        break;
      } else if (magi >= bracket.magiMax && i === irmaaBrackets.length - 1) {
        currentIRMAABracket = bracket;
        roomToNextIRMAABracket = 0; // In highest bracket
        roomToLowerIRMAABracket = magi - bracket.magi;
        break;
      }
    }
    
    // Medicare costs per person, projected to IRMAA_YEAR: base premiums plus the
    // surcharge for the bracket found above. Before eligibility there is nothing to
    // pay yet -- the IRMAA section shows a projection from currentIRMAABracket instead.
    const noCost = { partB: 0, partD: 0, monthly: 0, annual: 0 };
    let medicare = { eligible: false, basePremiums: noCost, irmaa: noCost, total: noCost, projectedYear: IRMAA_YEAR };
    if (personalInfo.age >= MEDICARE_RULES.eligibilityAge) {
      const { partB, partD } = currentIRMAABracket || noCost;
      const irmaa = { partB, partD, monthly: partB + partD, annual: (partB + partD) * 12 };
      const base = PROJECTED_BASE_PREMIUMS;
      medicare = {
        eligible: true,
        basePremiums: base,
        irmaa,
        total: {
          partB: base.partB + partB,
          partD: base.partD + partD,
          monthly: base.monthly + irmaa.monthly,
          annual: base.annual + irmaa.annual
        },
        projectedYear: IRMAA_YEAR
      };
    }

    // Determine current tax bracket and room to top
    const brackets = ordinaryBracketsFor(personalInfo.filingStatus);
    let currentBracket = null;
    let roomInBracket = 0;
    
    for (let i = 0; i < brackets.length; i++) {
      const bracket = brackets[i];
      if (taxableOrdinaryIncome >= bracket.min && taxableOrdinaryIncome < bracket.max) {
        currentBracket = bracket;
        roomInBracket = bracket.max - taxableOrdinaryIncome;
        break;
      } else if (taxableOrdinaryIncome >= bracket.max && i === brackets.length - 1) {
        currentBracket = bracket;
        roomInBracket = 0; // In highest bracket
        break;
      }
    }

    // roomInBracket is read as "how much more you can convert before the next
    // bracket", and bracket.max - taxableOrdinaryIncome is not that: another dollar
    // of conversion can first be soaked up by leftover deductions, can make more
    // Social Security taxable, and above the threshold also phases out 6 cents per
    // person of the senior deduction. Measure it instead: find the largest extra
    // conversion that keeps taxable ordinary income within this bracket. Taxable
    // ordinary income never falls as conversion rises, so a binary search is valid.
    if (measureBracketRoom && currentBracket && currentBracket.max !== Infinity) {
      const fits = (extra) => calculateScenario(
        { ...scenario, rothConversion: rothConversion + extra },
        { measureBracketRoom: false }
      ).taxableOrdinaryIncome <= currentBracket.max;

      let lo = 0;
      let hi = Math.max(1, Math.ceil(roomInBracket));
      while (fits(hi) && hi < 1e9) { lo = hi; hi *= 2; }
      while (hi - lo > 1) {
        const mid = Math.floor((lo + hi) / 2);
        if (fits(mid)) lo = mid; else hi = mid;
      }
      roomInBracket = lo;
    }
    
    // Calculate Net Investment Income Tax (NIIT) - 3.8% surtax
    const niitThreshold = forFilingStatus(federalRules.niit.thresholds, personalInfo.filingStatus);

    // Net investment income includes: interest, dividends, net capital gains/losses
    // Capital losses can reduce net investment income (but not below zero)
    // Guard each field: every other use of these guards with || 0, and a single
    // undefined here turns netInvestmentIncome, niitTax, totalTax and the entire
    // Combined Tax Summary into NaN, which renders as "$NaN".
    const netInvestmentIncome = Math.max(0,
                                 (personalInfo.interestIncome || 0) +
                                 (personalInfo.qualifiedDividends || 0) +
                                 (personalInfo.ordinaryDividends || 0) +
                                 (netCapitalGains || 0));

    // NIIT applies to the lesser of: net investment income OR (MAGI - threshold)
    const magiOverThreshold = Math.max(0, magi - niitThreshold);
    const niitBase = Math.min(netInvestmentIncome, magiOverThreshold);
    const niitTax = niitBase * federalRules.niit.rate;

    // Total tax
    const totalTax = ordinaryIncomeTax + capitalGainsTax + niitTax;
    const totalTaxWithState = totalTax + totalUtahTax;
    
    // Total withdrawals (includes Roth conversion since it's taxed)
    const totalWithdrawals = Object.values(withdrawals).reduce((sum, val) => sum + val, 0) + totalStockProceeds + totalCryptoProceeds + totalMetalProceeds + rothConversion;

    // Total gross income (all income sources before standard deduction)
    const totalGrossIncome = ordinaryIncome + totalLongTermGainsWithQualDiv;

    // Effective tax rate based on total gross income
    const effectiveRate = totalGrossIncome > 0 ? (totalTax / totalGrossIncome) * 100 : 0;
    const effectiveRateWithState = totalGrossIncome > 0 ? (totalTaxWithState / totalGrossIncome) * 100 : 0;
    
    return {
      employmentIncome,
      pensionIncome,
      ordinaryIncome,
      totalStockProceeds,
      totalStockGains: totalStockShortTermGains + totalStockLongTermGains,
      totalStockShortTermGains,
      totalStockLongTermGains,
      totalCryptoProceeds,
      totalCryptoGains: totalCryptoShortTermGains + totalCryptoLongTermGains,
      totalCryptoShortTermGains,
      totalCryptoLongTermGains,
      totalMetalProceeds,
      totalMetalGains: totalMetalShortTermGains + totalMetalLongTermGains,
      totalMetalShortTermGains,
      totalMetalLongTermGains,
      totalCapitalGains,
      totalLongTermGainsWithQualDiv,
      totalShortTermGains,
      totalLongTermGains,
      netCapitalGains,
      socialSecurityIncome,
      taxableSocialSecurity,
      provisionalIncome,
      utahTaxableIncome,
      taxableShortTermGains,
      taxableLongTermGains,
      capitalLossDeduction,
      excessCapitalLoss,
      standardDeduction: deduction,
      baseStandardDeduction,
      additionalStandardDeduction,
      seniorDeduction,
      utahCreditBase,
      utahTaxBeforeCredit,
      utahInitialCredit,
      utahCreditPhaseOut,
      utahTaxpayerCredit,
      utahExempt,
      utahSSInitialCredit,
      utahSSPhaseOut,
      utahSocialSecurityCredit,
      utahRetirementEligible,
      utahRetirementInitialCredit,
      utahRetirementPhaseOut,
      utahRetirementCredit,
      utahSSUsable,
      utahRetirementUsable,
      taxableIncome,
      taxablePreferentialIncome,
      taxableOrdinaryIncome,
      capitalGainsTax,
      ordinaryIncomeTax,
      totalTax,
      totalWithdrawals,
      taxFreeWithdrawals,
      effectiveRate,
      currentBracket,
      roomInBracket,
      magi,
      medicare,
      currentIRMAABracket,
      roomToNextIRMAABracket,
      roomToLowerIRMAABracket,
      totalUtahTax,
      totalTaxWithState,
      effectiveRateWithState,
      niitThreshold,
      niitBase,
      niitTax,
      netInvestmentIncome,
      rothConversion
    };
  };

  // Calculate results for the active scenario
  const activeScenario = getActiveScenario();
  const results = activeScenario ? calculateScenario(activeScenario) : null;

  const updateWithdrawal = (account, value) => {
    updateActiveScenario({
      withdrawals: {
        ...getActiveScenario().withdrawals,
        [account]: parseFloat(value) || 0
      }
    });
  };

  const addStock = () => {
    if (stocks.length < 12) {
      setStocks([...stocks, {
        name: nextAssetName('Stock', stocks),
        shares: 0,
        costBasis: 0,
        useLotTracking: false,
        lots: [],
        currentPrice: 0,
        skipPriceUpdate: false,
        excludeFromTotals: false
      }]);
    }
  };

  const removeStock = (index) => {
    const stockName = stocks[index].name;
    setStocks(stocks.filter((_, i) => i !== index));
    // Remove stock withdrawal from active scenario
    updateActiveScenario({
      stockWithdrawals: getActiveScenario().stockWithdrawals.filter(sw => sw.stockName !== stockName)
    });
  };

  const updateStock = (index, field, value) => {
    const newStocks = [...stocks];
    // Handle boolean fields properly
    if (field === 'skipPriceUpdate' || field === 'excludeFromTotals') {
      newStocks[index] = { ...newStocks[index], [field]: value };
    } else if (field === 'name') {
      newStocks[index] = { ...newStocks[index], [field]: value };
    } else {
      newStocks[index] = { ...newStocks[index], [field]: parseFloat(value) || 0 };
    }
    setStocks(newStocks);
  };

  const addCrypto = () => {
    if (crypto.length < 12) {
      setCrypto([...crypto, {
        name: nextAssetName('Crypto', crypto),
        units: 0,
        costBasis: 0,
        useLotTracking: false,
        lots: [],
        currentPrice: 0,
        skipPriceUpdate: false,
        excludeFromTotals: false
      }]);
    }
  };

  const removeCrypto = (index) => {
    const cryptoName = crypto[index].name;
    setCrypto(crypto.filter((_, i) => i !== index));
    // Remove crypto sale from active scenario
    updateActiveScenario({
      cryptoSales: getActiveScenario().cryptoSales.filter(cs => cs.cryptoName !== cryptoName)
    });
  };

  const updateCrypto = (index, field, value) => {
    const newCrypto = [...crypto];
    // Boolean and text fields must bypass the numeric coercion below
    if (field === 'excludeFromTotals' || field === 'name') {
      newCrypto[index] = { ...newCrypto[index], [field]: value };
    } else {
      newCrypto[index] = { ...newCrypto[index], [field]: parseFloat(value) || 0 };
    }
    setCrypto(newCrypto);
  };

  const addMetal = () => {
    if (metals.length < 12) {
      setMetals([...metals, {
        name: nextAssetName('Metal', metals),
        units: 0,
        costBasis: 0,
        useLotTracking: false,
        lots: [],
        currentPrice: 0,
        skipPriceUpdate: false,
        excludeFromTotals: false
      }]);
    }
  };

  const removeMetal = (index) => {
    const metalName = metals[index].name;
    setMetals(metals.filter((_, i) => i !== index));
    // Remove metal sale from active scenario
    updateActiveScenario({
      metalSales: getActiveScenario().metalSales.filter(ms => ms.metalName !== metalName)
    });
  };

  const updateMetal = (index, field, value) => {
    const newMetals = [...metals];
    // Boolean and text fields must bypass the numeric coercion below
    if (field === 'excludeFromTotals' || field === 'name') {
      newMetals[index] = { ...newMetals[index], [field]: value };
    } else {
      newMetals[index] = { ...newMetals[index], [field]: parseFloat(value) || 0 };
    }
    setMetals(newMetals);
  };

  // ===== LOT MANAGEMENT HELPER FUNCTIONS =====

  // UUID generator for lot IDs
  const generateLotId = () => {
    return 'lot-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  };

  // Toggle lot tracking for an asset
  const toggleLotTracking = (assetIndex, enabled, assetType = 'stocks') => {
    const updateAsset = (assets, setAssets) => {
      const newAssets = [...assets];
      newAssets[assetIndex].useLotTracking = enabled;

      // If enabling and no lots exist, create one from current legacy data
      if (enabled && newAssets[assetIndex].lots.length === 0) {
        const asset = newAssets[assetIndex];
        const quantity = asset.shares || asset.units || 0;
        if (quantity > 0) {
          newAssets[assetIndex].lots = [{
            id: generateLotId(),
            purchaseDate: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 400 days ago (long-term)
            quantity: quantity,
            costBasisPerUnit: asset.costBasis,
            totalCostBasis: quantity * asset.costBasis
          }];
        }
      }

      setAssets(newAssets);
    };

    if (assetType === 'stocks') updateAsset(stocks, setStocks);
    else if (assetType === 'crypto') updateAsset(crypto, setCrypto);
    else if (assetType === 'metals') updateAsset(metals, setMetals);
  };

  // Add a new lot to an asset
  const addLot = (assetIndex, assetType = 'stocks') => {
    const updateAsset = (assets, setAssets) => {
      const newAssets = [...assets];
      if (newAssets[assetIndex].lots.length < 30) {
        newAssets[assetIndex].lots.push({
          id: generateLotId(),
          purchaseDate: new Date().toISOString().split('T')[0],
          quantity: 0,
          costBasisPerUnit: 0,
          totalCostBasis: 0
        });
        setAssets(newAssets);
      }
    };

    if (assetType === 'stocks') updateAsset(stocks, setStocks);
    else if (assetType === 'crypto') updateAsset(crypto, setCrypto);
    else if (assetType === 'metals') updateAsset(metals, setMetals);
  };

  // Update a lot field
  const updateLot = (assetIndex, lotIndex, field, value, assetType = 'stocks') => {
    const updateAsset = (assets, setAssets) => {
      const newAssets = [...assets];
      const lot = newAssets[assetIndex].lots[lotIndex];

      if (field === 'purchaseDate') {
        lot.purchaseDate = value;
      } else {
        lot[field] = parseFloat(value) || 0;
        // Recalculate total cost basis when quantity or cost per unit changes
        if (field === 'quantity' || field === 'costBasisPerUnit') {
          lot.totalCostBasis = lot.quantity * lot.costBasisPerUnit;
        }
      }

      setAssets(newAssets);
    };

    if (assetType === 'stocks') updateAsset(stocks, setStocks);
    else if (assetType === 'crypto') updateAsset(crypto, setCrypto);
    else if (assetType === 'metals') updateAsset(metals, setMetals);
  };

  // Remove a lot from an asset
  const removeLot = (assetIndex, lotIndex, assetType = 'stocks') => {
    const updateAsset = (assets, setAssets) => {
      const newAssets = [...assets];
      newAssets[assetIndex].lots = newAssets[assetIndex].lots.filter((_, i) => i !== lotIndex);
      setAssets(newAssets);
    };

    if (assetType === 'stocks') updateAsset(stocks, setStocks);
    else if (assetType === 'crypto') updateAsset(crypto, setCrypto);
    else if (assetType === 'metals') updateAsset(metals, setMetals);
  };

  // Open lot management modal
  const openLotModal = (assetIndex, assetType) => {
    const asset = assetType === 'stocks' ? stocks[assetIndex]
      : assetType === 'crypto' ? crypto[assetIndex]
      : metals[assetIndex];

    setLotModal({
      isOpen: true,
      assetIndex,
      assetType,
      assetName: asset.name
    });
  };

  // Close lot management modal
  const closeLotModal = () => {
    setLotModal({
      isOpen: false,
      assetIndex: null,
      assetType: null,
      assetName: ''
    });
  };

  // Open CSV import modal
  const openCSVImportModal = (assetIndex, assetType) => {
    setCSVImportModal({
      isOpen: true,
      assetIndex,
      assetType,
      csvText: ''
    });
  };

  // Close CSV import modal
  const closeCSVImportModal = () => {
    setCSVImportModal({
      isOpen: false,
      assetIndex: null,
      assetType: null,
      csvText: ''
    });
  };

  // Parse and import lots from CSV
  const parseCSVAndImportLots = () => {
    try {
      const lines = csvImportModal.csvText.trim().split('\n');
      if (lines.length < 2) {
        alert('CSV must have at least a header row and one data row');
        return;
      }

      // Expected format: Purchase Date, Quantity, Cost Per Unit
      // Skip header row
      const lots = [];
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(',').map(p => p.trim());
        if (parts.length >= 3) {
          const quantity = parseFloat(parts[1]) || 0;
          const costPerUnit = parseFloat(parts[2]) || 0;
          lots.push({
            id: generateLotId(),
            purchaseDate: parts[0], // Should be YYYY-MM-DD format
            quantity,
            costBasisPerUnit: costPerUnit,
            totalCostBasis: quantity * costPerUnit
          });
        }
      }

      if (lots.length === 0) {
        alert('No valid lots found in CSV');
        return;
      }

      if (lots.length > 20) {
        alert(`CSV contains ${lots.length} lots, but maximum is 20. Only first 20 will be imported.`);
        lots.splice(20);
      }

      // Import lots into the selected asset
      const assetType = csvImportModal.assetType;
      const assetIndex = csvImportModal.assetIndex;

      if (assetType === 'stocks') {
        const newStocks = [...stocks];
        newStocks[assetIndex].lots = lots;
        newStocks[assetIndex].useLotTracking = true;
        setStocks(newStocks);
      } else if (assetType === 'crypto') {
        const newCrypto = [...crypto];
        newCrypto[assetIndex].lots = lots;
        newCrypto[assetIndex].useLotTracking = true;
        setCrypto(newCrypto);
      } else if (assetType === 'metals') {
        const newMetals = [...metals];
        newMetals[assetIndex].lots = lots;
        newMetals[assetIndex].useLotTracking = true;
        setMetals(newMetals);
      }

      closeCSVImportModal();
      alert(`Successfully imported ${lots.length} lots`);
    } catch (error) {
      alert(`Error parsing CSV: ${error.message}`);
    }
  };

  // ===== END LOT MANAGEMENT HELPER FUNCTIONS =====

  const updateStockWithdrawal = (stockName, shares) => {
    const scenario = getActiveScenario();
    const sharesToSell = Math.max(0, parseFloat(shares) || 0);
    const existing = scenario.stockWithdrawals.find(sw => sw.stockName === stockName);
    if (existing) {
      updateActiveScenario({
        stockWithdrawals: scenario.stockWithdrawals.map(sw =>
          sw.stockName === stockName ? { ...sw, sharesToSell } : sw
        )
      });
    } else {
      updateActiveScenario({
        stockWithdrawals: [...scenario.stockWithdrawals, { stockName, sharesToSell }]
      });
    }
  };

  const getStockWithdrawal = (stockName) => {
    const scenario = getActiveScenario();
    const sw = scenario.stockWithdrawals.find(s => s.stockName === stockName);
    return sw ? sw.sharesToSell : 0;
  };

  const getStockStrategy = (stockName) => {
    const scenario = getActiveScenario();
    const sw = scenario.stockWithdrawals.find(s => s.stockName === stockName);
    return sw ? (sw.selectionStrategy || 'HIFO') : 'HIFO';
  };

  const updateStockStrategy = (stockName, strategy) => {
    const scenario = getActiveScenario();
    const existing = scenario.stockWithdrawals.find(sw => sw.stockName === stockName);
    if (existing) {
      updateActiveScenario({
        stockWithdrawals: scenario.stockWithdrawals.map(sw =>
          sw.stockName === stockName ? { ...sw, selectionStrategy: strategy } : sw
        )
      });
    } else {
      // Create withdrawal entry with strategy if it doesn't exist
      updateActiveScenario({
        stockWithdrawals: [...scenario.stockWithdrawals, { stockName, sharesToSell: 0, selectionStrategy: strategy }]
      });
    }
  };

  const updateCryptoSale = (cryptoName, units) => {
    const scenario = getActiveScenario();
    const unitsToSell = Math.max(0, parseFloat(units) || 0);
    const existing = scenario.cryptoSales.find(cs => cs.cryptoName === cryptoName);
    if (existing) {
      updateActiveScenario({
        cryptoSales: scenario.cryptoSales.map(cs =>
          cs.cryptoName === cryptoName ? { ...cs, unitsToSell } : cs
        )
      });
    } else {
      updateActiveScenario({
        cryptoSales: [...scenario.cryptoSales, { cryptoName, unitsToSell }]
      });
    }
  };

  const getCryptoSale = (cryptoName) => {
    const scenario = getActiveScenario();
    const cs = scenario.cryptoSales.find(c => c.cryptoName === cryptoName);
    return cs ? cs.unitsToSell : 0;
  };

  const getCryptoStrategy = (cryptoName) => {
    const scenario = getActiveScenario();
    const cs = scenario.cryptoSales.find(c => c.cryptoName === cryptoName);
    return cs ? (cs.selectionStrategy || 'HIFO') : 'HIFO';
  };

  const updateCryptoStrategy = (cryptoName, strategy) => {
    const scenario = getActiveScenario();
    const existing = scenario.cryptoSales.find(cs => cs.cryptoName === cryptoName);
    if (existing) {
      updateActiveScenario({
        cryptoSales: scenario.cryptoSales.map(cs =>
          cs.cryptoName === cryptoName ? { ...cs, selectionStrategy: strategy } : cs
        )
      });
    } else {
      // Create sale entry with strategy if it doesn't exist
      updateActiveScenario({
        cryptoSales: [...scenario.cryptoSales, { cryptoName, unitsToSell: 0, selectionStrategy: strategy }]
      });
    }
  };

  const updateMetalSale = (metalName, units) => {
    const scenario = getActiveScenario();
    const unitsToSell = Math.max(0, parseFloat(units) || 0);
    const existing = scenario.metalSales.find(ms => ms.metalName === metalName);
    if (existing) {
      updateActiveScenario({
        metalSales: scenario.metalSales.map(ms =>
          ms.metalName === metalName ? { ...ms, unitsToSell } : ms
        )
      });
    } else {
      updateActiveScenario({
        metalSales: [...scenario.metalSales, { metalName, unitsToSell }]
      });
    }
  };

  const getMetalSale = (metalName) => {
    const scenario = getActiveScenario();
    const ms = scenario.metalSales.find(m => m.metalName === metalName);
    return ms ? ms.unitsToSell : 0;
  };

  const getMetalStrategy = (metalName) => {
    const scenario = getActiveScenario();
    const ms = scenario.metalSales.find(m => m.metalName === metalName);
    return ms ? (ms.selectionStrategy || 'HIFO') : 'HIFO';
  };

  const updateMetalStrategy = (metalName, strategy) => {
    const scenario = getActiveScenario();
    const existing = scenario.metalSales.find(ms => ms.metalName === metalName);
    if (existing) {
      updateActiveScenario({
        metalSales: scenario.metalSales.map(ms =>
          ms.metalName === metalName ? { ...ms, selectionStrategy: strategy } : ms
        )
      });
    } else {
      // Create sale entry with strategy if it doesn't exist
      updateActiveScenario({
        metalSales: [...scenario.metalSales, { metalName, unitsToSell: 0, selectionStrategy: strategy }]
      });
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6 bg-gray-50">
      <style>{`
        /* Fix input/select text cutoff in PDF by ensuring adequate line-height */
        .pdf-section input,
        .pdf-section select {
          line-height: 1.8 !important;
          padding-top: 6px !important;
          padding-bottom: 6px !important;
        }

        .pdf-section select {
          min-height: 48px !important;
          height: 48px !important;
          line-height: normal !important;
          padding-top: 12px !important;
          padding-bottom: 12px !important;
          display: flex !important;
          align-items: center !important;
          overflow: visible !important;
          background-color: #f3f4f6 !important;
        }
      `}</style>
      <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Calculator className="w-6 h-6 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-800">{TAX_YEAR} Retirement Withdrawal Tax Planner</h1>
          </div>
          <div className="flex items-center gap-2">
            {saveStatus && (
              <span className="text-sm text-green-600 mr-2">{saveStatus}</span>
            )}
            <button
              onClick={saveData}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
            >
              <Save className="w-4 h-4" />
              Save Data
            </button>
            <button
              onClick={exportData}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              <Download className="w-4 h-4" />
              Export
            </button>
            <div className="flex items-center gap-2 border border-gray-300 rounded-md p-1 bg-white">
              <select
                value={pdfReportMode}
                onChange={(e) => setPdfReportMode(e.target.value)}
                className="text-sm px-2 py-1 border-none focus:outline-none"
              >
                <option value="full">Full Report</option>
                <option value="summary">Summary Report</option>
              </select>
              <button
                onClick={generatePDFReport}
                className="flex items-center gap-2 px-3 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700"
                title={pdfReportMode === 'full' ? "Generate full PDF report with all details" : "Generate summary PDF report (excludes assets and lot details)"}
              >
                <FileText className="w-4 h-4" />
                PDF Report
              </button>
            </div>
            <label className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 cursor-pointer">
              <Upload className="w-4 h-4" />
              Import
              <input
                type="file"
                accept=".json"
                onChange={importData}
                className="hidden"
              />
            </label>
            <button
              onClick={resetToDefaults}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700"
              title="Reset all data to default values"
            >
              <RotateCcw className="w-4 h-4" />
              Reset
            </button>
          </div>
        </div>
        <p className="text-sm text-gray-600 mb-4">
          Plan your retirement withdrawals to minimize taxes. This is for educational purposes only - consult a tax professional for personalized advice.
        </p>
      </div>

      {/* Scenario Management Section */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-800">Withdrawal Scenarios</h2>
          <div className="flex items-center gap-3">
            {scenarios.length > 1 && (
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700">Active Scenario:</label>
                <select
                  value={activeScenarioId}
                  onChange={(e) => setActiveScenarioId(parseInt(e.target.value))}
                  className="px-3 py-2 border border-gray-300 rounded-md"
                >
                  {scenarios.map(scenario => (
                    <option key={scenario.id} value={scenario.id}>
                      {scenario.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <button
              onClick={addScenario}
              disabled={scenarios.length >= MAX_SCENARIOS}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              Add Scenario ({scenarios.length}/{MAX_SCENARIOS})
            </button>
          </div>
        </div>

        {scenarios.length > 1 && (
          <div className="flex items-center gap-3 pt-3 border-t">
            <input
              type="text"
              value={getActiveScenario().name}
              onChange={(e) => renameScenario(activeScenarioId, e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
              placeholder="Scenario name"
            />
            <button
              onClick={() => deleteScenario(activeScenarioId)}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
            >
              Delete Scenario
            </button>
          </div>
        )}
      </div>

      {/* Personal Info + Accounts/SS wrapper for PDF */}
      <div className="pdf-section mb-6">
        <div className="grid md:grid-cols-2 gap-6">
          {/* Personal Information - Left Column */}
          <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4 text-gray-800">Personal Information</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Age</label>
              <input
                type="number"
                value={personalInfo.age}
                onChange={(e) => setPersonalInfo({...personalInfo, age: parseInt(e.target.value) || 0})}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>

            {personalInfo.filingStatus === 'married' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Spouse Age</label>
                <input
                  type="number"
                  value={personalInfo.spouseAge}
                  onChange={(e) => setPersonalInfo({...personalInfo, spouseAge: parseInt(e.target.value) || 0})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Filing Status</label>
              <select
                value={personalInfo.filingStatus}
                onChange={(e) => setPersonalInfo({...personalInfo, filingStatus: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value="single">Single</option>
                <option value="married">Married Filing Jointly</option>
                <option value="marriedFilingSeparately">Married Filing Separately</option>
                <option value="hoh">Head of Household</option>
                <option value="qualifyingSurvivingSpouse">Qualifying Surviving Spouse</option>
              </select>
            </div>

            {personalInfo.filingStatus === 'marriedFilingSeparately' && (
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="lived-apart"
                  checked={!!personalInfo.livedApartFromSpouse}
                  onChange={(e) => setPersonalInfo({...personalInfo, livedApartFromSpouse: e.target.checked})}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <label htmlFor="lived-apart" className="text-sm text-gray-700">
                  Lived apart from spouse the entire year
                  <span className="block text-xs text-gray-500">Uses the single thresholds for Social Security taxability and IRMAA</span>
                </label>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Dependents</label>
              <input
                type="number"
                min="0"
                value={personalInfo.dependents || 0}
                onChange={(e) => setPersonalInfo({...personalInfo, dependents: Math.max(0, parseInt(e.target.value) || 0)})}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
              <p className="text-xs text-gray-500 mt-1">Used for the Utah taxpayer tax credit</p>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Months Working This Year</label>
              <input
                type="number"
                value={personalInfo.workMonths}
                onChange={(e) => setPersonalInfo({...personalInfo, workMonths: parseInt(e.target.value) || 0})}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                max="12"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Monthly Work Income</label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-gray-500">$</span>
                <input
                  type="text"
                  value={personalInfo.monthlyWorkIncome.toLocaleString()}
                  onChange={(e) => setPersonalInfo({...personalInfo, monthlyWorkIncome: parseFloat(e.target.value.replace(/,/g, '')) || 0})}
                  className="w-full pl-7 px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Pension Start Month (0=None, 1-12)</label>
              <input
                type="number"
                value={personalInfo.pensionStartMonth}
                onChange={(e) => setPersonalInfo({...personalInfo, pensionStartMonth: parseInt(e.target.value) || 0})}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                min="0"
                max="12"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Monthly Pension</label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-gray-500">$</span>
                <input
                  type="text"
                  value={personalInfo.monthlyPension.toLocaleString()}
                  onChange={(e) => setPersonalInfo({...personalInfo, monthlyPension: parseFloat(e.target.value.replace(/,/g, '')) || 0})}
                  className="w-full pl-7 px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Annual Interest Income</label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-gray-500">$</span>
                <input
                  type="text"
                  value={personalInfo.interestIncome.toLocaleString()}
                  onChange={(e) => setPersonalInfo({...personalInfo, interestIncome: parseFloat(e.target.value.replace(/,/g, '')) || 0})}
                  className="w-full pl-7 px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Qualified Dividends</label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-gray-500">$</span>
                <input
                  type="text"
                  value={personalInfo.qualifiedDividends.toLocaleString()}
                  onChange={(e) => setPersonalInfo({...personalInfo, qualifiedDividends: parseFloat(e.target.value.replace(/,/g, '')) || 0})}
                  className="w-full pl-7 px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">Taxed at capital gains rates (typically 15%)</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ordinary Dividends</label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-gray-500">$</span>
                <input
                  type="text"
                  value={personalInfo.ordinaryDividends.toLocaleString()}
                  onChange={(e) => setPersonalInfo({...personalInfo, ordinaryDividends: parseFloat(e.target.value.replace(/,/g, '')) || 0})}
                  className="w-full pl-7 px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">Taxed as ordinary income</p>
            </div>
          </div>
        </div>

        {/* Right Column - Account Balances and Social Security */}
        <div className="space-y-6">
          {/* Account Balances */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4 text-gray-800">Account Balances</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Savings Account</label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-gray-500">$</span>
                  <input
                    type="text"
                    value={accounts.savings.toLocaleString()}
                    onChange={(e) => setAccounts({...accounts, savings: parseFloat(e.target.value.replace(/,/g, '')) || 0})}
                    className="w-full pl-7 px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Brokerage Account</label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-gray-500">$</span>
                  <input
                    type="text"
                    value={accounts.brokerage.toLocaleString()}
                    onChange={(e) => setAccounts({...accounts, brokerage: parseFloat(e.target.value.replace(/,/g, '')) || 0})}
                    className="w-full pl-7 px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Traditional IRA</label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-gray-500">$</span>
                  <input
                    type="text"
                    value={accounts.traditionalIRA.toLocaleString()}
                    onChange={(e) => setAccounts({...accounts, traditionalIRA: parseFloat(e.target.value.replace(/,/g, '')) || 0})}
                    className="w-full pl-7 px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Roth IRA</label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-gray-500">$</span>
                  <input
                    type="text"
                    value={accounts.rothIRA.toLocaleString()}
                    onChange={(e) => setAccounts({...accounts, rothIRA: parseFloat(e.target.value.replace(/,/g, '')) || 0})}
                    className="w-full pl-7 px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Traditional 401(k)</label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-gray-500">$</span>
                  <input
                    type="text"
                    value={accounts.traditional401k.toLocaleString()}
                    onChange={(e) => setAccounts({...accounts, traditional401k: parseFloat(e.target.value.replace(/,/g, '')) || 0})}
                    className="w-full pl-7 px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Roth 401(k)</label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-gray-500">$</span>
                  <input
                    type="text"
                    value={accounts.roth401k.toLocaleString()}
                    onChange={(e) => setAccounts({...accounts, roth401k: parseFloat(e.target.value.replace(/,/g, '')) || 0})}
                    className="w-full pl-7 px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Social Security */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center gap-2 mb-4">
              <Users className="w-6 h-6 text-purple-600" />
              <h2 className="text-lg font-semibold text-gray-800">Social Security</h2>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="ss-enabled"
                  checked={socialSecurity.enabled}
                  onChange={(e) => setSocialSecurity({...socialSecurity, enabled: e.target.checked})}
                  className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                />
                <label htmlFor="ss-enabled" className="text-sm font-medium text-gray-700">
                  Include Social Security Benefits
                </label>
              </div>

              {socialSecurity.enabled && (
                <div className="space-y-4 pt-4 border-t">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {personalInfo.filingStatus === 'married' ? 'Primary Filer Monthly Benefit' : 'Your Monthly Benefit'}
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-gray-500">$</span>
                      <input
                        type="text"
                        value={socialSecurity.monthlyBenefit.toLocaleString()}
                        onChange={(e) => setSocialSecurity({...socialSecurity, monthlyBenefit: parseFloat(e.target.value.replace(/,/g, '')) || 0})}
                        className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      />
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      Find your estimate at SSA.gov
                    </p>
                  </div>

                  {personalInfo.filingStatus === 'married' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Spouse Monthly Benefit
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-2 text-gray-500">$</span>
                        <input
                          type="text"
                          value={socialSecurity.spouseMonthlyBenefit.toLocaleString()}
                          onChange={(e) => setSocialSecurity({...socialSecurity, spouseMonthlyBenefit: parseFloat(e.target.value.replace(/,/g, '')) || 0})}
                          className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        />
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        Spouse's estimated monthly benefit
                      </p>
                    </div>
                  )}

                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                    <p className="text-sm text-purple-900">
                      <strong>Estimated Annual Benefit{personalInfo.filingStatus === 'married' && socialSecurity.spouseMonthlyBenefit > 0 ? 's' : ''}:</strong>
                      {personalInfo.filingStatus === 'married' && socialSecurity.spouseMonthlyBenefit > 0 ? (
                        <>
                          <br />Primary: ${(socialSecurity.monthlyBenefit * 12).toLocaleString()}
                          <br />Spouse: ${(socialSecurity.spouseMonthlyBenefit * 12).toLocaleString()}
                          <br />Combined: ${((socialSecurity.monthlyBenefit + socialSecurity.spouseMonthlyBenefit) * 12).toLocaleString()}
                        </>
                      ) : (
                        <> ${(socialSecurity.monthlyBenefit * 12).toLocaleString()}</>
                      )}
                    </p>
                    <p className="text-xs text-purple-700 mt-2">
                      Taxation (0%, 50%, or 85%) calculated automatically based on your other income.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        </div>
      </div>

      {/* Stock Portfolio */}
      <div className="bg-white rounded-lg shadow p-6 mb-6 pdf-section pdf-detail-only">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-gray-800">Brokerage Account - Individual Stocks</h2>
          <div className="flex gap-2">
            <button
              onClick={updateAllStockPrices}
              disabled={loadingPrices}
              className="px-4 py-2 bg-purple-600 text-white rounded-md text-sm hover:bg-purple-700 disabled:bg-gray-400"
            >
              {loadingPrices ? 'Updating...' : 'Update Prices'}
            </button>
            {stocks.length < 12 && (
              <button
                onClick={addStock}
                className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700"
              >
                Add Stock
              </button>
            )}
          </div>
        </div>

        {/* API KEY INPUT */}
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
          <p className="text-xs text-gray-700 mb-2">
            <strong>Tip:</strong> Use ticker symbols (e.g., AAPL, MSFT, GOOGL) as stock names to automatically fetch current prices.
          </p>
          <div className="flex items-center gap-3">
            <label className="text-xs font-medium text-gray-700">
              Alpha Vantage API Key (get free key at <a href="https://www.alphavantage.co/support/#api-key" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">alphavantage.co</a>):
            </label>
            <div className="flex-1 relative">
              <input
                type={showApiKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Enter your free API key here"
                className="w-full px-3 py-1 pr-10 border border-gray-300 rounded text-sm"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700"
                title={showApiKey ? "Hide API key" : "Show API key"}
              >
                {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Stock Name</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Lot Tracking</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Shares Owned</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Avg Cost/Share</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Current Price</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Total Value</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Total Gain</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Gain %</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Skip Update</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Exclude</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {stocks.map((stock, index) => {
                // Calculate rolled-up values from lots if lot tracking is enabled
                let totalShares, avgCostBasis, totalCost, totalValue, totalGain, gainPercentage;

                // Ensure lots is an array
                const lots = Array.isArray(stock.lots) ? stock.lots : [];

                if (stock.useLotTracking && lots.length > 0) {
                  // Roll up from lots
                  totalShares = lots.reduce((sum, lot) => sum + (lot.quantity || 0), 0);
                  totalCost = lots.reduce((sum, lot) => sum + (lot.totalCostBasis || 0), 0);
                  avgCostBasis = totalShares > 0 ? totalCost / totalShares : 0;
                  // Ensure avgCostBasis always shows 2 decimal places
                  avgCostBasis = parseFloat(avgCostBasis.toFixed(2));
                  totalValue = totalShares * (stock.currentPrice || 0);
                  totalGain = totalValue - totalCost;
                  gainPercentage = totalCost > 0 ? ((totalGain / totalCost) * 100) : 0;
                } else {
                  // Use legacy simple values
                  totalShares = stock.shares || 0;
                  avgCostBasis = stock.costBasis || 0;
                  totalValue = (stock.shares || 0) * (stock.currentPrice || 0);
                  totalCost = (stock.shares || 0) * (stock.costBasis || 0);
                  totalGain = totalValue - totalCost;
                  gainPercentage = totalCost > 0 ? ((totalGain / totalCost) * 100) : 0;
                }
                
                return (
                  <tr key={index}>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={stock.name}
                        onChange={(e) => updateStock(index, 'name', e.target.value)}
                        className="w-full px-2 py-1 border border-gray-300 rounded"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={stock.useLotTracking || false}
                          onChange={(e) => toggleLotTracking(index, e.target.checked, 'stocks')}
                          className="rounded"
                        />
                        <span className="text-xs">{stock.useLotTracking ? `${lots.length} lots` : 'Enable'}</span>
                      </label>
                      {stock.useLotTracking && (
                        <button
                          onClick={() => openLotModal(index, 'stocks')}
                          className="mt-1 text-xs text-blue-600 hover:text-blue-800 underline"
                        >
                          Manage Lots
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {stock.useLotTracking ? (
                        <div className="text-sm font-medium text-gray-700 bg-gray-100 px-2 py-1 rounded">
                          {Math.round(totalShares).toLocaleString()}
                        </div>
                      ) : (
                        <input
                          type="number"
                          value={stock.shares}
                          onChange={(e) => updateStock(index, 'shares', e.target.value)}
                          className="w-24 px-2 py-1 border border-gray-300 rounded"
                        />
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {stock.useLotTracking ? (
                        <div className="text-sm font-medium text-gray-700 bg-gray-100 px-2 py-1 rounded">
                          ${avgCostBasis.toFixed(2)}
                        </div>
                      ) : (
                        <PriceInput
                          value={stock.costBasis}
                          onChange={(newVal) => updateStock(index, 'costBasis', newVal)}
                        />
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <PriceInput
                        value={stock.currentPrice}
                        onChange={(newVal) => updateStock(index, 'currentPrice', newVal)}
                        showDollarSign
                      />
                    </td>
                    <td className="px-3 py-2 font-medium">
                      ${Math.round(totalValue).toLocaleString()}
                    </td>
                    <td className={`px-3 py-2 font-medium ${totalGain >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      ${Math.round(totalGain).toLocaleString()}
                    </td>
                    <td className={`px-3 py-2 font-medium ${gainPercentage >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {gainPercentage.toFixed(2)}%
                    </td>
                    <td className="px-3 py-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={stock.skipPriceUpdate || false}
                          onChange={(e) => updateStock(index, 'skipPriceUpdate', e.target.checked)}
                          className="rounded"
                        />
                      </label>
                    </td>
                    <td className="px-3 py-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={stock.excludeFromTotals || false}
                          onChange={(e) => updateStock(index, 'excludeFromTotals', e.target.checked)}
                          className="rounded"
                        />
                      </label>
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => removeStock(index)}
                        className="text-red-600 hover:text-red-800 text-sm"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {stocks.length > 0 && (
              <tfoot className="bg-gray-50 font-semibold">
                {(() => {
                  // Totals omit any holding with "Exclude" checked (separate from Skip Update,
                  // which only suppresses the price fetch)
                  const totals = stocks.reduce((acc, stock) => {
                    if (stock.excludeFromTotals) return acc;

                    const lots = Array.isArray(stock.lots) ? stock.lots : [];
                    let totalCost, totalValue;

                    if (stock.useLotTracking && lots.length > 0) {
                      const totalShares = lots.reduce((sum, lot) => sum + (lot.quantity || 0), 0);
                      totalCost = lots.reduce((sum, lot) => sum + (lot.totalCostBasis || 0), 0);
                      totalValue = totalShares * (stock.currentPrice || 0);
                    } else {
                      totalCost = (stock.shares || 0) * (stock.costBasis || 0);
                      totalValue = (stock.shares || 0) * (stock.currentPrice || 0);
                    }

                    return { cost: acc.cost + totalCost, value: acc.value + totalValue };
                  }, { cost: 0, value: 0 });

                  const totalGain = totals.value - totals.cost;
                  const gainPercentage = totals.cost > 0 ? ((totalGain / totals.cost) * 100) : 0;

                  return (
                    <tr>
                      {/* Shares Owned and Avg Cost/Share are left blank on purpose:
                          shares of different stocks are not the same unit, so neither
                          a sum nor an average across them means anything. */}
                      <td className="px-3 py-2" colSpan="5">Total</td>
                      <td className="px-3 py-2">
                        ${Math.round(totals.value).toLocaleString()}
                      </td>
                      <td className={`px-3 py-2 ${totalGain >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        ${Math.round(totalGain).toLocaleString()}
                      </td>
                      <td className={`px-3 py-2 ${gainPercentage >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {gainPercentage.toFixed(2)}%
                      </td>
                      {/* Skip Update, Exclude, Actions */}
                      <td className="px-3 py-2" colSpan="3"></td>
                    </tr>
                  );
                })()}
              </tfoot>
            )}
          </table>
        </div>

        {stocks.length === 0 && (
          <p className="text-center text-gray-500 py-4">No stocks added yet. Click "Add Stock" to get started.</p>
        )}

        {/* Debug Log - HIDDEN */}
        {/* {debugLog.length > 0 && (
          <div className="mt-4 p-4 bg-gray-100 rounded-md">
            <h3 className="font-semibold text-sm mb-2">Debug Log:</h3>
            <div className="text-xs space-y-1 max-h-40 overflow-y-auto font-mono">
              {debugLog.map((log, idx) => (
                <div key={idx} className="text-gray-700">{log}</div>
              ))}
            </div>
            <button
              onClick={() => setDebugLog([])}
              className="mt-2 text-xs text-blue-600 hover:underline"
            >
              Clear Log
            </button>
          </div>
        )} */}
      </div>

      {/* Crypto Portfolio */}
      <div className="bg-white rounded-lg shadow p-6 mb-6 pdf-section pdf-detail-only">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-gray-800">Cryptocurrency Holdings</h2>
          {crypto.length < 12 && (
            <button
              onClick={addCrypto}
              className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700"
            >
              Add Crypto
            </button>
          )}
        </div>
        
        <p className="text-xs text-gray-600 mb-3">
          Track your cryptocurrency holdings. Crypto gains/losses are taxed as capital gains.
        </p>
        
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Lot Tracking</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Crypto Name</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Units Owned</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Avg Cost Basis/Unit</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Current Price</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Total Value</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Total Gain</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Gain %</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Exclude</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {crypto.map((cryptoAsset, index) => {
                // Calculate rolled-up values from lots if lot tracking is enabled
                let totalUnits, avgCostBasis, totalCost, totalValue, totalGain, gainPercentage;

                // Ensure lots is an array
                const lots = Array.isArray(cryptoAsset.lots) ? cryptoAsset.lots : [];

                if (cryptoAsset.useLotTracking && lots.length > 0) {
                  // Roll up from lots
                  totalUnits = lots.reduce((sum, lot) => sum + (lot.quantity || 0), 0);
                  totalCost = lots.reduce((sum, lot) => sum + (lot.totalCostBasis || 0), 0);
                  avgCostBasis = totalUnits > 0 ? totalCost / totalUnits : 0;
                  // Ensure avgCostBasis always shows 2 decimal places
                  avgCostBasis = parseFloat(avgCostBasis.toFixed(2));
                  totalValue = totalUnits * (cryptoAsset.currentPrice || 0);
                  totalGain = totalValue - totalCost;
                  gainPercentage = totalCost > 0 ? ((totalGain / totalCost) * 100) : 0;
                } else {
                  // Use legacy simple values
                  totalUnits = cryptoAsset.units || 0;
                  avgCostBasis = cryptoAsset.costBasis || 0;
                  totalValue = (cryptoAsset.units || 0) * (cryptoAsset.currentPrice || 0);
                  totalCost = (cryptoAsset.units || 0) * (cryptoAsset.costBasis || 0);
                  totalGain = totalValue - totalCost;
                  gainPercentage = totalCost > 0 ? ((totalGain / totalCost) * 100) : 0;
                }
                
                return (
                  <tr key={index}>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={cryptoAsset.useLotTracking || false}
                        onChange={(e) => toggleLotTracking(index, e.target.checked, 'crypto')}
                        className="w-4 h-4 cursor-pointer"
                        title="Enable lot tracking"
                      />
                      {cryptoAsset.useLotTracking && (
                        <button
                          onClick={() => openLotModal(index, 'crypto', cryptoAsset.name)}
                          className="ml-2 text-xs text-blue-600 hover:text-blue-800 underline whitespace-nowrap"
                        >
                          Manage Lots ({lots.length})
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={cryptoAsset.name}
                        onChange={(e) => updateCrypto(index, 'name', e.target.value)}
                        className="w-full px-2 py-1 border border-gray-300 rounded"
                        placeholder="BTC, ETH, etc."
                      />
                    </td>
                    <td className="px-3 py-2">
                      {cryptoAsset.useLotTracking ? (
                        <div className="text-sm font-medium text-gray-700 bg-gray-100 px-2 py-1 rounded w-24">
                          {totalUnits.toFixed(4)}
                        </div>
                      ) : (
                        <PriceInput
                          value={cryptoAsset.units || 0}
                          onChange={(newVal) => updateCrypto(index, 'units', newVal)}
                          decimals={6}
                          step={0.0001}
                        />
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {cryptoAsset.useLotTracking ? (
                        <div className="text-sm font-medium text-gray-700 bg-gray-100 px-2 py-1 rounded w-24">
                          ${avgCostBasis.toFixed(2)}
                        </div>
                      ) : (
                        <PriceInput
                          value={cryptoAsset.costBasis || 0}
                          onChange={(newVal) => updateCrypto(index, 'costBasis', newVal)}
                        />
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <PriceInput
                        value={cryptoAsset.currentPrice || 0}
                        onChange={(newVal) => updateCrypto(index, 'currentPrice', newVal)}
                        showDollarSign
                      />
                    </td>
                    <td className="px-3 py-2 font-medium">
                      ${totalValue.toLocaleString()}
                    </td>
                    <td className={`px-3 py-2 font-medium ${totalGain >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      ${totalGain.toLocaleString()}
                    </td>
                    <td className={`px-3 py-2 font-medium ${gainPercentage >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {gainPercentage.toFixed(2)}%
                    </td>
                    <td className="px-3 py-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={cryptoAsset.excludeFromTotals || false}
                          onChange={(e) => updateCrypto(index, 'excludeFromTotals', e.target.checked)}
                          className="rounded"
                        />
                      </label>
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => removeCrypto(index)}
                        className="text-red-600 hover:text-red-800 text-sm"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {crypto.length > 0 && (
              <tfoot className="bg-gray-50 font-semibold">
                {(() => {
                  // Totals omit any holding with "Exclude" checked
                  const totals = crypto.reduce((acc, cryptoAsset) => {
                    if (cryptoAsset.excludeFromTotals) return acc;

                    const lots = Array.isArray(cryptoAsset.lots) ? cryptoAsset.lots : [];
                    let totalCost, totalValue;

                    if (cryptoAsset.useLotTracking && lots.length > 0) {
                      const totalUnits = lots.reduce((sum, lot) => sum + (lot.quantity || 0), 0);
                      totalCost = lots.reduce((sum, lot) => sum + (lot.totalCostBasis || 0), 0);
                      totalValue = totalUnits * (cryptoAsset.currentPrice || 0);
                    } else {
                      totalCost = (cryptoAsset.units || 0) * (cryptoAsset.costBasis || 0);
                      totalValue = (cryptoAsset.units || 0) * (cryptoAsset.currentPrice || 0);
                    }

                    return { cost: acc.cost + totalCost, value: acc.value + totalValue };
                  }, { cost: 0, value: 0 });

                  const totalGain = totals.value - totals.cost;
                  const gainPercentage = totals.cost > 0 ? ((totalGain / totals.cost) * 100) : 0;

                  return (
                    <tr>
                      {/* Units Owned and Avg Cost Basis/Unit are left blank on purpose:
                          units of different coins are not the same unit, so neither
                          a sum nor an average across them means anything. */}
                      <td className="px-3 py-2" colSpan="5">Total</td>
                      <td className="px-3 py-2">
                        ${totals.value.toLocaleString()}
                      </td>
                      <td className={`px-3 py-2 ${totalGain >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        ${totalGain.toLocaleString()}
                      </td>
                      <td className={`px-3 py-2 ${gainPercentage >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {gainPercentage.toFixed(2)}%
                      </td>
                      <td className="px-3 py-2" colSpan="2"></td>
                    </tr>
                  );
                })()}
              </tfoot>
            )}
          </table>
        </div>

        {crypto.length === 0 && (
          <p className="text-center text-gray-500 py-4">No crypto added yet. Click "Add Crypto" to get started.</p>
        )}
      </div>

      {/* Precious Metals Portfolio */}
      <div className="bg-white rounded-lg shadow p-6 mb-6 pdf-section pdf-detail-only">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-gray-800">Precious Metals Holdings</h2>
          {metals.length < 12 && (
            <button
              onClick={addMetal}
              className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700"
            >
              Add Metal
            </button>
          )}
        </div>
        
        <p className="text-xs text-gray-600 mb-3">
          Track your precious metals (gold, silver, platinum, etc.). Note: Collectibles may be taxed at 28% federally, but this tool uses 15% for simplification.
        </p>
        
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Lot Tracking</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Metal Type</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Units (oz)</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Avg Cost Basis/oz</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Current Price/oz</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Total Value</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Total Gain</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Gain %</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Exclude</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {metals.map((metal, index) => {
                // Calculate rolled-up values from lots if lot tracking is enabled
                let totalUnits, avgCostBasis, totalCost, totalValue, totalGain, gainPercentage;

                // Ensure lots is an array
                const lots = Array.isArray(metal.lots) ? metal.lots : [];

                if (metal.useLotTracking && lots.length > 0) {
                  // Roll up from lots
                  totalUnits = lots.reduce((sum, lot) => sum + (lot.quantity || 0), 0);
                  totalCost = lots.reduce((sum, lot) => sum + (lot.totalCostBasis || 0), 0);
                  avgCostBasis = totalUnits > 0 ? totalCost / totalUnits : 0;
                  // Ensure avgCostBasis always shows 2 decimal places
                  avgCostBasis = parseFloat(avgCostBasis.toFixed(2));
                  totalValue = totalUnits * (metal.currentPrice || 0);
                  totalGain = totalValue - totalCost;
                  gainPercentage = totalCost > 0 ? ((totalGain / totalCost) * 100) : 0;
                } else {
                  // Use legacy simple values
                  totalUnits = metal.units || 0;
                  avgCostBasis = metal.costBasis || 0;
                  totalValue = (metal.units || 0) * (metal.currentPrice || 0);
                  totalCost = (metal.units || 0) * (metal.costBasis || 0);
                  totalGain = totalValue - totalCost;
                  gainPercentage = totalCost > 0 ? ((totalGain / totalCost) * 100) : 0;
                }
                
                return (
                  <tr key={index}>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={metal.useLotTracking || false}
                        onChange={(e) => toggleLotTracking(index, e.target.checked, 'metals')}
                        className="w-4 h-4 cursor-pointer"
                        title="Enable lot tracking"
                      />
                      {metal.useLotTracking && (
                        <button
                          onClick={() => openLotModal(index, 'metals', metal.name)}
                          className="ml-2 text-xs text-blue-600 hover:text-blue-800 underline whitespace-nowrap"
                        >
                          Manage Lots ({lots.length})
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={metal.name}
                        onChange={(e) => updateMetal(index, 'name', e.target.value)}
                        className="w-full px-2 py-1 border border-gray-300 rounded"
                        placeholder="Gold, Silver, etc."
                      />
                    </td>
                    <td className="px-3 py-2">
                      {metal.useLotTracking ? (
                        <div className="text-sm font-medium text-gray-700 bg-gray-100 px-2 py-1 rounded w-24">
                          {totalUnits.toFixed(2)}
                        </div>
                      ) : (
                        <PriceInput
                          value={metal.units || 0}
                          onChange={(newVal) => updateMetal(index, 'units', newVal)}
                        />
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {metal.useLotTracking ? (
                        <div className="text-sm font-medium text-gray-700 bg-gray-100 px-2 py-1 rounded w-24">
                          ${avgCostBasis.toFixed(2)}
                        </div>
                      ) : (
                        <PriceInput
                          value={metal.costBasis || 0}
                          onChange={(newVal) => updateMetal(index, 'costBasis', newVal)}
                        />
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <PriceInput
                        value={metal.currentPrice || 0}
                        onChange={(newVal) => updateMetal(index, 'currentPrice', newVal)}
                        showDollarSign
                      />
                    </td>
                    <td className="px-3 py-2 font-medium">
                      ${totalValue.toLocaleString()}
                    </td>
                    <td className={`px-3 py-2 font-medium ${totalGain >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      ${totalGain.toLocaleString()}
                    </td>
                    <td className={`px-3 py-2 font-medium ${gainPercentage >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {gainPercentage.toFixed(2)}%
                    </td>
                    <td className="px-3 py-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={metal.excludeFromTotals || false}
                          onChange={(e) => updateMetal(index, 'excludeFromTotals', e.target.checked)}
                          className="rounded"
                        />
                      </label>
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => removeMetal(index)}
                        className="text-red-600 hover:text-red-800 text-sm"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {metals.length > 0 && (
              <tfoot className="bg-gray-50 font-semibold">
                {(() => {
                  // Totals omit any holding with "Exclude" checked
                  const totals = metals.reduce((acc, metal) => {
                    if (metal.excludeFromTotals) return acc;

                    const lots = Array.isArray(metal.lots) ? metal.lots : [];
                    let totalCost, totalValue;

                    if (metal.useLotTracking && lots.length > 0) {
                      const totalUnits = lots.reduce((sum, lot) => sum + (lot.quantity || 0), 0);
                      totalCost = lots.reduce((sum, lot) => sum + (lot.totalCostBasis || 0), 0);
                      totalValue = totalUnits * (metal.currentPrice || 0);
                    } else {
                      totalCost = (metal.units || 0) * (metal.costBasis || 0);
                      totalValue = (metal.units || 0) * (metal.currentPrice || 0);
                    }

                    return { cost: acc.cost + totalCost, value: acc.value + totalValue };
                  }, { cost: 0, value: 0 });

                  const totalGain = totals.value - totals.cost;
                  const gainPercentage = totals.cost > 0 ? ((totalGain / totals.cost) * 100) : 0;

                  return (
                    <tr>
                      {/* Units (oz) and Avg Cost Basis/oz are left blank on purpose:
                          an ounce of gold and an ounce of silver are not the same unit,
                          so neither a sum nor an average across them means anything. */}
                      <td className="px-3 py-2" colSpan="5">Total</td>
                      <td className="px-3 py-2">
                        ${totals.value.toLocaleString()}
                      </td>
                      <td className={`px-3 py-2 ${totalGain >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        ${totalGain.toLocaleString()}
                      </td>
                      <td className={`px-3 py-2 ${gainPercentage >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {gainPercentage.toFixed(2)}%
                      </td>
                      <td className="px-3 py-2" colSpan="2"></td>
                    </tr>
                  );
                })()}
              </tfoot>
            )}
          </table>
        </div>

        {metals.length === 0 && (
          <p className="text-center text-gray-500 py-4">No metals added yet. Click "Add Metal" to get started.</p>
        )}
      </div>

      {/* Withdrawal Planning */}
      <div className="bg-white rounded-lg shadow p-6 mb-6 pdf-section pdf-detail-only">
        <h2 className="text-lg font-semibold mb-4 text-gray-800 flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-green-600" />
          Plan Your Withdrawals
        </h2>
        
        {/* Crypto Sales */}
        {crypto.length > 0 && (
          <div className="mb-6">
            <h3 className="font-medium text-gray-700 mb-3">Cryptocurrency Sales</h3>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {crypto.map((cryptoAsset, index) => {
                // Calculate total units from lots if lot tracking is enabled
                const lots = Array.isArray(cryptoAsset.lots) ? cryptoAsset.lots : [];
                const maxUnits = (cryptoAsset.useLotTracking && lots.length > 0)
                  ? lots.reduce((sum, lot) => sum + (lot.quantity || 0), 0)
                  : (cryptoAsset.units || 0);

                const unitsToSell = getCryptoSale(cryptoAsset.name);
                const strategy = getCryptoStrategy(cryptoAsset.name);

                // Route through selectLots like the stock and metal cards do. This
                // card used to apply the legacy units x (price - costBasis) formula
                // directly, which ignored lot tracking entirely -- so for a
                // lot-tracked holding it disagreed with the tax summary, which has
                // always gone through selectLots.
                const lotSelection = selectLots(cryptoAsset, unitsToSell, strategy);
                const proceeds = lotSelection.totalProceeds;
                const gain = lotSelection.totalGains;
                const shortTermGains = lotSelection.shortTermGains;
                const longTermGains = lotSelection.longTermGains;

                return (
                  <div key={index} className="border border-gray-200 rounded-md p-3">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {cryptoAsset.name} <span className="text-xs text-gray-500">(Max: {maxUnits} units)</span>
                    </label>
                    <input
                      type="number"
                      value={unitsToSell}
                      onChange={(e) => updateCryptoSale(cryptoAsset.name, e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md mb-2"
                      max={maxUnits}
                    />
                    {lotSelection.requestedQuantity > lotSelection.quantitySold && (
                      <div className="mb-2 px-2 py-1 bg-amber-50 border border-amber-300 rounded text-xs text-amber-800">
                        You only hold {maxUnits.toLocaleString(undefined, {maximumFractionDigits: 6})} units.
                        Figures below use {lotSelection.quantitySold.toLocaleString(undefined, {maximumFractionDigits: 6})}, not the {lotSelection.requestedQuantity.toLocaleString(undefined, {maximumFractionDigits: 6})} entered.
                      </div>
                    )}
                    {/* Strategy selector - only show if lot tracking is enabled */}
                    {cryptoAsset.useLotTracking && lots.length > 0 && unitsToSell > 0 && (
                      <select
                        value={strategy}
                        onChange={(e) => updateCryptoStrategy(cryptoAsset.name, e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md mb-2 text-sm"
                      >
                        <option value="HIFO">HIFO (Highest Cost First)</option>
                        <option value="FIFO">FIFO (First In First Out)</option>
                        <option value="LIFO">LIFO (Last In First Out)</option>
                        <option value="TAX_OPTIMIZED">Tax Optimized (Losses, then Long-Term)</option>
                      </select>
                    )}

                    {unitsToSell > 0 && (
                      <div className="text-xs space-y-1">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Proceeds:</span>
                          <span className="font-medium">${proceeds.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                        </div>

                        {/* Show breakdown if lot tracking is enabled */}
                        {cryptoAsset.useLotTracking && lots.length > 0 ? (
                          <>
                            <div className="flex justify-between">
                              <span className="text-gray-600">Short-term gain:</span>
                              <span className={`font-medium ${shortTermGains >= 0 ? 'text-orange-600' : 'text-red-600'}`}>
                                ${shortTermGains.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600">Long-term gain:</span>
                              <span className={`font-medium ${longTermGains >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                ${longTermGains.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                              </span>
                            </div>
                            <div className="flex justify-between font-semibold border-t pt-1">
                              <span className="text-gray-700">Total gain:</span>
                              <span className={gain >= 0 ? 'text-green-600' : 'text-red-600'}>
                                ${gain.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                              </span>
                            </div>
                          </>
                        ) : (
                          <div className="flex justify-between">
                            <span className="text-gray-600">Gain:</span>
                            <span className={`font-medium ${gain >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              ${gain.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Precious Metals Sales */}
        {metals.length > 0 && (
          <div className="mb-6">
            <h3 className="font-medium text-gray-700 mb-3">Precious Metals Sales</h3>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {metals.map((metal, index) => {
                const unitsToSell = getMetalSale(metal.name);
                const strategy = getMetalStrategy(metal.name);

                // Calculate lot-based gains if lot tracking is enabled
                const lotSelection = selectLots(metal, unitsToSell, strategy);
                const proceeds = lotSelection.totalProceeds;
                const totalGain = lotSelection.totalGains;
                const shortTermGains = lotSelection.shortTermGains;
                const longTermGains = lotSelection.longTermGains;

                // Calculate total units from lots if lot tracking is enabled
                const lots = Array.isArray(metal.lots) ? metal.lots : [];
                const maxUnits = (metal.useLotTracking && lots.length > 0)
                  ? lots.reduce((sum, lot) => sum + (lot.quantity || 0), 0)
                  : (metal.units || 0);

                return (
                  <div key={index} className="border border-gray-200 rounded-md p-3">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {metal.name} <span className="text-xs text-gray-500">(Max: {maxUnits} oz)</span>
                    </label>
                    <input
                      type="number"
                      value={unitsToSell}
                      onChange={(e) => updateMetalSale(metal.name, e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md mb-2"
                      max={maxUnits}
                      placeholder="Units to sell"
                    />
                    {lotSelection.requestedQuantity > lotSelection.quantitySold && (
                      <div className="mb-2 px-2 py-1 bg-amber-50 border border-amber-300 rounded text-xs text-amber-800">
                        You only hold {maxUnits.toLocaleString(undefined, {maximumFractionDigits: 2})} oz.
                        Figures below use {lotSelection.quantitySold.toLocaleString(undefined, {maximumFractionDigits: 2})}, not the {lotSelection.requestedQuantity.toLocaleString(undefined, {maximumFractionDigits: 2})} entered.
                      </div>
                    )}

                    {/* Strategy selector - only show if lot tracking is enabled */}
                    {metal.useLotTracking && lots.length > 0 && unitsToSell > 0 && (
                      <select
                        value={strategy}
                        onChange={(e) => updateMetalStrategy(metal.name, e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md mb-2 text-sm"
                      >
                        <option value="HIFO">HIFO (Highest Cost First)</option>
                        <option value="FIFO">FIFO (First In First Out)</option>
                        <option value="LIFO">LIFO (Last In First Out)</option>
                        <option value="TAX_OPTIMIZED">Tax Optimized (Losses, then Long-Term)</option>
                      </select>
                    )}

                    {unitsToSell > 0 && (
                      <div className="text-xs space-y-1">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Proceeds:</span>
                          <span className="font-medium">${proceeds.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Gain:</span>
                          <span className={`font-medium ${totalGain >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            ${totalGain.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                          </span>
                        </div>
                        {metal.useLotTracking && lots.length > 0 && (
                          <>
                            <div className="flex justify-between text-gray-500">
                              <span>Short-term:</span>
                              <span>${shortTermGains.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                            </div>
                            <div className="flex justify-between text-gray-500">
                              <span>Long-term:</span>
                              <span>${longTermGains.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        
        {/* Stock Sales */}
        {stocks.length > 0 && (
          <div className="mb-6">
            <h3 className="font-medium text-gray-700 mb-3">Stock Sales</h3>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {stocks.map((stock, index) => {
                const sharesToSell = getStockWithdrawal(stock.name);
                const strategy = getStockStrategy(stock.name);

                // Calculate lot-based gains if lot tracking is enabled
                const lotSelection = selectLots(stock, sharesToSell, strategy);
                const proceeds = lotSelection.totalProceeds;
                const totalGain = lotSelection.totalGains;
                const shortTermGains = lotSelection.shortTermGains;
                const longTermGains = lotSelection.longTermGains;

                // Calculate max shares (from lots if enabled, else from simple value)
                const lots = Array.isArray(stock.lots) ? stock.lots : [];
                const maxShares = stock.useLotTracking && lots.length > 0
                  ? lots.reduce((sum, lot) => sum + (lot.quantity || 0), 0)
                  : (stock.shares || 0);

                return (
                  <div key={index} className="border border-gray-200 rounded-md p-3">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {stock.name} <span className="text-xs text-gray-500">(Max: {maxShares} shares)</span>
                    </label>
                    <input
                      type="number"
                      value={sharesToSell}
                      onChange={(e) => updateStockWithdrawal(stock.name, e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md mb-2"
                      max={maxShares}
                      placeholder="Shares to sell"
                    />
                    {lotSelection.requestedQuantity > lotSelection.quantitySold && (
                      <div className="mb-2 px-2 py-1 bg-amber-50 border border-amber-300 rounded text-xs text-amber-800">
                        You only hold {maxShares.toLocaleString(undefined, {maximumFractionDigits: 0})} shares.
                        Figures below use {lotSelection.quantitySold.toLocaleString(undefined, {maximumFractionDigits: 0})}, not the {lotSelection.requestedQuantity.toLocaleString(undefined, {maximumFractionDigits: 0})} entered.
                      </div>
                    )}

                    {/* Strategy selector - only show if lot tracking is enabled */}
                    {stock.useLotTracking && lots.length > 0 && sharesToSell > 0 && (
                      <select
                        value={strategy}
                        onChange={(e) => updateStockStrategy(stock.name, e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md mb-2 text-sm"
                      >
                        <option value="HIFO">HIFO (Highest Cost First)</option>
                        <option value="FIFO">FIFO (First In First Out)</option>
                        <option value="LIFO">LIFO (Last In First Out)</option>
                        <option value="TAX_OPTIMIZED">Tax Optimized (Losses, then Long-Term)</option>
                      </select>
                    )}

                    {sharesToSell > 0 && (
                      <div className="text-xs space-y-1">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Proceeds:</span>
                          <span className="font-medium">${proceeds.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                        </div>

                        {/* Show breakdown if lot tracking is enabled */}
                        {stock.useLotTracking && lots.length > 0 ? (
                          <>
                            <div className="flex justify-between">
                              <span className="text-gray-600">Short-term gain:</span>
                              <span className={`font-medium ${shortTermGains >= 0 ? 'text-orange-600' : 'text-red-600'}`}>
                                ${shortTermGains.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600">Long-term gain:</span>
                              <span className={`font-medium ${longTermGains >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                ${longTermGains.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                              </span>
                            </div>
                            <div className="flex justify-between font-semibold border-t pt-1">
                              <span className="text-gray-700">Total gain:</span>
                              <span className={totalGain >= 0 ? 'text-green-600' : 'text-red-600'}>
                                ${totalGain.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                              </span>
                            </div>
                          </>
                        ) : (
                          <div className="flex justify-between">
                            <span className="text-gray-600">Gain:</span>
                            <span className={`font-medium ${totalGain >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              ${totalGain.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Retirement & Savings Account Withdrawals + Roth Conversion */}
      <div className="bg-white rounded-lg shadow p-6 mb-6 pdf-section pdf-detail-only">
        <h2 className="text-lg font-semibold mb-4 text-gray-800 flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-blue-600" />
          Retirement & Savings Account Withdrawals
        </h2>
        <h3 className="font-medium text-gray-700 mb-3">Account Withdrawals</h3>
        <div className="grid md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Savings <span className="text-xs text-green-600">(Tax-Free)</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-gray-500">$</span>
              <input
                type="text"
                value={getActiveScenario().withdrawals.savings.toLocaleString()}
                onChange={(e) => updateWithdrawal('savings', e.target.value.replace(/,/g, ''))}
                className="w-full pl-7 px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Traditional IRA <span className="text-xs text-red-600">(Ordinary Income)</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-gray-500">$</span>
              <input
                type="text"
                value={getActiveScenario().withdrawals.traditionalIRA.toLocaleString()}
                onChange={(e) => updateWithdrawal('traditionalIRA', e.target.value.replace(/,/g, ''))}
                className="w-full pl-7 px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Roth IRA <span className="text-xs text-green-600">(Tax-Free)</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-gray-500">$</span>
              <input
                type="text"
                value={getActiveScenario().withdrawals.rothIRA.toLocaleString()}
                onChange={(e) => updateWithdrawal('rothIRA', e.target.value.replace(/,/g, ''))}
                className="w-full pl-7 px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Traditional 401(k) <span className="text-xs text-red-600">(Ordinary Income)</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-gray-500">$</span>
              <input
                type="text"
                value={getActiveScenario().withdrawals.traditional401k.toLocaleString()}
                onChange={(e) => updateWithdrawal('traditional401k', e.target.value.replace(/,/g, ''))}
                className="w-full pl-7 px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Roth 401(k) <span className="text-xs text-green-600">(Tax-Free)</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-gray-500">$</span>
              <input
                type="text"
                value={getActiveScenario().withdrawals.roth401k.toLocaleString()}
                onChange={(e) => updateWithdrawal('roth401k', e.target.value.replace(/,/g, ''))}
                className="w-full pl-7 px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
          </div>
        </div>

        {/* Roth Conversion */}
        <div className="mt-6">
          <h3 className="font-medium text-gray-700 mb-2 flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-indigo-600" />
            Roth Conversion Planning
          </h3>
          <p className="text-xs text-gray-600 mb-3">
            Convert Traditional IRA/401(k) funds to Roth. You'll pay tax now, but future growth and withdrawals will be tax-free.
          </p>

          {/* Optimization Strategy Selector */}
          <div className="mb-4 pb-4 border-b border-indigo-200">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Optimization Strategy:
            </label>
            <div className="space-y-2">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="rothStrategy"
                  value="conservative"
                  checked={rothOptimizationStrategy === 'conservative'}
                  onChange={(e) => setRothOptimizationStrategy(e.target.value)}
                  className="mt-1"
                />
                <div className="flex-1">
                  <div className="text-sm font-medium text-gray-800">Conservative - Stay in Current Tax Bracket</div>
                  <div className="text-xs text-gray-600">Maximize conversion without jumping to the next tax bracket</div>
                </div>
              </label>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="rothStrategy"
                  value="irmaa"
                  checked={rothOptimizationStrategy === 'irmaa'}
                  onChange={(e) => setRothOptimizationStrategy(e.target.value)}
                  className="mt-1"
                />
                <div className="flex-1">
                  <div className="text-sm font-medium text-gray-800">Moderate - Optimize for IRMAA (Recommended)</div>
                  <div className="text-xs text-gray-600">Maximize conversion up to IRMAA threshold, even if crossing tax bracket</div>
                </div>
              </label>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="rothStrategy"
                  value="aggressive"
                  checked={rothOptimizationStrategy === 'aggressive'}
                  onChange={(e) => setRothOptimizationStrategy(e.target.value)}
                  className="mt-1"
                />
                <div className="flex-1">
                  <div className="text-sm font-medium text-gray-800">Aggressive - Maximize Conversion</div>
                  <div className="text-xs text-gray-600">Fill to the top of the next IRMAA bracket, accepting one IRMAA tier increase for maximum long-term Roth growth</div>
                </div>
              </label>
            </div>

            {/* IRMAA Buffer */}
            <div className="mt-3">
              <label className="block text-xs font-medium text-gray-700 mb-1">
                IRMAA Safety Buffer ({IRMAA_PROJECTED ? `${IRMAA_PROJECTION_YEARS}-year projection uncertainty` : 'published table, little uncertainty'}):
              </label>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <span className="absolute left-2 top-0.5 text-gray-500 text-xs">$</span>
                  <input
                    type="text"
                    value={irmaaBuffer.toLocaleString()}
                    onChange={(e) => setIrmaaBuffer(parseFloat(e.target.value.replace(/,/g, '')) || 0)}
                    className="w-32 pl-5 px-2 py-1 border border-gray-300 rounded text-sm"
                  />
                </div>
                <span className="text-xs text-gray-600">Reduce suggested amount by this buffer to account for IRMAA bracket inflation uncertainty</span>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Roth Conversion Amount <span className="text-xs text-orange-600">(Taxed as Ordinary Income)</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-gray-500">$</span>
              <input
                type="text"
                value={(getActiveScenario().rothConversion || 0).toLocaleString()}
                onChange={(e) => updateActiveScenario({ rothConversion: parseFloat(e.target.value.replace(/,/g, '')) || 0 })}
                className="w-full pl-7 px-3 py-2 border border-indigo-300 rounded-md focus:ring-2 focus:ring-indigo-500"
                placeholder="Enter amount to convert"
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Max available: ${(accounts.traditionalIRA + accounts.traditional401k).toLocaleString()}
            </p>
          </div>

          {/* Smart Optimizer */}
          {(() => {
            // Calculate baseline scenario without conversion
            const baselineScenario = { ...getActiveScenario(), rothConversion: 0 };
            const baselineResults = calculateScenario(baselineScenario);

            // Calculate constraints with IRMAA buffer applied
            const taxBracketRoom = baselineResults.roomInBracket > 0 ? baselineResults.roomInBracket : 0;
            const irmaaRoomRaw = baselineResults.roomToNextIRMAABracket > 0 ? baselineResults.roomToNextIRMAABracket : 0;
            const irmaaRoom = Math.max(0, irmaaRoomRaw - irmaaBuffer); // Apply buffer
            const niitRoom = baselineResults.magi < baselineResults.niitThreshold
              ? baselineResults.niitThreshold - baselineResults.magi
              : 0;

            // Find next IRMAA bracket threshold for aggressive mode
            const irmaaBrackets = irmaaBracketsFor(irmaaFilingStatus);
            let roomToNextIRMAABracket = 0;
            if (baselineResults.currentIRMAABracket) {
              const currentIndex = irmaaBrackets.findIndex(b => b.magi === baselineResults.currentIRMAABracket.magi);
              if (currentIndex >= 0 && currentIndex < irmaaBrackets.length - 1) {
                // Find the next IRMAA bracket threshold (one bracket up)
                const nextBracket = irmaaBrackets[currentIndex + 1];
                if (nextBracket.magiMax !== Infinity) {
                  roomToNextIRMAABracket = Math.max(0, nextBracket.magiMax - baselineResults.magi - irmaaBuffer);
                } else {
                  // The bracket above is the top one, so there is no IRMAA ceiling
                  // beyond it. Represent that as Infinity rather than a magic
                  // 1000000, which the guard below used to exclude -- silently
                  // turning Aggressive into the Moderate answer while the panel
                  // still advertised "$1,000,000" of room.
                  roomToNextIRMAABracket = Infinity;
                }
              }
            }

            // Determine the limiting factor and optimal amount based on strategy
            let optimalAmount = 0;
            let limitingFactor = '';
            let reason = '';

            if (rothOptimizationStrategy === 'conservative') {
              // Conservative: Stay in current tax bracket
              if (taxBracketRoom > 0) {
                optimalAmount = Math.floor(taxBracketRoom);
                limitingFactor = 'Tax Bracket';
                reason = `Fills your ${(baselineResults.currentBracket.rate * 100)}% tax bracket without jumping to the next bracket.`;
              }
            } else if (rothOptimizationStrategy === 'irmaa') {
              // Moderate: Optimize for IRMAA (can cross tax bracket)
              if (irmaaRoom > 0) {
                optimalAmount = Math.floor(irmaaRoom);
                limitingFactor = 'IRMAA Threshold';
                reason = `Maximizes conversion up to IRMAA threshold (with $${irmaaBuffer.toLocaleString()} buffer), even if crossing tax brackets.`;
              } else if (taxBracketRoom > 0) {
                // Fallback to tax bracket if at IRMAA limit
                optimalAmount = Math.floor(taxBracketRoom);
                limitingFactor = 'Tax Bracket';
                reason = 'Already at IRMAA threshold. Fills current tax bracket instead.';
              }
            } else if (rothOptimizationStrategy === 'aggressive') {
              // Aggressive: Maximize conversion up to next IRMAA bracket threshold
              if (Number.isFinite(roomToNextIRMAABracket) && roomToNextIRMAABracket > 0) {
                optimalAmount = Math.floor(roomToNextIRMAABracket);
                limitingFactor = 'Next IRMAA Bracket Threshold';
                reason = `Maximizes conversion by filling to the top of the NEXT IRMAA bracket (with $${irmaaBuffer.toLocaleString()} buffer). Accepts crossing current IRMAA threshold for maximum Roth conversion.`;
              } else if (!Number.isFinite(roomToNextIRMAABracket) && taxBracketRoom > 0) {
                // No IRMAA bracket above this one, so IRMAA imposes no ceiling and
                // the tax bracket is the only remaining limit.
                optimalAmount = Math.floor(taxBracketRoom);
                limitingFactor = 'Tax Bracket';
                reason = 'There is no IRMAA bracket above your current one, so IRMAA sets no upper limit. Fills your current tax bracket instead.';
              } else if (irmaaRoom > 0) {
                // Fallback to current IRMAA room
                optimalAmount = Math.floor(irmaaRoom);
                limitingFactor = 'Current IRMAA Threshold';
                reason = `Filling to current IRMAA threshold (with $${irmaaBuffer.toLocaleString()} buffer). Already in highest or near-highest IRMAA bracket.`;
              } else if (taxBracketRoom > 0) {
                // Last fallback
                optimalAmount = Math.floor(taxBracketRoom);
                limitingFactor = 'Tax Bracket';
                reason = 'Already at IRMAA limits. Fills current tax bracket.';
              }
            }

            // Cap at available funds
            const maxAvailable = accounts.traditionalIRA + accounts.traditional401k;
            if (optimalAmount > maxAvailable) {
              optimalAmount = maxAvailable;
              limitingFactor = 'Available Funds';
              reason = 'Limited by available Traditional IRA/401(k) balance.';
            }

            return optimalAmount > 0 ? (
              <div className="mt-4 p-3 bg-green-50 border border-green-300 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-green-900 mb-1">
                      💡 Suggested Optimal Conversion: ${optimalAmount.toLocaleString()}
                    </p>
                    <p className="text-xs text-green-800 mb-2">
                      {reason}
                    </p>
                    <div className="text-xs text-gray-700 mb-2">
                      <strong>Limiting Factor:</strong> {limitingFactor}
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 mb-2">
                      <div>Tax Bracket Room: <strong>${Math.round(taxBracketRoom).toLocaleString()}</strong></div>
                      <div>IRMAA Room (w/ buffer): <strong>${Math.round(irmaaRoom).toLocaleString()}</strong></div>
                      {rothOptimizationStrategy === 'aggressive' && roomToNextIRMAABracket > 0 && (
                        <div className="col-span-2">Room to Next IRMAA Bracket: <strong>{Number.isFinite(roomToNextIRMAABracket)
                          ? `$${Math.round(roomToNextIRMAABracket).toLocaleString()}`
                          : 'No bracket above this one'}</strong></div>
                      )}
                    </div>
                    <button
                      onClick={() => updateActiveScenario({ rothConversion: optimalAmount })}
                      className="mt-2 px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700 transition-colors"
                    >
                      Use Suggested Amount
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-4 p-3 bg-yellow-50 border border-yellow-300 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-yellow-900 mb-1">
                      ⚠️ Limited Conversion Opportunity
                    </p>
                    <p className="text-xs text-yellow-800">
                      {taxBracketRoom <= 0 && 'You\'re at the top of your tax bracket. '}
                      {irmaaRoom <= 0 && 'You\'re at an IRMAA threshold. '}
                      {niitRoom <= 0 && baselineResults.magi >= baselineResults.niitThreshold && 'You\'re above the NIIT threshold. '}
                      Any conversion will push you into higher tax brackets or trigger additional surcharges. Consider converting in a lower-income year.
                    </p>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Only render results sections if we have valid results */}
      {results && (
        <>
      {/* IRMAA Analysis */}
      <div className="bg-white rounded-lg shadow p-6 mb-6 irmaa-status-section pdf-section">
        <h2 className="text-lg font-semibold mb-4 text-gray-800 flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-purple-600" />
          Medicare IRMAA Analysis ({IRMAA_PROJECTED ? 'Projected' : 'Published'} {IRMAA_YEAR} Brackets)
        </h2>

        <div className="mb-4 bg-purple-50 border border-purple-200 rounded-lg p-3">
          <p className="text-sm text-purple-900">
            <strong>{IRMAA_PROJECTED ? 'Projected' : 'Published'} {IRMAA_YEAR} IRMAA Brackets:</strong> {IRMAA_BASIS_TEXT}
            This helps you plan Roth conversions and avoid future Medicare surcharges.{IRMAA_PROJECTED && ` Actual ${IRMAA_YEAR} brackets may differ.`}
          </p>
        </div>

        <p className="text-sm text-gray-600 mb-4">
          Medicare costs include base premiums (everyone pays) plus IRMAA surcharges based on your Modified Adjusted Gross Income (MAGI) from {LOOKBACK_YEARS} years prior. Your {TAX_YEAR} income will determine your {IRMAA_YEAR} Medicare premiums.
        </p>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <h3 className="font-medium text-gray-700 border-b pb-2">
              {results.medicare?.eligible ? 'Medicare Costs' : 'Medicare & IRMAA Projection'}
            </h3>

            {/* Always show MAGI */}
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Your {TAX_YEAR} MAGI:</span>
              <span className="font-bold">${results.magi.toLocaleString(undefined, {maximumFractionDigits: 0})}</span>
            </div>

            {results.medicare?.eligible ? (
              <>
                {/* Base Medicare Premiums */}
                <div className="bg-blue-50 border border-blue-200 rounded-md p-3 space-y-2">
                  <div className="text-xs font-semibold text-blue-800 mb-1">Base Premiums (Everyone Pays)</div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Part B Premium:</span>
                    <span className="font-medium text-blue-700">
                      ${results.medicare.basePremiums.partB.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}/mo
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Part D Premium (est.):</span>
                    <span className="font-medium text-blue-700">
                      ${results.medicare.basePremiums.partD.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}/mo
                    </span>
                  </div>
                </div>

                {/* IRMAA Surcharges */}
                {results.medicare.irmaa.annual > 0 ? (
                  <div className="bg-orange-50 border border-orange-200 rounded-md p-3 space-y-2">
                    <div className="text-xs font-semibold text-orange-800 mb-1">IRMAA Surcharges (Income-Based)</div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Part B Surcharge:</span>
                      <span className="font-medium text-orange-700">
                        +${results.medicare.irmaa.partB.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}/mo
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Part D Surcharge:</span>
                      <span className="font-medium text-orange-700">
                        +${results.medicare.irmaa.partD.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}/mo
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="bg-green-50 border border-green-200 rounded-md p-3">
                    <p className="text-sm text-green-700 font-medium">✓ No IRMAA surcharge - You're below the threshold!</p>
                  </div>
                )}

                {/* Total */}
                <div className="flex justify-between text-sm border-t pt-2">
                  <span className="text-gray-700 font-medium">Total Annual Medicare Cost:</span>
                  <span className="font-bold text-blue-700">
                    ${results.medicare.total.annual.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                  </span>
                </div>

                <div className="bg-yellow-50 border border-yellow-200 rounded-md p-2 mt-2">
                  <p className="text-xs text-yellow-800">
                    <strong>Note:</strong> This is the cost <strong>per person</strong>. {personalInfo.filingStatus !== 'single' && 'For married couples, both spouses would each pay these amounts when Medicare-eligible (typically age 65+).'}
                  </p>
                </div>

                {results.currentIRMAABracket && (
                  <div className="text-xs text-gray-500 mt-2">
                    Current IRMAA Bracket: {results.currentIRMAABracket.description}
                  </div>
                )}
              </>
            ) : (
              <>
                {/* Show projected IRMAA for pre-Medicare age */}
                <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                  <p className="text-sm text-blue-700 mb-2">
                    <strong>Projected at Age 65:</strong> At this income level, your estimated Medicare costs would be:
                  </p>
                  {results.currentIRMAABracket && (
                    <>
                      <div className="text-xs text-gray-600 space-y-1">
                        <div className="flex justify-between">
                          <span>IRMAA Bracket:</span>
                          <span className="font-medium">{results.currentIRMAABracket.description}</span>
                        </div>
                        {results.currentIRMAABracket.partB > 0 ? (
                          <>
                            <div className="flex justify-between text-orange-700">
                              <span>Part B Surcharge:</span>
                              <span className="font-medium">+${results.currentIRMAABracket.partB.toLocaleString(undefined, {minimumFractionDigits: 2})}/mo</span>
                            </div>
                            <div className="flex justify-between text-orange-700">
                              <span>Part D Surcharge:</span>
                              <span className="font-medium">+${results.currentIRMAABracket.partD.toLocaleString(undefined, {minimumFractionDigits: 2})}/mo</span>
                            </div>
                            <div className="flex justify-between pt-1 border-t border-blue-200 font-semibold text-orange-800">
                              <span>Annual IRMAA:</span>
                              <span>${((results.currentIRMAABracket.partB + results.currentIRMAABracket.partD) * 12).toLocaleString(undefined, {maximumFractionDigits: 0})}</span>
                            </div>
                          </>
                        ) : (
                          <div className="text-green-600 font-medium text-sm">
                            ✓ No IRMAA surcharge at this income level
                          </div>
                        )}
                      </div>
                    </>
                  )}
                  <p className="text-xs text-gray-500 mt-2">
                    Medicare eligibility begins at age 65. This projection helps you plan ahead.
                  </p>
                  <p className="text-xs text-yellow-700 mt-2 font-semibold">
                    Note: Costs shown are per person. {personalInfo.filingStatus !== 'single' && 'Married couples would each pay these amounts.'}
                  </p>
                </div>
              </>
            )}
          </div>
          
          <div className="space-y-3">
            <h3 className="font-medium text-gray-700 border-b pb-2">IRMAA Planning</h3>
            {results.currentIRMAABracket && (
              <>
                {results.roomToNextIRMAABracket > 0 ? (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-700 font-medium">Room to Next Bracket:</span>
                      <span className="font-bold text-yellow-700">${results.roomToNextIRMAABracket.toLocaleString(undefined, {maximumFractionDigits: 0})}</span>
                    </div>
                    <p className="text-xs text-gray-600">
                      You can earn up to ${results.roomToNextIRMAABracket.toLocaleString(undefined, {maximumFractionDigits: 0})} more before moving to the next IRMAA bracket.
                    </p>
                  </div>
                ) : (
                  <div className="bg-red-50 border border-red-200 rounded-md p-3">
                    <p className="text-sm text-red-700 font-medium">You're in the highest IRMAA bracket</p>
                  </div>
                )}

                {results.roomToLowerIRMAABracket > 0 && results.currentIRMAABracket.partB > 0 && (
                  <div className="bg-green-50 border border-green-200 rounded-md p-3">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-700 font-medium">To Drop to Lower Bracket:</span>
                      <span className="font-bold text-green-700">Reduce by ${results.roomToLowerIRMAABracket.toLocaleString(undefined, {maximumFractionDigits: 0})}</span>
                    </div>
                    <p className="text-xs text-gray-600">
                      Reducing your MAGI by ${results.roomToLowerIRMAABracket.toLocaleString(undefined, {maximumFractionDigits: 0})} would move you to a lower IRMAA bracket.
                    </p>
                  </div>
                )}

                {results.currentIRMAABracket.partB === 0 && (
                  <div className="bg-green-50 border border-green-200 rounded-md p-3">
                    <p className="text-sm text-green-700 font-medium">✓ No IRMAA surcharge - You're below the threshold!</p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* IRMAA Bracket Breakdown Table */}
        <div className="mt-6">
          <h3 className="font-medium text-gray-700 mb-3">{IRMAA_PROJECTED ? 'Projected' : 'Published'} {IRMAA_YEAR} IRMAA Surcharge Brackets</h3>
          <p className="text-xs text-gray-600 mb-3">
            {IRMAA_PROJECTED ? 'Estimated' : 'Published'} monthly surcharges for {IRMAA_YEAR} Medicare Part B and Part D premiums{IRMAA_PROJECTED ? ` (projected from the ${IRMAA_SOURCE_YEAR} table)` : ''}
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-100 border-b-2 border-gray-300">
                  <th className="text-left p-2 font-semibold text-gray-700">MAGI Range ({FILING_STATUS_LABELS[irmaaFilingStatus]})</th>
                  <th className="text-right p-2 font-semibold text-gray-700">Part B Monthly</th>
                  <th className="text-right p-2 font-semibold text-gray-700">Part D Monthly</th>
                  <th className="text-right p-2 font-semibold text-gray-700">Total Monthly</th>
                  <th className="text-right p-2 font-semibold text-gray-700">Total Annual</th>
                </tr>
              </thead>
              <tbody>
                {irmaaBracketsFor(irmaaFilingStatus).map((bracket, idx) => {
                  const isCurrentBracket = results.currentIRMAABracket &&
                    bracket.magi === results.currentIRMAABracket.magi;
                  const totalMonthly = bracket.partB + bracket.partD;
                  const totalAnnual = totalMonthly * 12;
                  const magiMaxDisplay = bracket.magiMax === Infinity ? '+' : bracket.magiMax.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});

                  return (
                    <tr
                      key={idx}
                      className={`border-b border-gray-200 ${isCurrentBracket ? 'bg-purple-50 font-semibold' : ''}`}
                    >
                      <td className="p-2">
                        ${bracket.magi.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} - ${magiMaxDisplay}
                        {isCurrentBracket && <span className="ml-2 text-xs text-purple-600">(Your Bracket)</span>}
                      </td>
                      <td className="text-right p-2">
                        {bracket.partB > 0 ? `$${bracket.partB.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}` : '$0'}
                      </td>
                      <td className="text-right p-2">
                        {bracket.partD > 0 ? `$${bracket.partD.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}` : '$0'}
                      </td>
                      <td className="text-right p-2 font-medium">
                        {totalMonthly > 0 ? `$${totalMonthly.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}` : '$0'}
                      </td>
                      <td className="text-right p-2 font-medium">
                        {totalAnnual > 0 ? `$${totalAnnual.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}` : '$0'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-md">
            <p className="text-xs text-gray-700">
              <strong>Note:</strong> These surcharges are in addition to the standard Medicare Part B premium ({IRMAA_PROJECTED ? 'an estimated ' : ''}${PROJECTED_BASE_PREMIUMS.partB.toFixed(2)}/month in {IRMAA_YEAR}) and your Part D prescription drug plan premium. The surcharges are based on your Modified Adjusted Gross Income (MAGI) from {LOOKBACK_YEARS} years prior. <strong>All costs shown are per person.</strong>
            </p>
          </div>
        </div>
      </div>

      {/* NIIT Analysis */}
      <div className="bg-white rounded-lg shadow p-6 mb-6 pdf-section">
        <h2 className="text-lg font-semibold mb-4 text-gray-800 flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-purple-600" />
          Net Investment Income Tax (NIIT) Analysis
        </h2>

        <p className="text-sm text-gray-600 mb-4">
          The NIIT is a {formatRate(federalRules.niit.rate)} surtax on net investment income for taxpayers with MAGI above ${results.niitThreshold.toLocaleString()}.
          It applies to the <strong>lesser</strong> of: (1) Net Investment Income, or (2) MAGI above the threshold.
        </p>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <h3 className="font-medium text-gray-700 border-b pb-2">Investment Income Components</h3>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Interest Income:</span>
              <span className="font-medium">${Math.round(personalInfo.interestIncome).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Qualified Dividends:</span>
              <span className="font-medium">${Math.round(personalInfo.qualifiedDividends).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Ordinary Dividends:</span>
              <span className="font-medium">${Math.round(personalInfo.ordinaryDividends).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Net Capital Gains (Losses):</span>
              <span className={`font-medium ${results.netCapitalGains >= 0 ? '' : 'text-red-600'}`}>${Math.round(results.netCapitalGains).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm border-t pt-2">
              <span className="text-gray-700 font-medium">Net Investment Income:</span>
              <span className="font-bold">${Math.round(results.netInvestmentIncome).toLocaleString()}</span>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="font-medium text-gray-700 border-b pb-2">NIIT Calculation</h3>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Your MAGI:</span>
              <span className="font-medium">${Math.round(results.magi).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">NIIT Threshold:</span>
              <span className="font-medium">${results.niitThreshold.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">MAGI Over Threshold:</span>
              <span className="font-medium">${Math.round(Math.max(0, results.magi - results.niitThreshold)).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm border-t pt-2">
              <span className="text-gray-700 font-medium">Taxable Amount (lesser of above):</span>
              <span className="font-bold">${Math.round(results.niitBase).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm border-t pt-2 bg-purple-50 -mx-3 px-3 py-2 rounded">
              <span className="text-gray-700 font-medium">NIIT ({formatRate(federalRules.niit.rate)}):</span>
              <span className="font-bold text-purple-600">${Math.round(results.niitTax).toLocaleString()}</span>
            </div>
          </div>
        </div>

        {results.niitTax === 0 && results.magi < results.niitThreshold && (
          <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-md">
            <p className="text-sm text-green-800">
              <strong>Good news!</strong> Your MAGI (${Math.round(results.magi).toLocaleString()}) is below the ${results.niitThreshold.toLocaleString()} threshold,
              so you do not owe NIIT. You have ${Math.round(results.niitThreshold - results.magi).toLocaleString()} of room before NIIT applies.
            </p>
          </div>
        )}

        {results.niitTax === 0 && results.magi >= results.niitThreshold && (
          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
            <p className="text-sm text-blue-800">
              While your MAGI (${Math.round(results.magi).toLocaleString()}) exceeds the threshold, you have no net investment income,
              so you do not owe NIIT.
            </p>
          </div>
        )}

        {results.niitTax > 0 && (
          <div className="mt-4 p-3 bg-orange-50 border border-orange-200 rounded-md">
            <p className="text-sm text-orange-800">
              <strong>NIIT applies:</strong> Your MAGI (${Math.round(results.magi).toLocaleString()}) exceeds the ${results.niitThreshold.toLocaleString()} threshold
              by ${Math.round(results.magi - results.niitThreshold).toLocaleString()}, and you have ${Math.round(results.netInvestmentIncome).toLocaleString()} in net investment income.
              The {formatRate(federalRules.niit.rate)} surtax is applied to the lesser amount: ${Math.round(results.niitBase).toLocaleString()}.
            </p>
          </div>
        )}
      </div>

      {/* Roth Conversion Tax Impact Analysis */}
      {results.rothConversion > 0 && (
        <div className="bg-white rounded-lg shadow p-6 mb-6 pdf-section">
          <h2 className="text-lg font-semibold mb-4 text-gray-800 flex items-center gap-2">
            <TrendingDown className="w-5 h-5 text-indigo-600" />
            Roth Conversion Tax Impact Analysis
          </h2>

          <div className="mb-4 p-3 bg-indigo-50 border border-indigo-200 rounded-md">
            <p className="text-sm text-indigo-900">
              <strong>Converting ${Math.round(results.rothConversion).toLocaleString()}</strong> from Traditional IRA/401(k) to Roth.
              This amount is added to your ordinary income and taxed at your marginal rate.
            </p>
          </div>

          {(() => {
            // Calculate scenario WITHOUT conversion for comparison
            const scenarioWithoutConversion = { ...activeScenario, rothConversion: 0 };
            const resultsWithoutConversion = calculateScenario(scenarioWithoutConversion);

            const taxDifference = results.totalTax - resultsWithoutConversion.totalTax;
            const stateTaxDifference = results.totalUtahTax - resultsWithoutConversion.totalUtahTax;
            const totalTaxDifference = results.totalTaxWithState - resultsWithoutConversion.totalTaxWithState;
            const niitDifference = results.niitTax - resultsWithoutConversion.niitTax;
            const irmaaDifference = results.currentIRMAABracket && resultsWithoutConversion.currentIRMAABracket
              ? ((results.currentIRMAABracket.partB + results.currentIRMAABracket.partD) * 12) -
                ((resultsWithoutConversion.currentIRMAABracket.partB + resultsWithoutConversion.currentIRMAABracket.partD) * 12)
              : 0;

            const effectiveTaxRate = (taxDifference / results.rothConversion) * 100;
            const totalEffectiveRate = (totalTaxDifference / results.rothConversion) * 100;

            return (
              <>
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <h3 className="font-medium text-gray-700 border-b pb-2">Immediate Tax Impact</h3>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Conversion Amount:</span>
                      <span className="font-bold text-indigo-600">${Math.round(results.rothConversion).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Additional Federal Tax:</span>
                      <span className="font-medium text-red-600">${Math.round(taxDifference).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Additional State Tax:</span>
                      <span className="font-medium text-orange-600">${Math.round(stateTaxDifference).toLocaleString()}</span>
                    </div>
                    {niitDifference > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Additional NIIT:</span>
                        <span className="font-medium text-purple-600">${Math.round(niitDifference).toLocaleString()}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm border-t pt-2">
                      <span className="text-gray-700 font-medium">Total Additional Tax:</span>
                      <span className="font-bold text-red-600">${Math.round(totalTaxDifference).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Effective Tax Rate on Conversion:</span>
                      <span className="font-medium">{effectiveTaxRate.toFixed(2)}%</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Effective Rate (Federal + State):</span>
                      <span className="font-medium">{totalEffectiveRate.toFixed(2)}%</span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h3 className="font-medium text-gray-700 border-b pb-2">Tax Bracket Impact</h3>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">MAGI Without Conversion:</span>
                      <span className="font-medium">${resultsWithoutConversion.magi.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">MAGI With Conversion:</span>
                      <span className="font-medium">${results.magi.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">MAGI Increase:</span>
                      <span className="font-medium text-orange-600">+${(results.magi - resultsWithoutConversion.magi).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm border-t pt-2">
                      <span className="text-gray-600">Tax Bracket Before:</span>
                      <span className="font-medium">{resultsWithoutConversion.currentBracket ? `${(resultsWithoutConversion.currentBracket.rate * 100)}%` : 'N/A'}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Tax Bracket After:</span>
                      <span className={`font-medium ${results.currentBracket && resultsWithoutConversion.currentBracket && results.currentBracket.rate > resultsWithoutConversion.currentBracket.rate ? 'text-red-600' : ''}`}>
                        {results.currentBracket ? `${(results.currentBracket.rate * 100)}%` : 'N/A'}
                      </span>
                    </div>
                    {results.currentBracket && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Room Remaining in Bracket:</span>
                        <span className="font-medium">${results.roomInBracket > 0 ? Math.round(results.roomInBracket).toLocaleString() : '0 (maxed out)'}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* IRMAA Impact */}
                {irmaaDifference !== 0 && (
                  <div className="mt-4 p-3 bg-orange-50 border border-orange-200 rounded-md">
                    <p className="text-sm text-orange-800">
                      <strong>IRMAA Impact:</strong> The conversion {irmaaDifference > 0 ? 'increases' : 'decreases'} your Medicare IRMAA surcharges by
                      <strong> ${Math.abs(Math.round(irmaaDifference)).toLocaleString()}/year</strong> ({IRMAA_YEAR} rates).
                      {irmaaDifference > 0 && ' Consider converting less to avoid crossing IRMAA thresholds.'}
                    </p>
                  </div>
                )}

                {/* Optimization Suggestions */}
                <div className="mt-4 space-y-3">
                  <h3 className="font-medium text-gray-700 border-b pb-2">Optimization Suggestions</h3>

                  {results.roomInBracket > 0 && results.roomInBracket > results.rothConversion && (
                    <div className="p-3 bg-green-50 border border-green-200 rounded-md">
                      <p className="text-sm text-green-800">
                        <strong>✓ Good positioning:</strong> You have ${Math.round(results.roomInBracket).toLocaleString()} remaining in your {(results.currentBracket.rate * 100)}% bracket.
                        You could convert up to ${Math.round(results.roomInBracket + results.rothConversion).toLocaleString()} total without jumping to the next bracket.
                      </p>
                    </div>
                  )}

                  {results.roomInBracket <= 0 && (
                    <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                      <p className="text-sm text-yellow-800">
                        <strong>⚠ Bracket limit reached:</strong> Your conversion has filled your current tax bracket.
                        Additional conversions will be taxed at {results.currentBracket ? `${((results.currentBracket.rate) * 100)}%` : 'a higher rate'}.
                      </p>
                    </div>
                  )}

                  {resultsWithoutConversion.roomToNextIRMAABracket > 0 &&
                   results.magi >= resultsWithoutConversion.currentIRMAABracket.magiMax && (
                    <div className="p-3 bg-orange-50 border border-orange-200 rounded-md">
                      <p className="text-sm text-orange-800">
                        <strong>⚠ IRMAA threshold crossed:</strong> Your conversion pushed you into a higher IRMAA bracket.
                        Consider converting ${Math.round(resultsWithoutConversion.roomToNextIRMAABracket).toLocaleString()} less to stay below the threshold.
                      </p>
                    </div>
                  )}

                  {resultsWithoutConversion.magi < results.niitThreshold && results.magi >= results.niitThreshold && (
                    <div className="p-3 bg-purple-50 border border-purple-200 rounded-md">
                      <p className="text-sm text-purple-800">
                        <strong>⚠ NIIT triggered:</strong> Your conversion pushed your MAGI above the ${results.niitThreshold.toLocaleString()} NIIT threshold,
                        adding ${Math.round(niitDifference).toLocaleString()} in Net Investment Income Tax.
                      </p>
                    </div>
                  )}
                </div>
              </>
            );
          })()}
        </div>
      )}

      {/* Tax Summary */}
      <div className="bg-white rounded-lg shadow p-6 pdf-section">
        <h2 className="text-lg font-semibold mb-4 text-gray-800 flex items-center gap-2">
          <TrendingDown className="w-5 h-5 text-blue-600" />
          Federal Tax Analysis
        </h2>
        
        {/* Tax Bracket Visualization */}
        <div className="mb-6 tax-bracket-visualization">
          <h3 className="font-medium text-gray-700 mb-4">Tax Bracket Visualization</h3>
          
          {/* Ordinary Income Tax Brackets */}
          <div className="mb-6">
            <div className="flex justify-between items-center mb-2">
              <h4 className="text-sm font-semibold text-gray-700">Ordinary Income Tax Brackets ({TAX_YEAR})</h4>
              <span className="text-xs text-gray-500">Your income: ${results.taxableOrdinaryIncome.toLocaleString(undefined, {maximumFractionDigits: 0})}</span>
            </div>
            {ordinaryBracketsFor(personalInfo.filingStatus).map((bracket, index) => {
              const brackets = ordinaryBracketsFor(personalInfo.filingStatus);
              const bracketWidth = bracket.max === Infinity ? 100000 : (bracket.max - bracket.min);
              const maxWidth = brackets[brackets.length - 2].max; // Use second to last bracket for scaling
              // Scale proportionally but make everything 2.5x bigger for better readability
              const widthPercent = Math.min((bracketWidth / maxWidth) * 100 * 2.5, 100);

              // Calculate how much of this bracket is filled
              let filledAmount = 0;
              if (results.taxableOrdinaryIncome > bracket.min) {
                filledAmount = Math.min(results.taxableOrdinaryIncome - bracket.min, bracket.max - bracket.min);
              }
              const filledPercent = bracketWidth > 0 ? (filledAmount / bracketWidth) * 100 : 0;

              return (
                <div key={index} className="mb-3">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-medium">{(bracket.rate * 100)}% Bracket</span>
                    <span className="text-gray-600">
                      ${bracket.min.toLocaleString(undefined, {maximumFractionDigits: 0})} - {bracket.max === Infinity ? '∞' : `${bracket.max.toLocaleString(undefined, {maximumFractionDigits: 0})}`}
                    </span>
                  </div>
                  <div className="relative h-8 bg-gray-100 rounded overflow-hidden" style={{width: `${widthPercent}%`}}>
                    <div
                      className={`absolute h-full transition-all duration-300 ${
                        filledPercent > 0 ? 'bg-gradient-to-r from-blue-400 to-blue-600' : ''
                      }`}
                      style={{width: `${filledPercent}%`}}
                    >
                      {filledPercent > 10 && (
                        <span className="absolute inset-0 flex items-center justify-center text-xs font-medium text-white">
                          ${filledAmount.toLocaleString(undefined, {maximumFractionDigits: 0})}
                        </span>
                      )}
                    </div>
                    {filledPercent > 0 && filledPercent <= 10 && (
                      <span className="absolute left-full ml-2 top-1/2 -translate-y-1/2 text-xs font-medium text-blue-600">
                        ${filledAmount.toLocaleString(undefined, {maximumFractionDigits: 0})}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          
          {/* Capital Gains Tax Brackets */}
          <div>
            {(() => {
              // Only long-term gains and qualified dividends get the preferential
              // rates; short-term gains are taxed as ordinary income and already
              // appear in the ordinary brackets above. totalLongTermGainsWithQualDiv
              // is floored at zero, so report a net-loss year from netCapitalGains.
              const preferentialGains = results.totalLongTermGainsWithQualDiv;
              const netLoss = results.netCapitalGains < 0 ? results.netCapitalGains : 0;
              const shown = preferentialGains > 0 ? preferentialGains : netLoss;
              const blendedRate = preferentialGains > 0
                ? (results.capitalGainsTax / preferentialGains) * 100
                : 0;

              return (
                <>
                  <div className="flex justify-between items-center mb-2">
                    <h4 className="text-sm font-semibold text-gray-700">Capital Gains Tax (Preferential Rates)</h4>
                    <span className="text-xs text-gray-500">
                      Taxed at preferential rates: ${preferentialGains.toLocaleString(undefined, {maximumFractionDigits: 0})}
                    </span>
                  </div>
                  <div className="mb-3">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-medium">Long-Term Gains &amp; Qualified Dividends</span>
                      <span className="text-gray-600">Stocks, Crypto, Metals, Qualified Dividends</span>
                    </div>
                    <div className="relative h-8 bg-gray-100 rounded overflow-hidden">
                      <div
                        className={`absolute h-full transition-all duration-300 ${
                          shown > 0 ? 'bg-gradient-to-r from-green-400 to-green-600' :
                          shown < 0 ? 'bg-gradient-to-r from-red-400 to-red-600' : ''
                        }`}
                        style={{width: shown !== 0 ? '100%' : '0%'}}
                      >
                        <span className="absolute inset-0 flex items-center justify-center text-xs font-medium text-white">
                          {shown >= 0 ? '+' : ''}${shown.toLocaleString(undefined, {maximumFractionDigits: 0})}
                          {shown > 0
                            ? ` (tax $${Math.round(results.capitalGainsTax).toLocaleString()} — ${blendedRate.toFixed(1)}%)`
                            : shown < 0 ? ' (net loss offsets gains)' : ''}
                        </span>
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 italic">
                    Rate shown is the blended 0%/15%/20% rate actually applied to these gains, which depends on your
                    total income. Short-term gains are taxed as ordinary income and appear in the brackets above.
                  </p>
                </>
              );
            })()}
          </div>
        </div>
      </div>

      {/* Capital Gains Detailed Breakdown - Separate Section */}
      {results && (results.totalShortTermGains !== 0 || results.totalLongTermGains !== 0) && (
        <div className="bg-white rounded-lg shadow p-6 mb-6 pdf-section">
          <h3 className="text-lg font-semibold mb-4 text-gray-800">Capital Gains Detailed Breakdown</h3>

          <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 mb-3">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium text-gray-700">Short-Term Gains (Ordinary Income)</span>
                  <span className={`font-semibold ${results.totalShortTermGains >= 0 ? 'text-orange-600' : 'text-red-600'}`}>
                    ${results.totalShortTermGains.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                  </span>
                </div>
                <div className="text-xs text-gray-600 space-y-1 pl-3">
                  {results.totalStockShortTermGains !== 0 && (
                    <div className="flex justify-between">
                      <span>• Stocks:</span>
                      <span>${results.totalStockShortTermGains.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                    </div>
                  )}
                  {results.totalCryptoShortTermGains !== 0 && (
                    <div className="flex justify-between">
                      <span>• Crypto:</span>
                      <span>${results.totalCryptoShortTermGains.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                    </div>
                  )}
                  {results.totalMetalShortTermGains !== 0 && (
                    <div className="flex justify-between">
                      <span>• Metals:</span>
                      <span>${results.totalMetalShortTermGains.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                    </div>
                  )}
                </div>
                <p className="text-xs text-gray-500 italic mt-2">
                  Taxed at your marginal rate (10%-37%)
                </p>
              </div>

              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium text-gray-700">Long-Term Gains (Preferential Rates)</span>
                  <span className={`font-semibold ${results.totalLongTermGains >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    ${results.totalLongTermGains.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                  </span>
                </div>
                <div className="text-xs text-gray-600 space-y-1 pl-3">
                  {results.totalStockLongTermGains !== 0 && (
                    <div className="flex justify-between">
                      <span>• Stocks:</span>
                      <span>${results.totalStockLongTermGains.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                    </div>
                  )}
                  {results.totalCryptoLongTermGains !== 0 && (
                    <div className="flex justify-between">
                      <span>• Crypto:</span>
                      <span>${results.totalCryptoLongTermGains.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                    </div>
                  )}
                  {results.totalMetalLongTermGains !== 0 && (
                    <div className="flex justify-between">
                      <span>• Metals:</span>
                      <span>${results.totalMetalLongTermGains.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                    </div>
                  )}
                </div>
                <p className="text-xs text-gray-500 italic mt-2">
                  Taxed at 0%, 15%, or 20% based on income
                </p>
              </div>

              <div className="mt-3 pt-3 border-t border-gray-200">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-semibold text-gray-800">Total Capital Gains:</span>
                  <span className={`text-lg font-bold ${results.totalCapitalGains >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                    ${results.totalCapitalGains.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                  </span>
                </div>
              </div>

              {/* Capital Loss Deduction Info */}
              {results.capitalLossDeduction > 0 && (
                <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-blue-900 mb-1">Capital Loss Deduction Applied</p>
                      <p className="text-xs text-blue-700">
                        You have net capital losses of ${Math.abs(results.netCapitalGains).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}.
                        ${results.capitalLossDeduction.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} has been deducted from your ordinary income.
                      </p>
                      {results.excessCapitalLoss > 0 && (
                        <p className="text-xs text-blue-700 mt-2 font-medium">
                          Excess loss of ${results.excessCapitalLoss.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} would carry forward to future years.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
        </div>
      )}

      {/* Tax Summary Grid */}
      {results && (
        <div className="bg-white rounded-lg shadow p-6 mb-6 pdf-section">
          <div className="grid md:grid-cols-3 gap-6">
          <div className="space-y-3">
            <h3 className="font-medium text-gray-700 border-b pb-2">Income Sources</h3>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Employment Income:</span>
              <span className="font-medium">${Math.round(results.employmentIncome).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Pension Income:</span>
              <span className="font-medium">${Math.round(results.pensionIncome).toLocaleString()}</span>
            </div>
            {socialSecurity.enabled && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Social Security Income:</span>
                <span className="font-medium text-purple-600">${Math.round(results.socialSecurityIncome).toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Traditional Withdrawals:</span>
              <span className="font-medium">${Math.round(getActiveScenario().withdrawals.traditionalIRA + getActiveScenario().withdrawals.traditional401k).toLocaleString()}</span>
            </div>
            {results.rothConversion > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Roth Conversion:</span>
                <span className="font-medium text-indigo-600">${Math.round(results.rothConversion).toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Interest Income:</span>
              <span className="font-medium">${Math.round(personalInfo.interestIncome || 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Ordinary Dividends:</span>
              <span className="font-medium">${Math.round(personalInfo.ordinaryDividends || 0).toLocaleString()}</span>
            </div>
            {results.taxableShortTermGains > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Short-Term Capital Gains:</span>
                <span className="font-medium">${Math.round(results.taxableShortTermGains).toLocaleString()}</span>
              </div>
            )}
            {results.capitalLossDeduction > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Capital Loss Deduction:</span>
                <span className="font-medium text-green-600">-${Math.round(results.capitalLossDeduction).toLocaleString()}</span>
              </div>
            )}
            {results.excessCapitalLoss > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 text-xs italic">Loss Carryforward (future years):</span>
                <span className="font-medium text-blue-600 text-xs">${Math.round(results.excessCapitalLoss).toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between text-sm border-t pt-2">
              <span className="text-gray-700 font-medium">Total Ordinary Income:</span>
              <span className="font-bold">${Math.round(results.ordinaryIncome).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Less: Standard Deduction:</span>
              <span className="font-medium text-green-600">-${Math.round(results.baseStandardDeduction).toLocaleString()}</span>
            </div>
            {results.additionalStandardDeduction > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Less: Additional Deduction (65+):</span>
                <span className="font-medium text-green-600">-${Math.round(results.additionalStandardDeduction).toLocaleString()}</span>
              </div>
            )}
            {results.seniorDeduction > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Less: Senior Deduction (65+):</span>
                <span className="font-medium text-green-600">-${Math.round(results.seniorDeduction).toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between text-sm border-t pt-2">
              <span className="text-gray-700 font-medium">Taxable Ordinary Income:</span>
              <span className="font-bold">${Math.round(results.taxableOrdinaryIncome).toLocaleString()}</span>
            </div>
          </div>
          
          <div className="space-y-3">
            <h3 className="font-medium text-gray-700 border-b pb-2">Withdrawals</h3>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Tax-Free Withdrawals:</span>
              <span className="font-medium text-green-600">${Math.round(results.taxFreeWithdrawals).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Stock Sale Proceeds:</span>
              <span className="font-medium text-yellow-600">${Math.round(results.totalStockProceeds).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Stock Gains/Losses:</span>
              <span className={`font-medium ${results.totalStockGains >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                ${Math.round(results.totalStockGains).toLocaleString()}
              </span>
            </div>
            {(results.totalStockShortTermGains !== 0 || results.totalStockLongTermGains !== 0) && (
              <div className="flex justify-between text-xs text-gray-500 italic pl-4">
                <span>Short: ${Math.round(results.totalStockShortTermGains).toLocaleString()} | Long: ${Math.round(results.totalStockLongTermGains).toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Crypto Sale Proceeds:</span>
              <span className="font-medium text-yellow-600">${Math.round(results.totalCryptoProceeds).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Crypto Gains/Losses:</span>
              <span className={`font-medium ${results.totalCryptoGains >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                ${Math.round(results.totalCryptoGains).toLocaleString()}
              </span>
            </div>
            {(results.totalCryptoShortTermGains !== 0 || results.totalCryptoLongTermGains !== 0) && (
              <div className="flex justify-between text-xs text-gray-500 italic pl-4">
                <span>Short: ${Math.round(results.totalCryptoShortTermGains).toLocaleString()} | Long: ${Math.round(results.totalCryptoLongTermGains).toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Metal Sale Proceeds:</span>
              <span className="font-medium text-yellow-600">${Math.round(results.totalMetalProceeds).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Metal Gains/Losses:</span>
              <span className={`font-medium ${results.totalMetalGains >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                ${Math.round(results.totalMetalGains).toLocaleString()}
              </span>
            </div>
            {(results.totalMetalShortTermGains !== 0 || results.totalMetalLongTermGains !== 0) && (
              <div className="flex justify-between text-xs text-gray-500 italic pl-4">
                <span>Short: ${Math.round(results.totalMetalShortTermGains).toLocaleString()} | Long: ${Math.round(results.totalMetalLongTermGains).toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Qualified Dividends:</span>
              <span className="font-medium text-yellow-600">${Math.round(personalInfo.qualifiedDividends || 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm border-t pt-2">
              <span className="text-gray-700 font-medium">Long-Term Gains/Qual. Div:</span>
              <span className={`font-bold ${(results.taxableLongTermGains + (personalInfo.qualifiedDividends || 0)) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                ${Math.round(results.taxableLongTermGains + (personalInfo.qualifiedDividends || 0)).toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between text-sm text-xs text-gray-500 italic pl-4">
              <span>Taxed at preferential rates (0%/15%/20%)</span>
            </div>
            <div className="flex justify-between text-sm border-t pt-2 mt-2">
              <span className="text-gray-700 font-medium">Total Withdrawals:</span>
              <span className="font-bold">${Math.round(results.totalWithdrawals).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-base border-t-2 pt-3 mt-3 bg-blue-50 -mx-4 px-4 py-3 rounded-lg">
              <span className="text-gray-800 font-bold">TOTAL GROSS INCOME:</span>
              <span className="font-bold text-blue-900 text-xl">
                ${(() => {
                  const grossIncome = Math.round(
                    results.employmentIncome +
                    results.pensionIncome +
                    results.socialSecurityIncome +
                    (personalInfo.interestIncome || 0) +
                    (personalInfo.ordinaryDividends || 0) +
                    (personalInfo.qualifiedDividends || 0) +
                    results.totalStockProceeds +
                    results.totalCryptoProceeds +
                    results.totalMetalProceeds +
                    results.taxFreeWithdrawals +
                    getActiveScenario().withdrawals.traditionalIRA +
                    getActiveScenario().withdrawals.traditional401k +
                    (results.rothConversion || 0)
                  );
                  return grossIncome.toLocaleString();
                })()}
              </span>
            </div>
            <div className="flex justify-between text-sm -mx-4 px-4 py-2">
              <span className="text-gray-600">Less: Total Tax (Fed + State):</span>
              <span className="font-medium text-red-600">-${Math.round(results.totalTaxWithState).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-base border-t-2 pt-3 bg-green-50 -mx-4 px-4 py-3 rounded-lg">
              <span className="text-gray-800 font-bold">NET INCOME AFTER TAX:</span>
              <span className="font-bold text-green-700 text-xl">
                ${Math.round(
                  results.employmentIncome +
                  results.pensionIncome +
                  results.socialSecurityIncome +
                  (personalInfo.interestIncome || 0) +
                  (personalInfo.ordinaryDividends || 0) +
                  (personalInfo.qualifiedDividends || 0) +
                  results.totalStockProceeds +
                  results.totalCryptoProceeds +
                  results.totalMetalProceeds +
                  results.taxFreeWithdrawals +
                  getActiveScenario().withdrawals.traditionalIRA +
                  getActiveScenario().withdrawals.traditional401k +
                  (results.rothConversion || 0) -
                  results.totalTaxWithState
                ).toLocaleString()}
              </span>
            </div>
            {results.rothConversion > 0 && (
              <>
                <div className="flex justify-between text-sm border-t pt-3 mt-3 -mx-4 px-4 py-2">
                  <span className="text-gray-700 font-medium">Roth Conversion Amount:</span>
                  <span className="font-medium text-indigo-600">
                    ${Math.round(results.rothConversion).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between text-sm bg-blue-50 -mx-4 px-4 py-2 rounded">
                  <span className="text-gray-700 font-semibold">Net Cash After Roth Conversion:</span>
                  <span className="font-bold text-blue-700">
                    ${Math.round(
                      results.employmentIncome +
                      results.pensionIncome +
                      results.socialSecurityIncome +
                      (personalInfo.interestIncome || 0) +
                      (personalInfo.ordinaryDividends || 0) +
                      (personalInfo.qualifiedDividends || 0) +
                      results.totalStockProceeds +
                      results.totalCryptoProceeds +
                      results.totalMetalProceeds +
                      results.taxFreeWithdrawals +
                      getActiveScenario().withdrawals.traditionalIRA +
                      getActiveScenario().withdrawals.traditional401k +
                      (results.rothConversion || 0) -
                      results.totalTaxWithState -
                      results.rothConversion
                    ).toLocaleString()}
                  </span>
                </div>
              </>
            )}
          </div>
          
          <div className="space-y-3">
            <h3 className="font-medium text-gray-700 border-b pb-2">Tax Calculation</h3>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Taxable Ord. Income:</span>
              <span className="font-medium">${Math.round(results.taxableOrdinaryIncome).toLocaleString()}</span>
            </div>
            {results.currentBracket && (
              <>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Current Tax Bracket:</span>
                  <span className="font-medium text-blue-600">{(results.currentBracket.rate * 100)}%</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Room to Next Bracket:</span>
                  <span className="font-medium text-blue-600">
                    {results.roomInBracket > 0 ? `${Math.round(results.roomInBracket).toLocaleString()}` : 'In highest bracket'}
                  </span>
                </div>
              </>
            )}
            <div className="flex justify-between text-sm border-t pt-2">
              <span className="text-gray-600">Ordinary Income Tax:</span>
              <span className="font-medium text-red-600">${Math.round(results.ordinaryIncomeTax).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Capital Gains Tax:</span>
              <span className="font-medium text-red-600">${Math.round(results.capitalGainsTax).toLocaleString()}</span>
            </div>
            {results.niitTax > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Net Investment Income Tax ({formatRate(federalRules.niit.rate)}):</span>
                <span className="font-medium text-red-600">${Math.round(results.niitTax).toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between text-sm border-t pt-2">
              <span className="text-gray-700 font-medium">Total Tax:</span>
              <span className="font-bold text-red-600">${Math.round(results.totalTax).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Effective Rate:</span>
              <span className="font-medium">{results.effectiveRate.toFixed(2)}%</span>
            </div>
          </div>
        </div>
      </div>
      )}

      {/* Utah State Tax Analysis */}
      <div className="bg-white rounded-lg shadow p-6 mb-6 pdf-section">
        <h2 className="text-lg font-semibold mb-4 text-gray-800 flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-orange-600" />
          Utah State Tax Analysis
        </h2>

        <p className="text-sm text-gray-600 mb-4">
          Utah taxes your federal adjusted gross income at a flat {formatRate(utahTaxRate)} &mdash; capital gains included &mdash;
          then subtracts a taxpayer tax credit: {formatRate(TAX_RULES.utah.taxpayerCredit.creditRate)} of your federal standard
          deduction (plus {'$'}{TAX_RULES.utah.taxpayerCredit.personalExemption.toLocaleString()} per dependent), reduced
          by {formatRate(TAX_RULES.utah.taxpayerCredit.phaseOutRate)} of income above a phase-out amount (TC-40 lines 9&ndash;22).
          Taxable Social Security benefits also earn a Social Security credit at the same rate, which phases out at
          {' '}{formatRate(TAX_RULES.utah.socialSecurityCredit.phaseOutRate)} of income above
          {' $'}{forFilingStatus(TAX_RULES.utah.socialSecurityCredit.phaseOutThreshold, personalInfo.filingStatus).toLocaleString()}.
          Filers born in {TAX_RULES.utah.retirementCredit.bornOnOrBefore} or earlier may instead take a retirement credit of
          {' $'}{TAX_RULES.utah.retirementCredit.perPerson} each; the larger of the two is used.
          {TAX_RULES.utah.taxpayerCredit.amountsYear !== TAX_YEAR &&
            ` The credit uses Utah's ${TAX_RULES.utah.taxpayerCredit.amountsYear} amounts until the ${TAX_YEAR} ones are published.`}
        </p>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <h3 className="font-medium text-gray-700 border-b pb-2">Utah Taxable Income</h3>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Federal Adjusted Gross Income:</span>
              <span className="font-medium">${Math.round(results.utahTaxableIncome).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm border-t pt-2">
              <span className="text-gray-700 font-medium">Utah Taxable Income:</span>
              <span className="font-bold">${Math.round(results.utahTaxableIncome).toLocaleString()}</span>
            </div>
            <p className="text-xs text-gray-500">
              Utah additions and subtractions (e.g. U.S. Treasury interest) are not modeled.
            </p>
          </div>

          <div className="space-y-3">
            <h3 className="font-medium text-gray-700 border-b pb-2">Utah Tax</h3>
            {results.utahExempt ? (
              <div className="bg-green-50 border border-green-200 rounded-md p-3">
                <p className="text-sm text-green-700 font-medium">
                  ✓ Exempt from Utah income tax: federal AGI is at or below the standard deduction plus the senior deduction.
                </p>
              </div>
            ) : (
              <>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Tax at {formatRate(utahTaxRate)}:</span>
                  <span className="font-medium text-orange-600">${Math.round(results.utahTaxBeforeCredit).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 text-xs italic">Credit before phase-out ({formatRate(TAX_RULES.utah.taxpayerCredit.creditRate)} of ${Math.round(results.utahCreditBase).toLocaleString()}):</span>
                  <span className="font-medium text-xs">${Math.round(results.utahInitialCredit).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 text-xs italic">Phase-out:</span>
                  <span className="font-medium text-xs">&minus;${Math.round(Math.min(results.utahCreditPhaseOut, results.utahInitialCredit)).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Less: Taxpayer Tax Credit:</span>
                  <span className="font-medium text-green-600">&minus;${Math.round(results.utahTaxpayerCredit).toLocaleString()}</span>
                </div>
                {results.utahSSInitialCredit > 0 && results.utahRetirementCredit === 0 && (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600 text-xs italic">Social Security credit before phase-out ({formatRate(utahTaxRate)} of ${Math.round(results.taxableSocialSecurity).toLocaleString()} taxable benefits):</span>
                      <span className="font-medium text-xs">${Math.round(results.utahSSInitialCredit).toLocaleString()}</span>
                    </div>
                    {results.utahSSPhaseOut > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600 text-xs italic">Phase-out ({formatRate(TAX_RULES.utah.socialSecurityCredit.phaseOutRate)} of AGI over ${forFilingStatus(TAX_RULES.utah.socialSecurityCredit.phaseOutThreshold, personalInfo.filingStatus).toLocaleString()}):</span>
                        <span className="font-medium text-xs">&minus;${Math.round(Math.min(results.utahSSPhaseOut, results.utahSSInitialCredit)).toLocaleString()}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Less: Social Security Credit:</span>
                      <span className="font-medium text-green-600">&minus;${Math.round(results.utahSocialSecurityCredit).toLocaleString()}</span>
                    </div>
                  </>
                )}
                {results.utahRetirementCredit > 0 && (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600 text-xs italic">Retirement credit before phase-out (${TAX_RULES.utah.retirementCredit.perPerson} &times; {results.utahRetirementEligible}):</span>
                      <span className="font-medium text-xs">${Math.round(results.utahRetirementInitialCredit).toLocaleString()}</span>
                    </div>
                    {results.utahRetirementPhaseOut > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600 text-xs italic">Phase-out ({formatRate(TAX_RULES.utah.retirementCredit.phaseOutRate)} of AGI over ${forFilingStatus(TAX_RULES.utah.retirementCredit.phaseOutThreshold, personalInfo.filingStatus).toLocaleString()}):</span>
                        <span className="font-medium text-xs">&minus;${Math.round(Math.min(results.utahRetirementPhaseOut, results.utahRetirementInitialCredit)).toLocaleString()}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Less: Retirement Credit:</span>
                      <span className="font-medium text-green-600">&minus;${Math.round(results.utahRetirementCredit).toLocaleString()}</span>
                    </div>
                  </>
                )}
                {results.utahSSUsable > 0 && results.utahRetirementUsable > 0 && (
                  <p className="text-xs text-gray-500">
                    Utah allows either the Social Security credit (${Math.round(results.utahSSUsable).toLocaleString()}) or the
                    retirement credit (${Math.round(results.utahRetirementUsable).toLocaleString()}), not both; the larger is used.
                  </p>
                )}
              </>
            )}
            <div className="flex justify-between text-sm border-t pt-2">
              <span className="text-gray-700 font-medium">Total Utah Tax:</span>
              <span className="font-bold text-orange-600">${Math.round(results.totalUtahTax).toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Combined Tax Summary */}
      <div className="bg-white rounded-lg shadow p-6 mb-6 pdf-section">
        <h2 className="text-lg font-semibold mb-4 text-gray-800 flex items-center gap-2">
          <Calculator className="w-5 h-5 text-blue-600" />
          Combined Tax Summary (Federal + State)
        </h2>

        <div className="max-w-md mx-auto space-y-4">
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Federal Tax:</span>
              <span className="font-medium text-red-600">${Math.round(results.totalTax).toLocaleString()}</span>
            </div>
            {results.niitTax > 0 && (
              <div className="flex justify-between text-xs pl-4 italic">
                <span className="text-gray-500">• Includes NIIT ({formatRate(federalRules.niit.rate)}):</span>
                <span className="font-medium text-purple-600">${Math.round(results.niitTax).toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Utah State Tax:</span>
              <span className="font-medium text-orange-600">${Math.round(results.totalUtahTax).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-base border-t-2 pt-3 bg-blue-50 -mx-4 px-4 py-3 rounded-lg">
              <span className="text-gray-800 font-bold">TOTAL TAX (Federal + Utah):</span>
              <span className="font-bold text-blue-900 text-xl">${Math.round(results.totalTaxWithState).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm pt-2">
              <span className="text-gray-600">Combined Effective Rate:</span>
              <span className="font-bold text-blue-700">{results.effectiveRateWithState.toFixed(2)}%</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Total Taxable Income:</span>
              <span className="font-medium">${Math.round(results.taxableIncome).toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Income Stacking Waterfall Chart */}
      <div className="bg-white rounded-lg shadow p-6 mb-6 pdf-section">
        <h2 className="text-lg font-semibold mb-4 text-gray-800 flex items-center gap-2">
          <TrendingDown className="w-5 h-5 text-indigo-600" />
          How Long-Term Gains Stack on Top of Ordinary Income
        </h2>

        <p className="text-sm text-gray-600 mb-6">
          This chart visualizes how long-term capital gains and qualified dividends "stack" on top of your ordinary
          income for tax calculation purposes, filling the remaining space in lower brackets before moving to higher
          ones. Short-term gains are not shown separately here &mdash; they are taxed as ordinary income and are
          already included in the Ordinary Income bar.
        </p>

        {(() => {
          // Take these from the engine rather than recomputing them: a local
          // standard-deduction ternary drifted from calculateScenario and gave
          // marriedFilingSeparately a different deduction than the tax numbers used.
          const standardDeduction = results.standardDeduction;
          const grossOrdinaryIncome = results.ordinaryIncome;
          const taxableOrdinaryIncome = results.taxableOrdinaryIncome;

          // Only long-term gains and qualified dividends stack at the preferential
          // rates. Short-term gains are already inside ordinaryIncome above, so
          // using results.totalCapitalGains here would draw (and total) them twice.
          // Only the part not already sheltered by leftover deductions.
          const preferentialRateGains = results.taxablePreferentialIncome;
          const totalIncome = taxableOrdinaryIncome + preferentialRateGains;

          // Get tax brackets
          const ordinaryBrackets = ordinaryBracketsFor(personalInfo.filingStatus);
          const capitalGainsBrackets = capitalGainsBracketsFor(personalInfo.filingStatus);

          // Determine capital gains color based on where they stack
          const getCapitalGainsColor = () => {
            const startIncome = taxableOrdinaryIncome;
            const endIncome = taxableOrdinaryIncome + preferentialRateGains;

            if (preferentialRateGains === 0) return '#a7f3d0';

            if (endIncome <= capitalGainsBrackets[0].max) {
              return '#d1fae5'; // 0%
            } else if (startIncome >= capitalGainsBrackets[1].max) {
              return '#6ee7b7'; // 20%
            } else if (startIncome >= capitalGainsBrackets[0].max) {
              return '#a7f3d0'; // 15% - solid color
            } else {
              return 'url(#capitalGainsGradient)'; // gradient
            }
          };

          // Prepare data for the waterfall chart
          const chartData = [
            {
              name: 'Ordinary\nIncome',
              base: 0,
              value: grossOrdinaryIncome,
              displayValue: grossOrdinaryIncome,
              color: '#84cc16',
              tax: 0,
              description: 'Gross ordinary income before deductions'
            },
            {
              name: 'Standard\nDeduction',
              base: taxableOrdinaryIncome,
              value: standardDeduction,
              displayValue: -standardDeduction,
              color: '#dc2626',
              tax: 0,
              description: results.additionalStandardDeduction + results.seniorDeduction > 0
                ? `${FILING_STATUS_LABELS[personalInfo.filingStatus]} standard deduction plus 65+ deductions`
                : `${FILING_STATUS_LABELS[personalInfo.filingStatus]} standard deduction`
            },
            {
              name: 'Taxable\nOrdinary',
              base: 0,
              value: taxableOrdinaryIncome,
              displayValue: taxableOrdinaryIncome,
              color: 'url(#taxBracketGradient)',
              tax: results.ordinaryIncomeTax,
              description: 'Ordinary income subject to tax'
            },
            {
              name: 'Long-Term\nGains',
              base: taxableOrdinaryIncome,
              value: preferentialRateGains,
              displayValue: preferentialRateGains,
              color: getCapitalGainsColor(),
              tax: results.capitalGainsTax,
              description: 'Long-term gains and qualified dividends stacked on top'
            },
            {
              name: 'Total\nTaxable',
              base: 0,
              value: totalIncome,
              displayValue: totalIncome,
              color: '#6366f1',
              tax: results.totalTax,
              description: 'Total taxable income'
            }
          ];

          // Custom tooltip
          const CustomTooltip = ({ active, payload }) => {
            if (active && payload && payload.length) {
              const data = payload[0].payload;
              return (
                <div className="bg-white p-3 border border-gray-300 rounded shadow-lg">
                  <p className="font-semibold text-gray-800">{data.name.replace(/\n/g, ' ')}</p>
                  <p className="text-sm text-gray-600">{data.description}</p>
                  <p className="text-sm font-medium text-gray-800 mt-1">
                    Amount: ${Math.abs(data.displayValue).toLocaleString(undefined, {maximumFractionDigits: 0})}
                  </p>
                  {data.tax > 0 && (
                    <p className="text-sm font-medium text-red-600">
                      Tax Due: ${data.tax.toLocaleString(undefined, {maximumFractionDigits: 0})}
                    </p>
                  )}
                </div>
              );
            }
            return null;
          };

          // Custom label renderer
          const renderCustomLabel = (props) => {
            const { x, y, width, height, index } = props;
            const data = chartData[index];

            if (!data || data.displayValue === 0) return null;

            const isNegative = data.displayValue < 0;
            const labelY = isNegative ? y + height + 15 : y - 10;

            return (
              <g>
                <text
                  x={x + width / 2}
                  y={labelY}
                  fill={isNegative ? '#dc2626' : '#374151'}
                  textAnchor="middle"
                  fontSize="12"
                  fontWeight="600"
                >
                  {isNegative ? '(' : ''}${Math.abs(data.displayValue).toLocaleString(undefined, {maximumFractionDigits: 0})}{isNegative ? ')' : ''}
                </text>
                {data.tax > 0 && height > 30 && (
                  <>
                    <text
                      x={x + width / 2}
                      y={y + height / 2 - 5}
                      fill="white"
                      textAnchor="middle"
                      fontSize="10"
                    >
                      Tax Due
                    </text>
                    <text
                      x={x + width / 2}
                      y={y + height / 2 + 10}
                      fill="white"
                      textAnchor="middle"
                      fontSize="11"
                      fontWeight="600"
                    >
                      ${data.tax.toLocaleString(undefined, {maximumFractionDigits: 0})}
                    </text>
                  </>
                )}
              </g>
            );
          };

          // Create gradient definition for the Taxable Ordinary bar
          const createTaxBracketGradient = () => {
            const blueShades = [
              '#dbeafe', // 10%
              '#93c5fd', // 12%
              '#3b82f6', // 22%
              '#1d4ed8', // 24%
              '#1e40af', // 32%
              '#1e3a8a', // 35%
              '#1e293b'  // 37%
            ];

            const stops = [];
            const income = taxableOrdinaryIncome;

            ordinaryBrackets.forEach((bracket, idx) => {
              const bracketStart = bracket.min;
              const bracketEnd = bracket.max === Infinity ? income : Math.min(bracket.max, income);

              if (bracketStart < income) {
                const startPercent = (bracketStart / income) * 100;
                const endPercent = (bracketEnd / income) * 100;

                stops.push(
                  <stop key={`start-${idx}`} offset={`${startPercent}%`} stopColor={blueShades[idx]} stopOpacity="1" />,
                  <stop key={`end-${idx}`} offset={`${endPercent}%`} stopColor={blueShades[idx]} stopOpacity="1" />
                );
              }
            });

            return stops;
          };

          // Create capital gains gradient (only if needed)
          const createCapitalGainsGradient = () => {
            const startIncome = taxableOrdinaryIncome;
            const endIncome = taxableOrdinaryIncome + preferentialRateGains;
            const capGainsAmount = preferentialRateGains;

            const stops = [];

            // 0% bracket
            if (startIncome < capitalGainsBrackets[0].max) {
              const startPercent = 0;
              const endPercent = Math.min(100, ((capitalGainsBrackets[0].max - startIncome) / capGainsAmount) * 100);
              stops.push(
                <stop key="cap-0-start" offset={`${startPercent}%`} stopColor="#d1fae5" stopOpacity="1" />,
                <stop key="cap-0-end" offset={`${endPercent}%`} stopColor="#d1fae5" stopOpacity="1" />
              );
            }

            // 15% bracket
            if (endIncome > capitalGainsBrackets[0].max && startIncome < capitalGainsBrackets[1].max) {
              const startPercent = Math.max(0, ((capitalGainsBrackets[0].max - startIncome) / capGainsAmount) * 100);
              const endPercent = Math.min(100, ((capitalGainsBrackets[1].max - startIncome) / capGainsAmount) * 100);
              stops.push(
                <stop key="cap-15-start" offset={`${startPercent}%`} stopColor="#a7f3d0" stopOpacity="1" />,
                <stop key="cap-15-end" offset={`${endPercent}%`} stopColor="#a7f3d0" stopOpacity="1" />
              );
            }

            // 20% bracket
            if (endIncome > capitalGainsBrackets[1].max) {
              const startPercent = ((capitalGainsBrackets[1].max - startIncome) / capGainsAmount) * 100;
              stops.push(
                <stop key="cap-20-start" offset={`${startPercent}%`} stopColor="#6ee7b7" stopOpacity="1" />,
                <stop key="cap-20-end" offset="100%" stopColor="#6ee7b7" stopOpacity="1" />
              );
            }

            return stops;
          };

          return (
            <div className="w-full" style={{ height: '400px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  margin={{ top: 30, right: 80, left: 80, bottom: 30 }}
                >
                  <defs>
                    <linearGradient id="taxBracketGradient" x1="0" y1="1" x2="0" y2="0">
                      {createTaxBracketGradient()}
                    </linearGradient>
                    <linearGradient id="capitalGainsGradient" x1="0" y1="1" x2="0" y2="0">
                      {createCapitalGainsGradient()}
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 12 }}
                    interval={0}
                  />

                  {/* Left Y-axis - Primary Scale */}
                  <YAxis
                    yAxisId="left"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                    domain={[0, 'auto']}
                  />

                  {/* Right Y-axis - Mirror Scale */}
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                    domain={[0, 'auto']}
                  />

                  <Tooltip content={<CustomTooltip />} />

                  {/* Reference lines for Ordinary Income tax brackets (left axis) */}
                  {ordinaryBrackets.filter(b => b.max !== Infinity).slice(0, 5).map((bracket, idx) => (
                    <ReferenceLine
                      key={`ord-${idx}`}
                      yAxisId="left"
                      y={bracket.max}
                      stroke="#1e3a8a"
                      strokeDasharray="3 3"
                      strokeWidth={1}
                      opacity={0.3}
                    >
                      <Label
                        value={`$${bracket.max.toLocaleString()} (${(bracket.rate * 100).toFixed(0)}%)`}
                        position="insideTopLeft"
                        style={{ fontSize: 10, fill: '#1e3a8a', fontWeight: 'bold', background: '#ffffff', padding: 2 }}
                      />
                    </ReferenceLine>
                  ))}

                  <Bar
                    dataKey="base"
                    fill="transparent"
                    stackId="stack"
                    yAxisId="left"
                  />
                  <Bar
                    dataKey="value"
                    stackId="stack"
                    label={renderCustomLabel}
                    yAxisId="left"
                  >
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          );
        })()}

        <div className="mt-4 p-3 bg-gray-50 rounded text-xs">
          <p className="font-medium mb-2 text-gray-700">Chart Legend:</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <div className="flex items-center gap-2">
              <div className="w-10 h-4 rounded" style={{ background: 'linear-gradient(to right, #dbeafe, #3b82f6, #1d4ed8)' }}></div>
              <span className="text-gray-600">Blue gradient: Ordinary income tax brackets (lighter=10%, darker=37%)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-10 h-4 rounded" style={{ background: 'linear-gradient(to bottom, #d1fae5 50%, #a7f3d0 50%)' }}></div>
              <span className="text-gray-600">Green shading: Capital gains zones (lighter=0%, darker=15%)</span>
            </div>
          </div>
          <p className="font-medium mb-1 text-gray-700">Key Insight:</p>
          <p className="text-gray-600">
            The chart shows dual shading: <strong>Blue zones</strong> represent ordinary income tax brackets (10%-37%), and <strong>green zones</strong> show capital gains rates (0%, 15%, 20%).
            Capital gains are taxed at different rates depending on where they "land" after stacking on top of your ordinary income.
            This stacking order significantly impacts your total tax bill and is why timing of capital gains matters for tax planning.
          </p>
        </div>
      </div>

      {/* Scenario Comparison Table */}
      {scenarios.length > 1 && (
        <div className="bg-white rounded-lg shadow p-6 mb-6 pdf-section">
          <h2 className="text-lg font-semibold mb-4 text-gray-800 flex items-center gap-2">
            <Calculator className="w-5 h-5 text-indigo-600" />
            Scenario Comparison
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Metric</th>
                  {scenarios.map(scenario => (
                    <th key={scenario.id} className={`px-4 py-3 text-right font-medium ${scenario.id === activeScenarioId ? 'bg-blue-50 text-blue-700' : 'text-gray-700'}`}>
                      {scenario.name}
                      {scenario.id === activeScenarioId && (
                        <span className="ml-2 text-xs">(Active)</span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {(() => {
                  // Calculate results for all scenarios
                  const allResults = scenarios.map(s => ({
                    scenario: s,
                    results: calculateScenario(s)
                  }));

                  return (
                    <>
                      <tr>
                        <td className="px-4 py-2 font-medium text-gray-700">Total Withdrawals</td>
                        {allResults.map(({ scenario, results }) => (
                          <td key={scenario.id} className={`px-4 py-2 text-right ${scenario.id === activeScenarioId ? 'bg-blue-50' : ''}`}>
                            ${results.totalWithdrawals.toLocaleString(undefined, {maximumFractionDigits: 0})}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="px-4 py-2 font-medium text-gray-700">Roth Conversion</td>
                        {allResults.map(({ scenario, results }) => (
                          <td key={scenario.id} className={`px-4 py-2 text-right ${results.rothConversion > 0 ? 'text-indigo-600 font-medium' : 'text-gray-400'} ${scenario.id === activeScenarioId ? 'bg-blue-50' : ''}`}>
                            ${results.rothConversion.toLocaleString(undefined, {maximumFractionDigits: 0})}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="px-4 py-2 font-medium text-gray-700">MAGI (for IRMAA)</td>
                        {allResults.map(({ scenario, results }) => (
                          <td key={scenario.id} className={`px-4 py-2 text-right ${scenario.id === activeScenarioId ? 'bg-blue-50' : ''}`}>
                            ${results.magi.toLocaleString(undefined, {maximumFractionDigits: 0})}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="px-4 py-2 font-medium text-gray-700">Tax Bracket</td>
                        {allResults.map(({ scenario, results }) => (
                          <td key={scenario.id} className={`px-4 py-2 text-right ${scenario.id === activeScenarioId ? 'bg-blue-50' : ''}`}>
                            {results.currentBracket ? `${(results.currentBracket.rate * 100)}%` : 'N/A'}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="px-4 py-2 font-medium text-gray-700">Federal Tax</td>
                        {allResults.map(({ scenario, results }) => (
                          <td key={scenario.id} className={`px-4 py-2 text-right text-red-600 ${scenario.id === activeScenarioId ? 'bg-blue-50' : ''}`}>
                            ${results.totalTax.toLocaleString(undefined, {maximumFractionDigits: 0})}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="px-4 py-2 font-medium text-gray-700 pl-8 text-sm italic">• NIIT ({formatRate(federalRules.niit.rate)})</td>
                        {allResults.map(({ scenario, results }) => (
                          <td key={scenario.id} className={`px-4 py-2 text-right text-purple-600 text-sm ${scenario.id === activeScenarioId ? 'bg-blue-50' : ''}`}>
                            ${results.niitTax.toLocaleString(undefined, {maximumFractionDigits: 0})}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="px-4 py-2 font-medium text-gray-700">Utah State Tax</td>
                        {allResults.map(({ scenario, results }) => (
                          <td key={scenario.id} className={`px-4 py-2 text-right text-orange-600 ${scenario.id === activeScenarioId ? 'bg-blue-50' : ''}`}>
                            ${results.totalUtahTax.toLocaleString(undefined, {maximumFractionDigits: 0})}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="px-4 py-2 font-medium text-gray-700">Annual Medicare Cost</td>
                        {allResults.map(({ scenario, results }) => (
                          <td key={scenario.id} className={`px-4 py-2 text-right text-blue-600 ${scenario.id === activeScenarioId ? 'bg-blue-50' : ''}`}>
                            ${results.medicare?.total.annual ? results.medicare.total.annual.toLocaleString(undefined, {maximumFractionDigits: 0}) : '0'}
                          </td>
                        ))}
                      </tr>
                      <tr className="bg-gray-50 font-semibold">
                        <td className="px-4 py-3 font-bold text-gray-800">Total Tax (Fed + State + Medicare)</td>
                        {allResults.map(({ scenario, results }) => {
                          const medicareAnnual = results.medicare?.total.annual || 0;
                          const totalCost = results.totalTaxWithState + medicareAnnual;
                          return (
                            <td key={scenario.id} className={`px-4 py-3 text-right text-blue-900 ${scenario.id === activeScenarioId ? 'bg-blue-100' : ''}`}>
                              ${totalCost.toLocaleString(undefined, {maximumFractionDigits: 0})}
                            </td>
                          );
                        })}
                      </tr>
                      <tr>
                        <td className="px-4 py-2 font-medium text-gray-700">Effective Rate (Fed + State)</td>
                        {allResults.map(({ scenario, results }) => (
                          <td key={scenario.id} className={`px-4 py-2 text-right ${scenario.id === activeScenarioId ? 'bg-blue-50' : ''}`}>
                            {results.effectiveRateWithState.toFixed(2)}%
                          </td>
                        ))}
                      </tr>
                    </>
                  );
                })()}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-gray-500 mt-3">
            The active scenario is highlighted in blue. Click a scenario name in the dropdown above to view its details.
          </p>

          {/* Tips */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-6">
            <div className="flex gap-2">
              <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-900">
                <p className="font-medium mb-2">General Tax-Efficient Withdrawal Strategies:</p>
                <ul className="space-y-1 list-disc list-inside">
                  <li>Use taxable accounts (brokerage, savings) first for flexibility and potentially lower capital gains rates</li>
                  <li>Fill up lower tax brackets with traditional IRA/401(k) withdrawals before jumping to higher brackets</li>
                  <li>Preserve Roth accounts for last - they grow tax-free and provide flexibility in high-income years</li>
                  <li>Consider RMDs starting at age {federalRules.rmdStartAge.default} (or {federalRules.rmdStartAge.bornIn1960OrLater} if born in 1960 or later)</li>
                  <li>This calculator uses simplified assumptions - actual taxes may vary based on state taxes, Medicare premiums, and other factors</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lot Details - Stock Holdings */}
      {stocks.filter(s => s.useLotTracking && Array.isArray(s.lots) && s.lots.length > 0).map((stock, stockIndex) => (
        <div key={`stock-lots-${stockIndex}`} className="bg-white rounded-lg shadow p-6 mb-6 pdf-section pdf-detail-only">
          <h2 className="text-lg font-semibold mb-4 text-gray-800">Stock Lot Details: {stock.name}</h2>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-gray-700">Purchase Date</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-700">Shares</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-700">Cost/Share</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-700">Total Cost Basis</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-700">Current Price</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-700">Current Value</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-700">Gain/Loss</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-700">Gain %</th>
                  <th className="px-3 py-2 text-center font-medium text-gray-700">Term</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {stock.lots.map((lot, lotIndex) => {
                  const currentValue = lot.quantity * stock.currentPrice;
                  const gainLoss = currentValue - lot.totalCostBasis;
                  const gainPercent = lot.totalCostBasis > 0 ? (gainLoss / lot.totalCostBasis) * 100 : 0;
                  const holdingPeriod = calculateHoldingPeriod(lot.purchaseDate);

                  return (
                    <tr key={lotIndex}>
                      <td className="px-3 py-2">{new Date(lot.purchaseDate).toLocaleDateString()}</td>
                      <td className="px-3 py-2 text-right">{lot.quantity.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right">${parseFloat(lot.costBasisPerUnit).toFixed(2)}</td>
                      <td className="px-3 py-2 text-right">${lot.totalCostBasis.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                      <td className="px-3 py-2 text-right">${stock.currentPrice.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right font-medium">${currentValue.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                      <td className={`px-3 py-2 text-right font-medium ${gainLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        ${gainLoss.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                      </td>
                      <td className={`px-3 py-2 text-right ${gainPercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {gainPercent.toFixed(2)}%
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${holdingPeriod.isLongTerm ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                          {holdingPeriod.isLongTerm ? 'Long' : 'Short'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-gray-50 font-semibold">
                <tr>
                  <td className="px-3 py-2">Total</td>
                  <td className="px-3 py-2 text-right">{stock.lots.reduce((sum, lot) => sum + lot.quantity, 0).toLocaleString()}</td>
                  <td className="px-3 py-2"></td>
                  <td className="px-3 py-2 text-right">${stock.lots.reduce((sum, lot) => sum + lot.totalCostBasis, 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                  <td className="px-3 py-2"></td>
                  <td className="px-3 py-2 text-right">${(stock.lots.reduce((sum, lot) => sum + lot.quantity, 0) * stock.currentPrice).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                  <td className={`px-3 py-2 text-right ${((stock.lots.reduce((sum, lot) => sum + lot.quantity, 0) * stock.currentPrice) - stock.lots.reduce((sum, lot) => sum + lot.totalCostBasis, 0)) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    ${((stock.lots.reduce((sum, lot) => sum + lot.quantity, 0) * stock.currentPrice) - stock.lots.reduce((sum, lot) => sum + lot.totalCostBasis, 0)).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                  </td>
                  <td className="px-3 py-2"></td>
                  <td className="px-3 py-2"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ))}

      {/* Lot Details - Cryptocurrency Holdings */}
      {crypto.filter(c => c.useLotTracking && Array.isArray(c.lots) && c.lots.length > 0).map((cryptoAsset, cryptoIndex) => (
        <div key={`crypto-lots-${cryptoIndex}`} className="bg-white rounded-lg shadow p-6 mb-6 pdf-section pdf-detail-only">
          <h2 className="text-lg font-semibold mb-4 text-gray-800">Crypto Lot Details: {cryptoAsset.name}</h2>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-gray-700">Purchase Date</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-700">Units</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-700">Cost/Unit</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-700">Total Cost Basis</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-700">Current Price</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-700">Current Value</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-700">Gain/Loss</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-700">Gain %</th>
                  <th className="px-3 py-2 text-center font-medium text-gray-700">Term</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {cryptoAsset.lots.map((lot, lotIndex) => {
                  const currentValue = lot.quantity * cryptoAsset.currentPrice;
                  const gainLoss = currentValue - lot.totalCostBasis;
                  const gainPercent = lot.totalCostBasis > 0 ? (gainLoss / lot.totalCostBasis) * 100 : 0;
                  const holdingPeriod = calculateHoldingPeriod(lot.purchaseDate);

                  return (
                    <tr key={lotIndex}>
                      <td className="px-3 py-2">{new Date(lot.purchaseDate).toLocaleDateString()}</td>
                      <td className="px-3 py-2 text-right">{lot.quantity.toFixed(4)}</td>
                      <td className="px-3 py-2 text-right">${parseFloat(lot.costBasisPerUnit).toFixed(2)}</td>
                      <td className="px-3 py-2 text-right">${lot.totalCostBasis.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                      <td className="px-3 py-2 text-right">${cryptoAsset.currentPrice.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right font-medium">${currentValue.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                      <td className={`px-3 py-2 text-right font-medium ${gainLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        ${gainLoss.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                      </td>
                      <td className={`px-3 py-2 text-right ${gainPercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {gainPercent.toFixed(2)}%
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${holdingPeriod.isLongTerm ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                          {holdingPeriod.isLongTerm ? 'Long' : 'Short'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-gray-50 font-semibold">
                <tr>
                  <td className="px-3 py-2">Total</td>
                  <td className="px-3 py-2 text-right">{cryptoAsset.lots.reduce((sum, lot) => sum + lot.quantity, 0).toFixed(4)}</td>
                  <td className="px-3 py-2"></td>
                  <td className="px-3 py-2 text-right">${cryptoAsset.lots.reduce((sum, lot) => sum + lot.totalCostBasis, 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                  <td className="px-3 py-2"></td>
                  <td className="px-3 py-2 text-right">${(cryptoAsset.lots.reduce((sum, lot) => sum + lot.quantity, 0) * cryptoAsset.currentPrice).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                  <td className={`px-3 py-2 text-right ${((cryptoAsset.lots.reduce((sum, lot) => sum + lot.quantity, 0) * cryptoAsset.currentPrice) - cryptoAsset.lots.reduce((sum, lot) => sum + lot.totalCostBasis, 0)) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    ${((cryptoAsset.lots.reduce((sum, lot) => sum + lot.quantity, 0) * cryptoAsset.currentPrice) - cryptoAsset.lots.reduce((sum, lot) => sum + lot.totalCostBasis, 0)).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                  </td>
                  <td className="px-3 py-2"></td>
                  <td className="px-3 py-2"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ))}

      {/* Lot Details - Precious Metals Holdings */}
      {metals.filter(m => m.useLotTracking && Array.isArray(m.lots) && m.lots.length > 0).map((metal, metalIndex) => (
        <div key={`metal-lots-${metalIndex}`} className="bg-white rounded-lg shadow p-6 mb-6 pdf-section pdf-detail-only">
          <h2 className="text-lg font-semibold mb-4 text-gray-800">Precious Metal Lot Details: {metal.name}</h2>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-gray-700">Purchase Date</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-700">Units (oz)</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-700">Cost/oz</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-700">Total Cost Basis</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-700">Current Price/oz</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-700">Current Value</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-700">Gain/Loss</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-700">Gain %</th>
                  <th className="px-3 py-2 text-center font-medium text-gray-700">Term</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {metal.lots.map((lot, lotIndex) => {
                  const currentValue = lot.quantity * metal.currentPrice;
                  const gainLoss = currentValue - lot.totalCostBasis;
                  const gainPercent = lot.totalCostBasis > 0 ? (gainLoss / lot.totalCostBasis) * 100 : 0;
                  const holdingPeriod = calculateHoldingPeriod(lot.purchaseDate);

                  return (
                    <tr key={lotIndex}>
                      <td className="px-3 py-2">{new Date(lot.purchaseDate).toLocaleDateString()}</td>
                      <td className="px-3 py-2 text-right">{lot.quantity.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right">${parseFloat(lot.costBasisPerUnit).toFixed(2)}</td>
                      <td className="px-3 py-2 text-right">${lot.totalCostBasis.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                      <td className="px-3 py-2 text-right">${metal.currentPrice.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right font-medium">${currentValue.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                      <td className={`px-3 py-2 text-right font-medium ${gainLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        ${gainLoss.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                      </td>
                      <td className={`px-3 py-2 text-right ${gainPercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {gainPercent.toFixed(2)}%
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${holdingPeriod.isLongTerm ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                          {holdingPeriod.isLongTerm ? 'Long' : 'Short'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-gray-50 font-semibold">
                <tr>
                  <td className="px-3 py-2">Total</td>
                  <td className="px-3 py-2 text-right">{metal.lots.reduce((sum, lot) => sum + lot.quantity, 0).toFixed(2)}</td>
                  <td className="px-3 py-2"></td>
                  <td className="px-3 py-2 text-right">${metal.lots.reduce((sum, lot) => sum + lot.totalCostBasis, 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                  <td className="px-3 py-2"></td>
                  <td className="px-3 py-2 text-right">${(metal.lots.reduce((sum, lot) => sum + lot.quantity, 0) * metal.currentPrice).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                  <td className={`px-3 py-2 text-right ${((metal.lots.reduce((sum, lot) => sum + lot.quantity, 0) * metal.currentPrice) - metal.lots.reduce((sum, lot) => sum + lot.totalCostBasis, 0)) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    ${((metal.lots.reduce((sum, lot) => sum + lot.quantity, 0) * metal.currentPrice) - metal.lots.reduce((sum, lot) => sum + lot.totalCostBasis, 0)).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                  </td>
                  <td className="px-3 py-2"></td>
                  <td className="px-3 py-2"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ))}

      {/* Lot Management Modal */}
      {lotModal.isOpen && (() => {
        const asset = lotModal.assetType === 'stocks' ? stocks[lotModal.assetIndex]
          : lotModal.assetType === 'crypto' ? crypto[lotModal.assetIndex]
          : metals[lotModal.assetIndex];

        if (!asset) return null;

        // Ensure lots is an array
        const assetLots = Array.isArray(asset.lots) ? asset.lots : [];
        const quantityLabel = lotModal.assetType === 'stocks' ? 'Shares' : 'Units';

        return (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
              <div className="p-6 border-b">
                <div className="flex justify-between items-center">
                  <h2 className="text-2xl font-bold text-gray-800">
                    Manage Lots - {lotModal.assetName}
                  </h2>
                  <button
                    onClick={closeLotModal}
                    className="text-gray-500 hover:text-gray-700 text-2xl"
                  >
                    ×
                  </button>
                </div>
                <p className="text-sm text-gray-600 mt-2">
                  Current Price: <span className="font-medium">${(asset.currentPrice || 0).toFixed(2)}</span>
                </p>
              </div>

              <div className="p-6 overflow-y-auto flex-1">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold text-gray-700">
                    Lots ({assetLots.length}/20)
                  </h3>
                  <div className="flex gap-2">
                    <button
                      onClick={() => openCSVImportModal(lotModal.assetIndex, lotModal.assetType)}
                      className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm"
                    >
                      Import CSV
                    </button>
                    <button
                      onClick={() => addLot(lotModal.assetIndex, lotModal.assetType)}
                      disabled={assetLots.length >= 30}
                      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 text-sm"
                    >
                      Add Lot ({assetLots.length}/30)
                    </button>
                  </div>
                </div>

                {assetLots.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border border-gray-200">
                      <thead className="bg-gray-100">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium text-gray-700 border-b">Purchase Date</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-700 border-b">{quantityLabel}</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-700 border-b">Cost/{quantityLabel.slice(0, -1)}</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-700 border-b">Total Cost</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-700 border-b">Current Value</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-700 border-b">Gain/Loss</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-700 border-b">Gain %</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-700 border-b">Term</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-700 border-b">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {assetLots.map((lot, lotIndex) => {
                          const lotMetrics = calculateLotMetrics(lot, asset.currentPrice || 0);
                          const gainPct = lot.totalCostBasis > 0 ? (lotMetrics.gainLoss / lot.totalCostBasis) * 100 : 0;

                          return (
                            <tr key={lot.id} className="hover:bg-gray-50">
                              <td className="px-3 py-2">
                                <input
                                  type="date"
                                  value={lot.purchaseDate}
                                  onChange={(e) => updateLot(lotModal.assetIndex, lotIndex, 'purchaseDate', e.target.value, lotModal.assetType)}
                                  className="w-36 px-2 py-1 border border-gray-300 rounded text-sm"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="number"
                                  value={lot.quantity}
                                  onChange={(e) => updateLot(lotModal.assetIndex, lotIndex, 'quantity', e.target.value, lotModal.assetType)}
                                  className="w-24 px-2 py-1 border border-gray-300 rounded text-sm"
                                  step="0.01"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <PriceInput
                                  value={lot.costBasisPerUnit}
                                  onChange={(newVal) => updateLot(lotModal.assetIndex, lotIndex, 'costBasisPerUnit', newVal, lotModal.assetType)}
                                />
                              </td>
                              <td className="px-3 py-2 font-medium text-gray-700">
                                ${lot.totalCostBasis.toFixed(2)}
                              </td>
                              <td className="px-3 py-2 font-medium text-gray-700">
                                ${lotMetrics.currentValue.toFixed(2)}
                              </td>
                              <td className={`px-3 py-2 font-medium ${lotMetrics.gainLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                ${lotMetrics.gainLoss.toFixed(2)}
                              </td>
                              <td className={`px-3 py-2 font-medium ${gainPct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {gainPct.toFixed(2)}%
                              </td>
                              <td className="px-3 py-2">
                                <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${lotMetrics.isLongTerm ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                  {lotMetrics.isLongTerm ? 'Long' : 'Short'} ({Math.floor(lotMetrics.days)}d)
                                </span>
                              </td>
                              <td className="px-3 py-2">
                                <button
                                  onClick={() => removeLot(lotModal.assetIndex, lotIndex, lotModal.assetType)}
                                  className="text-red-600 hover:text-red-800 text-xs"
                                >
                                  Remove
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="bg-gray-50 font-medium">
                        <tr className="border-t-2 border-gray-300">
                          <td className="px-3 py-2 text-gray-700">Totals:</td>
                          <td className="px-3 py-2 text-gray-700">
                            {assetLots.reduce((sum, lot) => sum + (lot.quantity || 0), 0).toFixed(2)}
                          </td>
                          <td className="px-3 py-2 text-gray-700">
                            Avg: ${assetLots.length > 0 ?
                              (assetLots.reduce((sum, lot) => sum + (lot.totalCostBasis || 0), 0) /
                               assetLots.reduce((sum, lot) => sum + (lot.quantity || 0), 0)).toFixed(2)
                            : '0.00'}
                          </td>
                          <td className="px-3 py-2 text-gray-700">
                            ${assetLots.reduce((sum, lot) => sum + (lot.totalCostBasis || 0), 0).toFixed(2)}
                          </td>
                          <td className="px-3 py-2 text-gray-700">
                            ${(assetLots.reduce((sum, lot) => sum + (lot.quantity || 0), 0) * (asset.currentPrice || 0)).toFixed(2)}
                          </td>
                          <td className={`px-3 py-2 ${
                            (assetLots.reduce((sum, lot) => sum + (lot.quantity || 0), 0) * (asset.currentPrice || 0) -
                             assetLots.reduce((sum, lot) => sum + (lot.totalCostBasis || 0), 0)) >= 0
                              ? 'text-green-600' : 'text-red-600'
                          }`}>
                            ${(assetLots.reduce((sum, lot) => sum + (lot.quantity || 0), 0) * (asset.currentPrice || 0) -
                               assetLots.reduce((sum, lot) => sum + (lot.totalCostBasis || 0), 0)).toFixed(2)}
                          </td>
                          <td colSpan="3"></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-12 text-gray-500">
                    <p className="mb-2">No lots added yet.</p>
                    <p className="text-sm">Click "Add Lot" to add manually or "Import CSV" to import from your brokerage.</p>
                  </div>
                )}

                <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <h4 className="text-sm font-semibold text-gray-800 mb-2">CSV Import Format:</h4>
                  <p className="text-xs text-gray-600 mb-2">
                    Your CSV should have columns: <strong>Purchase Date (YYYY-MM-DD), Quantity, Cost Per Unit</strong>
                  </p>
                  <pre className="text-xs bg-white p-2 rounded border border-gray-300 overflow-x-auto">
{`Purchase Date,Quantity,Cost Per Unit
2023-01-15,100,45.50
2024-06-20,50,52.75`}
                  </pre>
                </div>
              </div>

              <div className="p-6 border-t bg-gray-50">
                <button
                  onClick={closeLotModal}
                  className="px-6 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* CSV Import Modal */}
      {csvImportModal.isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full p-6">
            <h3 className="text-lg font-semibold mb-4">Import Lots from CSV</h3>
            <p className="text-sm text-gray-600 mb-3">
              Paste CSV data with columns: <strong>Purchase Date (YYYY-MM-DD), Quantity, Cost Per Unit</strong>
            </p>
            <p className="text-xs text-gray-500 mb-3">
              Example:<br/>
              Purchase Date,Quantity,Cost Per Unit<br/>
              2023-01-15,100,45.50<br/>
              2024-06-20,50,52.75
            </p>
            <textarea
              value={csvImportModal.csvText}
              onChange={(e) => setCSVImportModal({...csvImportModal, csvText: e.target.value})}
              className="w-full h-48 px-3 py-2 border border-gray-300 rounded-md font-mono text-sm"
              placeholder="Paste CSV data here..."
            />
            <div className="flex gap-3 mt-4">
              <button
                onClick={parseCSVAndImportLots}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Import Lots
              </button>
              <button
                onClick={closeCSVImportModal}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

        </>
      )}
    </div>
  );
}
