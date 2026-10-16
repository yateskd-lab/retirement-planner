import React from 'react';
import PriceInput from './PriceInput';

export default function LotManagementModal({ addLot, calculateLotMetrics, closeLotModal, crypto, lotModal, metals, openCSVImportModal, removeLot, stocks, updateLot }) {
  return (
    <>
      {/* Lot Management Modal */}
      {lotModal.isOpen && (() => {
        const asset = lotModal.assetType === 'stocks' ? stocks[lotModal.assetIndex]
          : lotModal.assetType === 'crypto' ? crypto[lotModal.assetIndex]
          : metals[lotModal.assetIndex];

        if (!asset) return null;

        // Ensure lots is an array
        const assetLots = Array.isArray(asset.lots) ? asset.lots : [];
        const quantityLabel = lotModal.assetType === 'stocks' ? 'Shares' : 'Units';

        return (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
              <div className="p-6 border-b">
                <div className="flex justify-between items-center">
                  <h2 className="text-2xl font-bold text-gray-800">
                    Manage Lots - {lotModal.assetName}
                  </h2>
                  <button
                    onClick={closeLotModal}
                    className="text-gray-500 hover:text-gray-700 text-2xl"
                  >
                    ×
                  </button>
                </div>
                <p className="text-sm text-gray-600 mt-2">
                  Current Price: <span className="font-medium">${(asset.currentPrice || 0).toFixed(2)}</span>
                </p>
              </div>

              <div className="p-6 overflow-y-auto flex-1">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold text-gray-700">
                    Lots ({assetLots.length}/30)
                  </h3>
                  <div className="flex gap-2">
                    <button
                      onClick={() => openCSVImportModal(lotModal.assetIndex, lotModal.assetType)}
                      className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm"
                    >
                      Import CSV
                    </button>
                    <button
                      onClick={() => addLot(lotModal.assetIndex, lotModal.assetType)}
                      disabled={assetLots.length >= 30}
                      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 text-sm"
                    >
                      Add Lot ({assetLots.length}/30)
                    </button>
                  </div>
                </div>

                {assetLots.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border border-gray-200">
                      <thead className="bg-gray-100">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium text-gray-700 border-b">Purchase Date</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-700 border-b">{quantityLabel}</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-700 border-b">Cost/{quantityLabel.slice(0, -1)}</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-700 border-b">Total Cost</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-700 border-b">Current Value</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-700 border-b">Gain/Loss</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-700 border-b">Gain %</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-700 border-b">Term</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-700 border-b">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {assetLots.map((lot, lotIndex) => {
                          const lotMetrics = calculateLotMetrics(lot, asset.currentPrice || 0);
                          const gainPct = lot.totalCostBasis > 0 ? (lotMetrics.gainLoss / lot.totalCostBasis) * 100 : 0;

                          return (
                            <tr key={lot.id} className="hover:bg-gray-50">
                              <td className="px-3 py-2">
                                <input
                                  type="date"
                                  value={lot.purchaseDate}
                                  onChange={(e) => updateLot(lotModal.assetIndex, lotIndex, 'purchaseDate', e.target.value, lotModal.assetType)}
                                  className="w-36 px-2 py-1 border border-gray-300 rounded text-sm"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="number"
                                  value={lot.quantity}
                                  onChange={(e) => updateLot(lotModal.assetIndex, lotIndex, 'quantity', e.target.value, lotModal.assetType)}
                                  className="w-24 px-2 py-1 border border-gray-300 rounded text-sm"
                                  step="0.01"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <PriceInput
                                  value={lot.costBasisPerUnit}
                                  onChange={(newVal) => updateLot(lotModal.assetIndex, lotIndex, 'costBasisPerUnit', newVal, lotModal.assetType)}
                                />
                              </td>
                              <td className="px-3 py-2 font-medium text-gray-700">
                                ${lot.totalCostBasis.toFixed(2)}
                              </td>
                              <td className="px-3 py-2 font-medium text-gray-700">
                                ${lotMetrics.currentValue.toFixed(2)}
                              </td>
                              <td className={`px-3 py-2 font-medium ${lotMetrics.gainLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                ${lotMetrics.gainLoss.toFixed(2)}
                              </td>
                              <td className={`px-3 py-2 font-medium ${gainPct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {gainPct.toFixed(2)}%
                              </td>
                              <td className="px-3 py-2">
                                <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${lotMetrics.isLongTerm ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                  {lotMetrics.isLongTerm ? 'Long' : 'Short'} ({Math.floor(lotMetrics.days)}d)
                                </span>
                              </td>
                              <td className="px-3 py-2">
                                <button
                                  onClick={() => removeLot(lotModal.assetIndex, lotIndex, lotModal.assetType)}
                                  className="text-red-600 hover:text-red-800 text-xs"
                                >
                                  Remove
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="bg-gray-50 font-medium">
                        <tr className="border-t-2 border-gray-300">
                          <td className="px-3 py-2 text-gray-700">Totals:</td>
                          <td className="px-3 py-2 text-gray-700">
                            {assetLots.reduce((sum, lot) => sum + (lot.quantity || 0), 0).toFixed(2)}
                          </td>
                          <td className="px-3 py-2 text-gray-700">
                            Avg: ${assetLots.length > 0 ?
                              (assetLots.reduce((sum, lot) => sum + (lot.totalCostBasis || 0), 0) /
                               assetLots.reduce((sum, lot) => sum + (lot.quantity || 0), 0)).toFixed(2)
                            : '0.00'}
                          </td>
                          <td className="px-3 py-2 text-gray-700">
                            ${assetLots.reduce((sum, lot) => sum + (lot.totalCostBasis || 0), 0).toFixed(2)}
                          </td>
                          <td className="px-3 py-2 text-gray-700">
                            ${(assetLots.reduce((sum, lot) => sum + (lot.quantity || 0), 0) * (asset.currentPrice || 0)).toFixed(2)}
                          </td>
                          <td className={`px-3 py-2 ${
                            (assetLots.reduce((sum, lot) => sum + (lot.quantity || 0), 0) * (asset.currentPrice || 0) -
                             assetLots.reduce((sum, lot) => sum + (lot.totalCostBasis || 0), 0)) >= 0
                              ? 'text-green-600' : 'text-red-600'
                          }`}>
                            ${(assetLots.reduce((sum, lot) => sum + (lot.quantity || 0), 0) * (asset.currentPrice || 0) -
                               assetLots.reduce((sum, lot) => sum + (lot.totalCostBasis || 0), 0)).toFixed(2)}
                          </td>
                          <td colSpan="3"></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-12 text-gray-500">
                    <p className="mb-2">No lots added yet.</p>
                    <p className="text-sm">Click "Add Lot" to add manually or "Import CSV" to import from your brokerage.</p>
                  </div>
                )}

                <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <h4 className="text-sm font-semibold text-gray-800 mb-2">CSV Import Format:</h4>
                  <p className="text-xs text-gray-600 mb-2">
                    Your CSV should have columns: <strong>Purchase Date (YYYY-MM-DD), Quantity, Cost Per Unit</strong>
                  </p>
                  <pre className="text-xs bg-white p-2 rounded border border-gray-300 overflow-x-auto">
{`Purchase Date,Quantity,Cost Per Unit
2023-01-15,100,45.50
2024-06-20,50,52.75`}
                  </pre>
                </div>
              </div>

              <div className="p-6 border-t bg-gray-50">
                <button
                  onClick={closeLotModal}
                  className="px-6 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}
