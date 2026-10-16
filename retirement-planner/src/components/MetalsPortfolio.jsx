import React from 'react';
import PriceInput from './PriceInput';

export default function MetalsPortfolio({ metals, addMetal, updateMetal, removeMetal, toggleLotTracking, openLotModal }) {
  return (
    <>
      {/* Precious Metals Portfolio */}
      <div className="bg-white rounded-lg shadow p-6 mb-6 pdf-section pdf-detail-only">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-gray-800">Precious Metals Holdings</h2>
          {metals.length < 12 && (
            <button
              onClick={addMetal}
              className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700"
            >
              Add Metal
            </button>
          )}
        </div>
        
        <p className="text-xs text-gray-600 mb-3">
          Track your precious metals (gold, silver, platinum, etc.). Note: Collectibles may be taxed at 28% federally, but this tool uses 15% for simplification.
        </p>
        
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Lot Tracking</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Metal Type</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Units (oz)</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Avg Cost Basis/oz</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Current Price/oz</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Total Value</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Total Gain</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Gain %</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Exclude</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {metals.map((metal, index) => {
                // Calculate rolled-up values from lots if lot tracking is enabled
                let totalUnits, avgCostBasis, totalCost, totalValue, totalGain, gainPercentage;

                // Ensure lots is an array
                const lots = Array.isArray(metal.lots) ? metal.lots : [];

                if (metal.useLotTracking && lots.length > 0) {
                  // Roll up from lots
                  totalUnits = lots.reduce((sum, lot) => sum + (lot.quantity || 0), 0);
                  totalCost = lots.reduce((sum, lot) => sum + (lot.totalCostBasis || 0), 0);
                  avgCostBasis = totalUnits > 0 ? totalCost / totalUnits : 0;
                  // Ensure avgCostBasis always shows 2 decimal places
                  avgCostBasis = parseFloat(avgCostBasis.toFixed(2));
                  totalValue = totalUnits * (metal.currentPrice || 0);
                  totalGain = totalValue - totalCost;
                  gainPercentage = totalCost > 0 ? ((totalGain / totalCost) * 100) : 0;
                } else {
                  // Use legacy simple values
                  totalUnits = metal.units || 0;
                  avgCostBasis = metal.costBasis || 0;
                  totalValue = (metal.units || 0) * (metal.currentPrice || 0);
                  totalCost = (metal.units || 0) * (metal.costBasis || 0);
                  totalGain = totalValue - totalCost;
                  gainPercentage = totalCost > 0 ? ((totalGain / totalCost) * 100) : 0;
                }
                
                return (
                  <tr key={index}>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={metal.useLotTracking || false}
                        onChange={(e) => toggleLotTracking(index, e.target.checked, 'metals')}
                        className="w-4 h-4 cursor-pointer"
                        title="Enable lot tracking"
                      />
                      {metal.useLotTracking && (
                        <button
                          onClick={() => openLotModal(index, 'metals', metal.name)}
                          className="ml-2 text-xs text-blue-600 hover:text-blue-800 underline whitespace-nowrap"
                        >
                          Manage Lots ({lots.length})
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={metal.name}
                        onChange={(e) => updateMetal(index, 'name', e.target.value)}
                        className="w-full px-2 py-1 border border-gray-300 rounded"
                        placeholder="Gold, Silver, etc."
                      />
                    </td>
                    <td className="px-3 py-2">
                      {metal.useLotTracking ? (
                        <div className="text-sm font-medium text-gray-700 bg-gray-100 px-2 py-1 rounded w-24">
                          {totalUnits.toFixed(2)}
                        </div>
                      ) : (
                        <PriceInput
                          value={metal.units || 0}
                          onChange={(newVal) => updateMetal(index, 'units', newVal)}
                        />
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {metal.useLotTracking ? (
                        <div className="text-sm font-medium text-gray-700 bg-gray-100 px-2 py-1 rounded w-24">
                          ${avgCostBasis.toFixed(2)}
                        </div>
                      ) : (
                        <PriceInput
                          value={metal.costBasis || 0}
                          onChange={(newVal) => updateMetal(index, 'costBasis', newVal)}
                        />
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <PriceInput
                        value={metal.currentPrice || 0}
                        onChange={(newVal) => updateMetal(index, 'currentPrice', newVal)}
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
                          checked={metal.excludeFromTotals || false}
                          onChange={(e) => updateMetal(index, 'excludeFromTotals', e.target.checked)}
                          className="rounded"
                        />
                      </label>
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => removeMetal(index)}
                        className="text-red-600 hover:text-red-800 text-sm"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {metals.length > 0 && (
              <tfoot className="bg-gray-50 font-semibold">
                {(() => {
                  // Totals omit any holding with "Exclude" checked
                  const totals = metals.reduce((acc, metal) => {
                    if (metal.excludeFromTotals) return acc;

                    const lots = Array.isArray(metal.lots) ? metal.lots : [];
                    let totalCost, totalValue;

                    if (metal.useLotTracking && lots.length > 0) {
                      const totalUnits = lots.reduce((sum, lot) => sum + (lot.quantity || 0), 0);
                      totalCost = lots.reduce((sum, lot) => sum + (lot.totalCostBasis || 0), 0);
                      totalValue = totalUnits * (metal.currentPrice || 0);
                    } else {
                      totalCost = (metal.units || 0) * (metal.costBasis || 0);
                      totalValue = (metal.units || 0) * (metal.currentPrice || 0);
                    }

                    return { cost: acc.cost + totalCost, value: acc.value + totalValue };
                  }, { cost: 0, value: 0 });

                  const totalGain = totals.value - totals.cost;
                  const gainPercentage = totals.cost > 0 ? ((totalGain / totals.cost) * 100) : 0;

                  return (
                    <tr>
                      {/* Units (oz) and Avg Cost Basis/oz are left blank on purpose:
                          an ounce of gold and an ounce of silver are not the same unit,
                          so neither a sum nor an average across them means anything. */}
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

        {metals.length === 0 && (
          <p className="text-center text-gray-500 py-4">No metals added yet. Click "Add Metal" to get started.</p>
        )}
      </div>
    </>
  );
}
