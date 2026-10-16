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

export const TAX_RULES = loadTaxRules(taxRulesFile);
export const TAX_YEAR = TAX_RULES.year;

// 0.0455 -> "4.55%", 0.038 -> "3.8%"
export const formatRate = (rate) => `${+(rate * 100).toFixed(2)}%`;

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

export const toCents = (amount) => Math.round(amount * 100) / 100;

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

export const MEDICARE_RULES = loadMedicareRules(taxRulesFile.medicare);
export const LOOKBACK_YEARS = MEDICARE_RULES.lookbackYears;
export const IRMAA_YEAR = TAX_YEAR + LOOKBACK_YEARS;
export const IRMAA_SOURCE_YEAR = (() => {
  const published = Object.keys(MEDICARE_RULES.premiumYears).map(Number);
  const notLater = published.filter(year => year <= IRMAA_YEAR);
  return notLater.length > 0 ? Math.max(...notLater) : Math.min(...published);
})();
export const IRMAA_PROJECTION_YEARS = Math.max(0, IRMAA_YEAR - IRMAA_SOURCE_YEAR);
export const IRMAA_PROJECTED = IRMAA_PROJECTION_YEARS > 0;
export const { brackets: PROJECTED_IRMAA_BRACKETS, basePremiums: PROJECTED_BASE_PREMIUMS } = projectPremiumYear(
  MEDICARE_RULES.premiumYears[IRMAA_SOURCE_YEAR], IRMAA_SOURCE_YEAR, IRMAA_YEAR, MEDICARE_RULES.projection
);

// Shown wherever the brackets are, so it's clear how much to trust them.
export const IRMAA_BASIS_TEXT = (() => {
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
export const forFilingStatus = (table, filingStatus) => table[filingStatus] ?? table.married;

export const FILING_STATUS_LABELS = {
  single: 'Single',
  married: 'Married Filing Jointly',
  marriedFilingSeparately: 'Married Filing Separately',
  hoh: 'Head of Household',
  qualifyingSurvivingSpouse: 'Qualifying Surviving Spouse'
};
// ===== END TAX RULES =====

