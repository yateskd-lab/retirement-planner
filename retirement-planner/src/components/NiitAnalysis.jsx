import React from 'react';
import { AlertCircle } from 'lucide-react';
import { formatRate } from '../taxConfig';

export default function NiitAnalysis({ federalRules, personalInfo, results }) {
  return (
    <>
      {/* NIIT Analysis */}
      <div className="bg-white rounded-lg shadow p-6 mb-6 pdf-section">
        <h2 className="text-lg font-semibold mb-4 text-gray-800 flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-purple-600" />
          Net Investment Income Tax (NIIT) Analysis
        </h2>

        <p className="text-sm text-gray-600 mb-4">
          The NIIT is a {formatRate(federalRules.niit.rate)} surtax on net investment income for taxpayers with MAGI above ${results.niitThreshold.toLocaleString()}.
          It applies to the <strong>lesser</strong> of: (1) Net Investment Income, or (2) MAGI above the threshold.
        </p>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <h3 className="font-medium text-gray-700 border-b pb-2">Investment Income Components</h3>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Interest Income:</span>
              <span className="font-medium">${Math.round(personalInfo.interestIncome).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Qualified Dividends:</span>
              <span className="font-medium">${Math.round(personalInfo.qualifiedDividends).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Ordinary Dividends:</span>
              <span className="font-medium">${Math.round(personalInfo.ordinaryDividends).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Net Capital Gains (Losses):</span>
              <span className={`font-medium ${results.netCapitalGains >= 0 ? '' : 'text-red-600'}`}>${Math.round(results.netCapitalGains).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm border-t pt-2">
              <span className="text-gray-700 font-medium">Net Investment Income:</span>
              <span className="font-bold">${Math.round(results.netInvestmentIncome).toLocaleString()}</span>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="font-medium text-gray-700 border-b pb-2">NIIT Calculation</h3>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Your MAGI:</span>
              <span className="font-medium">${Math.round(results.magi).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">NIIT Threshold:</span>
              <span className="font-medium">${results.niitThreshold.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">MAGI Over Threshold:</span>
              <span className="font-medium">${Math.round(Math.max(0, results.magi - results.niitThreshold)).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm border-t pt-2">
              <span className="text-gray-700 font-medium">Taxable Amount (lesser of above):</span>
              <span className="font-bold">${Math.round(results.niitBase).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm border-t pt-2 bg-purple-50 -mx-3 px-3 py-2 rounded">
              <span className="text-gray-700 font-medium">NIIT ({formatRate(federalRules.niit.rate)}):</span>
              <span className="font-bold text-purple-600">${Math.round(results.niitTax).toLocaleString()}</span>
            </div>
          </div>
        </div>

        {results.niitTax === 0 && results.magi < results.niitThreshold && (
          <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-md">
            <p className="text-sm text-green-800">
              <strong>Good news!</strong> Your MAGI (${Math.round(results.magi).toLocaleString()}) is below the ${results.niitThreshold.toLocaleString()} threshold,
              so you do not owe NIIT. You have ${Math.round(results.niitThreshold - results.magi).toLocaleString()} of room before NIIT applies.
            </p>
          </div>
        )}

        {results.niitTax === 0 && results.magi >= results.niitThreshold && (
          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
            <p className="text-sm text-blue-800">
              While your MAGI (${Math.round(results.magi).toLocaleString()}) exceeds the threshold, you have no net investment income,
              so you do not owe NIIT.
            </p>
          </div>
        )}

        {results.niitTax > 0 && (
          <div className="mt-4 p-3 bg-orange-50 border border-orange-200 rounded-md">
            <p className="text-sm text-orange-800">
              <strong>NIIT applies:</strong> Your MAGI (${Math.round(results.magi).toLocaleString()}) exceeds the ${results.niitThreshold.toLocaleString()} threshold
              by ${Math.round(results.magi - results.niitThreshold).toLocaleString()}, and you have ${Math.round(results.netInvestmentIncome).toLocaleString()} in net investment income.
              The {formatRate(federalRules.niit.rate)} surtax is applied to the lesser amount: ${Math.round(results.niitBase).toLocaleString()}.
            </p>
          </div>
        )}
      </div>
    </>
  );
}
