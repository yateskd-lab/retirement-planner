import { migrateAsset, migrateScenario } from './migrations';
import {
  createDefaultPersonalInfo, createDefaultAccounts, createDefaultStocks,
  createDefaultSocialSecurity, createDefaultScenario, highestScenarioId,
} from './defaults';

// Loading, saving, exporting, importing and resetting the planner's data.
// The component passes in the state and setters each one needs; this file reads no
// component state of its own.

// Load data from storage on mount
export const loadSavedData = async ({
  setPersonalInfo, setAccounts, setStocks, setCrypto, setMetals, setSocialSecurity, setApiKey,
  setScenarios, setActiveScenarioId, setScenarioCounter,
  setIsLoading,
}) => {
  try {
    const result = await window.storage.get('retirement-planner-data');
    if (result && result.value) {
      const data = JSON.parse(result.value);
      if (data.personalInfo) setPersonalInfo(prev => ({ ...prev, ...data.personalInfo }));
      if (data.accounts) {
        // Migrate accounts to include brokerage field if missing
        setAccounts({
          ...data.accounts,
          brokerage: data.accounts.brokerage ?? 500000
        });
      }

      // Migrate assets to include lot tracking fields
      if (data.stocks) setStocks(data.stocks.map(migrateAsset));
      if (data.crypto) setCrypto(data.crypto.map(migrateAsset));
      if (data.metals) setMetals(data.metals.map(migrateAsset));

      if (data.socialSecurity) setSocialSecurity({ ...createDefaultSocialSecurity(), ...data.socialSecurity });
      if (data.apiKey) setApiKey(data.apiKey);

      // Handle scenarios - migrate old format if needed
      if (data.scenarios) {
        // New format with scenarios - migrate each scenario to ensure required fields exist
        const migratedScenarios = Array.isArray(data.scenarios)
          ? data.scenarios.map(migrateScenario)
          : [];
        setScenarios(migratedScenarios);
        setActiveScenarioId(data.activeScenarioId || (migratedScenarios[0] ? migratedScenarios[0].id : 1));
        setScenarioCounter(Math.max(Number(data.scenarioCounter) || 0, highestScenarioId(migratedScenarios)));
      } else {
        // Old format - migrate to scenario structure
        setScenarios([migrateScenario({
          ...createDefaultScenario(),
          withdrawals: data.withdrawals,
          stockWithdrawals: data.stockWithdrawals,
          cryptoSales: data.cryptoSales,
          metalSales: data.metalSales
        })]);
        setActiveScenarioId(1);
        setScenarioCounter(1);
      }
    }
  } catch (error) {
    console.log('No saved data found or error loading:', error);
  } finally {
    setIsLoading(false);
  }
};

// Save data to storage
export const saveData = async ({
  personalInfo, accounts, stocks, crypto, metals, socialSecurity, apiKey, scenarios, activeScenarioId, scenarioCounter,
  setSaveStatus,
}) => {
  try {
    const data = {
      personalInfo,
      accounts,
      stocks,
      crypto,
      metals,
      socialSecurity,
      apiKey,
      scenarios,
      activeScenarioId,
      scenarioCounter,
      savedAt: new Date().toISOString()
    };

    await window.storage.set('retirement-planner-data', JSON.stringify(data));
    setSaveStatus('Saved successfully!');
    setTimeout(() => setSaveStatus(''), 3000);
  } catch (error) {
    setSaveStatus('Error saving data');
    setTimeout(() => setSaveStatus(''), 3000);
  }
};

