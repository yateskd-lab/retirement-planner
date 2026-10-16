/**
 * Tax Engine - Handles tax calculations for various scenarios
 */
class TaxEngine {
  /**
   * Calculate income tax based on progressive tax brackets
   * @param {number} income - Annual income
   * @param {Array} brackets - Tax brackets with [threshold, rate]
   * @returns {number} Tax amount
   */
  calculateIncomeTax(income, brackets) {
    let tax = 0;
    let previousThreshold = 0;
    
    for (const [threshold, rate] of brackets) {
      if (income > threshold) {
        tax += (threshold - previousThreshold) * rate;
        previousThreshold = threshold;
      } else {
        tax += (income - previousThreshold) * rate;
        break;
      }
    }
    
    return tax;
  }

  /**
   * Calculate sales tax
   * @param {number} amount - Purchase amount
   * @param {number} rate - Sales tax rate (as decimal)
   * @returns {number} Sales tax amount
   */
  calculateSalesTax(amount, rate) {
    return amount * rate;
  }

  /**
   * Calculate property tax
   * @param {number} assessedValue - Property assessed value
   * @param {number} taxRate - Tax rate per $1000 of assessed value
   * @returns {number} Property tax amount
   */
  calculatePropertyTax(assessedValue, taxRate) {
    return (assessedValue / 1000) * taxRate;
  }

  /**
   * Calculate total tax for multiple tax types
   * @param {Object} taxes - Object containing different tax calculations
   * @returns {number} Total tax amount
   */
  calculateTotalTax(taxes) {
    return Object.values(taxes).reduce((total, tax) => total + tax, 0);
  }
}

// Export the TaxEngine class
module.exports = TaxEngine;
