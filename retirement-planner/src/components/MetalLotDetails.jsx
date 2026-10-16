import React from 'react';

export default function MetalLotDetails({ metals, calculateHoldingPeriod }) {
  return (
    <>
      {/* Lot Details - Precious Metals Holdings */}
      {metals.filter(m => m.useLotTracking && Array.isArray(m.lots) && m.lots.length > 0).map((metal, metalIndex) => (
        <div key={`metal-lots-${metalIndex}`} className="bg-white rounded-lg shadow p-6 mb-6 pdf-section pdf-detail-only">
          <h2 className="text-lg font-semibold mb-4 text-gray-800">Precious Metal Lot Details: {metal.name}</h2>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-gray-700">Purchase Date</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-700">Units (oz)</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-700">Cost/oz</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-700">Total Cost Basis</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-700">Current Price/oz</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-700">Current Value</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-700">Gain/Loss</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-700">Gain %</th>
                  <th className="px-3 py-2 text-center font-medium text-gray-700">Term</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {metal.lots.map((lot, lotIndex) => {
                  const currentValue = lot.quantity * metal.currentPrice;
                  const gainLoss = currentValue - lot.totalCostBasis;
                  const gainPercent = lot.totalCostBasis > 0 ? (gainLoss / lot.totalCostBasis) * 100 : 0;
                  const holdingPeriod = calculateHoldingPeriod(lot.purchaseDate);

                  return (
                    <tr key={lotIndex}>
                      <td className="px-3 py-2">{new Date(lot.purchaseDate).toLocaleDateString()}</td>
                      <td className="px-3 py-2 text-right">{lot.quantity.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right">${parseFloat(lot.costBasisPerUnit).toFixed(2)}</td>
                      <td className="px-3 py-2 text-right">${lot.totalCostBasis.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                      <td className="px-3 py-2 text-right">${metal.currentPrice.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right font-medium">${currentValue.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                      <td className={`px-3 py-2 text-right font-medium ${gainLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        ${gainLoss.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                      </td>
                      <td className={`px-3 py-2 text-right ${gainPercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {gainPercent.toFixed(2)}%
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${holdingPeriod.isLongTerm ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                          {holdingPeriod.isLongTerm ? 'Long' : 'Short'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-gray-50 font-semibold">
                <tr>
                  <td className="px-3 py-2">Total</td>
                  <td className="px-3 py-2 text-right">{metal.lots.reduce((sum, lot) => sum + lot.quantity, 0).toFixed(2)}</td>
                  <td className="px-3 py-2"></td>
                  <td className="px-3 py-2 text-right">${metal.lots.reduce((sum, lot) => sum + lot.totalCostBasis, 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                  <td className="px-3 py-2"></td>
                  <td className="px-3 py-2 text-right">${(metal.lots.reduce((sum, lot) => sum + lot.quantity, 0) * metal.currentPrice).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                  <td className={`px-3 py-2 text-right ${((metal.lots.reduce((sum, lot) => sum + lot.quantity, 0) * metal.currentPrice) - metal.lots.reduce((sum, lot) => sum + lot.totalCostBasis, 0)) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    ${((metal.lots.reduce((sum, lot) => sum + lot.quantity, 0) * metal.currentPrice) - metal.lots.reduce((sum, lot) => sum + lot.totalCostBasis, 0)).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                  </td>
                  <td className="px-3 py-2"></td>
                  <td className="px-3 py-2"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ))}
    </>
  );
}
