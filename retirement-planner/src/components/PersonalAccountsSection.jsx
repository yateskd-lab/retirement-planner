import React from 'react';
import { Users } from 'lucide-react';

export default function PersonalAccountsSection({ accounts, personalInfo, setAccounts, setPersonalInfo, setSocialSecurity, socialSecurity }) {
  return (
    <>
      {/* Personal Info + Accounts/SS wrapper for PDF */}
      <div className="pdf-section mb-6">
        <div className="grid md:grid-cols-2 gap-6">
          {/* Personal Information - Left Column */}
          <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4 text-gray-800">Personal Information</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Age</label>
              <input
                type="number"
                value={personalInfo.age}
                onChange={(e) => setPersonalInfo({...personalInfo, age: parseInt(e.target.value) || 0})}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>

            {personalInfo.filingStatus === 'married' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Spouse Age</label>
                <input
                  type="number"
                  value={personalInfo.spouseAge}
                  onChange={(e) => setPersonalInfo({...personalInfo, spouseAge: parseInt(e.target.value) || 0})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Filing Status</label>
              <select
                value={personalInfo.filingStatus}
                onChange={(e) => setPersonalInfo({...personalInfo, filingStatus: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value="single">Single</option>
                <option value="married">Married Filing Jointly</option>
                <option value="marriedFilingSeparately">Married Filing Separately</option>
                <option value="hoh">Head of Household</option>
                <option value="qualifyingSurvivingSpouse">Qualifying Surviving Spouse</option>
              </select>
            </div>

            {personalInfo.filingStatus === 'marriedFilingSeparately' && (
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="lived-apart"
                  checked={!!personalInfo.livedApartFromSpouse}
                  onChange={(e) => setPersonalInfo({...personalInfo, livedApartFromSpouse: e.target.checked})}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <label htmlFor="lived-apart" className="text-sm text-gray-700">
                  Lived apart from spouse the entire year
                  <span className="block text-xs text-gray-500">Uses the single thresholds for Social Security taxability and IRMAA</span>
                </label>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Dependents</label>
              <input
                type="number"
                min="0"
                value={personalInfo.dependents || 0}
                onChange={(e) => setPersonalInfo({...personalInfo, dependents: Math.max(0, parseInt(e.target.value) || 0)})}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
              <p className="text-xs text-gray-500 mt-1">Used for the Utah taxpayer tax credit</p>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Months Working This Year</label>
              <input
                type="number"
                value={personalInfo.workMonths}
                onChange={(e) => setPersonalInfo({...personalInfo, workMonths: parseInt(e.target.value) || 0})}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                max="12"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Monthly Work Income</label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-gray-500">$</span>
                <input
                  type="text"
                  value={personalInfo.monthlyWorkIncome.toLocaleString()}
                  onChange={(e) => setPersonalInfo({...personalInfo, monthlyWorkIncome: parseFloat(e.target.value.replace(/,/g, '')) || 0})}
                  className="w-full pl-7 px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Pension Start Month (0=None, 1-12)</label>
              <input
                type="number"
                value={personalInfo.pensionStartMonth}
                onChange={(e) => setPersonalInfo({...personalInfo, pensionStartMonth: parseInt(e.target.value) || 0})}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                min="0"
                max="12"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Monthly Pension</label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-gray-500">$</span>
                <input
                  type="text"
                  value={personalInfo.monthlyPension.toLocaleString()}
                  onChange={(e) => setPersonalInfo({...personalInfo, monthlyPension: parseFloat(e.target.value.replace(/,/g, '')) || 0})}
                  className="w-full pl-7 px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Annual Interest Income</label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-gray-500">$</span>
                <input
                  type="text"
                  value={personalInfo.interestIncome.toLocaleString()}
                  onChange={(e) => setPersonalInfo({...personalInfo, interestIncome: parseFloat(e.target.value.replace(/,/g, '')) || 0})}
                  className="w-full pl-7 px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Qualified Dividends</label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-gray-500">$</span>
                <input
                  type="text"
                  value={personalInfo.qualifiedDividends.toLocaleString()}
                  onChange={(e) => setPersonalInfo({...personalInfo, qualifiedDividends: parseFloat(e.target.value.replace(/,/g, '')) || 0})}
                  className="w-full pl-7 px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">Taxed at capital gains rates (typically 15%)</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ordinary Dividends</label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-gray-500">$</span>
                <input
                  type="text"
                  value={personalInfo.ordinaryDividends.toLocaleString()}
                  onChange={(e) => setPersonalInfo({...personalInfo, ordinaryDividends: parseFloat(e.target.value.replace(/,/g, '')) || 0})}
                  className="w-full pl-7 px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">Taxed as ordinary income</p>
            </div>
          </div>
        </div>

        {/* Right Column - Account Balances and Social Security */}
        <div className="space-y-6">
          {/* Account Balances */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4 text-gray-800">Account Balances</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Savings Account</label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-gray-500">$</span>
                  <input
                    type="text"
                    value={accounts.savings.toLocaleString()}
                    onChange={(e) => setAccounts({...accounts, savings: parseFloat(e.target.value.replace(/,/g, '')) || 0})}
                    className="w-full pl-7 px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Brokerage Account</label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-gray-500">$</span>
                  <input
                    type="text"
                    value={accounts.brokerage.toLocaleString()}
                    onChange={(e) => setAccounts({...accounts, brokerage: parseFloat(e.target.value.replace(/,/g, '')) || 0})}
                    className="w-full pl-7 px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Traditional IRA</label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-gray-500">$</span>
                  <input
                    type="text"
                    value={accounts.traditionalIRA.toLocaleString()}
                    onChange={(e) => setAccounts({...accounts, traditionalIRA: parseFloat(e.target.value.replace(/,/g, '')) || 0})}
                    className="w-full pl-7 px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Roth IRA</label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-gray-500">$</span>
                  <input
                    type="text"
                    value={accounts.rothIRA.toLocaleString()}
                    onChange={(e) => setAccounts({...accounts, rothIRA: parseFloat(e.target.value.replace(/,/g, '')) || 0})}
                    className="w-full pl-7 px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Traditional 401(k)</label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-gray-500">$</span>
                  <input
                    type="text"
                    value={accounts.traditional401k.toLocaleString()}
                    onChange={(e) => setAccounts({...accounts, traditional401k: parseFloat(e.target.value.replace(/,/g, '')) || 0})}
                    className="w-full pl-7 px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Roth 401(k)</label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-gray-500">$</span>
                  <input
                    type="text"
                    value={accounts.roth401k.toLocaleString()}
                    onChange={(e) => setAccounts({...accounts, roth401k: parseFloat(e.target.value.replace(/,/g, '')) || 0})}
                    className="w-full pl-7 px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Social Security */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center gap-2 mb-4">
              <Users className="w-6 h-6 text-purple-600" />
              <h2 className="text-lg font-semibold text-gray-800">Social Security</h2>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="ss-enabled"
                  checked={socialSecurity.enabled}
                  onChange={(e) => setSocialSecurity({...socialSecurity, enabled: e.target.checked})}
                  className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                />
                <label htmlFor="ss-enabled" className="text-sm font-medium text-gray-700">
                  Include Social Security Benefits
                </label>
              </div>

              {socialSecurity.enabled && (
                <div className="space-y-4 pt-4 border-t">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {personalInfo.filingStatus === 'married' ? 'Primary Filer Monthly Benefit' : 'Your Monthly Benefit'}
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-gray-500">$</span>
                      <input
                        type="text"
                        value={socialSecurity.monthlyBenefit.toLocaleString()}
                        onChange={(e) => setSocialSecurity({...socialSecurity, monthlyBenefit: parseFloat(e.target.value.replace(/,/g, '')) || 0})}
                        className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      />
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      Find your estimate at SSA.gov
                    </p>
                  </div>

                  {personalInfo.filingStatus === 'married' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Spouse Monthly Benefit
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-2 text-gray-500">$</span>
                        <input
                          type="text"
                          value={socialSecurity.spouseMonthlyBenefit.toLocaleString()}
                          onChange={(e) => setSocialSecurity({...socialSecurity, spouseMonthlyBenefit: parseFloat(e.target.value.replace(/,/g, '')) || 0})}
                          className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        />
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        Spouse's estimated monthly benefit
                      </p>
                    </div>
                  )}

                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                    <p className="text-sm text-purple-900">
                      <strong>Estimated Annual Benefit{personalInfo.filingStatus === 'married' && socialSecurity.spouseMonthlyBenefit > 0 ? 's' : ''}:</strong>
                      {personalInfo.filingStatus === 'married' && socialSecurity.spouseMonthlyBenefit > 0 ? (
                        <>
                          <br />Primary: ${(socialSecurity.monthlyBenefit * 12).toLocaleString()}
                          <br />Spouse: ${(socialSecurity.spouseMonthlyBenefit * 12).toLocaleString()}
                          <br />Combined: ${((socialSecurity.monthlyBenefit + socialSecurity.spouseMonthlyBenefit) * 12).toLocaleString()}
                        </>
                      ) : (
                        <> ${(socialSecurity.monthlyBenefit * 12).toLocaleString()}</>
                      )}
                    </p>
                    <p className="text-xs text-purple-700 mt-2">
                      Taxation (0%, 50%, or 85%) calculated automatically based on your other income.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        </div>
      </div>
    </>
  );
}
