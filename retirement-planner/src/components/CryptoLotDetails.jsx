import React from 'react';

export default function CryptoLotDetails({ crypto, calculateHoldingPeriod }) {
  return (
    <>
      {/* Lot Details - Cryptocurrency Holdings */}
      {crypto.filter(c => c.useLotTracking && Array.isArray(c.lots) && c.lots.length > 0).map((cryptoAsset, cryptoIndex) => (
        <div key={`crypto-lots-${cryptoIndex}`} className="bg-white rounded-lg shadow p-6 mb-6 pdf-section pdf-detail-only">
          <h2 className="text-lg font-semibold mb-4 text-gray-800">Crypto Lot Details: {cryptoAsset.name}</h2>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-gray-700">Purchase Date</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-700">Units</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-700">Cost/Unit</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-700">Total Cost Basis</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-700">Current Price</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-700">Current Value</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-700">Gain/Loss</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-700">Gain %</th>
                  <th className="px-3 py-2 text-center font-medium text-gray-700">Term</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {cryptoAsset.lots.map((lot, lotIndex) => {
                  const currentValue = lot.quantity * cryptoAsset.currentPrice;
                  const gainLoss = currentValue - lot.totalCostBasis;
                  const gainPercent = lot.totalCostBasis > 0 ? (gainLoss / lot.totalCostBasis) * 100 : 0;
                  const holdingPeriod = calculateHoldingPeriod(lot.purchaseDate);

                  return (
                    <tr key={lotIndex}>
                      <td className="px-3 py-2">{new Date(lot.purchaseDate).toLocaleDateString()}</td>
                      <td className="px-3 py-2 text-right">{lot.quantity.toFixed(4)}</td>
                      <td className="px-3 py-2 text-right">${parseFloat(lot.costBasisPerUnit).toFixed(2)}</td>
                      <td className="px-3 py-2 text-right">${lot.totalCostBasis.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                      <td className="px-3 py-2 text-right">${cryptoAsset.currentPrice.toFixed(2)}</td>
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
                  <td className="px-3 py-2 text-right">{cryptoAsset.lots.reduce((sum, lot) => sum + lot.quantity, 0).toFixed(4)}</td>
                  <td className="px-3 py-2"></td>
                  <td className="px-3 py-2 text-right">${cryptoAsset.lots.reduce((sum, lot) => sum + lot.totalCostBasis, 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                  <td className="px-3 py-2"></td>
                  <td className="px-3 py-2 text-right">${(cryptoAsset.lots.reduce((sum, lot) => sum + lot.quantity, 0) * cryptoAsset.currentPrice).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                  <td className={`px-3 py-2 text-right ${((cryptoAsset.lots.reduce((sum, lot) => sum + lot.quantity, 0) * cryptoAsset.currentPrice) - cryptoAsset.lots.reduce((sum, lot) => sum + lot.totalCostBasis, 0)) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    ${((cryptoAsset.lots.reduce((sum, lot) => sum + lot.quantity, 0) * cryptoAsset.currentPrice) - cryptoAsset.lots.reduce((sum, lot) => sum + lot.totalCostBasis, 0)).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
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
