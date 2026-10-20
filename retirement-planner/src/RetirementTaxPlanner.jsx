import React, { useState, useEffect, useRef } from 'react';
import { Calculator, Save, Download, Upload, RotateCcw, FileText } from 'lucide-react';
import IncomeStackingChart from './components/IncomeStackingChart';
import { loadSavedData, saveData as runSave, exportData as runExport,
  importData as runImport, resetToDefaults as runReset } from './persistence';
import { updateAllStockPrices as runStockPriceUpdate } from './stockPrices';
import { generatePDFReport as createPDFReport } from './pdfReport';
import ScenarioManagement from './components/ScenarioManagement';
import PersonalAccountsSection from './components/PersonalAccountsSection';
import WithdrawalPlanning from './components/WithdrawalPlanning';
import RetirementWithdrawals from './components/RetirementWithdrawals';
import LotManagementModal from './components/LotManagementModal';
import CsvImportModal from './components/CsvImportModal';
import IrmaaAnalysis from './components/IrmaaAnalysis';
import NiitAnalysis from './components/NiitAnalysis';
import RothConversionImpact from './components/RothConversionImpact';
import TaxSummary from './components/TaxSummary';
import CapitalGainsBreakdown from './components/CapitalGainsBreakdown';
import TaxSummaryGrid from './components/TaxSummaryGrid';
import UtahStateTax from './components/UtahStateTax';
import CombinedTaxSummary from './components/CombinedTaxSummary';
import ScenarioComparison from './components/ScenarioComparison';
import StockPortfolio from './components/StockPortfolio';
import CryptoPortfolio from './components/CryptoPortfolio';
import MetalsPortfolio from './components/MetalsPortfolio';
import StockLotDetails from './components/StockLotDetails';
import CryptoLotDetails from './components/CryptoLotDetails';
import MetalLotDetails from './components/MetalLotDetails';
import { TAX_YEAR } from './taxConfig';
import { nextAssetName, createDefaultPersonalInfo, createDefaultAccounts, createDefaultStocks, createDefaultSocialSecurity, highestScenarioId, createDefaultScenario } from './defaults';
import { createTaxEngine } from './taxEngine';

