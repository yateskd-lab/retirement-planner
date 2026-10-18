import React from 'react';
import { DollarSign } from 'lucide-react';

export default function WithdrawalPlanning({ crypto, getCryptoSale, getCryptoStrategy, getMetalSale, getMetalStrategy, getStockStrategy, getStockWithdrawal, metals, selectLots, stocks, updateCryptoSale, updateCryptoStrategy, updateMetalSale, updateMetalStrategy, updateStockStrategy, updateStockWithdrawal }) {
  return (
    <>
      {/* Withdrawal Planning */}
      <div className="bg-white rounded-lg shadow p-6 mb-6 pdf-section pdf-detail-only">
        <h2 className="text-lg font-semibold mb-4 text-gray-800 flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-green-600" />
          Plan Your Withdrawals
        </h2>
        
        {/* Crypto Sales */}
        {crypto.length > 0 && (
          <div className="mb-6">
            <h3 className="font-medium text-gray-700 mb-3">Cryptocurrency Sales</h3>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {crypto.map((cryptoAsset, index) => {
                // Calculate total units from lots if lot tracking is enabled
                const lots = Array.isArray(cryptoAsset.lots) ? cryptoAsset.lots : [];
                const maxUnits = (cryptoAsset.useLotTracking && lots.length > 0)
                  ? lots.reduce((sum, lot) => sum + (lot.quantity || 0), 0)
                  : (cryptoAsset.units || 0);

                const unitsToSell = getCryptoSale(cryptoAsset.name);
                const strategy = getCryptoStrategy(cryptoAsset.name);

                // Route through selectLots like the stock and metal cards do. This
                // card used to apply the legacy units x (price - costBasis) formula
                // directly, which ignored lot tracking entirely -- so for a
                // lot-tracked holding it disagreed with the tax summary, which has
                // always gone through selectLots.
                const lotSelection = selectLots(cryptoAsset, unitsToSell, strategy);
                const proceeds = lotSelection.totalProceeds;
                const gain = lotSelection.totalGains;
                const shortTermGains = lotSelection.shortTermGains;
                const longTermGains = lotSelection.longTermGains;

                return (
                  <div key={index} className="border border-gray-200 rounded-md p-3">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {cryptoAsset.name} <span className="text-xs text-gray-500">(Max: {maxUnits} units)</span>
                    </label>
                    <input
                      type="number"
                      value={unitsToSell}
                      onChange={(e) => updateCryptoSale(cryptoAsset.name, e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md mb-2"
                      max={maxUnits}
                    />
                    {lotSelection.requestedQuantity > lotSelection.quantitySold && (
                      <div className="mb-2 px-2 py-1 bg-amber-50 border border-amber-300 rounded text-xs text-amber-800">
                        You only hold {maxUnits.toLocaleString(undefined, {maximumFractionDigits: 6})} units.
                        Figures below use {lotSelection.quantitySold.toLocaleString(undefined, {maximumFractionDigits: 6})}, not the {lotSelection.requestedQuantity.toLocaleString(undefined, {maximumFractionDigits: 6})} entered.
                      </div>
                    )}
                    {/* Strategy selector - only show if lot tracking is enabled */}
                    {cryptoAsset.useLotTracking && lots.length > 0 && unitsToSell > 0 && (
                      <select
                        value={strategy}
                        onChange={(e) => updateCryptoStrategy(cryptoAsset.name, e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md mb-2 text-sm"
                      >
                        <option value="HIFO">HIFO (Highest Cost First)</option>
                        <option value="FIFO">FIFO (First In First Out)</option>
                        <option value="LIFO">LIFO (Last In First Out)</option>
                        <option value="TAX_OPTIMIZED">Tax Optimized (Losses, then Long-Term)</option>
                      </select>
                    )}

                    {unitsToSell > 0 && (
                      <div className="text-xs space-y-1">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Proceeds:</span>
                          <span className="font-medium">${proceeds.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                        </div>

                        {/* Show breakdown if lot tracking is enabled */}
                        {cryptoAsset.useLotTracking && lots.length > 0 ? (
                          <>
                            <div className="flex justify-between">
                              <span className="text-gray-600">Short-term gain:</span>
                              <span className={`font-medium ${shortTermGains >= 0 ? 'text-orange-600' : 'text-red-600'}`}>
                                ${shortTermGains.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600">Long-term gain:</span>
                              <span className={`font-medium ${longTermGains >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                ${longTermGains.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                              </span>
                            </div>
                            <div className="flex justify-between font-semibold border-t pt-1">
                              <span className="text-gray-700">Total gain:</span>
                              <span className={gain >= 0 ? 'text-green-600' : 'text-red-600'}>
                                ${gain.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                              </span>
                            </div>
                          </>
                        ) : (
                          <div className="flex justify-between">
                            <span className="text-gray-600">Gain:</span>
                            <span className={`font-medium ${gain >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              ${gain.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Precious Metals Sales */}
        {metals.length > 0 && (
          <div className="mb-6">
            <h3 className="font-medium text-gray-700 mb-3">Precious Metals Sales</h3>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {metals.map((metal, index) => {
                const unitsToSell = getMetalSale(metal.name);
                const strategy = getMetalStrategy(metal.name);

                // Calculate lot-based gains if lot tracking is enabled
                const lotSelection = selectLots(metal, unitsToSell, strategy);
                const proceeds = lotSelection.totalProceeds;
                const totalGain = lotSelection.totalGains;
                const shortTermGains = lotSelection.shortTermGains;
                const longTermGains = lotSelection.longTermGains;

                // Calculate total units from lots if lot tracking is enabled
                const lots = Array.isArray(metal.lots) ? metal.lots : [];
                const maxUnits = (metal.useLotTracking && lots.length > 0)
                  ? lots.reduce((sum, lot) => sum + (lot.quantity || 0), 0)
                  : (metal.units || 0);

                return (
                  <div key={index} className="border border-gray-200 rounded-md p-3">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {metal.name} <span className="text-xs text-gray-500">(Max: {maxUnits} oz)</span>
                    </label>
                    <input
                      type="number"
                      value={unitsToSell}
                      onChange={(e) => updateMetalSale(metal.name, e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md mb-2"
                      max={maxUnits}
                      placeholder="Units to sell"
                    />
                    {lotSelection.requestedQuantity > lotSelection.quantitySold && (
                      <div className="mb-2 px-2 py-1 bg-amber-50 border border-amber-300 rounded text-xs text-amber-800">
                        You only hold {maxUnits.toLocaleString(undefined, {maximumFractionDigits: 2})} oz.
                        Figures below use {lotSelection.quantitySold.toLocaleString(undefined, {maximumFractionDigits: 2})}, not the {lotSelection.requestedQuantity.toLocaleString(undefined, {maximumFractionDigits: 2})} entered.
                      </div>
                    )}

                    {/* Strategy selector - only show if lot tracking is enabled */}
                    {metal.useLotTracking && lots.length > 0 && unitsToSell > 0 && (
                      <select
                        value={strategy}
                        onChange={(e) => updateMetalStrategy(metal.name, e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md mb-2 text-sm"
                      >
                        <option value="HIFO">HIFO (Highest Cost First)</option>
                        <option value="FIFO">FIFO (First In First Out)</option>
                        <option value="LIFO">LIFO (Last In First Out)</option>
                        <option value="TAX_OPTIMIZED">Tax Optimized (Losses, then Long-Term)</option>
                      </select>
                    )}

                    {unitsToSell > 0 && (
                      <div className="text-xs space-y-1">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Proceeds:</span>
                          <span className="font-medium">${proceeds.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Gain:</span>
                          <span className={`font-medium ${totalGain >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            ${totalGain.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                          </span>
                        </div>
                        {metal.useLotTracking && lots.length > 0 && (
                          <>
                            <div className="flex justify-between text-gray-500">
                              <span>Short-term:</span>
                              <span>${shortTermGains.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                            </div>
                            <div className="flex justify-between text-gray-500">
                              <span>Long-term:</span>
                              <span>${longTermGains.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        
        {/* Stock Sales */}
        {stocks.length > 0 && (
          <div className="mb-6">
            <h3 className="font-medium text-gray-700 mb-3">Stock Sales</h3>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {stocks.map((stock, index) => {
                const sharesToSell = getStockWithdrawal(stock.name);
                const strategy = getStockStrategy(stock.name);

                // Calculate lot-based gains if lot tracking is enabled
                const lotSelection = selectLots(stock, sharesToSell, strategy);
                const proceeds = lotSelection.totalProceeds;
                const totalGain = lotSelection.totalGains;
                const shortTermGains = lotSelection.shortTermGains;
                const longTermGains = lotSelection.longTermGains;

                // Calculate max shares (from lots if enabled, else from simple value)
                const lots = Array.isArray(stock.lots) ? stock.lots : [];
                const maxShares = stock.useLotTracking && lots.length > 0
                  ? lots.reduce((sum, lot) => sum + (lot.quantity || 0), 0)
                  : (stock.shares || 0);

                return (
                  <div key={index} className="border border-gray-200 rounded-md p-3">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {stock.name} <span className="text-xs text-gray-500">(Max: {maxShares} shares)</span>
                    </label>
                    <input
                      type="number"
                      value={sharesToSell}
                      onChange={(e) => updateStockWithdrawal(stock.name, e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md mb-2"
                      max={maxShares}
                      placeholder="Shares to sell"
                    />
                    {lotSelection.requestedQuantity > lotSelection.quantitySold && (
                      <div className="mb-2 px-2 py-1 bg-amber-50 border border-amber-300 rounded text-xs text-amber-800">
                        You only hold {maxShares.toLocaleString(undefined, {maximumFractionDigits: 0})} shares.
                        Figures below use {lotSelection.quantitySold.toLocaleString(undefined, {maximumFractionDigits: 0})}, not the {lotSelection.requestedQuantity.toLocaleString(undefined, {maximumFractionDigits: 0})} entered.
                      </div>
                    )}

                    {/* Strategy selector - only show if lot tracking is enabled */}
                    {stock.useLotTracking && lots.length > 0 && sharesToSell > 0 && (
                      <select
                        value={strategy}
                        onChange={(e) => updateStockStrategy(stock.name, e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md mb-2 text-sm"
                      >
                        <option value="HIFO">HIFO (Highest Cost First)</option>
                        <option value="FIFO">FIFO (First In First Out)</option>
                        <option value="LIFO">LIFO (Last In First Out)</option>
                        <option value="TAX_OPTIMIZED">Tax Optimized (Losses, then Long-Term)</option>
                      </select>
                    )}

                    {sharesToSell > 0 && (
                      <div className="text-xs space-y-1">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Proceeds:</span>
                          <span className="font-medium">${proceeds.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                        </div>

                        {/* Show breakdown if lot tracking is enabled */}
                        {stock.useLotTracking && lots.length > 0 ? (
                          <>
                            <div className="flex justify-between">
                              <span className="text-gray-600">Short-term gain:</span>
                              <span className={`font-medium ${shortTermGains >= 0 ? 'text-orange-600' : 'text-red-600'}`}>
                                ${shortTermGains.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600">Long-term gain:</span>
                              <span className={`font-medium ${longTermGains >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                ${longTermGains.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                              </span>
                            </div>
                            <div className="flex justify-between font-semibold border-t pt-1">
                              <span className="text-gray-700">Total gain:</span>
                              <span className={totalGain >= 0 ? 'text-green-600' : 'text-red-600'}>
                                ${totalGain.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                              </span>
                            </div>
                          </>
                        ) : (
                          <div className="flex justify-between">
                            <span className="text-gray-600">Gain:</span>
                            <span className={`font-medium ${totalGain >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              ${totalGain.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
