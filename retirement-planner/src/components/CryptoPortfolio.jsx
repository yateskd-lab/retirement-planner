import React from 'react';
import PriceInput from './PriceInput';

export default function CryptoPortfolio({ crypto, addCrypto, updateCrypto, removeCrypto, toggleLotTracking, openLotModal }) {
  return (
    <>
      {/* Crypto Portfolio */}
      <div className="bg-white rounded-lg shadow p-6 mb-6 pdf-section pdf-detail-only">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-gray-800">Cryptocurrency Holdings</h2>
          {crypto.length < 12 && (
            <button
              onClick={addCrypto}
              className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700"
            >
              Add Crypto
            </button>
          )}
        </div>
        
        <p className="text-xs text-gray-600 mb-3">
          Track your cryptocurrency holdings. Crypto gains/losses are taxed as capital gains.
        </p>
        
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Lot Tracking</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Crypto Name</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Units Owned</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Avg Cost Basis/Unit</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Current Price</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Total Value</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Total Gain</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Gain %</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Exclude</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {crypto.map((cryptoAsset, index) => {
                // Calculate rolled-up values from lots if lot tracking is enabled
                let totalUnits, avgCostBasis, totalCost, totalValue, totalGain, gainPercentage;

                // Ensure lots is an array
                const lots = Array.isArray(cryptoAsset.lots) ? cryptoAsset.lots : [];

                if (cryptoAsset.useLotTracking && lots.length > 0) {
                  // Roll up from lots
                  totalUnits = lots.reduce((sum, lot) => sum + (lot.quantity || 0), 0);
                  totalCost = lots.reduce((sum, lot) => sum + (lot.totalCostBasis || 0), 0);
                  avgCostBasis = totalUnits > 0 ? totalCost / totalUnits : 0;
                  // Ensure avgCostBasis always shows 2 decimal places
                  avgCostBasis = parseFloat(avgCostBasis.toFixed(2));
                  totalValue = totalUnits * (cryptoAsset.currentPrice || 0);
                  totalGain = totalValue - totalCost;
                  gainPercentage = totalCost > 0 ? ((totalGain / totalCost) * 100) : 0;
                } else {
                  // Use legacy simple values
                  totalUnits = cryptoAsset.units || 0;
                  avgCostBasis = cryptoAsset.costBasis || 0;
                  totalValue = (cryptoAsset.units || 0) * (cryptoAsset.currentPrice || 0);
                  totalCost = (cryptoAsset.units || 0) * (cryptoAsset.costBasis || 0);
                  totalGain = totalValue - totalCost;
                  gainPercentage = totalCost > 0 ? ((totalGain / totalCost) * 100) : 0;
                }
                
                return (
                  <tr key={index}>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={cryptoAsset.useLotTracking || false}
                        onChange={(e) => toggleLotTracking(index, e.target.checked, 'crypto')}
                        className="w-4 h-4 cursor-pointer"
                        title="Enable lot tracking"
                      />
                      {cryptoAsset.useLotTracking && (
                        <button
                          onClick={() => openLotModal(index, 'crypto', cryptoAsset.name)}
                          className="ml-2 text-xs text-blue-600 hover:text-blue-800 underline whitespace-nowrap"
                        >
                          Manage Lots ({lots.length})
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={cryptoAsset.name}
                        onChange={(e) => updateCrypto(index, 'name', e.target.value)}
                        className="w-full px-2 py-1 border border-gray-300 rounded"
                        placeholder="BTC, ETH, etc."
                      />
                    </td>
                    <td className="px-3 py-2">
                      {cryptoAsset.useLotTracking ? (
                        <div className="text-sm font-medium text-gray-700 bg-gray-100 px-2 py-1 rounded w-24">
                          {totalUnits.toFixed(4)}
                        </div>
                      ) : (
                        <PriceInput
                          value={cryptoAsset.units || 0}
                          onChange={(newVal) => updateCrypto(index, 'units', newVal)}
                          decimals={6}
                          step={0.0001}
                        />
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {cryptoAsset.useLotTracking ? (
                        <div className="text-sm font-medium text-gray-700 bg-gray-100 px-2 py-1 rounded w-24">
                          ${avgCostBasis.toFixed(2)}
                        </div>
                      ) : (
                        <PriceInput
                          value={cryptoAsset.costBasis || 0}
                          onChange={(newVal) => updateCrypto(index, 'costBasis', newVal)}
                        />
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <PriceInput
                        value={cryptoAsset.currentPrice || 0}
                        onChange={(newVal) => updateCrypto(index, 'currentPrice', newVal)}
                        showDollarSign
                      />
                    </td>
                    <td className="px-3 py-2 font-medium">
                      ${totalValue.toLocaleString()}
                    </td>
                    <td className={`px-3 py-2 font-medium ${totalGain >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      ${totalGain.toLocaleString()}
                    </td>
                    <td className={`px-3 py-2 font-medium ${gainPercentage >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {gainPercentage.toFixed(2)}%
                    </td>
                    <td className="px-3 py-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={cryptoAsset.excludeFromTotals || false}
                          onChange={(e) => updateCrypto(index, 'excludeFromTotals', e.target.checked)}
                          className="rounded"
                        />
                      </label>
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => removeCrypto(index)}
                        className="text-red-600 hover:text-red-800 text-sm"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {crypto.length > 0 && (
              <tfoot className="bg-gray-50 font-semibold">
                {(() => {
                  // Totals omit any holding with "Exclude" checked
                  const totals = crypto.reduce((acc, cryptoAsset) => {
                    if (cryptoAsset.excludeFromTotals) return acc;

                    const lots = Array.isArray(cryptoAsset.lots) ? cryptoAsset.lots : [];
                    let totalCost, totalValue;

                    if (cryptoAsset.useLotTracking && lots.length > 0) {
                      const totalUnits = lots.reduce((sum, lot) => sum + (lot.quantity || 0), 0);
                      totalCost = lots.reduce((sum, lot) => sum + (lot.totalCostBasis || 0), 0);
                      totalValue = totalUnits * (cryptoAsset.currentPrice || 0);
                    } else {
                      totalCost = (cryptoAsset.units || 0) * (cryptoAsset.costBasis || 0);
                      totalValue = (cryptoAsset.units || 0) * (cryptoAsset.currentPrice || 0);
                    }

                    return { cost: acc.cost + totalCost, value: acc.value + totalValue };
                  }, { cost: 0, value: 0 });

                  const totalGain = totals.value - totals.cost;
                  const gainPercentage = totals.cost > 0 ? ((totalGain / totals.cost) * 100) : 0;

                  return (
                    <tr>
                      {/* Units Owned and Avg Cost Basis/Unit are left blank on purpose:
                          units of different coins are not the same unit, so neither
                          a sum nor an average across them means anything. */}
                      <td className="px-3 py-2" colSpan="5">Total</td>
                      <td className="px-3 py-2">
                        ${totals.value.toLocaleString()}
                      </td>
                      <td className={`px-3 py-2 ${totalGain >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        ${totalGain.toLocaleString()}
                      </td>
                      <td className={`px-3 py-2 ${gainPercentage >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {gainPercentage.toFixed(2)}%
                      </td>
                      <td className="px-3 py-2" colSpan="2"></td>
                    </tr>
                  );
                })()}
              </tfoot>
            )}
          </table>
        </div>

        {crypto.length === 0 && (
          <p className="text-center text-gray-500 py-4">No crypto added yet. Click "Add Crypto" to get started.</p>
        )}
      </div>
    </>
  );
}