export default function RetirementTaxPlanner() {
  // Load saved data from storage on mount
  const [isLoading, setIsLoading] = useState(true);

  const [personalInfo, setPersonalInfo] = useState(createDefaultPersonalInfo);

  const [accounts, setAccounts] = useState(createDefaultAccounts);

  const [stocks, setStocks] = useState(createDefaultStocks);

  // Use a ref to always have access to the latest stocks
  const stocksRef = useRef(stocks);
  useEffect(() => {
    stocksRef.current = stocks;
  }, [stocks]);

  const [crypto, setCrypto] = useState([]);
  
  const [metals, setMetals] = useState([]);

  // Scenario management - supports up to 5 independent withdrawal scenarios
  const MAX_SCENARIOS = 5;
  const [scenarios, setScenarios] = useState(() => [createDefaultScenario()]);
  const [activeScenarioId, setActiveScenarioId] = useState(1);
  const [scenarioCounter, setScenarioCounter] = useState(1);

  const [saveStatus, setSaveStatus] = useState('');
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [debugLog, setDebugLog] = useState([]);

  // Lot management modal state
  const [lotModal, setLotModal] = useState({
    isOpen: false,
    assetIndex: null,
    assetType: null, // 'stocks', 'crypto', 'metals'
    assetName: ''
  });

  // CSV import modal state
  const [csvImportModal, setCSVImportModal] = useState({
    isOpen: false,
    assetIndex: null,
    assetType: null,
    csvText: ''
  });

  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [pdfReportMode, setPdfReportMode] = useState('full'); // 'full' or 'summary'
  const [rothOptimizationStrategy, setRothOptimizationStrategy] = useState('irmaa'); // 'conservative', 'irmaa', 'aggressive'
  const [irmaaBuffer, setIrmaaBuffer] = useState(5000);

  const [socialSecurity, setSocialSecurity] = useState(createDefaultSocialSecurity);

  // Add debug message helper
  const addDebugLog = (message) => {
    setDebugLog(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
    console.log(message);
  };

  // Scenario helper functions
  const getActiveScenario = () => {
    return scenarios.find(s => s.id === activeScenarioId) || scenarios[0];
  };

  const updateActiveScenario = (updates) => {
    setScenarios(scenarios.map(s =>
      s.id === activeScenarioId ? { ...s, ...updates } : s
    ));
  };

  const addScenario = () => {
    if (scenarios.length >= MAX_SCENARIOS) return;
    // Take the counter OR the highest live id, whichever is greater, so a stale or
    // corrupt counter can still never collide with an existing scenario.
    const newId = Math.max(scenarioCounter, highestScenarioId(scenarios)) + 1;
    setScenarioCounter(newId);
    setScenarios([...scenarios, createDefaultScenario(newId, `Scenario ${newId}`)]);
    setActiveScenarioId(newId);
  };

  const deleteScenario = (id) => {
    if (scenarios.length === 1) return; // Keep at least one
    const newScenarios = scenarios.filter(s => s.id !== id);
    setScenarios(newScenarios);
    if (activeScenarioId === id) {
      setActiveScenarioId(newScenarios[0].id);
    }
  };

  const renameScenario = (id, newName) => {
    setScenarios(scenarios.map(s =>
      s.id === id ? { ...s, name: newName } : s
    ));
  };

  // Stock price lookup lives in stockPrices.js; this keeps the button wiring the same.
  const updateAllStockPrices = () => runStockPriceUpdate({
    stocksRef, setStocks, setDebugLog, setLoadingPrices, setSaveStatus, apiKey, addDebugLog,
  });

  useEffect(() => {
    loadSavedData({ setPersonalInfo, setAccounts, setStocks, setCrypto, setMetals, setSocialSecurity, setApiKey, setScenarios, setActiveScenarioId, setScenarioCounter, setIsLoading });
  }, []);

  // Auto-fetch prices on load - DISABLED for now to prevent data corruption
  // useEffect(() => {
  //   if (!isLoading && stocks.length > 0) {
  //     // Small delay to ensure UI has rendered
  //     setTimeout(() => {
  //       updateAllStockPrices();
  //     }, 500);
  //   }
  // }, [isLoading]);

  // Save data to storage
  const saveData = () => runSave({ personalInfo, accounts, stocks, crypto, metals, socialSecurity, apiKey, scenarios, activeScenarioId, scenarioCounter, setSaveStatus });

  // Export data as JSON file
  const exportData = () => runExport({ personalInfo, accounts, stocks, crypto, metals, socialSecurity, apiKey, scenarios, activeScenarioId, scenarioCounter });

  // Generate PDF Report (the work is in pdfReport.js)
  const generatePDFReport = () =>
    createPDFReport({ scenarios, activeScenarioId, calculateScenario, pdfReportMode });

  // Import data from JSON file
  const importData = (event) => runImport(event, { setPersonalInfo, setAccounts, setStocks, setCrypto, setMetals, setSocialSecurity, setApiKey, setScenarios, setActiveScenarioId, setScenarioCounter, setSaveStatus });

  // Reset all data to default values
  const resetToDefaults = () => runReset({ setPersonalInfo, setAccounts, setStocks, setCrypto, setMetals, setSocialSecurity, setApiKey, setScenarios, setActiveScenarioId, setScenarioCounter, setSaveStatus });

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto p-6 bg-gray-50">
        <div className="bg-white rounded-lg shadow-lg p-6 text-center">
          <p className="text-gray-600">Loading your saved data...</p>
        </div>
      </div>
    );
  }

  const {
    federalRules, utahTaxRate, ordinaryBracketsFor, capitalGainsBracketsFor, irmaaBracketsFor,
    irmaaFilingStatus, calculateHoldingPeriod, calculateLotMetrics, selectLots, calculateScenario,
  } = createTaxEngine({ personalInfo, stocks, crypto, metals, socialSecurity });


  // Calculate results for the active scenario
  const activeScenario = getActiveScenario();
  const results = activeScenario ? calculateScenario(activeScenario) : null;

  const updateWithdrawal = (account, value) => {
    updateActiveScenario({
      withdrawals: {
        ...getActiveScenario().withdrawals,
        [account]: parseFloat(value) || 0
      }
    });
  };

  const addStock = () => {
    if (stocks.length < 12) {
      setStocks([...stocks, {
        name: nextAssetName('Stock', stocks),
        shares: 0,
        costBasis: 0,
        useLotTracking: false,
        lots: [],
        currentPrice: 0,
        skipPriceUpdate: false,
        excludeFromTotals: false
      }]);
    }
  };

  const removeStock = (index) => {
    const stockName = stocks[index].name;
    setStocks(stocks.filter((_, i) => i !== index));
    // Remove stock withdrawal from active scenario
    updateActiveScenario({
      stockWithdrawals: getActiveScenario().stockWithdrawals.filter(sw => sw.stockName !== stockName)
    });
  };

  const updateStock = (index, field, value) => {
    const newStocks = [...stocks];
    // Handle boolean fields properly
    if (field === 'skipPriceUpdate' || field === 'excludeFromTotals') {
      newStocks[index] = { ...newStocks[index], [field]: value };
    } else if (field === 'name') {
      newStocks[index] = { ...newStocks[index], [field]: value };
    } else {
      newStocks[index] = { ...newStocks[index], [field]: parseFloat(value) || 0 };
    }
    setStocks(newStocks);
  };

  const addCrypto = () => {
    if (crypto.length < 12) {
      setCrypto([...crypto, {
        name: nextAssetName('Crypto', crypto),
        units: 0,
        costBasis: 0,
        useLotTracking: false,
        lots: [],
        currentPrice: 0,
        skipPriceUpdate: false,
        excludeFromTotals: false
      }]);
    }
  };

  const removeCrypto = (index) => {
    const cryptoName = crypto[index].name;
    setCrypto(crypto.filter((_, i) => i !== index));
    // Remove crypto sale from active scenario
    updateActiveScenario({
      cryptoSales: getActiveScenario().cryptoSales.filter(cs => cs.cryptoName !== cryptoName)
    });
  };

  const updateCrypto = (index, field, value) => {
    const newCrypto = [...crypto];
    // Boolean and text fields must bypass the numeric coercion below
    if (field === 'excludeFromTotals' || field === 'name') {
      newCrypto[index] = { ...newCrypto[index], [field]: value };
    } else {
      newCrypto[index] = { ...newCrypto[index], [field]: parseFloat(value) || 0 };
    }
    setCrypto(newCrypto);
  };

  const addMetal = () => {
    if (metals.length < 12) {
      setMetals([...metals, {
        name: nextAssetName('Metal', metals),
        units: 0,
        costBasis: 0,
        useLotTracking: false,
        lots: [],
        currentPrice: 0,
        skipPriceUpdate: false,
        excludeFromTotals: false
      }]);
    }
  };

  const removeMetal = (index) => {
    const metalName = metals[index].name;
    setMetals(metals.filter((_, i) => i !== index));
    // Remove metal sale from active scenario
    updateActiveScenario({
      metalSales: getActiveScenario().metalSales.filter(ms => ms.metalName !== metalName)
    });
  };

  const updateMetal = (index, field, value) => {
    const newMetals = [...metals];
    // Boolean and text fields must bypass the numeric coercion below
    if (field === 'excludeFromTotals' || field === 'name') {
      newMetals[index] = { ...newMetals[index], [field]: value };
    } else {
      newMetals[index] = { ...newMetals[index], [field]: parseFloat(value) || 0 };
    }
    setMetals(newMetals);
  };

  // ===== LOT MANAGEMENT HELPER FUNCTIONS =====

  // UUID generator for lot IDs
  const generateLotId = () => {
    return 'lot-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  };

  // Toggle lot tracking for an asset
  const toggleLotTracking = (assetIndex, enabled, assetType = 'stocks') => {
    const updateAsset = (assets, setAssets) => {
      const newAssets = [...assets];
      newAssets[assetIndex].useLotTracking = enabled;

      // If enabling and no lots exist, create one from current legacy data
      if (enabled && newAssets[assetIndex].lots.length === 0) {
        const asset = newAssets[assetIndex];
        const quantity = asset.shares || asset.units || 0;
        if (quantity > 0) {
          newAssets[assetIndex].lots = [{
            id: generateLotId(),
            purchaseDate: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 400 days ago (long-term)
            quantity: quantity,
            costBasisPerUnit: asset.costBasis,
            totalCostBasis: quantity * asset.costBasis
          }];
        }
      }

      setAssets(newAssets);
    };

    if (assetType === 'stocks') updateAsset(stocks, setStocks);
    else if (assetType === 'crypto') updateAsset(crypto, setCrypto);
    else if (assetType === 'metals') updateAsset(metals, setMetals);
  };

  // Add a new lot to an asset
  const addLot = (assetIndex, assetType = 'stocks') => {
    const updateAsset = (assets, setAssets) => {
      const newAssets = [...assets];
      if (newAssets[assetIndex].lots.length < 30) {
        newAssets[assetIndex].lots.push({
          id: generateLotId(),
          purchaseDate: new Date().toISOString().split('T')[0],
          quantity: 0,
          costBasisPerUnit: 0,
          totalCostBasis: 0
        });
        setAssets(newAssets);
      }
    };

    if (assetType === 'stocks') updateAsset(stocks, setStocks);
    else if (assetType === 'crypto') updateAsset(crypto, setCrypto);
    else if (assetType === 'metals') updateAsset(metals, setMetals);
  };

  // Update a lot field
  const updateLot = (assetIndex, lotIndex, field, value, assetType = 'stocks') => {
    const updateAsset = (assets, setAssets) => {
      const newAssets = [...assets];
      const lot = newAssets[assetIndex].lots[lotIndex];

      if (field === 'purchaseDate') {
        lot.purchaseDate = value;
      } else {
        lot[field] = parseFloat(value) || 0;
        // Recalculate total cost basis when quantity or cost per unit changes
        if (field === 'quantity' || field === 'costBasisPerUnit') {
          lot.totalCostBasis = lot.quantity * lot.costBasisPerUnit;
        }
      }

      setAssets(newAssets);
    };

    if (assetType === 'stocks') updateAsset(stocks, setStocks);
    else if (assetType === 'crypto') updateAsset(crypto, setCrypto);
    else if (assetType === 'metals') updateAsset(metals, setMetals);
  };

  // Remove a lot from an asset
  const removeLot = (assetIndex, lotIndex, assetType = 'stocks') => {
    const updateAsset = (assets, setAssets) => {
      const newAssets = [...assets];
      newAssets[assetIndex].lots = newAssets[assetIndex].lots.filter((_, i) => i !== lotIndex);
      setAssets(newAssets);
    };

    if (assetType === 'stocks') updateAsset(stocks, setStocks);
    else if (assetType === 'crypto') updateAsset(crypto, setCrypto);
    else if (assetType === 'metals') updateAsset(metals, setMetals);
  };

  // Open lot management modal
  const openLotModal = (assetIndex, assetType) => {
    const asset = assetType === 'stocks' ? stocks[assetIndex]
      : assetType === 'crypto' ? crypto[assetIndex]
      : metals[assetIndex];

    setLotModal({
      isOpen: true,
      assetIndex,
      assetType,
      assetName: asset.name
    });
  };

  // Close lot management modal
  const closeLotModal = () => {
    setLotModal({
      isOpen: false,
      assetIndex: null,
      assetType: null,
      assetName: ''
    });
  };

  // Open CSV import modal
  const openCSVImportModal = (assetIndex, assetType) => {
    setCSVImportModal({
      isOpen: true,
      assetIndex,
      assetType,
      csvText: ''
    });
  };

  // Close CSV import modal
  const closeCSVImportModal = () => {
    setCSVImportModal({
      isOpen: false,
      assetIndex: null,
      assetType: null,
      csvText: ''
    });
  };

  // Parse and import lots from CSV
  const parseCSVAndImportLots = () => {
    try {
      const lines = csvImportModal.csvText.trim().split('\n');
      if (lines.length < 2) {
        alert('CSV must have at least a header row and one data row');
        return;
      }

      // Expected format: Purchase Date, Quantity, Cost Per Unit
      // Skip header row
      const lots = [];
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(',').map(p => p.trim());
        if (parts.length >= 3) {
          const quantity = parseFloat(parts[1]) || 0;
          const costPerUnit = parseFloat(parts[2]) || 0;
          lots.push({
            id: generateLotId(),
            purchaseDate: parts[0], // Should be YYYY-MM-DD format
            quantity,
            costBasisPerUnit: costPerUnit,
            totalCostBasis: quantity * costPerUnit
          });
        }
      }

      if (lots.length === 0) {
        alert('No valid lots found in CSV');
        return;
      }

      if (lots.length > 30) {
        alert(`CSV contains ${lots.length} lots, but maximum is 30. Only first 30 will be imported.`);
        lots.splice(30);
      }

      // Import lots into the selected asset
      const assetType = csvImportModal.assetType;
      const assetIndex = csvImportModal.assetIndex;

      if (assetType === 'stocks') {
        const newStocks = [...stocks];
        newStocks[assetIndex].lots = lots;
        newStocks[assetIndex].useLotTracking = true;
        setStocks(newStocks);
      } else if (assetType === 'crypto') {
        const newCrypto = [...crypto];
        newCrypto[assetIndex].lots = lots;
        newCrypto[assetIndex].useLotTracking = true;
        setCrypto(newCrypto);
      } else if (assetType === 'metals') {
        const newMetals = [...metals];
        newMetals[assetIndex].lots = lots;
        newMetals[assetIndex].useLotTracking = true;
        setMetals(newMetals);
      }

      closeCSVImportModal();
      alert(`Successfully imported ${lots.length} lots`);
    } catch (error) {
      alert(`Error parsing CSV: ${error.message}`);
    }
  };

  // ===== END LOT MANAGEMENT HELPER FUNCTIONS =====

  const updateStockWithdrawal = (stockName, shares) => {
    const scenario = getActiveScenario();
    const sharesToSell = Math.max(0, parseFloat(shares) || 0);
    const existing = scenario.stockWithdrawals.find(sw => sw.stockName === stockName);
    if (existing) {
      updateActiveScenario({
        stockWithdrawals: scenario.stockWithdrawals.map(sw =>
          sw.stockName === stockName ? { ...sw, sharesToSell } : sw
        )
      });
    } else {
      updateActiveScenario({
        stockWithdrawals: [...scenario.stockWithdrawals, { stockName, sharesToSell }]
      });
    }
  };

  const getStockWithdrawal = (stockName) => {
    const scenario = getActiveScenario();
    const sw = scenario.stockWithdrawals.find(s => s.stockName === stockName);
    return sw ? sw.sharesToSell : 0;
  };

  const getStockStrategy = (stockName) => {
    const scenario = getActiveScenario();
    const sw = scenario.stockWithdrawals.find(s => s.stockName === stockName);
    return sw ? (sw.selectionStrategy || 'HIFO') : 'HIFO';
  };

  const updateStockStrategy = (stockName, strategy) => {
    const scenario = getActiveScenario();
    const existing = scenario.stockWithdrawals.find(sw => sw.stockName === stockName);
    if (existing) {
      updateActiveScenario({
        stockWithdrawals: scenario.stockWithdrawals.map(sw =>
          sw.stockName === stockName ? { ...sw, selectionStrategy: strategy } : sw
        )
      });
    } else {
      // Create withdrawal entry with strategy if it doesn't exist
      updateActiveScenario({
        stockWithdrawals: [...scenario.stockWithdrawals, { stockName, sharesToSell: 0, selectionStrategy: strategy }]
      });
    }
  };

  const updateCryptoSale = (cryptoName, units) => {
    const scenario = getActiveScenario();
    const unitsToSell = Math.max(0, parseFloat(units) || 0);
    const existing = scenario.cryptoSales.find(cs => cs.cryptoName === cryptoName);
    if (existing) {
      updateActiveScenario({
        cryptoSales: scenario.cryptoSales.map(cs =>
          cs.cryptoName === cryptoName ? { ...cs, unitsToSell } : cs
        )
      });
    } else {
      updateActiveScenario({
        cryptoSales: [...scenario.cryptoSales, { cryptoName, unitsToSell }]
      });
    }
  };

  const getCryptoSale = (cryptoName) => {
    const scenario = getActiveScenario();
    const cs = scenario.cryptoSales.find(c => c.cryptoName === cryptoName);
    return cs ? cs.unitsToSell : 0;
  };

  const getCryptoStrategy = (cryptoName) => {
    const scenario = getActiveScenario();
    const cs = scenario.cryptoSales.find(c => c.cryptoName === cryptoName);
    return cs ? (cs.selectionStrategy || 'HIFO') : 'HIFO';
  };

  const updateCryptoStrategy = (cryptoName, strategy) => {
    const scenario = getActiveScenario();
    const existing = scenario.cryptoSales.find(cs => cs.cryptoName === cryptoName);
    if (existing) {
      updateActiveScenario({
        cryptoSales: scenario.cryptoSales.map(cs =>
          cs.cryptoName === cryptoName ? { ...cs, selectionStrategy: strategy } : cs
        )
      });
    } else {
      // Create sale entry with strategy if it doesn't exist
      updateActiveScenario({
        cryptoSales: [...scenario.cryptoSales, { cryptoName, unitsToSell: 0, selectionStrategy: strategy }]
      });
    }
  };

  const updateMetalSale = (metalName, units) => {
    const scenario = getActiveScenario();
    const unitsToSell = Math.max(0, parseFloat(units) || 0);
    const existing = scenario.metalSales.find(ms => ms.metalName === metalName);
    if (existing) {
      updateActiveScenario({
        metalSales: scenario.metalSales.map(ms =>
          ms.metalName === metalName ? { ...ms, unitsToSell } : ms
        )
      });
    } else {
      updateActiveScenario({
        metalSales: [...scenario.metalSales, { metalName, unitsToSell }]
      });
    }
  };

  const getMetalSale = (metalName) => {
    const scenario = getActiveScenario();
    const ms = scenario.metalSales.find(m => m.metalName === metalName);
    return ms ? ms.unitsToSell : 0;
  };

  const getMetalStrategy = (metalName) => {
    const scenario = getActiveScenario();
    const ms = scenario.metalSales.find(m => m.metalName === metalName);
    return ms ? (ms.selectionStrategy || 'HIFO') : 'HIFO';
  };

  const updateMetalStrategy = (metalName, strategy) => {
    const scenario = getActiveScenario();
    const existing = scenario.metalSales.find(ms => ms.metalName === metalName);
    if (existing) {
      updateActiveScenario({
        metalSales: scenario.metalSales.map(ms =>
          ms.metalName === metalName ? { ...ms, selectionStrategy: strategy } : ms
        )
      });
    } else {
      // Create sale entry with strategy if it doesn't exist
      updateActiveScenario({
        metalSales: [...scenario.metalSales, { metalName, unitsToSell: 0, selectionStrategy: strategy }]
      });
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6 bg-gray-50">
      <style>{`
        /* Fix input/select text cutoff in PDF by ensuring adequate line-height */
        .pdf-section input,
        .pdf-section select {
          line-height: 1.8 !important;
          padding-top: 6px !important;
          padding-bottom: 6px !important;
        }

        .pdf-section select {
          min-height: 48px !important;
          height: 48px !important;
          line-height: normal !important;
          padding-top: 12px !important;
          padding-bottom: 12px !important;
          display: flex !important;
          align-items: center !important;
          overflow: visible !important;
          background-color: #f3f4f6 !important;
        }
      `}</style>
      <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Calculator className="w-6 h-6 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-800">{TAX_YEAR} Retirement Withdrawal Tax Planner</h1>
          </div>
          <div className="flex items-center gap-2">
            {saveStatus && (
              <span className="text-sm text-green-600 mr-2">{saveStatus}</span>
            )}
            <button
              onClick={saveData}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
            >
              <Save className="w-4 h-4" />
              Save Data
            </button>
            <button
              onClick={exportData}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              <Download className="w-4 h-4" />
              Export
            </button>
            <div className="flex items-center gap-2 border border-gray-300 rounded-md p-1 bg-white">
              <select
                value={pdfReportMode}
                onChange={(e) => setPdfReportMode(e.target.value)}
                className="text-sm px-2 py-1 border-none focus:outline-none"
              >
                <option value="full">Full Report</option>
                <option value="summary">Summary Report</option>
              </select>
              <button
                onClick={generatePDFReport}
                className="flex items-center gap-2 px-3 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700"
                title={pdfReportMode === 'full' ? "Generate full PDF report with all details" : "Generate summary PDF report (excludes assets and lot details)"}
              >
                <FileText className="w-4 h-4" />
                PDF Report
              </button>
            </div>
            <label className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 cursor-pointer">
              <Upload className="w-4 h-4" />
              Import
              <input
                type="file"
                accept=".json"
                onChange={importData}
                className="hidden"
              />
            </label>
            <button
              onClick={resetToDefaults}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700"
              title="Reset all data to default values"
            >
              <RotateCcw className="w-4 h-4" />
              Reset
            </button>
          </div>
        </div>
        <p className="text-sm text-gray-600 mb-4">
          Plan your retirement withdrawals to minimize taxes. This is for educational purposes only - consult a tax professional for personalized advice.
        </p>
      </div>

      <ScenarioManagement
        MAX_SCENARIOS={MAX_SCENARIOS}
        activeScenarioId={activeScenarioId}
        addScenario={addScenario}
        deleteScenario={deleteScenario}
        getActiveScenario={getActiveScenario}
        renameScenario={renameScenario}
        scenarios={scenarios}
        setActiveScenarioId={setActiveScenarioId}
      />

      <PersonalAccountsSection
        accounts={accounts}
        personalInfo={personalInfo}
        setAccounts={setAccounts}
        setPersonalInfo={setPersonalInfo}
        setSocialSecurity={setSocialSecurity}
        socialSecurity={socialSecurity}
      />

      <StockPortfolio
        stocks={stocks}
        addStock={addStock}
        updateStock={updateStock}
        removeStock={removeStock}
        updateAllStockPrices={updateAllStockPrices}
        toggleLotTracking={toggleLotTracking}
        openLotModal={openLotModal}
        apiKey={apiKey}
        setApiKey={setApiKey}
        showApiKey={showApiKey}
        setShowApiKey={setShowApiKey}
        loadingPrices={loadingPrices}
        debugLog={debugLog}
        setDebugLog={setDebugLog}
      />

      <CryptoPortfolio
        crypto={crypto}
        addCrypto={addCrypto}
        updateCrypto={updateCrypto}
        removeCrypto={removeCrypto}
        toggleLotTracking={toggleLotTracking}
        openLotModal={openLotModal}
      />

      <MetalsPortfolio
        metals={metals}
        addMetal={addMetal}
        updateMetal={updateMetal}
        removeMetal={removeMetal}
        toggleLotTracking={toggleLotTracking}
        openLotModal={openLotModal}
      />

      <WithdrawalPlanning
        crypto={crypto}
        getCryptoSale={getCryptoSale}
        getCryptoStrategy={getCryptoStrategy}
        getMetalSale={getMetalSale}
        getMetalStrategy={getMetalStrategy}
        getStockStrategy={getStockStrategy}
        getStockWithdrawal={getStockWithdrawal}
        metals={metals}
        selectLots={selectLots}
        stocks={stocks}
        updateCryptoSale={updateCryptoSale}
        updateCryptoStrategy={updateCryptoStrategy}
        updateMetalSale={updateMetalSale}
        updateMetalStrategy={updateMetalStrategy}
        updateStockStrategy={updateStockStrategy}
        updateStockWithdrawal={updateStockWithdrawal}
      />

      <RetirementWithdrawals
        accounts={accounts}
        calculateScenario={calculateScenario}
        getActiveScenario={getActiveScenario}
        irmaaBracketsFor={irmaaBracketsFor}
        irmaaBuffer={irmaaBuffer}
        irmaaFilingStatus={irmaaFilingStatus}
        rothOptimizationStrategy={rothOptimizationStrategy}
        setIrmaaBuffer={setIrmaaBuffer}
        setRothOptimizationStrategy={setRothOptimizationStrategy}
        updateActiveScenario={updateActiveScenario}
        updateWithdrawal={updateWithdrawal}
      />

      {/* Only render results sections if we have valid results */}
      {results && (
        <>
      <IrmaaAnalysis
        irmaaBracketsFor={irmaaBracketsFor}
        irmaaFilingStatus={irmaaFilingStatus}
        personalInfo={personalInfo}
        results={results}
      />

      <NiitAnalysis
        federalRules={federalRules}
        personalInfo={personalInfo}
        results={results}
      />

      <RothConversionImpact
        activeScenario={activeScenario}
        calculateScenario={calculateScenario}
        results={results}
      />

      <TaxSummary
        ordinaryBracketsFor={ordinaryBracketsFor}
        personalInfo={personalInfo}
        results={results}
      />

      <CapitalGainsBreakdown
        results={results}
      />

      <TaxSummaryGrid
        federalRules={federalRules}
        getActiveScenario={getActiveScenario}
        personalInfo={personalInfo}
        results={results}
        socialSecurity={socialSecurity}
      />

      <UtahStateTax
        personalInfo={personalInfo}
        results={results}
        utahTaxRate={utahTaxRate}
      />

      <CombinedTaxSummary
        federalRules={federalRules}
        results={results}
      />

      <IncomeStackingChart
        results={results}
        personalInfo={personalInfo}
        ordinaryBracketsFor={ordinaryBracketsFor}
        capitalGainsBracketsFor={capitalGainsBracketsFor}
      />

      <ScenarioComparison
        accounts={accounts}
        activeScenarioId={activeScenarioId}
        calculateScenario={calculateScenario}
        federalRules={federalRules}
        results={results}
        scenarios={scenarios}
      />

      <StockLotDetails
        stocks={stocks}
        calculateHoldingPeriod={calculateHoldingPeriod}
      />

      <CryptoLotDetails
        crypto={crypto}
        calculateHoldingPeriod={calculateHoldingPeriod}
      />

      <MetalLotDetails
        metals={metals}
        calculateHoldingPeriod={calculateHoldingPeriod}
      />

      <LotManagementModal
        addLot={addLot}
        calculateLotMetrics={calculateLotMetrics}
        closeLotModal={closeLotModal}
        crypto={crypto}
        lotModal={lotModal}
        metals={metals}
        openCSVImportModal={openCSVImportModal}
        removeLot={removeLot}
        stocks={stocks}
        updateLot={updateLot}
      />

      <CsvImportModal
        closeCSVImportModal={closeCSVImportModal}
        csvImportModal={csvImportModal}
        parseCSVAndImportLots={parseCSVAndImportLots}
        setCSVImportModal={setCSVImportModal}
      />

        </>
      )}
    </div>
  );
}
