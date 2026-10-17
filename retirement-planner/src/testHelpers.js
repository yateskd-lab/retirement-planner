// Shared setup for the tax engine tests.
import { createTaxEngine } from './taxEngine';
import {
  createDefaultPersonalInfo,
  createDefaultScenario,
  createDefaultSocialSecurity,
} from './defaults';

// A person with no income at all, so each test sets only what it is about.
export const noIncome = {
  workMonths: 0,
  monthlyWorkIncome: 0,
  monthlyPension: 0,
  pensionStartMonth: 0,
  interestIncome: 0,
  qualifiedDividends: 0,
  ordinaryDividends: 0,
};

export const makeEngine = ({
  personalInfo = {},
  stocks = [],
  crypto = [],
  metals = [],
  socialSecurity = {},
} = {}) =>
  createTaxEngine({
    personalInfo: { ...createDefaultPersonalInfo(), ...noIncome, ...personalInfo },
    stocks,
    crypto,
    metals,
    socialSecurity: { ...createDefaultSocialSecurity(), ...socialSecurity },
  });

// A scenario with every withdrawal at zero except the ones given.
export const makeScenario = ({ withdrawals = {}, ...rest } = {}) => {
  const base = createDefaultScenario();
  return { ...base, ...rest, withdrawals: { ...base.withdrawals, ...withdrawals } };
};

// One-step helper: engine + scenario -> results.
export const run = (setup = {}, scenario = {}) =>
  makeEngine(setup).calculateScenario(makeScenario(scenario));
