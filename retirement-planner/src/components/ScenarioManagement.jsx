import React from 'react';

export default function ScenarioManagement({ MAX_SCENARIOS, activeScenarioId, addScenario, deleteScenario, getActiveScenario, renameScenario, scenarios, setActiveScenarioId }) {
  return (
    <>
      {/* Scenario Management Section */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-800">Withdrawal Scenarios</h2>
          <div className="flex items-center gap-3">
            {scenarios.length > 1 && (
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700">Active Scenario:</label>
                <select
                  value={activeScenarioId}
                  onChange={(e) => setActiveScenarioId(parseInt(e.target.value))}
                  className="px-3 py-2 border border-gray-300 rounded-md"
                >
                  {scenarios.map(scenario => (
                    <option key={scenario.id} value={scenario.id}>
                      {scenario.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <button
              onClick={addScenario}
              disabled={scenarios.length >= MAX_SCENARIOS}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              Add Scenario ({scenarios.length}/{MAX_SCENARIOS})
            </button>
          </div>
        </div>

        {scenarios.length > 1 && (
          <div className="flex items-center gap-3 pt-3 border-t">
            <input
              type="text"
              value={getActiveScenario().name}
              onChange={(e) => renameScenario(activeScenarioId, e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
              placeholder="Scenario name"
            />
            <button
              onClick={() => deleteScenario(activeScenarioId)}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
            >
              Delete Scenario
            </button>
          </div>
        )}
      </div>
    </>
  );
}
