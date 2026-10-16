import React, { useState, useEffect, useRef } from 'react';
import { Calculator, DollarSign, TrendingDown, AlertCircle, Save, Download, Upload, RotateCcw, Users, FileText } from 'lucide-react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import IncomeStackingChart from './components/IncomeStackingChart';
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
