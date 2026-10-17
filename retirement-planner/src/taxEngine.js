import {
  TAX_RULES,
  TAX_YEAR,
  IRMAA_YEAR,
  PROJECTED_IRMAA_BRACKETS,
  PROJECTED_BASE_PREMIUMS,
  MEDICARE_RULES,
  forFilingStatus,
} from './taxConfig';
import { assetQuantityOwned } from './defaults';

// Everything that used to sit between `if (isLoading)` and the results in the
// component. It closes over the user's inputs, so it is built from them: call
// createTaxEngine(inputs) on each render and use the returned functions as before.
export const createTaxEngine = ({ personalInfo, stocks, crypto, metals, socialSecurity }) => {
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

  return {
    federalRules,
    utahTaxRate,
    ordinaryBracketsFor,
    capitalGainsBracketsFor,
    irmaaBracketsFor,
    irmaaFilingStatus,
    calculateHoldingPeriod,
    calculateLotMetrics,
    selectLots,
    calculateTax,
    calculateCapitalGainsTax,
    calculateScenario,
  };
};
