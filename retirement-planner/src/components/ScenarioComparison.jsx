import React from 'react';
import { Calculator, AlertCircle } from 'lucide-react';
import { formatRate } from '../taxConfig';

export default function ScenarioComparison({ accounts, activeScenarioId, calculateScenario, federalRules, results, scenarios }) {
  return (
    <>
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
    </>
  );
}
