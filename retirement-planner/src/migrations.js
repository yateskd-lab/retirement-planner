// Upgrades old saved or exported data to the current shape.
// Pure functions: they read no component state and no storage.

// Migrate legacy asset to include lot tracking fields
export const migrateAsset = (asset) => {
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
export const migrateScenario = (scenario) => {
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
