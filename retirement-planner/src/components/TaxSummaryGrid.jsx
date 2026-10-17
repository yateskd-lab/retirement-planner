import React from 'react';
import { formatRate } from '../taxConfig';

export default function TaxSummaryGrid({ federalRules, getActiveScenario, personalInfo, results, socialSecurity }) {
  return (
    <>
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
                    {Number.isFinite(results.roomInBracket) && results.roomInBracket > 0 ? `${Math.round(results.roomInBracket).toLocaleString()}` : 'In highest bracket'}
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
    </>
  );
}
