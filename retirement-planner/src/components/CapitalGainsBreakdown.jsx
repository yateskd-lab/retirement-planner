import React from 'react';
import { AlertCircle } from 'lucide-react';

export default function CapitalGainsBreakdown({ results }) {
  return (
    <>
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
    </>
  );
}
