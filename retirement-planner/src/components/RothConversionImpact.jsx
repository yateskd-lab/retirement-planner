import React from 'react';
import { TrendingDown } from 'lucide-react';
import { IRMAA_YEAR } from '../taxConfig';

export default function RothConversionImpact({ activeScenario, calculateScenario, results }) {
  return (
    <>
      {/* Roth Conversion Tax Impact Analysis */}
      {results.rothConversion > 0 && (
        <div className="bg-white rounded-lg shadow p-6 mb-6 pdf-section">
          <h2 className="text-lg font-semibold mb-4 text-gray-800 flex items-center gap-2">
            <TrendingDown className="w-5 h-5 text-indigo-600" />
            Roth Conversion Tax Impact Analysis
          </h2>

          <div className="mb-4 p-3 bg-indigo-50 border border-indigo-200 rounded-md">
            <p className="text-sm text-indigo-900">
              <strong>Converting ${Math.round(results.rothConversion).toLocaleString()}</strong> from Traditional IRA/401(k) to Roth.
              This amount is added to your ordinary income and taxed at your marginal rate.
            </p>
          </div>

          {(() => {
            // Calculate scenario WITHOUT conversion for comparison
            const scenarioWithoutConversion = { ...activeScenario, rothConversion: 0 };
            const resultsWithoutConversion = calculateScenario(scenarioWithoutConversion);

            const taxDifference = results.totalTax - resultsWithoutConversion.totalTax;
            const stateTaxDifference = results.totalUtahTax - resultsWithoutConversion.totalUtahTax;
            const totalTaxDifference = results.totalTaxWithState - resultsWithoutConversion.totalTaxWithState;
            const niitDifference = results.niitTax - resultsWithoutConversion.niitTax;
            const irmaaDifference = results.currentIRMAABracket && resultsWithoutConversion.currentIRMAABracket
              ? ((results.currentIRMAABracket.partB + results.currentIRMAABracket.partD) * 12) -
                ((resultsWithoutConversion.currentIRMAABracket.partB + resultsWithoutConversion.currentIRMAABracket.partD) * 12)
              : 0;

            const effectiveTaxRate = (taxDifference / results.rothConversion) * 100;
            const totalEffectiveRate = (totalTaxDifference / results.rothConversion) * 100;

            return (
              <>
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <h3 className="font-medium text-gray-700 border-b pb-2">Immediate Tax Impact</h3>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Conversion Amount:</span>
                      <span className="font-bold text-indigo-600">${Math.round(results.rothConversion).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Additional Federal Tax:</span>
                      <span className="font-medium text-red-600">${Math.round(taxDifference).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Additional State Tax:</span>
                      <span className="font-medium text-orange-600">${Math.round(stateTaxDifference).toLocaleString()}</span>
                    </div>
                    {niitDifference > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Additional NIIT:</span>
                        <span className="font-medium text-purple-600">${Math.round(niitDifference).toLocaleString()}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm border-t pt-2">
                      <span className="text-gray-700 font-medium">Total Additional Tax:</span>
                      <span className="font-bold text-red-600">${Math.round(totalTaxDifference).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Effective Tax Rate on Conversion:</span>
                      <span className="font-medium">{effectiveTaxRate.toFixed(2)}%</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Effective Rate (Federal + State):</span>
                      <span className="font-medium">{totalEffectiveRate.toFixed(2)}%</span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h3 className="font-medium text-gray-700 border-b pb-2">Tax Bracket Impact</h3>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">MAGI Without Conversion:</span>
                      <span className="font-medium">${resultsWithoutConversion.magi.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">MAGI With Conversion:</span>
                      <span className="font-medium">${results.magi.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">MAGI Increase:</span>
                      <span className="font-medium text-orange-600">+${(results.magi - resultsWithoutConversion.magi).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm border-t pt-2">
                      <span className="text-gray-600">Tax Bracket Before:</span>
                      <span className="font-medium">{resultsWithoutConversion.currentBracket ? `${(resultsWithoutConversion.currentBracket.rate * 100)}%` : 'N/A'}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Tax Bracket After:</span>
                      <span className={`font-medium ${results.currentBracket && resultsWithoutConversion.currentBracket && results.currentBracket.rate > resultsWithoutConversion.currentBracket.rate ? 'text-red-600' : ''}`}>
                        {results.currentBracket ? `${(results.currentBracket.rate * 100)}%` : 'N/A'}
                      </span>
                    </div>
                    {results.currentBracket && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Room Remaining in Bracket:</span>
                        <span className="font-medium">{!Number.isFinite(results.roomInBracket) ? 'No limit (top bracket)' : `$${results.roomInBracket > 0 ? Math.round(results.roomInBracket).toLocaleString() : '0 (maxed out)'}`}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* IRMAA Impact */}
                {irmaaDifference !== 0 && (
                  <div className="mt-4 p-3 bg-orange-50 border border-orange-200 rounded-md">
                    <p className="text-sm text-orange-800">
                      <strong>IRMAA Impact:</strong> The conversion {irmaaDifference > 0 ? 'increases' : 'decreases'} your Medicare IRMAA surcharges by
                      <strong> ${Math.abs(Math.round(irmaaDifference)).toLocaleString()}/year</strong> ({IRMAA_YEAR} rates).
                      {irmaaDifference > 0 && ' Consider converting less to avoid crossing IRMAA thresholds.'}
                    </p>
                  </div>
                )}

                {/* Optimization Suggestions */}
                <div className="mt-4 space-y-3">
                  <h3 className="font-medium text-gray-700 border-b pb-2">Optimization Suggestions</h3>

                  {Number.isFinite(results.roomInBracket) && results.roomInBracket > 0 && results.roomInBracket > results.rothConversion && (
                    <div className="p-3 bg-green-50 border border-green-200 rounded-md">
                      <p className="text-sm text-green-800">
                        <strong>✓ Good positioning:</strong> You have ${Math.round(results.roomInBracket).toLocaleString()} remaining in your {(results.currentBracket.rate * 100)}% bracket.
                        You could convert up to ${Math.round(results.roomInBracket + results.rothConversion).toLocaleString()} total without jumping to the next bracket.
                      </p>
                    </div>
                  )}

                  {results.roomInBracket <= 0 && (
                    <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                      <p className="text-sm text-yellow-800">
                        <strong>⚠ Bracket limit reached:</strong> Your conversion has filled your current tax bracket.
                        Additional conversions will be taxed at {results.currentBracket ? `${((results.currentBracket.rate) * 100)}%` : 'a higher rate'}.
                      </p>
                    </div>
                  )}

                  {resultsWithoutConversion.roomToNextIRMAABracket > 0 &&
                   results.magi >= resultsWithoutConversion.currentIRMAABracket.magiMax && (
                    <div className="p-3 bg-orange-50 border border-orange-200 rounded-md">
                      <p className="text-sm text-orange-800">
                        <strong>⚠ IRMAA threshold crossed:</strong> Your conversion pushed you into a higher IRMAA bracket.
                        Consider converting ${Math.round(resultsWithoutConversion.roomToNextIRMAABracket).toLocaleString()} less to stay below the threshold.
                      </p>
                    </div>
                  )}

                  {resultsWithoutConversion.magi < results.niitThreshold && results.magi >= results.niitThreshold && (
                    <div className="p-3 bg-purple-50 border border-purple-200 rounded-md">
                      <p className="text-sm text-purple-800">
                        <strong>⚠ NIIT triggered:</strong> Your conversion pushed your MAGI above the ${results.niitThreshold.toLocaleString()} NIIT threshold,
                        adding ${Math.round(niitDifference).toLocaleString()} in Net Investment Income Tax.
                      </p>
                    </div>
                  )}
                </div>
              </>
            );
          })()}
        </div>
      )}
    </>
  );
}
