import React from 'react';
import { TrendingDown } from 'lucide-react';
import { TAX_YEAR } from '../taxConfig';

export default function TaxSummary({ ordinaryBracketsFor, personalInfo, results }) {
  return (
    <>
      {/* Tax Summary */}
      <div className="bg-white rounded-lg shadow p-6 mb-6 pdf-section">
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
    </>
  );
}
