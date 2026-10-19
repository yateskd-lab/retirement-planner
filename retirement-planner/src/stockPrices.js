// Stock price lookup. The component passes in the state and setters it needs; this file
// reads no component state of its own.

// Fetch current stock price using multiple fallback APIs
export const fetchStockPrice = async (ticker, { apiKey, addDebugLog }) => {
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
export const updateAllStockPrices = async ({
  stocksRef, setStocks, setDebugLog, setLoadingPrices, setSaveStatus, apiKey, addDebugLog,
}) => {
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
      const price = await fetchStockPrice(ticker, { apiKey, addDebugLog });
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
