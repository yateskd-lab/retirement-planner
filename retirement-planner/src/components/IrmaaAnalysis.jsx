import React from 'react';
import { AlertCircle } from 'lucide-react';
import { FILING_STATUS_LABELS, IRMAA_BASIS_TEXT, IRMAA_PROJECTED, IRMAA_SOURCE_YEAR, IRMAA_YEAR, LOOKBACK_YEARS, PROJECTED_BASE_PREMIUMS, TAX_YEAR } from '../taxConfig';

export default function IrmaaAnalysis({ irmaaBracketsFor, irmaaFilingStatus, personalInfo, results }) {
  return (
    <>
      {/* IRMAA Analysis */}
      <div className="bg-white rounded-lg shadow p-6 mb-6 irmaa-status-section pdf-section">
        <h2 className="text-lg font-semibold mb-4 text-gray-800 flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-purple-600" />
          Medicare IRMAA Analysis ({IRMAA_PROJECTED ? 'Projected' : 'Published'} {IRMAA_YEAR} Brackets)
        </h2>

        <div className="mb-4 bg-purple-50 border border-purple-200 rounded-lg p-3">
          <p className="text-sm text-purple-900">
            <strong>{IRMAA_PROJECTED ? 'Projected' : 'Published'} {IRMAA_YEAR} IRMAA Brackets:</strong> {IRMAA_BASIS_TEXT}
            This helps you plan Roth conversions and avoid future Medicare surcharges.{IRMAA_PROJECTED && ` Actual ${IRMAA_YEAR} brackets may differ.`}
          </p>
        </div>

        <p className="text-sm text-gray-600 mb-4">
          Medicare costs include base premiums (everyone pays) plus IRMAA surcharges based on your Modified Adjusted Gross Income (MAGI) from {LOOKBACK_YEARS} years prior. Your {TAX_YEAR} income will determine your {IRMAA_YEAR} Medicare premiums.
        </p>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <h3 className="font-medium text-gray-700 border-b pb-2">
              {results.medicare?.eligible ? 'Medicare Costs' : 'Medicare & IRMAA Projection'}
            </h3>

            {/* Always show MAGI */}
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Your {TAX_YEAR} MAGI:</span>
              <span className="font-bold">${results.magi.toLocaleString(undefined, {maximumFractionDigits: 0})}</span>
            </div>

            {results.medicare?.eligible ? (
              <>
                {/* Base Medicare Premiums */}
                <div className="bg-blue-50 border border-blue-200 rounded-md p-3 space-y-2">
                  <div className="text-xs font-semibold text-blue-800 mb-1">Base Premiums (Everyone Pays)</div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Part B Premium:</span>
                    <span className="font-medium text-blue-700">
                      ${results.medicare.basePremiums.partB.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}/mo
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Part D Premium (est.):</span>
                    <span className="font-medium text-blue-700">
                      ${results.medicare.basePremiums.partD.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}/mo
                    </span>
                  </div>
                </div>

                {/* IRMAA Surcharges */}
                {results.medicare.irmaa.annual > 0 ? (
                  <div className="bg-orange-50 border border-orange-200 rounded-md p-3 space-y-2">
                    <div className="text-xs font-semibold text-orange-800 mb-1">IRMAA Surcharges (Income-Based)</div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Part B Surcharge:</span>
                      <span className="font-medium text-orange-700">
                        +${results.medicare.irmaa.partB.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}/mo
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Part D Surcharge:</span>
                      <span className="font-medium text-orange-700">
                        +${results.medicare.irmaa.partD.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}/mo
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="bg-green-50 border border-green-200 rounded-md p-3">
                    <p className="text-sm text-green-700 font-medium">✓ No IRMAA surcharge - You're below the threshold!</p>
                  </div>
                )}

                {/* Total */}
                <div className="flex justify-between text-sm border-t pt-2">
                  <span className="text-gray-700 font-medium">Total Annual Medicare Cost:</span>
                  <span className="font-bold text-blue-700">
                    ${results.medicare.total.annual.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                  </span>
                </div>

                <div className="bg-yellow-50 border border-yellow-200 rounded-md p-2 mt-2">
                  <p className="text-xs text-yellow-800">
                    <strong>Note:</strong> This is the cost <strong>per person</strong>. {personalInfo.filingStatus !== 'single' && 'For married couples, both spouses would each pay these amounts when Medicare-eligible (typically age 65+).'}
                  </p>
                </div>

                {results.currentIRMAABracket && (
                  <div className="text-xs text-gray-500 mt-2">
                    Current IRMAA Bracket: {results.currentIRMAABracket.description}
                  </div>
                )}
              </>
            ) : (
              <>
                {/* Show projected IRMAA for pre-Medicare age */}
                <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                  <p className="text-sm text-blue-700 mb-2">
                    <strong>Projected at Age 65:</strong> At this income level, your estimated Medicare costs would be:
                  </p>
                  {results.currentIRMAABracket && (
                    <>
                      <div className="text-xs text-gray-600 space-y-1">
                        <div className="flex justify-between">
                          <span>IRMAA Bracket:</span>
                          <span className="font-medium">{results.currentIRMAABracket.description}</span>
                        </div>
                        {results.currentIRMAABracket.partB > 0 ? (
                          <>
                            <div className="flex justify-between text-orange-700">
                              <span>Part B Surcharge:</span>
                              <span className="font-medium">+${results.currentIRMAABracket.partB.toLocaleString(undefined, {minimumFractionDigits: 2})}/mo</span>
                            </div>
                            <div className="flex justify-between text-orange-700">
                              <span>Part D Surcharge:</span>
                              <span className="font-medium">+${results.currentIRMAABracket.partD.toLocaleString(undefined, {minimumFractionDigits: 2})}/mo</span>
                            </div>
                            <div className="flex justify-between pt-1 border-t border-blue-200 font-semibold text-orange-800">
                              <span>Annual IRMAA:</span>
                              <span>${((results.currentIRMAABracket.partB + results.currentIRMAABracket.partD) * 12).toLocaleString(undefined, {maximumFractionDigits: 0})}</span>
                            </div>
                          </>
                        ) : (
                          <div className="text-green-600 font-medium text-sm">
                            ✓ No IRMAA surcharge at this income level
                          </div>
                        )}
                      </div>
                    </>
                  )}
                  <p className="text-xs text-gray-500 mt-2">
                    Medicare eligibility begins at age 65. This projection helps you plan ahead.
                  </p>
                  <p className="text-xs text-yellow-700 mt-2 font-semibold">
                    Note: Costs shown are per person. {personalInfo.filingStatus !== 'single' && 'Married couples would each pay these amounts.'}
                  </p>
                </div>
              </>
            )}
          </div>
          
          <div className="space-y-3">
            <h3 className="font-medium text-gray-700 border-b pb-2">IRMAA Planning</h3>
            {results.currentIRMAABracket && (
              <>
                {results.roomToNextIRMAABracket > 0 ? (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-700 font-medium">Room to Next Bracket:</span>
                      <span className="font-bold text-yellow-700">${results.roomToNextIRMAABracket.toLocaleString(undefined, {maximumFractionDigits: 0})}</span>
                    </div>
                    <p className="text-xs text-gray-600">
                      You can earn up to ${results.roomToNextIRMAABracket.toLocaleString(undefined, {maximumFractionDigits: 0})} more before moving to the next IRMAA bracket.
                    </p>
                  </div>
                ) : (
                  <div className="bg-red-50 border border-red-200 rounded-md p-3">
                    <p className="text-sm text-red-700 font-medium">You're in the highest IRMAA bracket</p>
                  </div>
                )}

                {results.roomToLowerIRMAABracket > 0 && results.currentIRMAABracket.partB > 0 && (
                  <div className="bg-green-50 border border-green-200 rounded-md p-3">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-700 font-medium">To Drop to Lower Bracket:</span>
                      <span className="font-bold text-green-700">Reduce by ${results.roomToLowerIRMAABracket.toLocaleString(undefined, {maximumFractionDigits: 0})}</span>
                    </div>
                    <p className="text-xs text-gray-600">
                      Reducing your MAGI by ${results.roomToLowerIRMAABracket.toLocaleString(undefined, {maximumFractionDigits: 0})} would move you to a lower IRMAA bracket.
                    </p>
                  </div>
                )}

                {results.currentIRMAABracket.partB === 0 && (
                  <div className="bg-green-50 border border-green-200 rounded-md p-3">
                    <p className="text-sm text-green-700 font-medium">✓ No IRMAA surcharge - You're below the threshold!</p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* IRMAA Bracket Breakdown Table */}
        <div className="mt-6">
          <h3 className="font-medium text-gray-700 mb-3">{IRMAA_PROJECTED ? 'Projected' : 'Published'} {IRMAA_YEAR} IRMAA Surcharge Brackets</h3>
          <p className="text-xs text-gray-600 mb-3">
            {IRMAA_PROJECTED ? 'Estimated' : 'Published'} monthly surcharges for {IRMAA_YEAR} Medicare Part B and Part D premiums{IRMAA_PROJECTED ? ` (projected from the ${IRMAA_SOURCE_YEAR} table)` : ''}
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-100 border-b-2 border-gray-300">
                  <th className="text-left p-2 font-semibold text-gray-700">MAGI Range ({FILING_STATUS_LABELS[irmaaFilingStatus]})</th>
                  <th className="text-right p-2 font-semibold text-gray-700">Part B Monthly</th>
                  <th className="text-right p-2 font-semibold text-gray-700">Part D Monthly</th>
                  <th className="text-right p-2 font-semibold text-gray-700">Total Monthly</th>
                  <th className="text-right p-2 font-semibold text-gray-700">Total Annual</th>
                </tr>
              </thead>
              <tbody>
                {irmaaBracketsFor(irmaaFilingStatus).map((bracket, idx) => {
                  const isCurrentBracket = results.currentIRMAABracket &&
                    bracket.magi === results.currentIRMAABracket.magi;
                  const totalMonthly = bracket.partB + bracket.partD;
                  const totalAnnual = totalMonthly * 12;
                  const magiMaxDisplay = bracket.magiMax === Infinity ? '+' : bracket.magiMax.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});

                  return (
                    <tr
                      key={idx}
                      className={`border-b border-gray-200 ${isCurrentBracket ? 'bg-purple-50 font-semibold' : ''}`}
                    >
                      <td className="p-2">
                        ${bracket.magi.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} - ${magiMaxDisplay}
                        {isCurrentBracket && <span className="ml-2 text-xs text-purple-600">(Your Bracket)</span>}
                      </td>
                      <td className="text-right p-2">
                        {bracket.partB > 0 ? `$${bracket.partB.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}` : '$0'}
                      </td>
                      <td className="text-right p-2">
                        {bracket.partD > 0 ? `$${bracket.partD.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}` : '$0'}
                      </td>
                      <td className="text-right p-2 font-medium">
                        {totalMonthly > 0 ? `$${totalMonthly.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}` : '$0'}
                      </td>
                      <td className="text-right p-2 font-medium">
                        {totalAnnual > 0 ? `$${totalAnnual.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}` : '$0'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-md">
            <p className="text-xs text-gray-700">
              <strong>Note:</strong> These surcharges are in addition to the standard Medicare Part B premium ({IRMAA_PROJECTED ? 'an estimated ' : ''}${PROJECTED_BASE_PREMIUMS.partB.toFixed(2)}/month in {IRMAA_YEAR}) and your Part D prescription drug plan premium. The surcharges are based on your Modified Adjusted Gross Income (MAGI) from {LOOKBACK_YEARS} years prior. <strong>All costs shown are per person.</strong>
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
