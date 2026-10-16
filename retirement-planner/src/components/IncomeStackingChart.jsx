import React from 'react';
import { TrendingDown } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell, ResponsiveContainer, ReferenceLine, Label } from 'recharts';
import { FILING_STATUS_LABELS } from '../taxConfig';

// Income stacking waterfall: how long-term gains and qualified dividends stack on ordinary income.
// Pure display: everything it needs comes in through props.
export default function IncomeStackingChart({ results, personalInfo, ordinaryBracketsFor, capitalGainsBracketsFor }) {
  return (
    <>
      {/* Income Stacking Waterfall Chart */}
      <div className="bg-white rounded-lg shadow p-6 mb-6 pdf-section">
        <h2 className="text-lg font-semibold mb-4 text-gray-800 flex items-center gap-2">
          <TrendingDown className="w-5 h-5 text-indigo-600" />
          How Long-Term Gains Stack on Top of Ordinary Income
        </h2>

        <p className="text-sm text-gray-600 mb-6">
          This chart visualizes how long-term capital gains and qualified dividends "stack" on top of your ordinary
          income for tax calculation purposes, filling the remaining space in lower brackets before moving to higher
          ones. Short-term gains are not shown separately here &mdash; they are taxed as ordinary income and are
          already included in the Ordinary Income bar.
        </p>

        {(() => {
          // Take these from the engine rather than recomputing them: a local
          // standard-deduction ternary drifted from calculateScenario and gave
          // marriedFilingSeparately a different deduction than the tax numbers used.
          const standardDeduction = results.standardDeduction;
          const grossOrdinaryIncome = results.ordinaryIncome;
          const taxableOrdinaryIncome = results.taxableOrdinaryIncome;

          // Only long-term gains and qualified dividends stack at the preferential
          // rates. Short-term gains are already inside ordinaryIncome above, so
          // using results.totalCapitalGains here would draw (and total) them twice.
          // Only the part not already sheltered by leftover deductions.
          const preferentialRateGains = results.taxablePreferentialIncome;
          const totalIncome = taxableOrdinaryIncome + preferentialRateGains;

          // Get tax brackets
          const ordinaryBrackets = ordinaryBracketsFor(personalInfo.filingStatus);
          const capitalGainsBrackets = capitalGainsBracketsFor(personalInfo.filingStatus);

          // Determine capital gains color based on where they stack
          const getCapitalGainsColor = () => {
            const startIncome = taxableOrdinaryIncome;
            const endIncome = taxableOrdinaryIncome + preferentialRateGains;

            if (preferentialRateGains === 0) return '#a7f3d0';

            if (endIncome <= capitalGainsBrackets[0].max) {
              return '#d1fae5'; // 0%
            } else if (startIncome >= capitalGainsBrackets[1].max) {
              return '#6ee7b7'; // 20%
            } else if (startIncome >= capitalGainsBrackets[0].max) {
              return '#a7f3d0'; // 15% - solid color
            } else {
              return 'url(#capitalGainsGradient)'; // gradient
            }
          };

          // Prepare data for the waterfall chart
          const chartData = [
            {
              name: 'Ordinary\nIncome',
              base: 0,
              value: grossOrdinaryIncome,
              displayValue: grossOrdinaryIncome,
              color: '#84cc16',
              tax: 0,
              description: 'Gross ordinary income before deductions'
            },
            {
              name: 'Standard\nDeduction',
              base: taxableOrdinaryIncome,
              value: standardDeduction,
              displayValue: -standardDeduction,
              color: '#dc2626',
              tax: 0,
              description: results.additionalStandardDeduction + results.seniorDeduction > 0
                ? `${FILING_STATUS_LABELS[personalInfo.filingStatus]} standard deduction plus 65+ deductions`
                : `${FILING_STATUS_LABELS[personalInfo.filingStatus]} standard deduction`
            },
            {
              name: 'Taxable\nOrdinary',
              base: 0,
              value: taxableOrdinaryIncome,
              displayValue: taxableOrdinaryIncome,
              color: 'url(#taxBracketGradient)',
              tax: results.ordinaryIncomeTax,
              description: 'Ordinary income subject to tax'
            },
            {
              name: 'Long-Term\nGains',
              base: taxableOrdinaryIncome,
              value: preferentialRateGains,
              displayValue: preferentialRateGains,
              color: getCapitalGainsColor(),
              tax: results.capitalGainsTax,
              description: 'Long-term gains and qualified dividends stacked on top'
            },
            {
              name: 'Total\nTaxable',
              base: 0,
              value: totalIncome,
              displayValue: totalIncome,
              color: '#6366f1',
              tax: results.totalTax,
              description: 'Total taxable income'
            }
          ];

          // Custom tooltip
          const CustomTooltip = ({ active, payload }) => {
            if (active && payload && payload.length) {
              const data = payload[0].payload;
              return (
                <div className="bg-white p-3 border border-gray-300 rounded shadow-lg">
                  <p className="font-semibold text-gray-800">{data.name.replace(/\n/g, ' ')}</p>
                  <p className="text-sm text-gray-600">{data.description}</p>
                  <p className="text-sm font-medium text-gray-800 mt-1">
                    Amount: ${Math.abs(data.displayValue).toLocaleString(undefined, {maximumFractionDigits: 0})}
                  </p>
                  {data.tax > 0 && (
                    <p className="text-sm font-medium text-red-600">
                      Tax Due: ${data.tax.toLocaleString(undefined, {maximumFractionDigits: 0})}
                    </p>
                  )}
                </div>
              );
            }
            return null;
          };

          // Custom label renderer
          const renderCustomLabel = (props) => {
            const { x, y, width, height, index } = props;
            const data = chartData[index];

            if (!data || data.displayValue === 0) return null;

            const isNegative = data.displayValue < 0;
            const labelY = isNegative ? y + height + 15 : y - 10;

            return (
              <g>
                <text
                  x={x + width / 2}
                  y={labelY}
                  fill={isNegative ? '#dc2626' : '#374151'}
                  textAnchor="middle"
                  fontSize="12"
                  fontWeight="600"
                >
                  {isNegative ? '(' : ''}${Math.abs(data.displayValue).toLocaleString(undefined, {maximumFractionDigits: 0})}{isNegative ? ')' : ''}
                </text>
                {data.tax > 0 && height > 30 && (
                  <>
                    <text
                      x={x + width / 2}
                      y={y + height / 2 - 5}
                      fill="white"
                      textAnchor="middle"
                      fontSize="10"
                    >
                      Tax Due
                    </text>
                    <text
                      x={x + width / 2}
                      y={y + height / 2 + 10}
                      fill="white"
                      textAnchor="middle"
                      fontSize="11"
                      fontWeight="600"
                    >
                      ${data.tax.toLocaleString(undefined, {maximumFractionDigits: 0})}
                    </text>
                  </>
                )}
              </g>
            );
          };

          // Create gradient definition for the Taxable Ordinary bar
          const createTaxBracketGradient = () => {
            const blueShades = [
              '#dbeafe', // 10%
              '#93c5fd', // 12%
              '#3b82f6', // 22%
              '#1d4ed8', // 24%
              '#1e40af', // 32%
              '#1e3a8a', // 35%
              '#1e293b'  // 37%
            ];

            const stops = [];
            const income = taxableOrdinaryIncome;

            ordinaryBrackets.forEach((bracket, idx) => {
              const bracketStart = bracket.min;
              const bracketEnd = bracket.max === Infinity ? income : Math.min(bracket.max, income);

              if (bracketStart < income) {
                const startPercent = (bracketStart / income) * 100;
                const endPercent = (bracketEnd / income) * 100;

                stops.push(
                  <stop key={`start-${idx}`} offset={`${startPercent}%`} stopColor={blueShades[idx]} stopOpacity="1" />,
                  <stop key={`end-${idx}`} offset={`${endPercent}%`} stopColor={blueShades[idx]} stopOpacity="1" />
                );
              }
            });

            return stops;
          };

          // Create capital gains gradient (only if needed)
          const createCapitalGainsGradient = () => {
            const startIncome = taxableOrdinaryIncome;
            const endIncome = taxableOrdinaryIncome + preferentialRateGains;
            const capGainsAmount = preferentialRateGains;

            const stops = [];

            // 0% bracket
            if (startIncome < capitalGainsBrackets[0].max) {
              const startPercent = 0;
              const endPercent = Math.min(100, ((capitalGainsBrackets[0].max - startIncome) / capGainsAmount) * 100);
              stops.push(
                <stop key="cap-0-start" offset={`${startPercent}%`} stopColor="#d1fae5" stopOpacity="1" />,
                <stop key="cap-0-end" offset={`${endPercent}%`} stopColor="#d1fae5" stopOpacity="1" />
              );
            }

            // 15% bracket
            if (endIncome > capitalGainsBrackets[0].max && startIncome < capitalGainsBrackets[1].max) {
              const startPercent = Math.max(0, ((capitalGainsBrackets[0].max - startIncome) / capGainsAmount) * 100);
              const endPercent = Math.min(100, ((capitalGainsBrackets[1].max - startIncome) / capGainsAmount) * 100);
              stops.push(
                <stop key="cap-15-start" offset={`${startPercent}%`} stopColor="#a7f3d0" stopOpacity="1" />,
                <stop key="cap-15-end" offset={`${endPercent}%`} stopColor="#a7f3d0" stopOpacity="1" />
              );
            }

            // 20% bracket
            if (endIncome > capitalGainsBrackets[1].max) {
              const startPercent = ((capitalGainsBrackets[1].max - startIncome) / capGainsAmount) * 100;
              stops.push(
                <stop key="cap-20-start" offset={`${startPercent}%`} stopColor="#6ee7b7" stopOpacity="1" />,
                <stop key="cap-20-end" offset="100%" stopColor="#6ee7b7" stopOpacity="1" />
              );
            }

            return stops;
          };

          return (
            <div className="w-full" style={{ height: '400px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  margin={{ top: 30, right: 80, left: 80, bottom: 30 }}
                >
                  <defs>
                    <linearGradient id="taxBracketGradient" x1="0" y1="1" x2="0" y2="0">
                      {createTaxBracketGradient()}
                    </linearGradient>
                    <linearGradient id="capitalGainsGradient" x1="0" y1="1" x2="0" y2="0">
                      {createCapitalGainsGradient()}
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 12 }}
                    interval={0}
                  />

                  {/* Left Y-axis - Primary Scale */}
                  <YAxis
                    yAxisId="left"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                    domain={[0, 'auto']}
                  />

                  {/* Right Y-axis - Mirror Scale */}
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                    domain={[0, 'auto']}
                  />

                  <Tooltip content={<CustomTooltip />} />

                  {/* Reference lines for Ordinary Income tax brackets (left axis) */}
                  {ordinaryBrackets.filter(b => b.max !== Infinity).slice(0, 5).map((bracket, idx) => (
                    <ReferenceLine
                      key={`ord-${idx}`}
                      yAxisId="left"
                      y={bracket.max}
                      stroke="#1e3a8a"
                      strokeDasharray="3 3"
                      strokeWidth={1}
                      opacity={0.3}
                    >
                      <Label
                        value={`$${bracket.max.toLocaleString()} (${(bracket.rate * 100).toFixed(0)}%)`}
                        position="insideTopLeft"
                        style={{ fontSize: 10, fill: '#1e3a8a', fontWeight: 'bold', background: '#ffffff', padding: 2 }}
                      />
                    </ReferenceLine>
                  ))}

                  <Bar
                    dataKey="base"
                    fill="transparent"
                    stackId="stack"
                    yAxisId="left"
                  />
                  <Bar
                    dataKey="value"
                    stackId="stack"
                    label={renderCustomLabel}
                    yAxisId="left"
                  >
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          );
        })()}

        <div className="mt-4 p-3 bg-gray-50 rounded text-xs">
          <p className="font-medium mb-2 text-gray-700">Chart Legend:</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <div className="flex items-center gap-2">
              <div className="w-10 h-4 rounded" style={{ background: 'linear-gradient(to right, #dbeafe, #3b82f6, #1d4ed8)' }}></div>
              <span className="text-gray-600">Blue gradient: Ordinary income tax brackets (lighter=10%, darker=37%)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-10 h-4 rounded" style={{ background: 'linear-gradient(to bottom, #d1fae5 50%, #a7f3d0 50%)' }}></div>
              <span className="text-gray-600">Green shading: Capital gains zones (lighter=0%, darker=15%)</span>
            </div>
          </div>
          <p className="font-medium mb-1 text-gray-700">Key Insight:</p>
          <p className="text-gray-600">
            The chart shows dual shading: <strong>Blue zones</strong> represent ordinary income tax brackets (10%-37%), and <strong>green zones</strong> show capital gains rates (0%, 15%, 20%).
            Capital gains are taxed at different rates depending on where they "land" after stacking on top of your ordinary income.
            This stacking order significantly impacts your total tax bill and is why timing of capital gains matters for tax planning.
          </p>
        </div>
      </div>
    </>
  );
}
