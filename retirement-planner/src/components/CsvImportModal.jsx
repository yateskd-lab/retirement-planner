import React from 'react';

export default function CsvImportModal({ closeCSVImportModal, csvImportModal, parseCSVAndImportLots, setCSVImportModal }) {
  return (
    <>
      {/* CSV Import Modal */}
      {csvImportModal.isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full p-6">
            <h3 className="text-lg font-semibold mb-4">Import Lots from CSV</h3>
            <p className="text-sm text-gray-600 mb-3">
              Paste CSV data with columns: <strong>Purchase Date (YYYY-MM-DD), Quantity, Cost Per Unit</strong>
            </p>
            <p className="text-xs text-gray-500 mb-3">
              Example:<br/>
              Purchase Date,Quantity,Cost Per Unit<br/>
              2023-01-15,100,45.50<br/>
              2024-06-20,50,52.75
            </p>
            <textarea
              value={csvImportModal.csvText}
              onChange={(e) => setCSVImportModal({...csvImportModal, csvText: e.target.value})}
              className="w-full h-48 px-3 py-2 border border-gray-300 rounded-md font-mono text-sm"
              placeholder="Paste CSV data here..."
            />
            <div className="flex gap-3 mt-4">
              <button
                onClick={parseCSVAndImportLots}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Import Lots
              </button>
              <button
                onClick={closeCSVImportModal}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