// Export data as JSON file
export const exportData = ({
  personalInfo, accounts, stocks, crypto, metals, socialSecurity, apiKey, scenarios, activeScenarioId, scenarioCounter,
}) => {
  const data = {
    personalInfo,
    accounts,
    stocks,
    crypto,
    metals,
    socialSecurity,
    apiKey,
    scenarios,
    activeScenarioId,
    scenarioCounter,
    exportedAt: new Date().toISOString()
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `retirement-plan-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

// Import data from JSON file
export const importData = (event, {
  setPersonalInfo, setAccounts, setStocks, setCrypto, setMetals, setSocialSecurity, setApiKey,
  setScenarios, setActiveScenarioId, setScenarioCounter,
  setSaveStatus,
}) => {
  const file = event.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        console.log('=== STARTING IMPORT ===');
        console.log('Import data:', data);

        try {
          if (data.personalInfo) {
            console.log('Setting personalInfo');
            // Merge over the defaults rather than replacing wholesale: a file
            // exported before a field existed would otherwise leave it undefined
            // and crash the render that formats it.
            setPersonalInfo({ ...createDefaultPersonalInfo(), ...data.personalInfo });
          }
        } catch (err) {
          console.error('Error setting personalInfo:', err);
          throw new Error('Failed to set personalInfo: ' + err.message);
        }

        try {
          if (data.accounts) {
            console.log('Setting accounts');
            // Same here -- notably accounts.brokerage, which the UI formats unguarded.
            setAccounts({ ...createDefaultAccounts(), ...data.accounts });
          }
        } catch (err) {
          console.error('Error setting accounts:', err);
          throw new Error('Failed to set accounts: ' + err.message);
        }

        // Migrate assets to include lot tracking fields
        try {
          if (data.stocks) {
            console.log('Migrating stocks:', data.stocks);
            const migratedStocks = data.stocks.map(migrateAsset);
            console.log('Migrated stocks:', migratedStocks);
            setStocks(migratedStocks);
            console.log('Stocks set successfully');
          }
        } catch (err) {
          console.error('Error setting stocks:', err);
          throw new Error('Failed to set stocks: ' + err.message);
        }

        try {
          if (data.crypto !== undefined) {
            console.log('Migrating crypto:', data.crypto);
            const migratedCrypto = Array.isArray(data.crypto) ? data.crypto.map(migrateAsset) : [];
            setCrypto(migratedCrypto);
            console.log('Crypto set successfully');
          }
        } catch (err) {
          console.error('Error setting crypto:', err);
          throw new Error('Failed to set crypto: ' + err.message);
        }

        try {
          if (data.metals !== undefined) {
            console.log('Migrating metals:', data.metals);
            const migratedMetals = Array.isArray(data.metals) ? data.metals.map(migrateAsset) : [];
            setMetals(migratedMetals);
            console.log('Metals set successfully');
          }
        } catch (err) {
          console.error('Error setting metals:', err);
          throw new Error('Failed to set metals: ' + err.message);
        }

        try {
          if (data.socialSecurity) {
            console.log('Setting socialSecurity');
            setSocialSecurity({ ...createDefaultSocialSecurity(), ...data.socialSecurity });
          }
        } catch (err) {
          console.error('Error setting socialSecurity:', err);
          throw new Error('Failed to set socialSecurity: ' + err.message);
        }

        try {
          if (data.apiKey !== undefined) {
            console.log('Setting apiKey');
            setApiKey(data.apiKey);
          }
        } catch (err) {
          console.error('Error setting apiKey:', err);
          throw new Error('Failed to set apiKey: ' + err.message);
        }

        // Handle scenarios - migrate old format if needed
        try {
          if (data.scenarios) {
            // New format with scenarios - migrate each scenario to ensure required fields exist
            console.log('Migrating scenarios:', data.scenarios);
            const migratedScenarios = Array.isArray(data.scenarios)
              ? data.scenarios.map(migrateScenario)
              : [];
            console.log('Migrated scenarios:', migratedScenarios);
            setScenarios(migratedScenarios);
            console.log('Scenarios set successfully');

            const activeId = data.activeScenarioId || (migratedScenarios[0] ? migratedScenarios[0].id : 1);
            console.log('Setting activeScenarioId:', activeId);
            setActiveScenarioId(activeId);

            const counter = Math.max(Number(data.scenarioCounter) || 0, highestScenarioId(migratedScenarios));
            console.log('Setting scenarioCounter:', counter);
            setScenarioCounter(counter);
          } else if (data.withdrawals) {
            // Old format - migrate to scenario structure
            console.log('Migrating old format to scenarios');
            setScenarios([migrateScenario({
              ...createDefaultScenario(),
              withdrawals: data.withdrawals,
              stockWithdrawals: data.stockWithdrawals,
              cryptoSales: data.cryptoSales,
              metalSales: data.metalSales
            })]);
            setActiveScenarioId(1);
            setScenarioCounter(1);
            console.log('Old format migrated successfully');
          }
        } catch (err) {
          console.error('Error setting scenarios:', err);
          throw new Error('Failed to set scenarios: ' + err.message);
        }

        console.log('=== IMPORT COMPLETED SUCCESSFULLY ===');
        alert('Data imported successfully!');
        setSaveStatus('Data imported successfully!');
        setTimeout(() => setSaveStatus(''), 3000);
      } catch (error) {
        console.error('=== IMPORT FAILED ===');
        console.error('Import error:', error);
        alert('Error importing data: ' + error.message);
        setSaveStatus('Error importing data');
        setTimeout(() => setSaveStatus(''), 3000);
      }
    };
    reader.readAsText(file);
  }
};

// Reset all data to default values
export const resetToDefaults = ({
  setPersonalInfo, setAccounts, setStocks, setCrypto, setMetals, setSocialSecurity, setApiKey,
  setScenarios, setActiveScenarioId, setScenarioCounter,
  setSaveStatus,
}) => {
  const confirmed = window.confirm(
    'Are you sure you want to reset all data to default values? This will clear all your inputs and cannot be undone.'
  );

  if (confirmed) {
    // Reset all state to default values. These come from the same factories the
    // initial useState values use, so Reset cannot drift from them again.
    setPersonalInfo(createDefaultPersonalInfo());
    setAccounts(createDefaultAccounts());
    setStocks(createDefaultStocks());

    setCrypto([]);
    setMetals([]);

    setSocialSecurity(createDefaultSocialSecurity());

    setApiKey('');

    setScenarios([createDefaultScenario()]);

    setActiveScenarioId(1);
    setScenarioCounter(1);

    // Clear localStorage
    try {
      window.storage.remove('retirement-planner-data');
    } catch (error) {
      console.error('Error clearing storage:', error);
    }

    setSaveStatus('Reset to default values!');
    setTimeout(() => setSaveStatus(''), 3000);
  }
};
