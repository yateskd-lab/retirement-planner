import React, { useState, useEffect, useRef } from 'react';
import { Calculator, DollarSign, TrendingDown, AlertCircle, Save, Download, Upload, RotateCcw } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell, ResponsiveContainer, ReferenceLine, ReferenceArea, Label } from 'recharts';

export default function RetirementTaxPlanner() {
  // Load saved data from storage on mount
  const [isLoading, setIsLoading] = useState(true);

  const [personalInfo, setPersonalInfo] = useState({
    age: 65,
    filingStatus: 'single',
    workMonths: 3,
    monthlyWorkIncome: 5000,
    monthlyPension: 3000,
    pensionStartMonth: 4,
    interestIncome: 0,
    qualifiedDividends: 0,
    ordinaryDividends: 0
  });

  const [accounts, setAccounts] = useState({
    savings: 50000,
    traditionalIRA: 300000,
    rothIRA: 100000,
    traditional401k: 400000,
    roth401k: 50000
  });

  const [stocks, setStocks] = useState([
    { name: 'Stock 1', shares: 100, costBasis: 50, currentPrice: 75 },
    { name: 'Stock 2', shares: 50, costBasis: 100, currentPrice: 120 },
  ]);

  // Use a ref to always have access to the latest stocks
  const stocksRef = useRef(stocks);
  useEffect(() => {
    stocksRef.current = stocks;
  }, [stocks]);

  const [crypto, setCrypto] = useState([]);
  
  const [metals, setMetals] = useState([]);

  // Scenario management - supports up to 5 independent withdrawal scenarios
  const MAX_SCENARIOS = 5;
  const [scenarios, setScenarios] = useState([
    {
      id: 1,
      name: "Scenario 1",
      withdrawals: {
        savings: 0,
        traditionalIRA: 0,
        rothIRA: 0,
        traditional401k: 0,
        roth401k: 0
      },
      stockWithdrawals: [],
      cryptoSales: [],
      metalSales: []
    }
  ]);
  const [activeScenarioId, setActiveScenarioId] = useState(1);
  const [scenarioCounter, setScenarioCounter] = useState(1);

  const [saveStatus, setSaveStatus] = useState('');
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [debugLog, setDebugLog] = useState([]);

  const [apiKey, setApiKey] = useState('');

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
    const newId = scenarioCounter + 1;
    setScenarioCounter(newId);
    setScenarios([...scenarios, {
      id: newId,
      name: `Scenario ${newId}`,
      withdrawals: {
        savings: 0,
        traditionalIRA: 0,
        rothIRA: 0,
        traditional401k: 0,
        roth401k: 0
      },
      stockWithdrawals: [],
      cryptoSales: [],
      metalSales: []
    }]);
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

  // Fetch current stock price using multiple fallback APIs
  const fetchStockPrice = async (ticker) => {
    try {
      // Try method 1: Yahoo Finance (most reliable, no API key needed)
      try {
        const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`;
        addDebugLog(`    → Trying Yahoo Finance for ${ticker}`);
        const yahooResponse = await fetch(yahooUrl);
        addDebugLog(`    → Yahoo response status: ${yahooResponse.status}`);
        const yahooData = await yahooResponse.json();
        addDebugLog(`    → Yahoo data received: ${JSON.stringify(yahooData).substring(0, 100)}...`);

        if (yahooData?.chart?.result?.[0]?.meta?.regularMarketPrice) {
          const price = parseFloat(yahooData.chart.result[0].meta.regularMarketPrice);
          addDebugLog(`    ✓ Yahoo Success for ${ticker}: $${price}`);
          return price;
        } else {
          addDebugLog(`    ✗ Yahoo data structure invalid for ${ticker}`);
        }
      } catch (e) {
        addDebugLog(`    ✗ Yahoo Finance failed for ${ticker}: ${e.message}`);
      }

      // Try method 2: Twelve Data (backup)
      try {
        const twelveUrl = `https://api.twelvedata.com/price?symbol=${ticker}&apikey=demo`;
        addDebugLog(`    → Trying Twelve Data for ${ticker}`);
        const twelveResponse = await fetch(twelveUrl);
        addDebugLog(`    → Twelve Data response status: ${twelveResponse.status}`);
        const twelveData = await twelveResponse.json();
        addDebugLog(`    → Twelve Data returned: ${JSON.stringify(twelveData)}`);

        if (twelveData?.price) {
          const price = parseFloat(twelveData.price);
          addDebugLog(`    ✓ Twelve Data Success for ${ticker}: $${price}`);
          return price;
        } else {
          addDebugLog(`    ✗ Twelve Data has no price field for ${ticker}`);
        }
      } catch (e) {
        addDebugLog(`    ✗ Twelve Data failed for ${ticker}: ${e.message}`);
      }

      // Try method 3: Alpha Vantage (if user provided API key)
      if (apiKey && apiKey.length > 0) {
        try {
          const avUrl = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${ticker}&apikey=${apiKey}`;
          addDebugLog(`    → Trying Alpha Vantage for ${ticker} with your API key`);
          const avResponse = await fetch(avUrl);
          addDebugLog(`    → Alpha Vantage response status: ${avResponse.status}`);
          const avData = await avResponse.json();
          addDebugLog(`    → Alpha Vantage returned: ${JSON.stringify(avData).substring(0, 200)}...`);

          if (avData && avData['Global Quote'] && avData['Global Quote']['05. price']) {
            const price = parseFloat(avData['Global Quote']['05. price']);
            addDebugLog(`    ✓ Alpha Vantage Success for ${ticker}: $${price}`);
            return price;
          } else {
            addDebugLog(`    ✗ Alpha Vantage has no valid price for ${ticker}`);
          }
        } catch (e) {
          addDebugLog(`    ✗ Alpha Vantage failed for ${ticker}: ${e.message}`);
        }
      }

      addDebugLog(`    ✗ All methods failed for ${ticker}`);
      return null;
    } catch (error) {
      addDebugLog(`    ✗ Error fetching price for ${ticker}: ${error.message}`);
      return null;
    }
  };

  // Update all stock prices
  const updateAllStockPrices = async () => {
    setDebugLog([]); // Clear previous logs
    setLoadingPrices(true);
    setSaveStatus('Fetching current prices...');

    // Get current stocks from ref
    const stocksToUpdate = [...stocksRef.current];
    addDebugLog(`Starting price update for ${stocksToUpdate.length} stocks: ${stocksToUpdate.map(s => s.name).join(', ')}`);

    let successCount = 0;
    let failedTickers = [];

    for (let i = 0; i < stocksToUpdate.length; i++) {
      const stock = stocksToUpdate[i];
      const ticker = stock.name.trim().toUpperCase();

      addDebugLog(`[${i + 1}/${stocksToUpdate.length}] Processing: ${ticker}`);

      // Only fetch if the name looks like a ticker (1-5 characters, letters only)
      const isTicker = /^[A-Z]{1,5}$/.test(ticker);

      if (isTicker) {
        addDebugLog(`  → ${ticker} is valid ticker format, fetching...`);
        const price = await fetchStockPrice(ticker);
        addDebugLog(`  → ${ticker} fetch returned: $${price}`);

        if (price && price > 0) {
          // Update the stock in our working array
          stocksToUpdate[i] = { ...stock, currentPrice: parseFloat(price.toFixed(2)) };
          successCount++;
          addDebugLog(`  ✓ ${ticker} updated to $${price}`);

          // Update state after each fetch so user sees progress
          setStocks([...stocksToUpdate]);
          addDebugLog(`  → State updated, continuing...`);
        } else {
          failedTickers.push(ticker);
          addDebugLog(`  ✗ ${ticker} failed (returned: ${price})`);
        }

        // Add delay to avoid rate limiting (Alpha Vantage requires 1 second between requests)
        addDebugLog(`  → Waiting 1.2 seconds before next fetch...`);
        await new Promise(resolve => setTimeout(resolve, 1200));
      } else {
        addDebugLog(`  → Skipping ${ticker} (not valid ticker format)`);
      }
    }

    addDebugLog(`=== COMPLETE: ${successCount} succeeded, ${failedTickers.length} failed ===`);
    setLoadingPrices(false);

    const validTickers = stocksToUpdate.filter(s => /^[A-Z]{1,5}$/.test(s.name.trim().toUpperCase())).length;
    if (successCount > 0) {
      setSaveStatus(`Updated ${successCount} of ${validTickers} prices!`);
    } else {
      setSaveStatus(`Failed to fetch prices. Check debug log below.`);
    }

    if (failedTickers.length > 0) {
      addDebugLog(`Failed tickers: ${failedTickers.join(', ')}`);
    }

    setTimeout(() => setSaveStatus(''), 5000);
  };

  // Load data from storage on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const result = await window.storage.get('retirement-planner-data');
        if (result && result.value) {
          const data = JSON.parse(result.value);
          if (data.personalInfo) setPersonalInfo(data.personalInfo);
          if (data.accounts) setAccounts(data.accounts);
          if (data.stocks) setStocks(data.stocks);
          if (data.crypto) setCrypto(data.crypto);
          if (data.metals) setMetals(data.metals);

          // Handle scenarios - migrate old format if needed
          if (data.scenarios) {
            // New format with scenarios
            setScenarios(data.scenarios);
            setActiveScenarioId(data.activeScenarioId || data.scenarios[0].id);
            setScenarioCounter(data.scenarioCounter || data.scenarios.length);
          } else {
            // Old format - migrate to scenario structure
            setScenarios([{
              id: 1,
              name: "Scenario 1",
              withdrawals: data.withdrawals || {
                savings: 0,
                traditionalIRA: 0,
                rothIRA: 0,
                traditional401k: 0,
                roth401k: 0
              },
              stockWithdrawals: data.stockWithdrawals || [],
              cryptoSales: data.cryptoSales || [],
              metalSales: data.metalSales || []
            }]);
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

    loadData();
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
  const saveData = async () => {
    try {
      const data = {
        personalInfo,
        accounts,
        stocks,
        crypto,
        metals,
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
  const exportData = () => {
    const data = {
      personalInfo,
      accounts,
      stocks,
      crypto,
      metals,
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
  const importData = (event) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target.result);
          setPersonalInfo(data.personalInfo || personalInfo);
          setAccounts(data.accounts || accounts);
          setStocks(data.stocks || stocks);
          setCrypto(data.crypto || []);
          setMetals(data.metals || []);

          // Handle scenarios - migrate old format if needed
          if (data.scenarios) {
            // New format with scenarios
            setScenarios(data.scenarios);
            setActiveScenarioId(data.activeScenarioId || data.scenarios[0].id);
            setScenarioCounter(data.scenarioCounter || data.scenarios.length);
          } else {
            // Old format - migrate to scenario structure
            setScenarios([{
              id: 1,
              name: "Scenario 1",
              withdrawals: data.withdrawals || {
                savings: 0,
                traditionalIRA: 0,
                rothIRA: 0,
                traditional401k: 0,
                roth401k: 0
              },
              stockWithdrawals: data.stockWithdrawals || [],
              cryptoSales: data.cryptoSales || [],
              metalSales: data.metalSales || []
            }]);
            setActiveScenarioId(1);
            setScenarioCounter(1);
          }

          setSaveStatus('Data imported successfully!');
          setTimeout(() => setSaveStatus(''), 3000);
        } catch (error) {
          setSaveStatus('Error importing data');
          setTimeout(() => setSaveStatus(''), 3000);
        }
      };
      reader.readAsText(file);
    }
  };

  // Reset all data to default values
  const resetToDefaults = () => {
    const confirmed = window.confirm(
      'Are you sure you want to reset all data to default values? This will clear all your inputs and cannot be undone.'
    );

    if (confirmed) {
      // Reset all state to default values
      setPersonalInfo({
        age: 65,
        filingStatus: 'single',
        workMonths: 3,
        monthlyWorkIncome: 5000,
        monthlyPension: 3000,
        pensionStartMonth: 4,
        interestIncome: 0,
        qualifiedDividends: 0,
        ordinaryDividends: 0
      });

      setAccounts({
        savings: 50000,
        traditionalIRA: 300000,
        rothIRA: 100000,
        traditional401k: 400000,
        roth401k: 50000
      });

      setStocks([
        { name: 'Stock 1', shares: 100, costBasis: 50, currentPrice: 75 },
        { name: 'Stock 2', shares: 50, costBasis: 100, currentPrice: 120 },
      ]);

      setCrypto([]);
      setMetals([]);

      setScenarios([
        {
          id: 1,
          name: "Scenario 1",
          withdrawals: {
            savings: 0,
            traditionalIRA: 0,
            rothIRA: 0,
            traditional401k: 0,
            roth401k: 0
          },
          stockWithdrawals: [],
          cryptoSales: [],
          metalSales: []
        }
      ]);

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

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto p-6 bg-gray-50">
        <div className="bg-white rounded-lg shadow-lg p-6 text-center">
          <p className="text-gray-600">Loading your saved data...</p>
        </div>
      </div>
    );
  }

  // 2026 tax brackets (single filer)
  const taxBrackets2026Single = [
    { rate: 0.10, min: 0, max: 12400 },
    { rate: 0.12, min: 12400, max: 50400 },
    { rate: 0.22, min: 50400, max: 105700 },
    { rate: 0.24, min: 105700, max: 201800 },
    { rate: 0.32, min: 201800, max: 256350 },
    { rate: 0.35, min: 256350, max: 640600 },
    { rate: 0.37, min: 640600, max: Infinity }
  ];

  // 2026 tax brackets (married filing jointly)
  const taxBrackets2026MFJ = [
    { rate: 0.10, min: 0, max: 24800 },
    { rate: 0.12, min: 24800, max: 100800 },
    { rate: 0.22, min: 100800, max: 211400 },
    { rate: 0.24, min: 211400, max: 403600 },
    { rate: 0.32, min: 403600, max: 512700 },
    { rate: 0.35, min: 512700, max: 768600 },
    { rate: 0.37, min: 768600, max: Infinity }
  ];

  // 2026 IRMAA brackets (based on 2024 MAGI for 2026 premiums)
  const irmaa2026Single = [
    { magi: 0, magiMax: 109000, partB: 0, partD: 0, description: 'No IRMAA' },
    { magi: 109000, magiMax: 137000, partB: 81.20, partD: 14.50, description: 'Bracket 1' },
    { magi: 137000, magiMax: 171000, partB: 202.90, partD: 37.60, description: 'Bracket 2' },
    { magi: 171000, magiMax: 205000, partB: 324.70, partD: 60.60, description: 'Bracket 3' },
    { magi: 205000, magiMax: 500000, partB: 446.40, partD: 83.70, description: 'Bracket 4' },
    { magi: 500000, magiMax: Infinity, partB: 487.00, partD: 91.00, description: 'Bracket 5 (Top)' }
  ];

  const irmaa2026MFJ = [
    { magi: 0, magiMax: 218000, partB: 0, partD: 0, description: 'No IRMAA' },
    { magi: 218000, magiMax: 274000, partB: 81.20, partD: 14.50, description: 'Bracket 1' },
    { magi: 274000, magiMax: 342000, partB: 202.90, partD: 37.60, description: 'Bracket 2' },
    { magi: 342000, magiMax: 410000, partB: 324.70, partD: 60.60, description: 'Bracket 3' },
    { magi: 410000, magiMax: 750000, partB: 446.40, partD: 83.70, description: 'Bracket 4' },
    { magi: 750000, magiMax: Infinity, partB: 487.00, partD: 91.00, description: 'Bracket 5 (Top)' }
  ];

  const standardDeduction2026 = {
    single: 16100,
    married: 32200,
    hoh: 24250
  };

  // Utah state tax rate for 2026
  const utahTaxRate2026 = 0.0455; // 4.55% flat rate

  const calculateTax = (taxableIncome, filingStatus) => {
    const brackets = filingStatus === 'single' ? taxBrackets2026Single : taxBrackets2026MFJ;
    let tax = 0;
    
    for (let i = 0; i < brackets.length; i++) {
      const bracket = brackets[i];
      if (taxableIncome > bracket.min) {
        const taxableInBracket = Math.min(taxableIncome, bracket.max) - bracket.min;
        tax += taxableInBracket * bracket.rate;
      }
    }
    
    return tax;
  };

  const calculateScenario = (scenario) => {
    // Destructure withdrawal data from the scenario
    const { withdrawals, stockWithdrawals, cryptoSales, metalSales } = scenario;

    // Calculate employment income (3 months)
    const employmentIncome = personalInfo.workMonths * personalInfo.monthlyWorkIncome;

    // Calculate pension income (9 months)
    const pensionMonths = 12 - personalInfo.pensionStartMonth + 1;
    const pensionIncome = pensionMonths * personalInfo.monthlyPension;

    // Calculate capital gains from stock sales
    let totalStockProceeds = 0;
    let totalStockGains = 0;

    stockWithdrawals.forEach(sw => {
      const stock = stocks.find(s => s.name === sw.stockName);
      if (stock && sw.sharesToSell > 0) {
        const proceeds = sw.sharesToSell * stock.currentPrice;
        const costBasis = sw.sharesToSell * stock.costBasis;
        const gain = proceeds - costBasis;
        
        totalStockProceeds += proceeds;
        totalStockGains += gain; // Include both gains AND losses
      }
    });

    // Calculate capital gains from crypto sales
    let totalCryptoProceeds = 0;
    let totalCryptoGains = 0;
    
    cryptoSales.forEach(cs => {
      const cryptoAsset = crypto.find(c => c.name === cs.cryptoName);
      if (cryptoAsset && cs.unitsToSell > 0) {
        const proceeds = cs.unitsToSell * cryptoAsset.currentPrice;
        const costBasis = cs.unitsToSell * cryptoAsset.costBasis;
        const gain = proceeds - costBasis;
        
        totalCryptoProceeds += proceeds;
        totalCryptoGains += gain; // Include both gains AND losses
      }
    });

    // Calculate capital gains from precious metals sales
    let totalMetalProceeds = 0;
    let totalMetalGains = 0;
    
    metalSales.forEach(ms => {
      const metalAsset = metals.find(m => m.name === ms.metalName);
      if (metalAsset && ms.unitsToSell > 0) {
        const proceeds = ms.unitsToSell * metalAsset.currentPrice;
        const costBasis = ms.unitsToSell * metalAsset.costBasis;
        const gain = proceeds - costBasis;
        
        totalMetalProceeds += proceeds;
        totalMetalGains += gain; // Include both gains AND losses
      }
    });
    
    // Ordinary income (employment + pension + traditional withdrawals + interest + ordinary dividends)
    const ordinaryIncome = employmentIncome + pensionIncome + 
      withdrawals.traditionalIRA + withdrawals.traditional401k + 
      (personalInfo.interestIncome || 0) + (personalInfo.ordinaryDividends || 0);
    
    // Tax-free withdrawals (Roth accounts and savings)
    const taxFreeWithdrawals = withdrawals.rothIRA + withdrawals.roth401k + withdrawals.savings;
    
    // Adjust for standard deduction
    const deduction = personalInfo.filingStatus === 'single' ? standardDeduction2026.single : standardDeduction2026.married;
    const taxableOrdinaryIncome = Math.max(0, ordinaryIncome - deduction);
    
    // Calculate capital gains (includes qualified dividends, taxed at preferential rates)
    // Note: Precious metals collectibles are taxed at 28% max rate, but we'll use 15% for simplification
    const totalCapitalGains = totalStockGains + totalCryptoGains + totalMetalGains + (personalInfo.qualifiedDividends || 0);
    
    // Calculate capital gains tax (simplified - assumes 15% for most retirees)
    // Only tax if there's a net gain, losses offset gains
    const capitalGainsTax = totalCapitalGains > 0 ? totalCapitalGains * 0.15 : 0;
    
    // Calculate ordinary income tax
    const ordinaryIncomeTax = calculateTax(taxableOrdinaryIncome, personalInfo.filingStatus);
    
    // Calculate Utah state tax (flat rate on federal taxable income)
    const utahStateTax = taxableOrdinaryIncome * utahTaxRate2026;
    const utahCapitalGainsTax = totalCapitalGains > 0 ? totalCapitalGains * utahTaxRate2026 : 0;
    const totalUtahTax = utahStateTax + utahCapitalGainsTax;
    
    // Calculate MAGI for IRMAA (AGI + tax-exempt interest)
    // For simplification, using taxable ordinary income + deduction as proxy for AGI
    const magi = ordinaryIncome; // MAGI includes all ordinary income before deduction
    
    // Determine IRMAA bracket
    const irmaaBrackets = personalInfo.filingStatus === 'single' ? irmaa2026Single : irmaa2026MFJ;
    let currentIRMAABracket = null;
    let roomToNextIRMAABracket = 0;
    let roomToLowerIRMAABracket = 0;
    
    for (let i = 0; i < irmaaBrackets.length; i++) {
      const bracket = irmaaBrackets[i];
      if (magi >= bracket.magi && magi < bracket.magiMax) {
        currentIRMAABracket = bracket;
        roomToNextIRMAABracket = bracket.magiMax - magi;
        
        // Calculate room to move to lower bracket
        if (i > 0) {
          roomToLowerIRMAABracket = magi - irmaaBrackets[i-1].magiMax;
        }
        break;
      } else if (magi >= bracket.magiMax && i === irmaaBrackets.length - 1) {
        currentIRMAABracket = bracket;
        roomToNextIRMAABracket = 0; // In highest bracket
        roomToLowerIRMAABracket = magi - bracket.magi;
        break;
      }
    }
    
    // Determine current tax bracket and room to top
    const brackets = personalInfo.filingStatus === 'single' ? taxBrackets2026Single : taxBrackets2026MFJ;
    let currentBracket = null;
    let roomInBracket = 0;
    
    for (let i = 0; i < brackets.length; i++) {
      const bracket = brackets[i];
      if (taxableOrdinaryIncome >= bracket.min && taxableOrdinaryIncome < bracket.max) {
        currentBracket = bracket;
        roomInBracket = bracket.max - taxableOrdinaryIncome;
        break;
      } else if (taxableOrdinaryIncome >= bracket.max && i === brackets.length - 1) {
        currentBracket = bracket;
        roomInBracket = 0; // In highest bracket
        break;
      }
    }
    
    // Total tax
    const totalTax = ordinaryIncomeTax + capitalGainsTax;
    const totalTaxWithState = totalTax + totalUtahTax;
    
    // Total withdrawals
    const totalWithdrawals = Object.values(withdrawals).reduce((sum, val) => sum + val, 0) + totalStockProceeds + totalCryptoProceeds + totalMetalProceeds;
    
    // Effective tax rate on withdrawals
    const effectiveRate = totalWithdrawals > 0 ? (totalTax / totalWithdrawals) * 100 : 0;
    const effectiveRateWithState = totalWithdrawals > 0 ? (totalTaxWithState / totalWithdrawals) * 100 : 0;
    
    return {
      employmentIncome,
      pensionIncome,
      ordinaryIncome,
      totalStockProceeds,
      totalStockGains,
      totalCryptoProceeds,
      totalCryptoGains,
      totalMetalProceeds,
      totalMetalGains,
      totalCapitalGains,
      standardDeduction: deduction,
      taxableOrdinaryIncome,
      capitalGainsTax,
      ordinaryIncomeTax,
      totalTax,
      totalWithdrawals,
      taxFreeWithdrawals,
      effectiveRate,
      currentBracket,
      roomInBracket,
      magi,
      currentIRMAABracket,
      roomToNextIRMAABracket,
      roomToLowerIRMAABracket,
      utahStateTax,
      utahCapitalGainsTax,
      totalUtahTax,
      totalTaxWithState,
      effectiveRateWithState
    };
  };

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
        name: `Stock ${stocks.length + 1}`, 
        shares: 0, 
        costBasis: 0, 
        currentPrice: 0 
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
    newStocks[index] = { ...newStocks[index], [field]: field === 'name' ? value : parseFloat(value) || 0 };
    setStocks(newStocks);
  };

  const addCrypto = () => {
    if (crypto.length < 12) {
      setCrypto([...crypto, { 
        name: `Crypto ${crypto.length + 1}`, 
        units: 0, 
        costBasis: 0, 
        currentPrice: 0 
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
    newCrypto[index] = { ...newCrypto[index], [field]: field === 'name' ? value : parseFloat(value) || 0 };
    setCrypto(newCrypto);
  };

  const addMetal = () => {
    if (metals.length < 12) {
      setMetals([...metals, { 
        name: `Metal ${metals.length + 1}`, 
        units: 0, 
        costBasis: 0, 
        currentPrice: 0 
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
    newMetals[index] = { ...newMetals[index], [field]: field === 'name' ? value : parseFloat(value) || 0 };
    setMetals(newMetals);
  };

  const updateStockWithdrawal = (stockName, shares) => {
    const scenario = getActiveScenario();
    const existing = scenario.stockWithdrawals.find(sw => sw.stockName === stockName);
    if (existing) {
      updateActiveScenario({
        stockWithdrawals: scenario.stockWithdrawals.map(sw =>
          sw.stockName === stockName ? { ...sw, sharesToSell: parseFloat(shares) || 0 } : sw
        )
      });
    } else {
      updateActiveScenario({
        stockWithdrawals: [...scenario.stockWithdrawals, { stockName, sharesToSell: parseFloat(shares) || 0 }]
      });
    }
  };

  const getStockWithdrawal = (stockName) => {
    const scenario = getActiveScenario();
    const sw = scenario.stockWithdrawals.find(s => s.stockName === stockName);
    return sw ? sw.sharesToSell : 0;
  };

  const updateCryptoSale = (cryptoName, units) => {
    const scenario = getActiveScenario();
    const existing = scenario.cryptoSales.find(cs => cs.cryptoName === cryptoName);
    if (existing) {
      updateActiveScenario({
        cryptoSales: scenario.cryptoSales.map(cs =>
          cs.cryptoName === cryptoName ? { ...cs, unitsToSell: parseFloat(units) || 0 } : cs
        )
      });
    } else {
      updateActiveScenario({
        cryptoSales: [...scenario.cryptoSales, { cryptoName, unitsToSell: parseFloat(units) || 0 }]
      });
    }
  };

  const getCryptoSale = (cryptoName) => {
    const scenario = getActiveScenario();
    const cs = scenario.cryptoSales.find(c => c.cryptoName === cryptoName);
    return cs ? cs.unitsToSell : 0;
  };

  const updateMetalSale = (metalName, units) => {
    const scenario = getActiveScenario();
    const existing = scenario.metalSales.find(ms => ms.metalName === metalName);
    if (existing) {
      updateActiveScenario({
        metalSales: scenario.metalSales.map(ms =>
          ms.metalName === metalName ? { ...ms, unitsToSell: parseFloat(units) || 0 } : ms
        )
      });
    } else {
      updateActiveScenario({
        metalSales: [...scenario.metalSales, { metalName, unitsToSell: parseFloat(units) || 0 }]
      });
    }
  };

  const getMetalSale = (metalName) => {
    const scenario = getActiveScenario();
    const ms = scenario.metalSales.find(m => m.metalName === metalName);
    return ms ? ms.unitsToSell : 0;
  };

  return (
    <div className="max-w-6xl mx-auto p-6 bg-gray-50">
      <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Calculator className="w-6 h-6 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-800">2026 Retirement Withdrawal Tax Planner</h1>
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

      <div className="grid md:grid-cols-2 gap-6 mb-6">
        {/* Personal Information */}
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
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Filing Status</label>
              <select
                value={personalInfo.filingStatus}
                onChange={(e) => setPersonalInfo({...personalInfo, filingStatus: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value="single">Single</option>
                <option value="married">Married Filing Jointly</option>
              </select>
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
              <input
                type="number"
                value={personalInfo.monthlyWorkIncome}
                onChange={(e) => setPersonalInfo({...personalInfo, monthlyWorkIncome: parseFloat(e.target.value) || 0})}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Pension Start Month (1-12)</label>
              <input
                type="number"
                value={personalInfo.pensionStartMonth}
                onChange={(e) => setPersonalInfo({...personalInfo, pensionStartMonth: parseInt(e.target.value) || 1})}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                min="1"
                max="12"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Monthly Pension</label>
              <input
                type="number"
                value={personalInfo.monthlyPension}
                onChange={(e) => setPersonalInfo({...personalInfo, monthlyPension: parseFloat(e.target.value) || 0})}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Annual Interest Income</label>
              <input
                type="number"
                value={personalInfo.interestIncome}
                onChange={(e) => setPersonalInfo({...personalInfo, interestIncome: parseFloat(e.target.value) || 0})}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Qualified Dividends</label>
              <input
                type="number"
                value={personalInfo.qualifiedDividends}
                onChange={(e) => setPersonalInfo({...personalInfo, qualifiedDividends: parseFloat(e.target.value) || 0})}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
              <p className="text-xs text-gray-500 mt-1">Taxed at capital gains rates (typically 15%)</p>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ordinary Dividends</label>
              <input
                type="number"
                value={personalInfo.ordinaryDividends}
                onChange={(e) => setPersonalInfo({...personalInfo, ordinaryDividends: parseFloat(e.target.value) || 0})}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
              <p className="text-xs text-gray-500 mt-1">Taxed as ordinary income</p>
            </div>
          </div>
        </div>

        {/* Account Balances */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4 text-gray-800">Account Balances</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Savings Account</label>
              <input
                type="number"
                value={accounts.savings}
                onChange={(e) => setAccounts({...accounts, savings: parseFloat(e.target.value) || 0})}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Traditional IRA</label>
              <input
                type="number"
                value={accounts.traditionalIRA}
                onChange={(e) => setAccounts({...accounts, traditionalIRA: parseFloat(e.target.value) || 0})}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Roth IRA</label>
              <input
                type="number"
                value={accounts.rothIRA}
                onChange={(e) => setAccounts({...accounts, rothIRA: parseFloat(e.target.value) || 0})}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Traditional 401(k)</label>
              <input
                type="number"
                value={accounts.traditional401k}
                onChange={(e) => setAccounts({...accounts, traditional401k: parseFloat(e.target.value) || 0})}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Roth 401(k)</label>
              <input
                type="number"
                value={accounts.roth401k}
                onChange={(e) => setAccounts({...accounts, roth401k: parseFloat(e.target.value) || 0})}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Stock Portfolio */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-gray-800">Brokerage Account - Individual Stocks</h2>
          <div className="flex gap-2">
            <button
              onClick={updateAllStockPrices}
              disabled={loadingPrices}
              className="px-4 py-2 bg-purple-600 text-white rounded-md text-sm hover:bg-purple-700 disabled:bg-gray-400"
            >
              {loadingPrices ? 'Updating...' : 'Update Prices'}
            </button>
            {stocks.length < 12 && (
              <button
                onClick={addStock}
                className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700"
              >
                Add Stock
              </button>
            )}
          </div>
        </div>
        
        <p className="text-xs text-gray-600 mb-3">
          Tip: Use ticker symbols (e.g., AAPL, MSFT, GOOGL) as stock names to automatically fetch current prices.
        </p>

        {/* API KEY INPUT */}
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
          <p className="text-xs text-gray-700 mb-2">
            <strong>Tip:</strong> Use ticker symbols (e.g., AAPL, MSFT, GOOGL) as stock names to automatically fetch current prices.
          </p>
          <div className="flex items-center gap-3">
            <label className="text-xs font-medium text-gray-700">
              Alpha Vantage API Key (get free key at <a href="https://www.alphavantage.co/support/#api-key" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">alphavantage.co</a>):
            </label>
            <input
              type="text"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Enter your free API key here"
              className="flex-1 px-3 py-1 border border-gray-300 rounded text-sm"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Stock Name</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Shares Owned</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Cost Basis/Share</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Current Price</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Total Value</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Total Gain</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Gain %</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {stocks.map((stock, index) => {
                const totalValue = stock.shares * stock.currentPrice;
                const totalCost = stock.shares * stock.costBasis;
                const totalGain = totalValue - totalCost;
                const gainPercentage = totalCost > 0 ? ((totalGain / totalCost) * 100) : 0;
                
                return (
                  <tr key={index}>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={stock.name}
                        onChange={(e) => updateStock(index, 'name', e.target.value)}
                        className="w-full px-2 py-1 border border-gray-300 rounded"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        value={stock.shares}
                        onChange={(e) => updateStock(index, 'shares', e.target.value)}
                        className="w-24 px-2 py-1 border border-gray-300 rounded"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        value={stock.costBasis}
                        onChange={(e) => updateStock(index, 'costBasis', e.target.value)}
                        className="w-24 px-2 py-1 border border-gray-300 rounded"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        value={stock.currentPrice}
                        onChange={(e) => updateStock(index, 'currentPrice', e.target.value)}
                        className="w-24 px-2 py-1 border border-gray-300 rounded"
                      />
                    </td>
                    <td className="px-3 py-2 font-medium">
                      ${totalValue.toLocaleString()}
                    </td>
                    <td className={`px-3 py-2 font-medium ${totalGain >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      ${totalGain.toLocaleString()}
                    </td>
                    <td className={`px-3 py-2 font-medium ${gainPercentage >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {gainPercentage.toFixed(2)}%
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => removeStock(index)}
                        className="text-red-600 hover:text-red-800 text-sm"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        
        {stocks.length === 0 && (
          <p className="text-center text-gray-500 py-4">No stocks added yet. Click "Add Stock" to get started.</p>
        )}

        {/* Debug Log - HIDDEN */}
        {/* {debugLog.length > 0 && (
          <div className="mt-4 p-4 bg-gray-100 rounded-md">
            <h3 className="font-semibold text-sm mb-2">Debug Log:</h3>
            <div className="text-xs space-y-1 max-h-40 overflow-y-auto font-mono">
              {debugLog.map((log, idx) => (
                <div key={idx} className="text-gray-700">{log}</div>
              ))}
            </div>
            <button
              onClick={() => setDebugLog([])}
              className="mt-2 text-xs text-blue-600 hover:underline"
            >
              Clear Log
            </button>
          </div>
        )} */}
      </div>

      {/* Crypto Portfolio */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-gray-800">Cryptocurrency Holdings</h2>
          {crypto.length < 12 && (
            <button
              onClick={addCrypto}
              className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700"
            >
              Add Crypto
            </button>
          )}
        </div>
        
        <p className="text-xs text-gray-600 mb-3">
          Track your cryptocurrency holdings. Crypto gains/losses are taxed as capital gains.
        </p>
        
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Crypto Name</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Units Owned</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Cost Basis/Unit</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Current Price</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Total Value</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Total Gain</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Gain %</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {crypto.map((cryptoAsset, index) => {
                const totalValue = cryptoAsset.units * cryptoAsset.currentPrice;
                const totalCost = cryptoAsset.units * cryptoAsset.costBasis;
                const totalGain = totalValue - totalCost;
                const gainPercentage = totalCost > 0 ? ((totalGain / totalCost) * 100) : 0;
                
                return (
                  <tr key={index}>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={cryptoAsset.name}
                        onChange={(e) => updateCrypto(index, 'name', e.target.value)}
                        className="w-full px-2 py-1 border border-gray-300 rounded"
                        placeholder="BTC, ETH, etc."
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        value={cryptoAsset.units}
                        onChange={(e) => updateCrypto(index, 'units', e.target.value)}
                        className="w-24 px-2 py-1 border border-gray-300 rounded"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        value={cryptoAsset.costBasis}
                        onChange={(e) => updateCrypto(index, 'costBasis', e.target.value)}
                        className="w-24 px-2 py-1 border border-gray-300 rounded"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        value={cryptoAsset.currentPrice}
                        onChange={(e) => updateCrypto(index, 'currentPrice', e.target.value)}
                        className="w-24 px-2 py-1 border border-gray-300 rounded"
                      />
                    </td>
                    <td className="px-3 py-2 font-medium">
                      ${totalValue.toLocaleString()}
                    </td>
                    <td className={`px-3 py-2 font-medium ${totalGain >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      ${totalGain.toLocaleString()}
                    </td>
                    <td className={`px-3 py-2 font-medium ${gainPercentage >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {gainPercentage.toFixed(2)}%
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => removeCrypto(index)}
                        className="text-red-600 hover:text-red-800 text-sm"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        
        {crypto.length === 0 && (
          <p className="text-center text-gray-500 py-4">No crypto added yet. Click "Add Crypto" to get started.</p>
        )}
      </div>

      {/* Precious Metals Portfolio */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-gray-800">Precious Metals Holdings</h2>
          {metals.length < 12 && (
            <button
              onClick={addMetal}
              className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700"
            >
              Add Metal
            </button>
          )}
        </div>
        
        <p className="text-xs text-gray-600 mb-3">
          Track your precious metals (gold, silver, platinum, etc.). Note: Collectibles may be taxed at 28% federally, but this tool uses 15% for simplification.
        </p>
        
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Metal Type</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Units (oz)</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Cost Basis/oz</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Current Price/oz</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Total Value</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Total Gain</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Gain %</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {metals.map((metal, index) => {
                const totalValue = metal.units * metal.currentPrice;
                const totalCost = metal.units * metal.costBasis;
                const totalGain = totalValue - totalCost;
                const gainPercentage = totalCost > 0 ? ((totalGain / totalCost) * 100) : 0;
                
                return (
                  <tr key={index}>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={metal.name}
                        onChange={(e) => updateMetal(index, 'name', e.target.value)}
                        className="w-full px-2 py-1 border border-gray-300 rounded"
                        placeholder="Gold, Silver, etc."
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        value={metal.units}
                        onChange={(e) => updateMetal(index, 'units', e.target.value)}
                        className="w-24 px-2 py-1 border border-gray-300 rounded"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        value={metal.costBasis}
                        onChange={(e) => updateMetal(index, 'costBasis', e.target.value)}
                        className="w-24 px-2 py-1 border border-gray-300 rounded"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        value={metal.currentPrice}
                        onChange={(e) => updateMetal(index, 'currentPrice', e.target.value)}
                        className="w-24 px-2 py-1 border border-gray-300 rounded"
                      />
                    </td>
                    <td className="px-3 py-2 font-medium">
                      ${totalValue.toLocaleString()}
                    </td>
                    <td className={`px-3 py-2 font-medium ${totalGain >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      ${totalGain.toLocaleString()}
                    </td>
                    <td className={`px-3 py-2 font-medium ${gainPercentage >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {gainPercentage.toFixed(2)}%
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => removeMetal(index)}
                        className="text-red-600 hover:text-red-800 text-sm"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        
        {metals.length === 0 && (
          <p className="text-center text-gray-500 py-4">No metals added yet. Click "Add Metal" to get started.</p>
        )}
      </div>

      {/* Withdrawal Planning */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4 text-gray-800 flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-green-600" />
          Plan Your Withdrawals
        </h2>
        
        {/* Crypto Sales */}
        {crypto.length > 0 && (
          <div className="mb-6">
            <h3 className="font-medium text-gray-700 mb-3">Cryptocurrency Sales</h3>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {crypto.map((cryptoAsset, index) => {
                const unitsToSell = getCryptoSale(cryptoAsset.name);
                const proceeds = unitsToSell * cryptoAsset.currentPrice;
                const gain = unitsToSell * (cryptoAsset.currentPrice - cryptoAsset.costBasis);
                
                return (
                  <div key={index} className="border border-gray-200 rounded-md p-3">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {cryptoAsset.name} <span className="text-xs text-gray-500">(Max: {cryptoAsset.units} units)</span>
                    </label>
                    <input
                      type="number"
                      value={unitsToSell}
                      onChange={(e) => updateCryptoSale(cryptoAsset.name, e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md mb-2"
                      max={cryptoAsset.units}
                    />
                    {unitsToSell > 0 && (
                      <div className="text-xs space-y-1">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Proceeds:</span>
                          <span className="font-medium">${proceeds.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Gain:</span>
                          <span className={`font-medium ${gain >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            ${gain.toLocaleString()}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        
        {/* Precious Metals Sales */}
        {metals.length > 0 && (
          <div className="mb-6">
            <h3 className="font-medium text-gray-700 mb-3">Precious Metals Sales</h3>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {metals.map((metal, index) => {
                const unitsToSell = getMetalSale(metal.name);
                const proceeds = unitsToSell * metal.currentPrice;
                const gain = unitsToSell * (metal.currentPrice - metal.costBasis);
                
                return (
                  <div key={index} className="border border-gray-200 rounded-md p-3">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {metal.name} <span className="text-xs text-gray-500">(Max: {metal.units} oz)</span>
                    </label>
                    <input
                      type="number"
                      value={unitsToSell}
                      onChange={(e) => updateMetalSale(metal.name, e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md mb-2"
                      max={metal.units}
                    />
                    {unitsToSell > 0 && (
                      <div className="text-xs space-y-1">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Proceeds:</span>
                          <span className="font-medium">${proceeds.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Gain:</span>
                          <span className={`font-medium ${gain >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            ${gain.toLocaleString()}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        
        {/* Stock Sales */}
        {stocks.length > 0 && (
          <div className="mb-6">
            <h3 className="font-medium text-gray-700 mb-3">Stock Sales</h3>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {stocks.map((stock, index) => {
                const sharesToSell = getStockWithdrawal(stock.name);
                const proceeds = sharesToSell * stock.currentPrice;
                const gain = sharesToSell * (stock.currentPrice - stock.costBasis);
                
                return (
                  <div key={index} className="border border-gray-200 rounded-md p-3">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {stock.name} <span className="text-xs text-gray-500">(Max: {stock.shares} shares)</span>
                    </label>
                    <input
                      type="number"
                      value={sharesToSell}
                      onChange={(e) => updateStockWithdrawal(stock.name, e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md mb-2"
                      max={stock.shares}
                    />
                    {sharesToSell > 0 && (
                      <div className="text-xs space-y-1">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Proceeds:</span>
                          <span className="font-medium">${proceeds.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Gain:</span>
                          <span className={`font-medium ${gain >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            ${gain.toLocaleString()}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        
        {/* Other Account Withdrawals */}
        <h3 className="font-medium text-gray-700 mb-3">Retirement & Savings Account Withdrawals</h3>
        <div className="grid md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Savings <span className="text-xs text-green-600">(Tax-Free)</span>
            </label>
            <input
              type="number"
              value={getActiveScenario().withdrawals.savings}
              onChange={(e) => updateWithdrawal('savings', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              max={accounts.savings}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Traditional IRA <span className="text-xs text-red-600">(Ordinary Income)</span>
            </label>
            <input
              type="number"
              value={getActiveScenario().withdrawals.traditionalIRA}
              onChange={(e) => updateWithdrawal('traditionalIRA', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              max={accounts.traditionalIRA}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Roth IRA <span className="text-xs text-green-600">(Tax-Free)</span>
            </label>
            <input
              type="number"
              value={getActiveScenario().withdrawals.rothIRA}
              onChange={(e) => updateWithdrawal('rothIRA', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              max={accounts.rothIRA}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Traditional 401(k) <span className="text-xs text-red-600">(Ordinary Income)</span>
            </label>
            <input
              type="number"
              value={getActiveScenario().withdrawals.traditional401k}
              onChange={(e) => updateWithdrawal('traditional401k', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              max={accounts.traditional401k}
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Roth 401(k) <span className="text-xs text-green-600">(Tax-Free)</span>
            </label>
            <input
              type="number"
              value={getActiveScenario().withdrawals.roth401k}
              onChange={(e) => updateWithdrawal('roth401k', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              max={accounts.roth401k}
            />
          </div>
        </div>
      </div>

      {/* Only render results sections if we have valid results */}
      {results && (
        <>
      {/* IRMAA Analysis */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4 text-gray-800 flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-purple-600" />
          Medicare IRMAA Analysis (2026)
        </h2>
        
        <p className="text-sm text-gray-600 mb-4">
          IRMAA (Income-Related Monthly Adjustment Amount) is a surcharge on Medicare Part B and Part D premiums based on your Modified Adjusted Gross Income (MAGI) from 2 years prior. Your 2026 IRMAA will be based on this year's (2024) income.
        </p>
        
        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <h3 className="font-medium text-gray-700 border-b pb-2">IRMAA Status</h3>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Your 2024 MAGI:</span>
              <span className="font-bold">${results.magi.toLocaleString()}</span>
            </div>
            {results.currentIRMAABracket && (
              <>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Current IRMAA Bracket:</span>
                  <span className="font-medium text-purple-600">{results.currentIRMAABracket.description}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Monthly Part B Surcharge:</span>
                  <span className={`font-medium ${results.currentIRMAABracket.partB > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {results.currentIRMAABracket.partB > 0 ? `+${results.currentIRMAABracket.partB.toFixed(2)}` : '$0.00'}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Monthly Part D Surcharge:</span>
                  <span className={`font-medium ${results.currentIRMAABracket.partD > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {results.currentIRMAABracket.partD > 0 ? `+${results.currentIRMAABracket.partD.toFixed(2)}` : '$0.00'}
                  </span>
                </div>
                <div className="flex justify-between text-sm border-t pt-2">
                  <span className="text-gray-700 font-medium">Annual IRMAA Cost:</span>
                  <span className={`font-bold ${(results.currentIRMAABracket.partB + results.currentIRMAABracket.partD) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    ${((results.currentIRMAABracket.partB + results.currentIRMAABracket.partD) * 12).toLocaleString()}
                  </span>
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
                      <span className="font-bold text-yellow-700">${results.roomToNextIRMAABracket.toLocaleString()}</span>
                    </div>
                    <p className="text-xs text-gray-600">
                      You can earn up to ${results.roomToNextIRMAABracket.toLocaleString()} more before moving to the next IRMAA bracket.
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
                      <span className="font-bold text-green-700">Reduce by ${results.roomToLowerIRMAABracket.toLocaleString()}</span>
                    </div>
                    <p className="text-xs text-gray-600">
                      Reducing your MAGI by ${results.roomToLowerIRMAABracket.toLocaleString()} would move you to a lower IRMAA bracket.
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
          <h3 className="font-medium text-gray-700 mb-3">2026 IRMAA Surcharge Brackets</h3>
          <p className="text-xs text-gray-600 mb-3">
            Monthly surcharges added to standard Medicare Part B and Part D premiums based on your 2024 MAGI
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-100 border-b-2 border-gray-300">
                  <th className="text-left p-2 font-semibold text-gray-700">MAGI Range ({personalInfo.filingStatus === 'single' ? 'Single' : 'Married Filing Jointly'})</th>
                  <th className="text-right p-2 font-semibold text-gray-700">Part B Monthly</th>
                  <th className="text-right p-2 font-semibold text-gray-700">Part D Monthly</th>
                  <th className="text-right p-2 font-semibold text-gray-700">Total Monthly</th>
                  <th className="text-right p-2 font-semibold text-gray-700">Total Annual</th>
                </tr>
              </thead>
              <tbody>
                {(personalInfo.filingStatus === 'single' ? irmaa2026Single : irmaa2026MFJ).map((bracket, idx) => {
                  const isCurrentBracket = results.currentIRMAABracket &&
                    bracket.magi === results.currentIRMAABracket.magi;
                  const totalMonthly = bracket.partB + bracket.partD;
                  const totalAnnual = totalMonthly * 12;
                  const magiMaxDisplay = bracket.magiMax === Infinity ? '+' : bracket.magiMax.toLocaleString();

                  return (
                    <tr
                      key={idx}
                      className={`border-b border-gray-200 ${isCurrentBracket ? 'bg-purple-50 font-semibold' : ''}`}
                    >
                      <td className="p-2">
                        ${bracket.magi.toLocaleString()} - ${magiMaxDisplay}
                        {isCurrentBracket && <span className="ml-2 text-xs text-purple-600">(Your Bracket)</span>}
                      </td>
                      <td className="text-right p-2">
                        {bracket.partB > 0 ? `$${bracket.partB.toFixed(2)}` : '$0.00'}
                      </td>
                      <td className="text-right p-2">
                        {bracket.partD > 0 ? `$${bracket.partD.toFixed(2)}` : '$0.00'}
                      </td>
                      <td className="text-right p-2 font-medium">
                        {totalMonthly > 0 ? `$${totalMonthly.toFixed(2)}` : '$0.00'}
                      </td>
                      <td className="text-right p-2 font-medium">
                        {totalAnnual > 0 ? `$${totalAnnual.toLocaleString()}` : '$0'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-md">
            <p className="text-xs text-gray-700">
              <strong>Note:</strong> These surcharges are in addition to the standard Medicare Part B premium (approximately $185/month in 2026) and your Part D prescription drug plan premium. The surcharges are based on your Modified Adjusted Gross Income (MAGI) from 2 years prior.
            </p>
          </div>
        </div>
      </div>

      {/* Tax Summary */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4 text-gray-800 flex items-center gap-2">
          <TrendingDown className="w-5 h-5 text-blue-600" />
          Federal Tax Analysis
        </h2>
        
        {/* Tax Bracket Visualization */}
        <div className="mb-6">
          <h3 className="font-medium text-gray-700 mb-4">Tax Bracket Visualization</h3>
          
          {/* Ordinary Income Tax Brackets */}
          <div className="mb-6">
            <div className="flex justify-between items-center mb-2">
              <h4 className="text-sm font-semibold text-gray-700">Ordinary Income Tax Brackets (2026)</h4>
              <span className="text-xs text-gray-500">Your income: ${results.taxableOrdinaryIncome.toLocaleString()}</span>
            </div>
            {(personalInfo.filingStatus === 'single' ? taxBrackets2026Single : taxBrackets2026MFJ).map((bracket, index) => {
              const brackets = personalInfo.filingStatus === 'single' ? taxBrackets2026Single : taxBrackets2026MFJ;
              const bracketWidth = bracket.max === Infinity ? 100000 : (bracket.max - bracket.min);
              const maxWidth = brackets[brackets.length - 2].max; // Use second to last bracket for scaling
              const widthPercent = Math.min((bracketWidth / maxWidth) * 100, 100);
              
              // Calculate how much of this bracket is filled
              let filledAmount = 0;
              if (results.taxableOrdinaryIncome > bracket.min) {
                filledAmount = Math.min(results.taxableOrdinaryIncome - bracket.min, bracket.max - bracket.min);
              }
              const filledPercent = bracketWidth > 0 ? (filledAmount / bracketWidth) * 100 : 0;
              
              return (
                <div key={index} className="mb-3">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-medium">{(bracket.rate * 100)}% Bracket</span>
                    <span className="text-gray-600">
                      ${bracket.min.toLocaleString()} - {bracket.max === Infinity ? '∞' : `${bracket.max.toLocaleString()}`}
                    </span>
                  </div>
                  <div className="relative h-8 bg-gray-100 rounded overflow-hidden" style={{width: `${widthPercent}%`}}>
                    <div 
                      className={`absolute h-full transition-all duration-300 ${
                        filledPercent > 0 ? 'bg-gradient-to-r from-blue-400 to-blue-600' : ''
                      }`}
                      style={{width: `${filledPercent}%`}}
                    >
                      {filledPercent > 20 && (
                        <span className="absolute inset-0 flex items-center justify-center text-xs font-medium text-white">
                          ${filledAmount.toLocaleString()}
                        </span>
                      )}
                    </div>
                    {filledPercent > 0 && filledPercent <= 20 && (
                      <span className="absolute left-full ml-2 top-1/2 -translate-y-1/2 text-xs font-medium text-blue-600">
                        ${filledAmount.toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          
          {/* Capital Gains Tax Brackets */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <h4 className="text-sm font-semibold text-gray-700">Capital Gains Tax (15% Rate)</h4>
              <span className="text-xs text-gray-500">Your capital gains: ${results.totalCapitalGains.toLocaleString()}</span>
            </div>
            <div className="mb-3">
              <div className="flex justify-between text-xs mb-1">
                <span className="font-medium">Long-Term Capital Gains (15%)</span>
                <span className="text-gray-600">Stocks, Crypto, Metals, Qualified Dividends</span>
              </div>
              <div className="relative h-8 bg-gray-100 rounded overflow-hidden">
                <div 
                  className={`absolute h-full transition-all duration-300 ${
                    results.totalCapitalGains > 0 ? 'bg-gradient-to-r from-green-400 to-green-600' : 
                    results.totalCapitalGains < 0 ? 'bg-gradient-to-r from-red-400 to-red-600' : ''
                  }`}
                  style={{width: results.totalCapitalGains !== 0 ? '100%' : '0%'}}
                >
                  <span className="absolute inset-0 flex items-center justify-center text-xs font-medium text-white">
                    {results.totalCapitalGains >= 0 ? '+' : ''}${results.totalCapitalGains.toLocaleString()} 
                    {results.totalCapitalGains > 0 ? ' (taxed at 15%)' : results.totalCapitalGains < 0 ? ' (loss offsets gains)' : ''}
                  </span>
                </div>
              </div>
            </div>
            <p className="text-xs text-gray-500 italic">
              Note: This visualization assumes 15% capital gains rate. Actual rate depends on total income. Losses offset gains.
            </p>
          </div>
        </div>
        
        <div className="grid md:grid-cols-3 gap-6">
          <div className="space-y-3">
            <h3 className="font-medium text-gray-700 border-b pb-2">Income Sources</h3>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Employment Income:</span>
              <span className="font-medium">${results.employmentIncome.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Pension Income:</span>
              <span className="font-medium">${results.pensionIncome.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Traditional Withdrawals:</span>
              <span className="font-medium">${(getActiveScenario().withdrawals.traditionalIRA + getActiveScenario().withdrawals.traditional401k).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Interest Income:</span>
              <span className="font-medium">${(personalInfo.interestIncome || 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Ordinary Dividends:</span>
              <span className="font-medium">${(personalInfo.ordinaryDividends || 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm border-t pt-2">
              <span className="text-gray-700 font-medium">Total Ordinary Income:</span>
              <span className="font-bold">${results.ordinaryIncome.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Less: Standard Deduction:</span>
              <span className="font-medium text-green-600">-${results.standardDeduction.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm border-t pt-2">
              <span className="text-gray-700 font-medium">Taxable Ordinary Income:</span>
              <span className="font-bold">${results.taxableOrdinaryIncome.toLocaleString()}</span>
            </div>
          </div>
          
          <div className="space-y-3">
            <h3 className="font-medium text-gray-700 border-b pb-2">Withdrawals</h3>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Tax-Free Withdrawals:</span>
              <span className="font-medium text-green-600">${results.taxFreeWithdrawals.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Stock Sale Proceeds:</span>
              <span className="font-medium text-yellow-600">${results.totalStockProceeds.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Stock Gains/Losses:</span>
              <span className={`font-medium ${results.totalStockGains >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                ${results.totalStockGains.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Crypto Sale Proceeds:</span>
              <span className="font-medium text-yellow-600">${results.totalCryptoProceeds.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Crypto Gains/Losses:</span>
              <span className={`font-medium ${results.totalCryptoGains >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                ${results.totalCryptoGains.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Metal Sale Proceeds:</span>
              <span className="font-medium text-yellow-600">${results.totalMetalProceeds.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Metal Gains/Losses:</span>
              <span className={`font-medium ${results.totalMetalGains >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                ${results.totalMetalGains.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Qualified Dividends:</span>
              <span className="font-medium text-yellow-600">${(personalInfo.qualifiedDividends || 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm border-t pt-2">
              <span className="text-gray-700 font-medium">Total Cap. Gains/Qual. Div:</span>
              <span className={`font-bold ${results.totalCapitalGains >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                ${results.totalCapitalGains.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between text-sm border-t pt-2 mt-2">
              <span className="text-gray-700 font-medium">Total Withdrawals:</span>
              <span className="font-bold">${results.totalWithdrawals.toLocaleString()}</span>
            </div>
          </div>
          
          <div className="space-y-3">
            <h3 className="font-medium text-gray-700 border-b pb-2">Tax Calculation</h3>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Taxable Ord. Income:</span>
              <span className="font-medium">${results.taxableOrdinaryIncome.toLocaleString()}</span>
            </div>
            {results.currentBracket && (
              <>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Current Tax Bracket:</span>
                  <span className="font-medium text-blue-600">{(results.currentBracket.rate * 100)}%</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Room to Next Bracket:</span>
                  <span className="font-medium text-blue-600">
                    {results.roomInBracket > 0 ? `${results.roomInBracket.toLocaleString()}` : 'In highest bracket'}
                  </span>
                </div>
              </>
            )}
            <div className="flex justify-between text-sm border-t pt-2">
              <span className="text-gray-600">Ordinary Income Tax:</span>
              <span className="font-medium text-red-600">${results.ordinaryIncomeTax.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Capital Gains Tax:</span>
              <span className="font-medium text-red-600">${results.capitalGainsTax.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm border-t pt-2">
              <span className="text-gray-700 font-medium">Total Tax:</span>
              <span className="font-bold text-red-600">${results.totalTax.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Effective Rate:</span>
              <span className="font-medium">{results.effectiveRate.toFixed(2)}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Income Stacking Waterfall Chart */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4 text-gray-800 flex items-center gap-2">
          <TrendingDown className="w-5 h-5 text-indigo-600" />
          How Capital Gains Stack on Top of Ordinary Income
        </h2>

        <p className="text-sm text-gray-600 mb-6">
          This chart visualizes how capital gains "stack" on top of your ordinary income for tax calculation purposes.
          Capital gains fill up remaining space in lower tax brackets before moving to higher brackets.
        </p>

        {(() => {
          // Calculate standard deduction based on filing status (2026 amounts)
          const standardDeduction = personalInfo.filingStatus === 'single' ? 16100 :
                                   personalInfo.filingStatus === 'married' ? 32200 : 24250;

          // Calculate values for waterfall chart
          const grossOrdinaryIncome = results.ordinaryIncome;
          const taxableOrdinaryIncome = Math.max(0, grossOrdinaryIncome - standardDeduction);
          const totalCapitalGains = results.totalCapitalGains;
          const totalIncome = taxableOrdinaryIncome + totalCapitalGains;

          // Get tax brackets
          const ordinaryBrackets = personalInfo.filingStatus === 'single' ? taxBrackets2026Single : taxBrackets2026MFJ;
          const capitalGainsBrackets = personalInfo.filingStatus === 'single'
            ? [{ max: 50400 }, { max: 561350 }]
            : [{ max: 100800 }, { max: 751600 }];

          // Determine capital gains color based on where they stack
          const getCapitalGainsColor = () => {
            const startIncome = taxableOrdinaryIncome;
            const endIncome = taxableOrdinaryIncome + totalCapitalGains;

            if (totalCapitalGains === 0) return '#a7f3d0';

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
              description: `${personalInfo.filingStatus} standard deduction`
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
              name: 'Capital\nGains',
              base: taxableOrdinaryIncome,
              value: totalCapitalGains,
              displayValue: totalCapitalGains,
              color: getCapitalGainsColor(),
              tax: results.capitalGainsTax,
              description: 'Long-term capital gains stacked on top'
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
                    Amount: ${Math.abs(data.displayValue).toLocaleString()}
                  </p>
                  {data.tax > 0 && (
                    <p className="text-sm font-medium text-red-600">
                      Tax Due: ${data.tax.toLocaleString()}
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
                  {isNegative ? '(' : ''}${Math.abs(data.displayValue).toLocaleString()}{isNegative ? ')' : ''}
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
                      ${data.tax.toLocaleString()}
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
            const endIncome = taxableOrdinaryIncome + totalCapitalGains;
            const capGainsAmount = totalCapitalGains;

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

      {/* Utah State Tax Analysis */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4 text-gray-800 flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-orange-600" />
          Utah State Tax Analysis
        </h2>

        <p className="text-sm text-gray-600 mb-4">
          Utah has a flat income tax rate of 4.55% that applies to all taxable income, including capital gains.
        </p>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <h3 className="font-medium text-gray-700 border-b pb-2">Utah Taxable Income</h3>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Ordinary Income:</span>
              <span className="font-medium">${results.taxableOrdinaryIncome.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Capital Gains:</span>
              <span className="font-medium">${results.totalCapitalGains.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm border-t pt-2">
              <span className="text-gray-700 font-medium">Total Utah Taxable:</span>
              <span className="font-bold">${(results.taxableOrdinaryIncome + results.totalCapitalGains).toLocaleString()}</span>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="font-medium text-gray-700 border-b pb-2">Utah Tax (4.55% Flat Rate)</h3>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Tax on Ordinary Income:</span>
              <span className="font-medium text-orange-600">${results.utahStateTax.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Tax on Capital Gains:</span>
              <span className="font-medium text-orange-600">${results.utahCapitalGainsTax.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm border-t pt-2">
              <span className="text-gray-700 font-medium">Total Utah Tax:</span>
              <span className="font-bold text-orange-600">${results.totalUtahTax.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Combined Tax Summary */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4 text-gray-800 flex items-center gap-2">
          <Calculator className="w-5 h-5 text-blue-600" />
          Combined Tax Summary (Federal + State)
        </h2>

        <div className="max-w-md mx-auto space-y-4">
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Federal Tax:</span>
              <span className="font-medium text-red-600">${results.totalTax.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Utah State Tax:</span>
              <span className="font-medium text-orange-600">${results.totalUtahTax.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-base border-t-2 pt-3 bg-blue-50 -mx-4 px-4 py-3 rounded-lg">
              <span className="text-gray-800 font-bold">TOTAL TAX (Federal + Utah):</span>
              <span className="font-bold text-blue-900 text-xl">${results.totalTaxWithState.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm pt-2">
              <span className="text-gray-600">Combined Effective Rate:</span>
              <span className="font-bold text-blue-700">{results.effectiveRateWithState.toFixed(2)}%</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Total Taxable Income:</span>
              <span className="font-medium">${(results.taxableOrdinaryIncome + results.totalCapitalGains).toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Scenario Comparison Table */}
      {scenarios.length > 1 && (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4 text-gray-800 flex items-center gap-2">
            <Calculator className="w-5 h-5 text-indigo-600" />
            Scenario Comparison
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Metric</th>
                  {scenarios.map(scenario => (
                    <th key={scenario.id} className={`px-4 py-3 text-right font-medium ${scenario.id === activeScenarioId ? 'bg-blue-50 text-blue-700' : 'text-gray-700'}`}>
                      {scenario.name}
                      {scenario.id === activeScenarioId && (
                        <span className="ml-2 text-xs">(Active)</span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {(() => {
                  // Calculate results for all scenarios
                  const allResults = scenarios.map(s => ({
                    scenario: s,
                    results: calculateScenario(s)
                  }));

                  return (
                    <>
                      <tr>
                        <td className="px-4 py-2 font-medium text-gray-700">Total Withdrawals</td>
                        {allResults.map(({ scenario, results }) => (
                          <td key={scenario.id} className={`px-4 py-2 text-right ${scenario.id === activeScenarioId ? 'bg-blue-50' : ''}`}>
                            ${results.totalWithdrawals.toLocaleString()}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="px-4 py-2 font-medium text-gray-700">MAGI (for IRMAA)</td>
                        {allResults.map(({ scenario, results }) => (
                          <td key={scenario.id} className={`px-4 py-2 text-right ${scenario.id === activeScenarioId ? 'bg-blue-50' : ''}`}>
                            ${results.magi.toLocaleString()}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="px-4 py-2 font-medium text-gray-700">Tax Bracket</td>
                        {allResults.map(({ scenario, results }) => (
                          <td key={scenario.id} className={`px-4 py-2 text-right ${scenario.id === activeScenarioId ? 'bg-blue-50' : ''}`}>
                            {results.currentBracket ? `${(results.currentBracket.rate * 100)}%` : 'N/A'}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="px-4 py-2 font-medium text-gray-700">Federal Tax</td>
                        {allResults.map(({ scenario, results }) => (
                          <td key={scenario.id} className={`px-4 py-2 text-right text-red-600 ${scenario.id === activeScenarioId ? 'bg-blue-50' : ''}`}>
                            ${results.totalTax.toLocaleString()}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="px-4 py-2 font-medium text-gray-700">Utah State Tax</td>
                        {allResults.map(({ scenario, results }) => (
                          <td key={scenario.id} className={`px-4 py-2 text-right text-orange-600 ${scenario.id === activeScenarioId ? 'bg-blue-50' : ''}`}>
                            ${results.totalUtahTax.toLocaleString()}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="px-4 py-2 font-medium text-gray-700">Annual IRMAA Cost</td>
                        {allResults.map(({ scenario, results }) => (
                          <td key={scenario.id} className={`px-4 py-2 text-right text-purple-600 ${scenario.id === activeScenarioId ? 'bg-blue-50' : ''}`}>
                            ${results.currentIRMAABracket ? ((results.currentIRMAABracket.partB + results.currentIRMAABracket.partD) * 12).toLocaleString() : '0'}
                          </td>
                        ))}
                      </tr>
                      <tr className="bg-gray-50 font-semibold">
                        <td className="px-4 py-3 font-bold text-gray-800">Total Tax (Fed + State + IRMAA)</td>
                        {allResults.map(({ scenario, results }) => {
                          const irmaaAnnual = results.currentIRMAABracket ? (results.currentIRMAABracket.partB + results.currentIRMAABracket.partD) * 12 : 0;
                          const totalCost = results.totalTaxWithState + irmaaAnnual;
                          return (
                            <td key={scenario.id} className={`px-4 py-3 text-right text-blue-900 ${scenario.id === activeScenarioId ? 'bg-blue-100' : ''}`}>
                              ${totalCost.toLocaleString()}
                            </td>
                          );
                        })}
                      </tr>
                      <tr>
                        <td className="px-4 py-2 font-medium text-gray-700">Effective Rate (Fed + State)</td>
                        {allResults.map(({ scenario, results }) => (
                          <td key={scenario.id} className={`px-4 py-2 text-right ${scenario.id === activeScenarioId ? 'bg-blue-50' : ''}`}>
                            {results.effectiveRateWithState.toFixed(2)}%
                          </td>
                        ))}
                      </tr>
                    </>
                  );
                })()}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-gray-500 mt-3">
            The active scenario is highlighted in blue. Click a scenario name in the dropdown above to view its details.
          </p>
        </div>
      )}

      {/* Tips */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-6">
        <div className="flex gap-2">
          <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-900">
            <p className="font-medium mb-2">General Tax-Efficient Withdrawal Strategies:</p>
            <ul className="space-y-1 list-disc list-inside">
              <li>Use taxable accounts (brokerage, savings) first for flexibility and potentially lower capital gains rates</li>
              <li>Fill up lower tax brackets with traditional IRA/401(k) withdrawals before jumping to higher brackets</li>
              <li>Preserve Roth accounts for last - they grow tax-free and provide flexibility in high-income years</li>
              <li>Consider RMDs starting at age 73 (or 75 if born in 1960 or later)</li>
              <li>This calculator uses simplified assumptions - actual taxes may vary based on state taxes, Medicare premiums, and other factors</li>
            </ul>
          </div>
        </div>
      </div>
        </>
      )}
    </div>
  );
}
