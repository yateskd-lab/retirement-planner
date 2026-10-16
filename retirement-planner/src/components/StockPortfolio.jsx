import React from 'react';
import { Eye, EyeOff } from 'lucide-react';
import PriceInput from './PriceInput';

export default function StockPortfolio({ stocks, addStock, updateStock, removeStock, updateAllStockPrices, toggleLotTracking, openLotModal, apiKey, setApiKey, showApiKey, setShowApiKey, loadingPrices, debugLog, setDebugLog }) {
  return (
    <>
      {/* Stock Portfolio */}
      <div className="bg-white rounded-lg shadow p-6 mb-6 pdf-section pdf-detail-only">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-gray-800">Brokerage Account - Individual Stocks</h2>
          <div className="flex gap-2">
            <button
              onClick={updateAllStockPrices}
              disabled={loadingPrices}
              className="px-4 py-2 bg-purple-600 text-white rounded-md text-sm hover:bg-purple-700 disabled:bg-gray-400"
            >
              {loadingPrices ? 'Updating...' : 'Update Prices'}
            </button>
            {stocks.length < 12 && (
              <button
                onClick={addStock}
                className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700"
              >
                Add Stock
              </button>
            )}
          </div>
        </div>

        {/* API KEY INPUT */}
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
          <p className="text-xs text-gray-700 mb-2">
            <strong>Tip:</strong> Use ticker symbols (e.g., AAPL, MSFT, GOOGL) as stock names to automatically fetch current prices.
          </p>
          <div className="flex items-center gap-3">
            <label className="text-xs font-medium text-gray-700">
              Alpha Vantage API Key (get free key at <a href="https://www.alphavantage.co/support/#api-key" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">alphavantage.co</a>):
            </label>
            <div className="flex-1 relative">
              <input
                type={showApiKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Enter your free API key here"
                className="w-full px-3 py-1 pr-10 border border-gray-300 rounded text-sm"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700"
                title={showApiKey ? "Hide API key" : "Show API key"}
              >
                {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Stock Name</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Lot Tracking</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Shares Owned</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Avg Cost/Share</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Current Price</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Total Value</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Total Gain</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Gain %</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Skip Update</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Exclude</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {stocks.map((stock, index) => {
                // Calculate rolled-up values from lots if lot tracking is enabled
                let totalShares, avgCostBasis, totalCost, totalValue, totalGain, gainPercentage;

                // Ensure lots is an array
                const lots = Array.isArray(stock.lots) ? stock.lots : [];

                if (stock.useLotTracking && lots.length > 0) {
                  // Roll up from lots
                  totalShares = lots.reduce((sum, lot) => sum + (lot.quantity || 0), 0);
                  totalCost = lots.reduce((sum, lot) => sum + (lot.totalCostBasis || 0), 0);
                  avgCostBasis = totalShares > 0 ? totalCost / totalShares : 0;
                  // Ensure avgCostBasis always shows 2 decimal places
                  avgCostBasis = parseFloat(avgCostBasis.toFixed(2));
                  totalValue = totalShares * (stock.currentPrice || 0);
                  totalGain = totalValue - totalCost;
                  gainPercentage = totalCost > 0 ? ((totalGain / totalCost) * 100) : 0;
                } else {
                  // Use legacy simple values
                  totalShares = stock.shares || 0;
                  avgCostBasis = stock.costBasis || 0;
                  totalValue = (stock.shares || 0) * (stock.currentPrice || 0);
                  totalCost = (stock.shares || 0) * (stock.costBasis || 0);
                  totalGain = totalValue - totalCost;
                  gainPercentage = totalCost > 0 ? ((totalGain / totalCost) * 100) : 0;
                }
                
                return (
                  <tr key={index}>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={stock.name}
                        onChange={(e) => updateStock(index, 'name', e.target.value)}
                        className="w-full px-2 py-1 border border-gray-300 rounded"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={stock.useLotTracking || false}
                          onChange={(e) => toggleLotTracking(index, e.target.checked, 'stocks')}
                          className="rounded"
                        />
                        <span className="text-xs">{stock.useLotTracking ? `${lots.length} lots` : 'Enable'}</span>
                      </label>
                      {stock.useLotTracking && (
                        <button
                          onClick={() => openLotModal(index, 'stocks')}
                          className="mt-1 text-xs text-blue-600 hover:text-blue-800 underline"
                        >
                          Manage Lots
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {stock.useLotTracking ? (
                        <div className="text-sm font-medium text-gray-700 bg-gray-100 px-2 py-1 rounded">
                          {Math.round(totalShares).toLocaleString()}
                        </div>
                      ) : (
                        <input
                          type="number"
                          value={stock.shares}
                          onChange={(e) => updateStock(index, 'shares', e.target.value)}
                          className="w-24 px-2 py-1 border border-gray-300 rounded"
                        />
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {stock.useLotTracking ? (
                        <div className="text-sm font-medium text-gray-700 bg-gray-100 px-2 py-1 rounded">
                          ${avgCostBasis.toFixed(2)}
                        </div>
                      ) : (
                        <PriceInput
                          value={stock.costBasis}
                          onChange={(newVal) => updateStock(index, 'costBasis', newVal)}
                        />
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <PriceInput
                        value={stock.currentPrice}
                        onChange={(newVal) => updateStock(index, 'currentPrice', newVal)}
                        showDollarSign
                      />
                    </td>
                    <td className="px-3 py-2 font-medium">
                      ${Math.round(totalValue).toLocaleString()}
                    </td>
                    <td className={`px-3 py-2 font-medium ${totalGain >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      ${Math.round(totalGain).toLocaleString()}
                    </td>
                    <td className={`px-3 py-2 font-medium ${gainPercentage >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {gainPercentage.toFixed(2)}%
                    </td>
                    <td className="px-3 py-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={stock.skipPriceUpdate || false}
                          onChange={(e) => updateStock(index, 'skipPriceUpdate', e.target.checked)}
                          className="rounded"
                        />
                      </label>
                    </td>
                    <td className="px-3 py-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={stock.excludeFromTotals || false}
                          onChange={(e) => updateStock(index, 'excludeFromTotals', e.target.checked)}
                          className="rounded"
                        />
                      </label>
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => removeStock(index)}
                        className="text-red-600 hover:text-red-800 text-sm"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {stocks.length > 0 && (
              <tfoot className="bg-gray-50 font-semibold">
                {(() => {
                  // Totals omit any holding with "Exclude" checked (separate from Skip Update,
                  // which only suppresses the price fetch)
                  const totals = stocks.reduce((acc, stock) => {
                    if (stock.excludeFromTotals) return acc;

                    const lots = Array.isArray(stock.lots) ? stock.lots : [];
                    let totalCost, totalValue;

                    if (stock.useLotTracking && lots.length > 0) {
                      const totalShares = lots.reduce((sum, lot) => sum + (lot.quantity || 0), 0);
                      totalCost = lots.reduce((sum, lot) => sum + (lot.totalCostBasis || 0), 0);
                      totalValue = totalShares * (stock.currentPrice || 0);
                    } else {
                      totalCost = (stock.shares || 0) * (stock.costBasis || 0);
                      totalValue = (stock.shares || 0) * (stock.currentPrice || 0);
                    }

                    return { cost: acc.cost + totalCost, value: acc.value + totalValue };
                  }, { cost: 0, value: 0 });

                  const totalGain = totals.value - totals.cost;
                  const gainPercentage = totals.cost > 0 ? ((totalGain / totals.cost) * 100) : 0;

                  return (
                    <tr>
                      {/* Shares Owned and Avg Cost/Share are left blank on purpose:
                          shares of different stocks are not the same unit, so neither
                          a sum nor an average across them means anything. */}
                      <td className="px-3 py-2" colSpan="5">Total</td>
                      <td className="px-3 py-2">
                        ${Math.round(totals.value).toLocaleString()}
                      </td>
                      <td className={`px-3 py-2 ${totalGain >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        ${Math.round(totalGain).toLocaleString()}
                      </td>
                      <td className={`px-3 py-2 ${gainPercentage >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {gainPercentage.toFixed(2)}%
                      </td>
                      {/* Skip Update, Exclude, Actions */}
                      <td className="px-3 py-2" colSpan="3"></td>
                    </tr>
                  );
                })()}
              </tfoot>
            )}
          </table>
        </div>

        {stocks.length === 0 && (
          <p className="text-center text-gray-500 py-4">No stocks added yet. Click "Add Stock" to get started.</p>
        )}

        {/* Debug Log - HIDDEN */}
        {/* {debugLog.length > 0 && (
          <div className="mt-4 p-4 bg-gray-100 rounded-md">
            <h3 className="font-semibold text-sm mb-2">Debug Log:</h3>
            <div className="text-xs space-y-1 max-h-40 overflow-y-auto font-mono">
              {debugLog.map((log, idx) => (
                <div key={idx} className="text-gray-700">{log}</div>
              ))}
            </div>
            <button
              onClick={() => setDebugLog([])}
              className="mt-2 text-xs text-blue-600 hover:underline"
            >
              Clear Log
            </button>
          </div>
        )} */}
      </div>
    </>
  );
}
