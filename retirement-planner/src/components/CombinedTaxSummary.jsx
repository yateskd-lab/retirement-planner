import React from 'react';
import { Calculator } from 'lucide-react';
import { formatRate } from '../taxConfig';

export default function CombinedTaxSummary({ federalRules, results }) {
  return (
    <>
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
    </>
  );
}
