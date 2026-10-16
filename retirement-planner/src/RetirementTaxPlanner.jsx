import React, { useState, useEffect, useRef } from 'react';
import { Calculator, DollarSign, TrendingDown, AlertCircle, Save, Download, Upload, RotateCcw, Users, FileText } from 'lucide-react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import PriceInput from './components/PriceInput';
import IncomeStackingChart from './components/IncomeStackingChart';
import StockPortfolio from './components/StockPortfolio';
import CryptoPortfolio from './components/CryptoPortfolio';
import MetalsPortfolio from './components/MetalsPortfolio';
import StockLotDetails from './components/StockLotDetails';
import CryptoLotDetails from './components/CryptoLotDetails';
import MetalLotDetails from './components/MetalLotDetails';
import {
  TAX_RULES, TAX_YEAR, IRMAA_YEAR, IRMAA_SOURCE_YEAR, IRMAA_PROJECTION_YEARS, IRMAA_PROJECTED,
  IRMAA_BASIS_TEXT, LOOKBACK_YEARS, PROJECTED_BASE_PREMIUMS, FILING_STATUS_LABELS, formatRate, forFilingStatus,
} from './taxConfig';
import {
  nextAssetName, createDefaultPersonalInfo, createDefaultAccounts, createDefaultStocks,
  createDefaultSocialSecurity, highestScenarioId, createDefaultScenario,
} from './defaults';
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
    let attemptedCount = 0;
    let failedTickers = [];

    // The row as it exists RIGHT NOW, matched by position and confirmed by name so a
    // reorder or rename during the run can never apply a price to the wrong holding.
    const liveStockAt = (index, expectedName) => {
      const current = stocksRef.current[index];
      return current && current.name === expectedName ? current : null;
    };

    for (let i = 0; i < stocksToUpdate.length; i++) {
      const stock = stocksToUpdate[i];
      const ticker = stock.name.trim().toUpperCase();

      addDebugLog(`[${i + 1}/${stocksToUpdate.length}] Processing: ${ticker}`);

      // Read the skip flag from live state, not the pre-loop snapshot: this loop
      // runs for ~14s on a full portfolio and the user may tick Skip Update during it.
      if ((liveStockAt(i, stock.name) || stock).skipPriceUpdate) {
        addDebugLog(`  → ${ticker} has skip flag, skipping price update`);
        continue;
      }

      // Only fetch if the name looks like a ticker (1-5 characters, letters only)
      const isTicker = /^[A-Z]{1,5}$/.test(ticker);

      if (isTicker) {
        addDebugLog(`  → ${ticker} is valid ticker format, fetching...`);
        attemptedCount++;
        const price = await fetchStockPrice(ticker);
        addDebugLog(`  → ${ticker} fetch returned: $${price}`);

        if (price && price > 0) {
          const fetchedPrice = parseFloat(price.toFixed(2));
          successCount++;
          addDebugLog(`  ✓ ${ticker} updated to $${price}`);

          // Merge the new price into CURRENT state rather than re-publishing the
          // snapshot taken before the loop. Publishing the stale array overwrote
          // every edit made while "Updating..." was running -- including ticking
          // Skip Update, whose own click was then undone.
          setStocks(prev => prev.map((s, idx) =>
            idx === i && s.name === stock.name ? { ...s, currentPrice: fetchedPrice } : s
          ));
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

    // Count only the tickers actually attempted -- skipped holdings were never
    // candidates, so including them reported "Updated 2 of 5" for a run of 2.
    if (successCount > 0) {
      setSaveStatus(`Updated ${successCount} of ${attemptedCount} prices!`);
    } else {
      setSaveStatus(`Failed to fetch prices. Check debug log below.`);
    }

    if (failedTickers.length > 0) {
      addDebugLog(`Failed tickers: ${failedTickers.join(', ')}`);
    }

    setTimeout(() => setSaveStatus(''), 5000);
  };

  // Migrate legacy asset to include lot tracking fields
  const migrateAsset = (asset) => {
    if (!asset) return asset;

    // Ensure lot tracking fields exist
    const migratedAsset = {
      ...asset,
      useLotTracking: asset.useLotTracking || false,
      lots: Array.isArray(asset.lots) ? asset.lots : [],
      skipPriceUpdate: asset.skipPriceUpdate || false,
      // New flag, split out from skipPriceUpdate. Default it from the old flag so
      // existing saved files keep the totals they had; ?? (not ||) so an explicit
      // false is preserved rather than falling back to skipPriceUpdate.
      excludeFromTotals: asset.excludeFromTotals ?? asset.skipPriceUpdate ?? false
    };

    console.log('Migrating asset:', asset.name, '→', migratedAsset);
    return migratedAsset;
  };

  // Migrate scenario to ensure all required fields exist
  const migrateScenario = (scenario) => {
    if (!scenario) return scenario;

    const migratedScenario = {
      ...scenario,
      withdrawals: {
        savings: scenario.withdrawals?.savings ?? 0,
        brokerage: scenario.withdrawals?.brokerage ?? 0,
        traditionalIRA: scenario.withdrawals?.traditionalIRA ?? 0,
        rothIRA: scenario.withdrawals?.rothIRA ?? 0,
        traditional401k: scenario.withdrawals?.traditional401k ?? 0,
        roth401k: scenario.withdrawals?.roth401k ?? 0
      },
      rothConversion: scenario.rothConversion ?? 0,
      stockWithdrawals: Array.isArray(scenario.stockWithdrawals) ? scenario.stockWithdrawals : [],
      cryptoSales: Array.isArray(scenario.cryptoSales) ? scenario.cryptoSales : [],
      metalSales: Array.isArray(scenario.metalSales) ? scenario.metalSales : []
    };

    console.log('Migrating scenario:', scenario.name, '→', migratedScenario);
    return migratedScenario;
  };

  // Load data from storage on mount
  useEffect(() => {
    const loadData = async () => {
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
  const exportData = () => {
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

  // Generate PDF Report
  const generatePDFReport = async () => {
    try {
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      let yPosition = 20;
      const margin = 15;

      // Get current scenario data
      const activeScenario = scenarios.find(s => s.id === activeScenarioId) || scenarios[0];
      const results = activeScenario ? calculateScenario(activeScenario) : null;

      if (!results) {
        alert('No scenario data available to generate report');
        return;
      }

      // Helper function to add section image to PDF
      const addSectionToPDF = async (selector, title) => {
        const element = document.querySelector(selector);
        if (!element) {
          console.warn(`Section not found: ${selector}`);
          return false;
        }

        try {
          const canvas = await html2canvas(element, {
            scale: 2,
            backgroundColor: '#ffffff',
            logging: false,
            useCORS: true
          });

          const imgData = canvas.toDataURL('image/png');
          const imgWidth = pageWidth - 2 * margin;
          const imgHeight = (canvas.height * imgWidth) / canvas.width;

          // Check if we need a new page
          if (yPosition + imgHeight > pageHeight - 20) {
            pdf.addPage();
            yPosition = 20;
          }

          // Add title if provided
          if (title) {
            pdf.setFontSize(14);
            pdf.setFont('helvetica', 'bold');
            pdf.text(title, margin, yPosition);
            yPosition += 8;
          }

          pdf.addImage(imgData, 'PNG', margin, yPosition, imgWidth, imgHeight);
          yPosition += imgHeight + 10;

          return true;
        } catch (error) {
          console.error(`Error capturing ${selector}:`, error);
          return false;
        }
      };

      // Title Page
      pdf.setFontSize(20);
      pdf.setFont('helvetica', 'bold');
      const reportTitle = pdfReportMode === 'summary'
        ? 'Retirement Tax Planning Report (Summary)'
        : 'Retirement Tax Planning Report (Full)';
      pdf.text(reportTitle, pageWidth / 2, yPosition, { align: 'center' });
      yPosition += 10;

      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Scenario: ${activeScenario.name}`, pageWidth / 2, yPosition, { align: 'center' });
      yPosition += 5;
      pdf.text(`Generated: ${new Date().toLocaleDateString()}`, pageWidth / 2, yPosition, { align: 'center' });
      yPosition += 15;

      // Capture all webpage sections
      console.log('Generating PDF report...');

      // Find all results sections and capture them
      let sections;
      if (pdfReportMode === 'summary') {
        // Exclude detail sections in summary mode
        sections = Array.from(document.querySelectorAll('.pdf-section')).filter(
          section => !section.classList.contains('pdf-detail-only')
        );
      } else {
        sections = document.querySelectorAll('.pdf-section');
      }

      for (const section of sections) {
        try {
          const canvas = await html2canvas(section, {
            scale: 2,
            backgroundColor: '#ffffff',
            logging: false,
            useCORS: true
          });

          const imgData = canvas.toDataURL('image/png');
          const topMargin = 20;
          const bottomMargin = 20;
          const maxImgHeight = pageHeight - topMargin - bottomMargin;

          let imgWidth = pageWidth - 2 * margin;
          let imgHeight = (canvas.height * imgWidth) / canvas.width;

          // Start a new page if this section will not fit in what is left.
          if (yPosition + imgHeight > pageHeight - bottomMargin) {
            pdf.addPage();
            yPosition = topMargin;
          }

          // A section taller than a whole page still will not fit after the page
          // break. Previously it was drawn at full height anyway: addImage clipped
          // everything past the bottom edge, and yPosition advanced beyond
          // pageHeight so the NEXT section started off-page too. Scale it down to
          // fit instead, keeping the aspect ratio and centring the narrower image.
          if (imgHeight > maxImgHeight) {
            imgWidth = (imgWidth * maxImgHeight) / imgHeight;
            imgHeight = maxImgHeight;
          }

          const imgX = (pageWidth - imgWidth) / 2;
          pdf.addImage(imgData, 'PNG', imgX, yPosition, imgWidth, imgHeight);
          yPosition += imgHeight + 10;
        } catch (error) {
          console.error('Error capturing section:', error);
        }
      }

      // Save PDF
      pdf.save(`retirement-tax-report-${activeScenario.name}-${new Date().toISOString().split('T')[0]}.pdf`);
      console.log('PDF generated successfully');

    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Error generating PDF report. Please check the console for details.');
    }
  };

  // Import data from JSON file
  const importData = (event) => {
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
  const resetToDefaults = () => {
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

      if (lots.length > 20) {
        alert(`CSV contains ${lots.length} lots, but maximum is 20. Only first 20 will be imported.`);
        lots.splice(20);
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

      {/* Withdrawal Planning */}
      <div className="bg-white rounded-lg shadow p-6 mb-6 pdf-section pdf-detail-only">
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
                // Calculate total units from lots if lot tracking is enabled
                const lots = Array.isArray(cryptoAsset.lots) ? cryptoAsset.lots : [];
                const maxUnits = (cryptoAsset.useLotTracking && lots.length > 0)
                  ? lots.reduce((sum, lot) => sum + (lot.quantity || 0), 0)
                  : (cryptoAsset.units || 0);

                const unitsToSell = getCryptoSale(cryptoAsset.name);
                const strategy = getCryptoStrategy(cryptoAsset.name);

                // Route through selectLots like the stock and metal cards do. This
                // card used to apply the legacy units x (price - costBasis) formula
                // directly, which ignored lot tracking entirely -- so for a
                // lot-tracked holding it disagreed with the tax summary, which has
                // always gone through selectLots.
                const lotSelection = selectLots(cryptoAsset, unitsToSell, strategy);
                const proceeds = lotSelection.totalProceeds;
                const gain = lotSelection.totalGains;
                const shortTermGains = lotSelection.shortTermGains;
                const longTermGains = lotSelection.longTermGains;

                return (
                  <div key={index} className="border border-gray-200 rounded-md p-3">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {cryptoAsset.name} <span className="text-xs text-gray-500">(Max: {maxUnits} units)</span>
                    </label>
                    <input
                      type="number"
                      value={unitsToSell}
                      onChange={(e) => updateCryptoSale(cryptoAsset.name, e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md mb-2"
                      max={maxUnits}
                    />
                    {lotSelection.requestedQuantity > lotSelection.quantitySold && (
                      <div className="mb-2 px-2 py-1 bg-amber-50 border border-amber-300 rounded text-xs text-amber-800">
                        You only hold {maxUnits.toLocaleString(undefined, {maximumFractionDigits: 6})} units.
                        Figures below use {lotSelection.quantitySold.toLocaleString(undefined, {maximumFractionDigits: 6})}, not the {lotSelection.requestedQuantity.toLocaleString(undefined, {maximumFractionDigits: 6})} entered.
                      </div>
                    )}
                    {/* Strategy selector - only show if lot tracking is enabled */}
                    {cryptoAsset.useLotTracking && lots.length > 0 && unitsToSell > 0 && (
                      <select
                        value={strategy}
                        onChange={(e) => updateCryptoStrategy(cryptoAsset.name, e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md mb-2 text-sm"
                      >
                        <option value="HIFO">HIFO (Highest Cost First)</option>
                        <option value="FIFO">FIFO (First In First Out)</option>
                        <option value="LIFO">LIFO (Last In First Out)</option>
                        <option value="TAX_OPTIMIZED">Tax Optimized (Losses, then Long-Term)</option>
                      </select>
                    )}

                    {unitsToSell > 0 && (
                      <div className="text-xs space-y-1">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Proceeds:</span>
                          <span className="font-medium">${proceeds.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                        </div>

                        {/* Show breakdown if lot tracking is enabled */}
                        {cryptoAsset.useLotTracking && lots.length > 0 ? (
                          <>
                            <div className="flex justify-between">
                              <span className="text-gray-600">Short-term gain:</span>
                              <span className={`font-medium ${shortTermGains >= 0 ? 'text-orange-600' : 'text-red-600'}`}>
                                ${shortTermGains.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600">Long-term gain:</span>
                              <span className={`font-medium ${longTermGains >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                ${longTermGains.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                              </span>
                            </div>
                            <div className="flex justify-between font-semibold border-t pt-1">
                              <span className="text-gray-700">Total gain:</span>
                              <span className={gain >= 0 ? 'text-green-600' : 'text-red-600'}>
                                ${gain.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                              </span>
                            </div>
                          </>
                        ) : (
                          <div className="flex justify-between">
                            <span className="text-gray-600">Gain:</span>
                            <span className={`font-medium ${gain >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              ${gain.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                            </span>
                          </div>
                        )}
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
                const strategy = getMetalStrategy(metal.name);

                // Calculate lot-based gains if lot tracking is enabled
                const lotSelection = selectLots(metal, unitsToSell, strategy);
                const proceeds = lotSelection.totalProceeds;
                const totalGain = lotSelection.totalGains;
                const shortTermGains = lotSelection.shortTermGains;
                const longTermGains = lotSelection.longTermGains;

                // Calculate total units from lots if lot tracking is enabled
                const lots = Array.isArray(metal.lots) ? metal.lots : [];
                const maxUnits = (metal.useLotTracking && lots.length > 0)
                  ? lots.reduce((sum, lot) => sum + (lot.quantity || 0), 0)
                  : (metal.units || 0);

                return (
                  <div key={index} className="border border-gray-200 rounded-md p-3">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {metal.name} <span className="text-xs text-gray-500">(Max: {maxUnits} oz)</span>
                    </label>
                    <input
                      type="number"
                      value={unitsToSell}
                      onChange={(e) => updateMetalSale(metal.name, e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md mb-2"
                      max={maxUnits}
                      placeholder="Units to sell"
                    />
                    {lotSelection.requestedQuantity > lotSelection.quantitySold && (
                      <div className="mb-2 px-2 py-1 bg-amber-50 border border-amber-300 rounded text-xs text-amber-800">
                        You only hold {maxUnits.toLocaleString(undefined, {maximumFractionDigits: 2})} oz.
                        Figures below use {lotSelection.quantitySold.toLocaleString(undefined, {maximumFractionDigits: 2})}, not the {lotSelection.requestedQuantity.toLocaleString(undefined, {maximumFractionDigits: 2})} entered.
                      </div>
                    )}

                    {/* Strategy selector - only show if lot tracking is enabled */}
                    {metal.useLotTracking && lots.length > 0 && unitsToSell > 0 && (
                      <select
                        value={strategy}
                        onChange={(e) => updateMetalStrategy(metal.name, e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md mb-2 text-sm"
                      >
                        <option value="HIFO">HIFO (Highest Cost First)</option>
                        <option value="FIFO">FIFO (First In First Out)</option>
                        <option value="LIFO">LIFO (Last In First Out)</option>
                        <option value="TAX_OPTIMIZED">Tax Optimized (Losses, then Long-Term)</option>
                      </select>
                    )}

                    {unitsToSell > 0 && (
                      <div className="text-xs space-y-1">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Proceeds:</span>
                          <span className="font-medium">${proceeds.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Gain:</span>
                          <span className={`font-medium ${totalGain >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            ${totalGain.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                          </span>
                        </div>
                        {metal.useLotTracking && lots.length > 0 && (
                          <>
                            <div className="flex justify-between text-gray-500">
                              <span>Short-term:</span>
                              <span>${shortTermGains.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                            </div>
                            <div className="flex justify-between text-gray-500">
                              <span>Long-term:</span>
                              <span>${longTermGains.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                            </div>
                          </>
                        )}
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
                const strategy = getStockStrategy(stock.name);

                // Calculate lot-based gains if lot tracking is enabled
                const lotSelection = selectLots(stock, sharesToSell, strategy);
                const proceeds = lotSelection.totalProceeds;
                const totalGain = lotSelection.totalGains;
                const shortTermGains = lotSelection.shortTermGains;
                const longTermGains = lotSelection.longTermGains;

                // Calculate max shares (from lots if enabled, else from simple value)
                const lots = Array.isArray(stock.lots) ? stock.lots : [];
                const maxShares = stock.useLotTracking && lots.length > 0
                  ? lots.reduce((sum, lot) => sum + (lot.quantity || 0), 0)
                  : (stock.shares || 0);

                return (
                  <div key={index} className="border border-gray-200 rounded-md p-3">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {stock.name} <span className="text-xs text-gray-500">(Max: {maxShares} shares)</span>
                    </label>
                    <input
                      type="number"
                      value={sharesToSell}
                      onChange={(e) => updateStockWithdrawal(stock.name, e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md mb-2"
                      max={maxShares}
                      placeholder="Shares to sell"
                    />
                    {lotSelection.requestedQuantity > lotSelection.quantitySold && (
                      <div className="mb-2 px-2 py-1 bg-amber-50 border border-amber-300 rounded text-xs text-amber-800">
                        You only hold {maxShares.toLocaleString(undefined, {maximumFractionDigits: 0})} shares.
                        Figures below use {lotSelection.quantitySold.toLocaleString(undefined, {maximumFractionDigits: 0})}, not the {lotSelection.requestedQuantity.toLocaleString(undefined, {maximumFractionDigits: 0})} entered.
                      </div>
                    )}

                    {/* Strategy selector - only show if lot tracking is enabled */}
                    {stock.useLotTracking && lots.length > 0 && sharesToSell > 0 && (
                      <select
                        value={strategy}
                        onChange={(e) => updateStockStrategy(stock.name, e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md mb-2 text-sm"
                      >
                        <option value="HIFO">HIFO (Highest Cost First)</option>
                        <option value="FIFO">FIFO (First In First Out)</option>
                        <option value="LIFO">LIFO (Last In First Out)</option>
                        <option value="TAX_OPTIMIZED">Tax Optimized (Losses, then Long-Term)</option>
                      </select>
                    )}

                    {sharesToSell > 0 && (
                      <div className="text-xs space-y-1">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Proceeds:</span>
                          <span className="font-medium">${proceeds.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                        </div>

                        {/* Show breakdown if lot tracking is enabled */}
                        {stock.useLotTracking && lots.length > 0 ? (
                          <>
                            <div className="flex justify-between">
                              <span className="text-gray-600">Short-term gain:</span>
                              <span className={`font-medium ${shortTermGains >= 0 ? 'text-orange-600' : 'text-red-600'}`}>
                                ${shortTermGains.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600">Long-term gain:</span>
                              <span className={`font-medium ${longTermGains >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                ${longTermGains.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                              </span>
                            </div>
                            <div className="flex justify-between font-semibold border-t pt-1">
                              <span className="text-gray-700">Total gain:</span>
                              <span className={totalGain >= 0 ? 'text-green-600' : 'text-red-600'}>
                                ${totalGain.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                              </span>
                            </div>
                          </>
                        ) : (
                          <div className="flex justify-between">
                            <span className="text-gray-600">Gain:</span>
                            <span className={`font-medium ${totalGain >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              ${totalGain.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Retirement & Savings Account Withdrawals + Roth Conversion */}
      <div className="bg-white rounded-lg shadow p-6 mb-6 pdf-section pdf-detail-only">
        <h2 className="text-lg font-semibold mb-4 text-gray-800 flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-blue-600" />
          Retirement & Savings Account Withdrawals
        </h2>
        <h3 className="font-medium text-gray-700 mb-3">Account Withdrawals</h3>
        <div className="grid md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Savings <span className="text-xs text-green-600">(Tax-Free)</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-gray-500">$</span>
              <input
                type="text"
                value={getActiveScenario().withdrawals.savings.toLocaleString()}
                onChange={(e) => updateWithdrawal('savings', e.target.value.replace(/,/g, ''))}
                className="w-full pl-7 px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Traditional IRA <span className="text-xs text-red-600">(Ordinary Income)</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-gray-500">$</span>
              <input
                type="text"
                value={getActiveScenario().withdrawals.traditionalIRA.toLocaleString()}
                onChange={(e) => updateWithdrawal('traditionalIRA', e.target.value.replace(/,/g, ''))}
                className="w-full pl-7 px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Roth IRA <span className="text-xs text-green-600">(Tax-Free)</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-gray-500">$</span>
              <input
                type="text"
                value={getActiveScenario().withdrawals.rothIRA.toLocaleString()}
                onChange={(e) => updateWithdrawal('rothIRA', e.target.value.replace(/,/g, ''))}
                className="w-full pl-7 px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Traditional 401(k) <span className="text-xs text-red-600">(Ordinary Income)</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-gray-500">$</span>
              <input
                type="text"
                value={getActiveScenario().withdrawals.traditional401k.toLocaleString()}
                onChange={(e) => updateWithdrawal('traditional401k', e.target.value.replace(/,/g, ''))}
                className="w-full pl-7 px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Roth 401(k) <span className="text-xs text-green-600">(Tax-Free)</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-gray-500">$</span>
              <input
                type="text"
                value={getActiveScenario().withdrawals.roth401k.toLocaleString()}
                onChange={(e) => updateWithdrawal('roth401k', e.target.value.replace(/,/g, ''))}
                className="w-full pl-7 px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
          </div>
        </div>

        {/* Roth Conversion */}
        <div className="mt-6">
          <h3 className="font-medium text-gray-700 mb-2 flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-indigo-600" />
            Roth Conversion Planning
          </h3>
          <p className="text-xs text-gray-600 mb-3">
            Convert Traditional IRA/401(k) funds to Roth. You'll pay tax now, but future growth and withdrawals will be tax-free.
          </p>

          {/* Optimization Strategy Selector */}
          <div className="mb-4 pb-4 border-b border-indigo-200">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Optimization Strategy:
            </label>
            <div className="space-y-2">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="rothStrategy"
                  value="conservative"
                  checked={rothOptimizationStrategy === 'conservative'}
                  onChange={(e) => setRothOptimizationStrategy(e.target.value)}
                  className="mt-1"
                />
                <div className="flex-1">
                  <div className="text-sm font-medium text-gray-800">Conservative - Stay in Current Tax Bracket</div>
                  <div className="text-xs text-gray-600">Maximize conversion without jumping to the next tax bracket</div>
                </div>
              </label>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="rothStrategy"
                  value="irmaa"
                  checked={rothOptimizationStrategy === 'irmaa'}
                  onChange={(e) => setRothOptimizationStrategy(e.target.value)}
                  className="mt-1"
                />
                <div className="flex-1">
                  <div className="text-sm font-medium text-gray-800">Moderate - Optimize for IRMAA (Recommended)</div>
                  <div className="text-xs text-gray-600">Maximize conversion up to IRMAA threshold, even if crossing tax bracket</div>
                </div>
              </label>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="rothStrategy"
                  value="aggressive"
                  checked={rothOptimizationStrategy === 'aggressive'}
                  onChange={(e) => setRothOptimizationStrategy(e.target.value)}
                  className="mt-1"
                />
                <div className="flex-1">
                  <div className="text-sm font-medium text-gray-800">Aggressive - Maximize Conversion</div>
                  <div className="text-xs text-gray-600">Fill to the top of the next IRMAA bracket, accepting one IRMAA tier increase for maximum long-term Roth growth</div>
                </div>
              </label>
            </div>

            {/* IRMAA Buffer */}
            <div className="mt-3">
              <label className="block text-xs font-medium text-gray-700 mb-1">
                IRMAA Safety Buffer ({IRMAA_PROJECTED ? `${IRMAA_PROJECTION_YEARS}-year projection uncertainty` : 'published table, little uncertainty'}):
              </label>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <span className="absolute left-2 top-0.5 text-gray-500 text-xs">$</span>
                  <input
                    type="text"
                    value={irmaaBuffer.toLocaleString()}
                    onChange={(e) => setIrmaaBuffer(parseFloat(e.target.value.replace(/,/g, '')) || 0)}
                    className="w-32 pl-5 px-2 py-1 border border-gray-300 rounded text-sm"
                  />
                </div>
                <span className="text-xs text-gray-600">Reduce suggested amount by this buffer to account for IRMAA bracket inflation uncertainty</span>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Roth Conversion Amount <span className="text-xs text-orange-600">(Taxed as Ordinary Income)</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-gray-500">$</span>
              <input
                type="text"
                value={(getActiveScenario().rothConversion || 0).toLocaleString()}
                onChange={(e) => updateActiveScenario({ rothConversion: parseFloat(e.target.value.replace(/,/g, '')) || 0 })}
                className="w-full pl-7 px-3 py-2 border border-indigo-300 rounded-md focus:ring-2 focus:ring-indigo-500"
                placeholder="Enter amount to convert"
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Max available: ${(accounts.traditionalIRA + accounts.traditional401k).toLocaleString()}
            </p>
          </div>

          {/* Smart Optimizer */}
          {(() => {
            // Calculate baseline scenario without conversion
            const baselineScenario = { ...getActiveScenario(), rothConversion: 0 };
            const baselineResults = calculateScenario(baselineScenario);

            // Calculate constraints with IRMAA buffer applied
            const taxBracketRoom = baselineResults.roomInBracket > 0 ? baselineResults.roomInBracket : 0;
            const irmaaRoomRaw = baselineResults.roomToNextIRMAABracket > 0 ? baselineResults.roomToNextIRMAABracket : 0;
            const irmaaRoom = Math.max(0, irmaaRoomRaw - irmaaBuffer); // Apply buffer
            const niitRoom = baselineResults.magi < baselineResults.niitThreshold
              ? baselineResults.niitThreshold - baselineResults.magi
              : 0;

            // Find next IRMAA bracket threshold for aggressive mode
            const irmaaBrackets = irmaaBracketsFor(irmaaFilingStatus);
            let roomToNextIRMAABracket = 0;
            if (baselineResults.currentIRMAABracket) {
              const currentIndex = irmaaBrackets.findIndex(b => b.magi === baselineResults.currentIRMAABracket.magi);
              if (currentIndex >= 0 && currentIndex < irmaaBrackets.length - 1) {
                // Find the next IRMAA bracket threshold (one bracket up)
                const nextBracket = irmaaBrackets[currentIndex + 1];
                if (nextBracket.magiMax !== Infinity) {
                  roomToNextIRMAABracket = Math.max(0, nextBracket.magiMax - baselineResults.magi - irmaaBuffer);
                } else {
                  // The bracket above is the top one, so there is no IRMAA ceiling
                  // beyond it. Represent that as Infinity rather than a magic
                  // 1000000, which the guard below used to exclude -- silently
                  // turning Aggressive into the Moderate answer while the panel
                  // still advertised "$1,000,000" of room.
                  roomToNextIRMAABracket = Infinity;
                }
              }
            }

            // Determine the limiting factor and optimal amount based on strategy
            let optimalAmount = 0;
            let limitingFactor = '';
            let reason = '';

            if (rothOptimizationStrategy === 'conservative') {
              // Conservative: Stay in current tax bracket
              if (taxBracketRoom > 0) {
                optimalAmount = Math.floor(taxBracketRoom);
                limitingFactor = 'Tax Bracket';
                reason = `Fills your ${(baselineResults.currentBracket.rate * 100)}% tax bracket without jumping to the next bracket.`;
              }
            } else if (rothOptimizationStrategy === 'irmaa') {
              // Moderate: Optimize for IRMAA (can cross tax bracket)
              if (irmaaRoom > 0) {
                optimalAmount = Math.floor(irmaaRoom);
                limitingFactor = 'IRMAA Threshold';
                reason = `Maximizes conversion up to IRMAA threshold (with $${irmaaBuffer.toLocaleString()} buffer), even if crossing tax brackets.`;
              } else if (taxBracketRoom > 0) {
                // Fallback to tax bracket if at IRMAA limit
                optimalAmount = Math.floor(taxBracketRoom);
                limitingFactor = 'Tax Bracket';
                reason = 'Already at IRMAA threshold. Fills current tax bracket instead.';
              }
            } else if (rothOptimizationStrategy === 'aggressive') {
              // Aggressive: Maximize conversion up to next IRMAA bracket threshold
              if (Number.isFinite(roomToNextIRMAABracket) && roomToNextIRMAABracket > 0) {
                optimalAmount = Math.floor(roomToNextIRMAABracket);
                limitingFactor = 'Next IRMAA Bracket Threshold';
                reason = `Maximizes conversion by filling to the top of the NEXT IRMAA bracket (with $${irmaaBuffer.toLocaleString()} buffer). Accepts crossing current IRMAA threshold for maximum Roth conversion.`;
              } else if (!Number.isFinite(roomToNextIRMAABracket) && taxBracketRoom > 0) {
                // No IRMAA bracket above this one, so IRMAA imposes no ceiling and
                // the tax bracket is the only remaining limit.
                optimalAmount = Math.floor(taxBracketRoom);
                limitingFactor = 'Tax Bracket';
                reason = 'There is no IRMAA bracket above your current one, so IRMAA sets no upper limit. Fills your current tax bracket instead.';
              } else if (irmaaRoom > 0) {
                // Fallback to current IRMAA room
                optimalAmount = Math.floor(irmaaRoom);
                limitingFactor = 'Current IRMAA Threshold';
                reason = `Filling to current IRMAA threshold (with $${irmaaBuffer.toLocaleString()} buffer). Already in highest or near-highest IRMAA bracket.`;
              } else if (taxBracketRoom > 0) {
                // Last fallback
                optimalAmount = Math.floor(taxBracketRoom);
                limitingFactor = 'Tax Bracket';
                reason = 'Already at IRMAA limits. Fills current tax bracket.';
              }
            }

            // Cap at available funds
            const maxAvailable = accounts.traditionalIRA + accounts.traditional401k;
            if (optimalAmount > maxAvailable) {
              optimalAmount = maxAvailable;
              limitingFactor = 'Available Funds';
              reason = 'Limited by available Traditional IRA/401(k) balance.';
            }

            return optimalAmount > 0 ? (
              <div className="mt-4 p-3 bg-green-50 border border-green-300 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-green-900 mb-1">
                      💡 Suggested Optimal Conversion: ${optimalAmount.toLocaleString()}
                    </p>
                    <p className="text-xs text-green-800 mb-2">
                      {reason}
                    </p>
                    <div className="text-xs text-gray-700 mb-2">
                      <strong>Limiting Factor:</strong> {limitingFactor}
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 mb-2">
                      <div>Tax Bracket Room: <strong>${Math.round(taxBracketRoom).toLocaleString()}</strong></div>
                      <div>IRMAA Room (w/ buffer): <strong>${Math.round(irmaaRoom).toLocaleString()}</strong></div>
                      {rothOptimizationStrategy === 'aggressive' && roomToNextIRMAABracket > 0 && (
                        <div className="col-span-2">Room to Next IRMAA Bracket: <strong>{Number.isFinite(roomToNextIRMAABracket)
                          ? `$${Math.round(roomToNextIRMAABracket).toLocaleString()}`
                          : 'No bracket above this one'}</strong></div>
                      )}
                    </div>
                    <button
                      onClick={() => updateActiveScenario({ rothConversion: optimalAmount })}
                      className="mt-2 px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700 transition-colors"
                    >
                      Use Suggested Amount
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-4 p-3 bg-yellow-50 border border-yellow-300 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-yellow-900 mb-1">
                      ⚠️ Limited Conversion Opportunity
                    </p>
                    <p className="text-xs text-yellow-800">
                      {taxBracketRoom <= 0 && 'You\'re at the top of your tax bracket. '}
                      {irmaaRoom <= 0 && 'You\'re at an IRMAA threshold. '}
                      {niitRoom <= 0 && baselineResults.magi >= baselineResults.niitThreshold && 'You\'re above the NIIT threshold. '}
                      Any conversion will push you into higher tax brackets or trigger additional surcharges. Consider converting in a lower-income year.
                    </p>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Only render results sections if we have valid results */}
      {results && (
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
                        <span className="font-medium">${results.roomInBracket > 0 ? Math.round(results.roomInBracket).toLocaleString() : '0 (maxed out)'}</span>
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

                  {results.roomInBracket > 0 && results.roomInBracket > results.rothConversion && (
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

      {/* Tax Summary */}
      <div className="bg-white rounded-lg shadow p-6 pdf-section">
        <h2 className="text-lg font-semibold mb-4 text-gray-800 flex items-center gap-2">
          <TrendingDown className="w-5 h-5 text-blue-600" />
          Federal Tax Analysis
        </h2>
        
        {/* Tax Bracket Visualization */}
        <div className="mb-6 tax-bracket-visualization">
          <h3 className="font-medium text-gray-700 mb-4">Tax Bracket Visualization</h3>
          
          {/* Ordinary Income Tax Brackets */}
          <div className="mb-6">
            <div className="flex justify-between items-center mb-2">
              <h4 className="text-sm font-semibold text-gray-700">Ordinary Income Tax Brackets ({TAX_YEAR})</h4>
              <span className="text-xs text-gray-500">Your income: ${results.taxableOrdinaryIncome.toLocaleString(undefined, {maximumFractionDigits: 0})}</span>
            </div>
            {ordinaryBracketsFor(personalInfo.filingStatus).map((bracket, index) => {
              const brackets = ordinaryBracketsFor(personalInfo.filingStatus);
              const bracketWidth = bracket.max === Infinity ? 100000 : (bracket.max - bracket.min);
              const maxWidth = brackets[brackets.length - 2].max; // Use second to last bracket for scaling
              // Scale proportionally but make everything 2.5x bigger for better readability
              const widthPercent = Math.min((bracketWidth / maxWidth) * 100 * 2.5, 100);

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
                      ${bracket.min.toLocaleString(undefined, {maximumFractionDigits: 0})} - {bracket.max === Infinity ? '∞' : `${bracket.max.toLocaleString(undefined, {maximumFractionDigits: 0})}`}
                    </span>
                  </div>
                  <div className="relative h-8 bg-gray-100 rounded overflow-hidden" style={{width: `${widthPercent}%`}}>
                    <div
                      className={`absolute h-full transition-all duration-300 ${
                        filledPercent > 0 ? 'bg-gradient-to-r from-blue-400 to-blue-600' : ''
                      }`}
                      style={{width: `${filledPercent}%`}}
                    >
                      {filledPercent > 10 && (
                        <span className="absolute inset-0 flex items-center justify-center text-xs font-medium text-white">
                          ${filledAmount.toLocaleString(undefined, {maximumFractionDigits: 0})}
                        </span>
                      )}
                    </div>
                    {filledPercent > 0 && filledPercent <= 10 && (
                      <span className="absolute left-full ml-2 top-1/2 -translate-y-1/2 text-xs font-medium text-blue-600">
                        ${filledAmount.toLocaleString(undefined, {maximumFractionDigits: 0})}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          
          {/* Capital Gains Tax Brackets */}
          <div>
            {(() => {
              // Only long-term gains and qualified dividends get the preferential
              // rates; short-term gains are taxed as ordinary income and already
              // appear in the ordinary brackets above. totalLongTermGainsWithQualDiv
              // is floored at zero, so report a net-loss year from netCapitalGains.
              const preferentialGains = results.totalLongTermGainsWithQualDiv;
              const netLoss = results.netCapitalGains < 0 ? results.netCapitalGains : 0;
              const shown = preferentialGains > 0 ? preferentialGains : netLoss;
              const blendedRate = preferentialGains > 0
                ? (results.capitalGainsTax / preferentialGains) * 100
                : 0;

              return (
                <>
                  <div className="flex justify-between items-center mb-2">
                    <h4 className="text-sm font-semibold text-gray-700">Capital Gains Tax (Preferential Rates)</h4>
                    <span className="text-xs text-gray-500">
                      Taxed at preferential rates: ${preferentialGains.toLocaleString(undefined, {maximumFractionDigits: 0})}
                    </span>
                  </div>
                  <div className="mb-3">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-medium">Long-Term Gains &amp; Qualified Dividends</span>
                      <span className="text-gray-600">Stocks, Crypto, Metals, Qualified Dividends</span>
                    </div>
                    <div className="relative h-8 bg-gray-100 rounded overflow-hidden">
                      <div
                        className={`absolute h-full transition-all duration-300 ${
                          shown > 0 ? 'bg-gradient-to-r from-green-400 to-green-600' :
                          shown < 0 ? 'bg-gradient-to-r from-red-400 to-red-600' : ''
                        }`}
                        style={{width: shown !== 0 ? '100%' : '0%'}}
                      >
                        <span className="absolute inset-0 flex items-center justify-center text-xs font-medium text-white">
                          {shown >= 0 ? '+' : ''}${shown.toLocaleString(undefined, {maximumFractionDigits: 0})}
                          {shown > 0
                            ? ` (tax $${Math.round(results.capitalGainsTax).toLocaleString()} — ${blendedRate.toFixed(1)}%)`
                            : shown < 0 ? ' (net loss offsets gains)' : ''}
                        </span>
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 italic">
                    Rate shown is the blended 0%/15%/20% rate actually applied to these gains, which depends on your
                    total income. Short-term gains are taxed as ordinary income and appear in the brackets above.
                  </p>
                </>
              );
            })()}
          </div>
        </div>
      </div>

      {/* Capital Gains Detailed Breakdown - Separate Section */}
      {results && (results.totalShortTermGains !== 0 || results.totalLongTermGains !== 0) && (
        <div className="bg-white rounded-lg shadow p-6 mb-6 pdf-section">
          <h3 className="text-lg font-semibold mb-4 text-gray-800">Capital Gains Detailed Breakdown</h3>

          <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 mb-3">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium text-gray-700">Short-Term Gains (Ordinary Income)</span>
                  <span className={`font-semibold ${results.totalShortTermGains >= 0 ? 'text-orange-600' : 'text-red-600'}`}>
                    ${results.totalShortTermGains.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                  </span>
                </div>
                <div className="text-xs text-gray-600 space-y-1 pl-3">
                  {results.totalStockShortTermGains !== 0 && (
                    <div className="flex justify-between">
                      <span>• Stocks:</span>
                      <span>${results.totalStockShortTermGains.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                    </div>
                  )}
                  {results.totalCryptoShortTermGains !== 0 && (
                    <div className="flex justify-between">
                      <span>• Crypto:</span>
                      <span>${results.totalCryptoShortTermGains.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                    </div>
                  )}
                  {results.totalMetalShortTermGains !== 0 && (
                    <div className="flex justify-between">
                      <span>• Metals:</span>
                      <span>${results.totalMetalShortTermGains.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                    </div>
                  )}
                </div>
                <p className="text-xs text-gray-500 italic mt-2">
                  Taxed at your marginal rate (10%-37%)
                </p>
              </div>

              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium text-gray-700">Long-Term Gains (Preferential Rates)</span>
                  <span className={`font-semibold ${results.totalLongTermGains >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    ${results.totalLongTermGains.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                  </span>
                </div>
                <div className="text-xs text-gray-600 space-y-1 pl-3">
                  {results.totalStockLongTermGains !== 0 && (
                    <div className="flex justify-between">
                      <span>• Stocks:</span>
                      <span>${results.totalStockLongTermGains.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                    </div>
                  )}
                  {results.totalCryptoLongTermGains !== 0 && (
                    <div className="flex justify-between">
                      <span>• Crypto:</span>
                      <span>${results.totalCryptoLongTermGains.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                    </div>
                  )}
                  {results.totalMetalLongTermGains !== 0 && (
                    <div className="flex justify-between">
                      <span>• Metals:</span>
                      <span>${results.totalMetalLongTermGains.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                    </div>
                  )}
                </div>
                <p className="text-xs text-gray-500 italic mt-2">
                  Taxed at 0%, 15%, or 20% based on income
                </p>
              </div>

              <div className="mt-3 pt-3 border-t border-gray-200">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-semibold text-gray-800">Total Capital Gains:</span>
                  <span className={`text-lg font-bold ${results.totalCapitalGains >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                    ${results.totalCapitalGains.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                  </span>
                </div>
              </div>

              {/* Capital Loss Deduction Info */}
              {results.capitalLossDeduction > 0 && (
                <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-blue-900 mb-1">Capital Loss Deduction Applied</p>
                      <p className="text-xs text-blue-700">
                        You have net capital losses of ${Math.abs(results.netCapitalGains).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}.
                        ${results.capitalLossDeduction.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} has been deducted from your ordinary income.
                      </p>
                      {results.excessCapitalLoss > 0 && (
                        <p className="text-xs text-blue-700 mt-2 font-medium">
                          Excess loss of ${results.excessCapitalLoss.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} would carry forward to future years.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
        </div>
      )}

      {/* Tax Summary Grid */}
      {results && (
        <div className="bg-white rounded-lg shadow p-6 mb-6 pdf-section">
          <div className="grid md:grid-cols-3 gap-6">
          <div className="space-y-3">
            <h3 className="font-medium text-gray-700 border-b pb-2">Income Sources</h3>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Employment Income:</span>
              <span className="font-medium">${Math.round(results.employmentIncome).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Pension Income:</span>
              <span className="font-medium">${Math.round(results.pensionIncome).toLocaleString()}</span>
            </div>
            {socialSecurity.enabled && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Social Security Income:</span>
                <span className="font-medium text-purple-600">${Math.round(results.socialSecurityIncome).toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Traditional Withdrawals:</span>
              <span className="font-medium">${Math.round(getActiveScenario().withdrawals.traditionalIRA + getActiveScenario().withdrawals.traditional401k).toLocaleString()}</span>
            </div>
            {results.rothConversion > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Roth Conversion:</span>
                <span className="font-medium text-indigo-600">${Math.round(results.rothConversion).toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Interest Income:</span>
              <span className="font-medium">${Math.round(personalInfo.interestIncome || 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Ordinary Dividends:</span>
              <span className="font-medium">${Math.round(personalInfo.ordinaryDividends || 0).toLocaleString()}</span>
            </div>
            {results.taxableShortTermGains > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Short-Term Capital Gains:</span>
                <span className="font-medium">${Math.round(results.taxableShortTermGains).toLocaleString()}</span>
              </div>
            )}
            {results.capitalLossDeduction > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Capital Loss Deduction:</span>
                <span className="font-medium text-green-600">-${Math.round(results.capitalLossDeduction).toLocaleString()}</span>
              </div>
            )}
            {results.excessCapitalLoss > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 text-xs italic">Loss Carryforward (future years):</span>
                <span className="font-medium text-blue-600 text-xs">${Math.round(results.excessCapitalLoss).toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between text-sm border-t pt-2">
              <span className="text-gray-700 font-medium">Total Ordinary Income:</span>
              <span className="font-bold">${Math.round(results.ordinaryIncome).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Less: Standard Deduction:</span>
              <span className="font-medium text-green-600">-${Math.round(results.baseStandardDeduction).toLocaleString()}</span>
            </div>
            {results.additionalStandardDeduction > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Less: Additional Deduction (65+):</span>
                <span className="font-medium text-green-600">-${Math.round(results.additionalStandardDeduction).toLocaleString()}</span>
              </div>
            )}
            {results.seniorDeduction > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Less: Senior Deduction (65+):</span>
                <span className="font-medium text-green-600">-${Math.round(results.seniorDeduction).toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between text-sm border-t pt-2">
              <span className="text-gray-700 font-medium">Taxable Ordinary Income:</span>
              <span className="font-bold">${Math.round(results.taxableOrdinaryIncome).toLocaleString()}</span>
            </div>
          </div>
          
          <div className="space-y-3">
            <h3 className="font-medium text-gray-700 border-b pb-2">Withdrawals</h3>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Tax-Free Withdrawals:</span>
              <span className="font-medium text-green-600">${Math.round(results.taxFreeWithdrawals).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Stock Sale Proceeds:</span>
              <span className="font-medium text-yellow-600">${Math.round(results.totalStockProceeds).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Stock Gains/Losses:</span>
              <span className={`font-medium ${results.totalStockGains >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                ${Math.round(results.totalStockGains).toLocaleString()}
              </span>
            </div>
            {(results.totalStockShortTermGains !== 0 || results.totalStockLongTermGains !== 0) && (
              <div className="flex justify-between text-xs text-gray-500 italic pl-4">
                <span>Short: ${Math.round(results.totalStockShortTermGains).toLocaleString()} | Long: ${Math.round(results.totalStockLongTermGains).toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Crypto Sale Proceeds:</span>
              <span className="font-medium text-yellow-600">${Math.round(results.totalCryptoProceeds).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Crypto Gains/Losses:</span>
              <span className={`font-medium ${results.totalCryptoGains >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                ${Math.round(results.totalCryptoGains).toLocaleString()}
              </span>
            </div>
            {(results.totalCryptoShortTermGains !== 0 || results.totalCryptoLongTermGains !== 0) && (
              <div className="flex justify-between text-xs text-gray-500 italic pl-4">
                <span>Short: ${Math.round(results.totalCryptoShortTermGains).toLocaleString()} | Long: ${Math.round(results.totalCryptoLongTermGains).toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Metal Sale Proceeds:</span>
              <span className="font-medium text-yellow-600">${Math.round(results.totalMetalProceeds).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Metal Gains/Losses:</span>
              <span className={`font-medium ${results.totalMetalGains >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                ${Math.round(results.totalMetalGains).toLocaleString()}
              </span>
            </div>
            {(results.totalMetalShortTermGains !== 0 || results.totalMetalLongTermGains !== 0) && (
              <div className="flex justify-between text-xs text-gray-500 italic pl-4">
                <span>Short: ${Math.round(results.totalMetalShortTermGains).toLocaleString()} | Long: ${Math.round(results.totalMetalLongTermGains).toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Qualified Dividends:</span>
              <span className="font-medium text-yellow-600">${Math.round(personalInfo.qualifiedDividends || 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm border-t pt-2">
              <span className="text-gray-700 font-medium">Long-Term Gains/Qual. Div:</span>
              <span className={`font-bold ${(results.taxableLongTermGains + (personalInfo.qualifiedDividends || 0)) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                ${Math.round(results.taxableLongTermGains + (personalInfo.qualifiedDividends || 0)).toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between text-sm text-xs text-gray-500 italic pl-4">
              <span>Taxed at preferential rates (0%/15%/20%)</span>
            </div>
            <div className="flex justify-between text-sm border-t pt-2 mt-2">
              <span className="text-gray-700 font-medium">Total Withdrawals:</span>
              <span className="font-bold">${Math.round(results.totalWithdrawals).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-base border-t-2 pt-3 mt-3 bg-blue-50 -mx-4 px-4 py-3 rounded-lg">
              <span className="text-gray-800 font-bold">TOTAL GROSS INCOME:</span>
              <span className="font-bold text-blue-900 text-xl">
                ${(() => {
                  const grossIncome = Math.round(
                    results.employmentIncome +
                    results.pensionIncome +
                    results.socialSecurityIncome +
                    (personalInfo.interestIncome || 0) +
                    (personalInfo.ordinaryDividends || 0) +
                    (personalInfo.qualifiedDividends || 0) +
                    results.totalStockProceeds +
                    results.totalCryptoProceeds +
                    results.totalMetalProceeds +
                    results.taxFreeWithdrawals +
                    getActiveScenario().withdrawals.traditionalIRA +
                    getActiveScenario().withdrawals.traditional401k +
                    (results.rothConversion || 0)
                  );
                  return grossIncome.toLocaleString();
                })()}
              </span>
            </div>
            <div className="flex justify-between text-sm -mx-4 px-4 py-2">
              <span className="text-gray-600">Less: Total Tax (Fed + State):</span>
              <span className="font-medium text-red-600">-${Math.round(results.totalTaxWithState).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-base border-t-2 pt-3 bg-green-50 -mx-4 px-4 py-3 rounded-lg">
              <span className="text-gray-800 font-bold">NET INCOME AFTER TAX:</span>
              <span className="font-bold text-green-700 text-xl">
                ${Math.round(
                  results.employmentIncome +
                  results.pensionIncome +
                  results.socialSecurityIncome +
                  (personalInfo.interestIncome || 0) +
                  (personalInfo.ordinaryDividends || 0) +
                  (personalInfo.qualifiedDividends || 0) +
                  results.totalStockProceeds +
                  results.totalCryptoProceeds +
                  results.totalMetalProceeds +
                  results.taxFreeWithdrawals +
                  getActiveScenario().withdrawals.traditionalIRA +
                  getActiveScenario().withdrawals.traditional401k +
                  (results.rothConversion || 0) -
                  results.totalTaxWithState
                ).toLocaleString()}
              </span>
            </div>
            {results.rothConversion > 0 && (
              <>
                <div className="flex justify-between text-sm border-t pt-3 mt-3 -mx-4 px-4 py-2">
                  <span className="text-gray-700 font-medium">Roth Conversion Amount:</span>
                  <span className="font-medium text-indigo-600">
                    ${Math.round(results.rothConversion).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between text-sm bg-blue-50 -mx-4 px-4 py-2 rounded">
                  <span className="text-gray-700 font-semibold">Net Cash After Roth Conversion:</span>
                  <span className="font-bold text-blue-700">
                    ${Math.round(
                      results.employmentIncome +
                      results.pensionIncome +
                      results.socialSecurityIncome +
                      (personalInfo.interestIncome || 0) +
                      (personalInfo.ordinaryDividends || 0) +
                      (personalInfo.qualifiedDividends || 0) +
                      results.totalStockProceeds +
                      results.totalCryptoProceeds +
                      results.totalMetalProceeds +
                      results.taxFreeWithdrawals +
                      getActiveScenario().withdrawals.traditionalIRA +
                      getActiveScenario().withdrawals.traditional401k +
                      (results.rothConversion || 0) -
                      results.totalTaxWithState -
                      results.rothConversion
                    ).toLocaleString()}
                  </span>
                </div>
              </>
            )}
          </div>
          
          <div className="space-y-3">
            <h3 className="font-medium text-gray-700 border-b pb-2">Tax Calculation</h3>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Taxable Ord. Income:</span>
              <span className="font-medium">${Math.round(results.taxableOrdinaryIncome).toLocaleString()}</span>
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
                    {results.roomInBracket > 0 ? `${Math.round(results.roomInBracket).toLocaleString()}` : 'In highest bracket'}
                  </span>
                </div>
              </>
            )}
            <div className="flex justify-between text-sm border-t pt-2">
              <span className="text-gray-600">Ordinary Income Tax:</span>
              <span className="font-medium text-red-600">${Math.round(results.ordinaryIncomeTax).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Capital Gains Tax:</span>
              <span className="font-medium text-red-600">${Math.round(results.capitalGainsTax).toLocaleString()}</span>
            </div>
            {results.niitTax > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Net Investment Income Tax ({formatRate(federalRules.niit.rate)}):</span>
                <span className="font-medium text-red-600">${Math.round(results.niitTax).toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between text-sm border-t pt-2">
              <span className="text-gray-700 font-medium">Total Tax:</span>
              <span className="font-bold text-red-600">${Math.round(results.totalTax).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Effective Rate:</span>
              <span className="font-medium">{results.effectiveRate.toFixed(2)}%</span>
            </div>
          </div>
        </div>
      </div>
      )}

      {/* Utah State Tax Analysis */}
      <div className="bg-white rounded-lg shadow p-6 mb-6 pdf-section">
        <h2 className="text-lg font-semibold mb-4 text-gray-800 flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-orange-600" />
          Utah State Tax Analysis
        </h2>

        <p className="text-sm text-gray-600 mb-4">
          Utah taxes your federal adjusted gross income at a flat {formatRate(utahTaxRate)} &mdash; capital gains included &mdash;
          then subtracts a taxpayer tax credit: {formatRate(TAX_RULES.utah.taxpayerCredit.creditRate)} of your federal standard
          deduction (plus {'$'}{TAX_RULES.utah.taxpayerCredit.personalExemption.toLocaleString()} per dependent), reduced
          by {formatRate(TAX_RULES.utah.taxpayerCredit.phaseOutRate)} of income above a phase-out amount (TC-40 lines 9&ndash;22).
          Taxable Social Security benefits also earn a Social Security credit at the same rate, which phases out at
          {' '}{formatRate(TAX_RULES.utah.socialSecurityCredit.phaseOutRate)} of income above
          {' $'}{forFilingStatus(TAX_RULES.utah.socialSecurityCredit.phaseOutThreshold, personalInfo.filingStatus).toLocaleString()}.
          Filers born in {TAX_RULES.utah.retirementCredit.bornOnOrBefore} or earlier may instead take a retirement credit of
          {' $'}{TAX_RULES.utah.retirementCredit.perPerson} each; the larger of the two is used.
          {TAX_RULES.utah.taxpayerCredit.amountsYear !== TAX_YEAR &&
            ` The credit uses Utah's ${TAX_RULES.utah.taxpayerCredit.amountsYear} amounts until the ${TAX_YEAR} ones are published.`}
        </p>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <h3 className="font-medium text-gray-700 border-b pb-2">Utah Taxable Income</h3>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Federal Adjusted Gross Income:</span>
              <span className="font-medium">${Math.round(results.utahTaxableIncome).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm border-t pt-2">
              <span className="text-gray-700 font-medium">Utah Taxable Income:</span>
              <span className="font-bold">${Math.round(results.utahTaxableIncome).toLocaleString()}</span>
            </div>
            <p className="text-xs text-gray-500">
              Utah additions and subtractions (e.g. U.S. Treasury interest) are not modeled.
            </p>
          </div>

          <div className="space-y-3">
            <h3 className="font-medium text-gray-700 border-b pb-2">Utah Tax</h3>
            {results.utahExempt ? (
              <div className="bg-green-50 border border-green-200 rounded-md p-3">
                <p className="text-sm text-green-700 font-medium">
                  ✓ Exempt from Utah income tax: federal AGI is at or below the standard deduction plus the senior deduction.
                </p>
              </div>
            ) : (
              <>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Tax at {formatRate(utahTaxRate)}:</span>
                  <span className="font-medium text-orange-600">${Math.round(results.utahTaxBeforeCredit).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 text-xs italic">Credit before phase-out ({formatRate(TAX_RULES.utah.taxpayerCredit.creditRate)} of ${Math.round(results.utahCreditBase).toLocaleString()}):</span>
                  <span className="font-medium text-xs">${Math.round(results.utahInitialCredit).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 text-xs italic">Phase-out:</span>
                  <span className="font-medium text-xs">&minus;${Math.round(Math.min(results.utahCreditPhaseOut, results.utahInitialCredit)).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Less: Taxpayer Tax Credit:</span>
                  <span className="font-medium text-green-600">&minus;${Math.round(results.utahTaxpayerCredit).toLocaleString()}</span>
                </div>
                {results.utahSSInitialCredit > 0 && results.utahRetirementCredit === 0 && (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600 text-xs italic">Social Security credit before phase-out ({formatRate(utahTaxRate)} of ${Math.round(results.taxableSocialSecurity).toLocaleString()} taxable benefits):</span>
                      <span className="font-medium text-xs">${Math.round(results.utahSSInitialCredit).toLocaleString()}</span>
                    </div>
                    {results.utahSSPhaseOut > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600 text-xs italic">Phase-out ({formatRate(TAX_RULES.utah.socialSecurityCredit.phaseOutRate)} of AGI over ${forFilingStatus(TAX_RULES.utah.socialSecurityCredit.phaseOutThreshold, personalInfo.filingStatus).toLocaleString()}):</span>
                        <span className="font-medium text-xs">&minus;${Math.round(Math.min(results.utahSSPhaseOut, results.utahSSInitialCredit)).toLocaleString()}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Less: Social Security Credit:</span>
                      <span className="font-medium text-green-600">&minus;${Math.round(results.utahSocialSecurityCredit).toLocaleString()}</span>
                    </div>
                  </>
                )}
                {results.utahRetirementCredit > 0 && (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600 text-xs italic">Retirement credit before phase-out (${TAX_RULES.utah.retirementCredit.perPerson} &times; {results.utahRetirementEligible}):</span>
                      <span className="font-medium text-xs">${Math.round(results.utahRetirementInitialCredit).toLocaleString()}</span>
                    </div>
                    {results.utahRetirementPhaseOut > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600 text-xs italic">Phase-out ({formatRate(TAX_RULES.utah.retirementCredit.phaseOutRate)} of AGI over ${forFilingStatus(TAX_RULES.utah.retirementCredit.phaseOutThreshold, personalInfo.filingStatus).toLocaleString()}):</span>
                        <span className="font-medium text-xs">&minus;${Math.round(Math.min(results.utahRetirementPhaseOut, results.utahRetirementInitialCredit)).toLocaleString()}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Less: Retirement Credit:</span>
                      <span className="font-medium text-green-600">&minus;${Math.round(results.utahRetirementCredit).toLocaleString()}</span>
                    </div>
                  </>
                )}
                {results.utahSSUsable > 0 && results.utahRetirementUsable > 0 && (
                  <p className="text-xs text-gray-500">
                    Utah allows either the Social Security credit (${Math.round(results.utahSSUsable).toLocaleString()}) or the
                    retirement credit (${Math.round(results.utahRetirementUsable).toLocaleString()}), not both; the larger is used.
                  </p>
                )}
              </>
            )}
            <div className="flex justify-between text-sm border-t pt-2">
              <span className="text-gray-700 font-medium">Total Utah Tax:</span>
              <span className="font-bold text-orange-600">${Math.round(results.totalUtahTax).toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Combined Tax Summary */}
      <div className="bg-white rounded-lg shadow p-6 mb-6 pdf-section">
        <h2 className="text-lg font-semibold mb-4 text-gray-800 flex items-center gap-2">
          <Calculator className="w-5 h-5 text-blue-600" />
          Combined Tax Summary (Federal + State)
        </h2>

        <div className="max-w-md mx-auto space-y-4">
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Federal Tax:</span>
              <span className="font-medium text-red-600">${Math.round(results.totalTax).toLocaleString()}</span>
            </div>
            {results.niitTax > 0 && (
              <div className="flex justify-between text-xs pl-4 italic">
                <span className="text-gray-500">• Includes NIIT ({formatRate(federalRules.niit.rate)}):</span>
                <span className="font-medium text-purple-600">${Math.round(results.niitTax).toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Utah State Tax:</span>
              <span className="font-medium text-orange-600">${Math.round(results.totalUtahTax).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-base border-t-2 pt-3 bg-blue-50 -mx-4 px-4 py-3 rounded-lg">
              <span className="text-gray-800 font-bold">TOTAL TAX (Federal + Utah):</span>
              <span className="font-bold text-blue-900 text-xl">${Math.round(results.totalTaxWithState).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm pt-2">
              <span className="text-gray-600">Combined Effective Rate:</span>
              <span className="font-bold text-blue-700">{results.effectiveRateWithState.toFixed(2)}%</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Total Taxable Income:</span>
              <span className="font-medium">${Math.round(results.taxableIncome).toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      <IncomeStackingChart
        results={results}
        personalInfo={personalInfo}
        ordinaryBracketsFor={ordinaryBracketsFor}
        capitalGainsBracketsFor={capitalGainsBracketsFor}
      />

      {/* Scenario Comparison Table */}
      {scenarios.length > 1 && (
        <div className="bg-white rounded-lg shadow p-6 mb-6 pdf-section">
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
                            ${results.totalWithdrawals.toLocaleString(undefined, {maximumFractionDigits: 0})}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="px-4 py-2 font-medium text-gray-700">Roth Conversion</td>
                        {allResults.map(({ scenario, results }) => (
                          <td key={scenario.id} className={`px-4 py-2 text-right ${results.rothConversion > 0 ? 'text-indigo-600 font-medium' : 'text-gray-400'} ${scenario.id === activeScenarioId ? 'bg-blue-50' : ''}`}>
                            ${results.rothConversion.toLocaleString(undefined, {maximumFractionDigits: 0})}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="px-4 py-2 font-medium text-gray-700">MAGI (for IRMAA)</td>
                        {allResults.map(({ scenario, results }) => (
                          <td key={scenario.id} className={`px-4 py-2 text-right ${scenario.id === activeScenarioId ? 'bg-blue-50' : ''}`}>
                            ${results.magi.toLocaleString(undefined, {maximumFractionDigits: 0})}
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
                            ${results.totalTax.toLocaleString(undefined, {maximumFractionDigits: 0})}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="px-4 py-2 font-medium text-gray-700 pl-8 text-sm italic">• NIIT ({formatRate(federalRules.niit.rate)})</td>
                        {allResults.map(({ scenario, results }) => (
                          <td key={scenario.id} className={`px-4 py-2 text-right text-purple-600 text-sm ${scenario.id === activeScenarioId ? 'bg-blue-50' : ''}`}>
                            ${results.niitTax.toLocaleString(undefined, {maximumFractionDigits: 0})}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="px-4 py-2 font-medium text-gray-700">Utah State Tax</td>
                        {allResults.map(({ scenario, results }) => (
                          <td key={scenario.id} className={`px-4 py-2 text-right text-orange-600 ${scenario.id === activeScenarioId ? 'bg-blue-50' : ''}`}>
                            ${results.totalUtahTax.toLocaleString(undefined, {maximumFractionDigits: 0})}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="px-4 py-2 font-medium text-gray-700">Annual Medicare Cost</td>
                        {allResults.map(({ scenario, results }) => (
                          <td key={scenario.id} className={`px-4 py-2 text-right text-blue-600 ${scenario.id === activeScenarioId ? 'bg-blue-50' : ''}`}>
                            ${results.medicare?.total.annual ? results.medicare.total.annual.toLocaleString(undefined, {maximumFractionDigits: 0}) : '0'}
                          </td>
                        ))}
                      </tr>
                      <tr className="bg-gray-50 font-semibold">
                        <td className="px-4 py-3 font-bold text-gray-800">Total Tax (Fed + State + Medicare)</td>
                        {allResults.map(({ scenario, results }) => {
                          const medicareAnnual = results.medicare?.total.annual || 0;
                          const totalCost = results.totalTaxWithState + medicareAnnual;
                          return (
                            <td key={scenario.id} className={`px-4 py-3 text-right text-blue-900 ${scenario.id === activeScenarioId ? 'bg-blue-100' : ''}`}>
                              ${totalCost.toLocaleString(undefined, {maximumFractionDigits: 0})}
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
                  <li>Consider RMDs starting at age {federalRules.rmdStartAge.default} (or {federalRules.rmdStartAge.bornIn1960OrLater} if born in 1960 or later)</li>
                  <li>This calculator uses simplified assumptions - actual taxes may vary based on state taxes, Medicare premiums, and other factors</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

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

      {/* Lot Management Modal */}
      {lotModal.isOpen && (() => {
        const asset = lotModal.assetType === 'stocks' ? stocks[lotModal.assetIndex]
          : lotModal.assetType === 'crypto' ? crypto[lotModal.assetIndex]
          : metals[lotModal.assetIndex];

        if (!asset) return null;

        // Ensure lots is an array
        const assetLots = Array.isArray(asset.lots) ? asset.lots : [];
        const quantityLabel = lotModal.assetType === 'stocks' ? 'Shares' : 'Units';

        return (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
              <div className="p-6 border-b">
                <div className="flex justify-between items-center">
                  <h2 className="text-2xl font-bold text-gray-800">
                    Manage Lots - {lotModal.assetName}
                  </h2>
                  <button
                    onClick={closeLotModal}
                    className="text-gray-500 hover:text-gray-700 text-2xl"
                  >
                    ×
                  </button>
                </div>
                <p className="text-sm text-gray-600 mt-2">
                  Current Price: <span className="font-medium">${(asset.currentPrice || 0).toFixed(2)}</span>
                </p>
              </div>

              <div className="p-6 overflow-y-auto flex-1">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold text-gray-700">
                    Lots ({assetLots.length}/20)
                  </h3>
                  <div className="flex gap-2">
                    <button
                      onClick={() => openCSVImportModal(lotModal.assetIndex, lotModal.assetType)}
                      className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm"
                    >
                      Import CSV
                    </button>
                    <button
                      onClick={() => addLot(lotModal.assetIndex, lotModal.assetType)}
                      disabled={assetLots.length >= 30}
                      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 text-sm"
                    >
                      Add Lot ({assetLots.length}/30)
                    </button>
                  </div>
                </div>

                {assetLots.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border border-gray-200">
                      <thead className="bg-gray-100">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium text-gray-700 border-b">Purchase Date</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-700 border-b">{quantityLabel}</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-700 border-b">Cost/{quantityLabel.slice(0, -1)}</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-700 border-b">Total Cost</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-700 border-b">Current Value</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-700 border-b">Gain/Loss</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-700 border-b">Gain %</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-700 border-b">Term</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-700 border-b">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {assetLots.map((lot, lotIndex) => {
                          const lotMetrics = calculateLotMetrics(lot, asset.currentPrice || 0);
                          const gainPct = lot.totalCostBasis > 0 ? (lotMetrics.gainLoss / lot.totalCostBasis) * 100 : 0;

                          return (
                            <tr key={lot.id} className="hover:bg-gray-50">
                              <td className="px-3 py-2">
                                <input
                                  type="date"
                                  value={lot.purchaseDate}
                                  onChange={(e) => updateLot(lotModal.assetIndex, lotIndex, 'purchaseDate', e.target.value, lotModal.assetType)}
                                  className="w-36 px-2 py-1 border border-gray-300 rounded text-sm"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="number"
                                  value={lot.quantity}
                                  onChange={(e) => updateLot(lotModal.assetIndex, lotIndex, 'quantity', e.target.value, lotModal.assetType)}
                                  className="w-24 px-2 py-1 border border-gray-300 rounded text-sm"
                                  step="0.01"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <PriceInput
                                  value={lot.costBasisPerUnit}
                                  onChange={(newVal) => updateLot(lotModal.assetIndex, lotIndex, 'costBasisPerUnit', newVal, lotModal.assetType)}
                                />
                              </td>
                              <td className="px-3 py-2 font-medium text-gray-700">
                                ${lot.totalCostBasis.toFixed(2)}
                              </td>
                              <td className="px-3 py-2 font-medium text-gray-700">
                                ${lotMetrics.currentValue.toFixed(2)}
                              </td>
                              <td className={`px-3 py-2 font-medium ${lotMetrics.gainLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                ${lotMetrics.gainLoss.toFixed(2)}
                              </td>
                              <td className={`px-3 py-2 font-medium ${gainPct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {gainPct.toFixed(2)}%
                              </td>
                              <td className="px-3 py-2">
                                <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${lotMetrics.isLongTerm ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                  {lotMetrics.isLongTerm ? 'Long' : 'Short'} ({Math.floor(lotMetrics.days)}d)
                                </span>
                              </td>
                              <td className="px-3 py-2">
                                <button
                                  onClick={() => removeLot(lotModal.assetIndex, lotIndex, lotModal.assetType)}
                                  className="text-red-600 hover:text-red-800 text-xs"
                                >
                                  Remove
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="bg-gray-50 font-medium">
                        <tr className="border-t-2 border-gray-300">
                          <td className="px-3 py-2 text-gray-700">Totals:</td>
                          <td className="px-3 py-2 text-gray-700">
                            {assetLots.reduce((sum, lot) => sum + (lot.quantity || 0), 0).toFixed(2)}
                          </td>
                          <td className="px-3 py-2 text-gray-700">
                            Avg: ${assetLots.length > 0 ?
                              (assetLots.reduce((sum, lot) => sum + (lot.totalCostBasis || 0), 0) /
                               assetLots.reduce((sum, lot) => sum + (lot.quantity || 0), 0)).toFixed(2)
                            : '0.00'}
                          </td>
                          <td className="px-3 py-2 text-gray-700">
                            ${assetLots.reduce((sum, lot) => sum + (lot.totalCostBasis || 0), 0).toFixed(2)}
                          </td>
                          <td className="px-3 py-2 text-gray-700">
                            ${(assetLots.reduce((sum, lot) => sum + (lot.quantity || 0), 0) * (asset.currentPrice || 0)).toFixed(2)}
                          </td>
                          <td className={`px-3 py-2 ${
                            (assetLots.reduce((sum, lot) => sum + (lot.quantity || 0), 0) * (asset.currentPrice || 0) -
                             assetLots.reduce((sum, lot) => sum + (lot.totalCostBasis || 0), 0)) >= 0
                              ? 'text-green-600' : 'text-red-600'
                          }`}>
                            ${(assetLots.reduce((sum, lot) => sum + (lot.quantity || 0), 0) * (asset.currentPrice || 0) -
                               assetLots.reduce((sum, lot) => sum + (lot.totalCostBasis || 0), 0)).toFixed(2)}
                          </td>
                          <td colSpan="3"></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-12 text-gray-500">
                    <p className="mb-2">No lots added yet.</p>
                    <p className="text-sm">Click "Add Lot" to add manually or "Import CSV" to import from your brokerage.</p>
                  </div>
                )}

                <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <h4 className="text-sm font-semibold text-gray-800 mb-2">CSV Import Format:</h4>
                  <p className="text-xs text-gray-600 mb-2">
                    Your CSV should have columns: <strong>Purchase Date (YYYY-MM-DD), Quantity, Cost Per Unit</strong>
                  </p>
                  <pre className="text-xs bg-white p-2 rounded border border-gray-300 overflow-x-auto">
{`Purchase Date,Quantity,Cost Per Unit
2023-01-15,100,45.50
2024-06-20,50,52.75`}
                  </pre>
                </div>
              </div>

              <div className="p-6 border-t bg-gray-50">
                <button
                  onClick={closeLotModal}
                  className="px-6 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}

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
      )}
    </div>
  );
}
