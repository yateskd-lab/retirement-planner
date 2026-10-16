import React from 'react';
import { DollarSign } from 'lucide-react';
import { TAX_YEAR, TAX_RULES, forFilingStatus, formatRate } from '../taxConfig';

export default function UtahStateTax({ personalInfo, results, utahTaxRate }) {
  return (
    <>
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
    </>
  );
}
