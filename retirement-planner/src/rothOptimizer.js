// Suggests how much to convert from a Traditional IRA/401(k) to Roth.
//
// Takes the results of the scenario WITH NO conversion (baselineResults) and works out how
// much could be converted before crossing a limit, depending on the chosen strategy:
//   conservative  stay inside the current tax bracket
//   irmaa         fill up to the IRMAA threshold (less the safety buffer), even across tax brackets
//   aggressive    fill to the top of the NEXT IRMAA bracket
// The answer is never more than the Traditional IRA/401(k) balance available.
// A room of Infinity means there is no ceiling above (the top bracket).

export const computeRothOptimization = ({
  baselineResults, irmaaBrackets, irmaaBuffer, rothOptimizationStrategy, accounts,
}) => {
  // Calculate constraints with IRMAA buffer applied
  const taxBracketRoom = baselineResults.roomInBracket > 0 ? baselineResults.roomInBracket : 0;
  const irmaaRoomRaw = baselineResults.roomToNextIRMAABracket > 0 ? baselineResults.roomToNextIRMAABracket : 0;
  const irmaaRoom = Math.max(0, irmaaRoomRaw - irmaaBuffer); // Apply buffer
  const niitRoom = baselineResults.magi < baselineResults.niitThreshold
    ? baselineResults.niitThreshold - baselineResults.magi
    : 0;

  // Find next IRMAA bracket threshold for aggressive mode
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

  return { optimalAmount, limitingFactor, reason, taxBracketRoom, irmaaRoom, niitRoom, roomToNextIRMAABracket };
};
