import React from 'react';
import { DollarSign, TrendingDown, AlertCircle } from 'lucide-react';
import { IRMAA_PROJECTED, IRMAA_PROJECTION_YEARS } from '../taxConfig';
import { computeRothOptimization } from '../rothOptimizer';

export default function RetirementWithdrawals({ accounts, calculateScenario, getActiveScenario, irmaaBracketsFor, irmaaBuffer, irmaaFilingStatus, rothOptimizationStrategy, setIrmaaBuffer, setRothOptimizationStrategy, updateActiveScenario, updateWithdrawal }) {
  return (
    <>
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

            const irmaaBrackets = irmaaBracketsFor(irmaaFilingStatus);
            const {
              optimalAmount, limitingFactor, reason, taxBracketRoom, irmaaRoom, niitRoom, roomToNextIRMAABracket,
            } = computeRothOptimization({
              baselineResults, irmaaBrackets, irmaaBuffer, rothOptimizationStrategy, accounts,
            });

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
                      <div>Tax Bracket Room: <strong>{Number.isFinite(taxBracketRoom) ? `$${Math.round(taxBracketRoom).toLocaleString()}` : 'No limit (top bracket)'}</strong></div>
                      <div>IRMAA Room (w/ buffer): <strong>{Number.isFinite(irmaaRoom) ? `$${Math.round(irmaaRoom).toLocaleString()}` : 'No limit (top IRMAA bracket)'}</strong></div>
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
    </>
  );
}
