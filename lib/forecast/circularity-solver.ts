// lib/forecast/circularity-solver.ts
// Phase 3.5: Circularity Solver (Interest ↔ Debt ↔ Cash ↔ Interest)

import { Decimal } from '@/lib/math';
import { CircularityResult } from './types';

/**
 * Circularity: Interest Expense → Net Income → Cash Flow → Cash → Revolver → Interest Expense
 *
 * Solution Methods:
 * 1. Iterative: Repeatedly calculate until convergence
 * 2. Closed-form: Algebraic solution (approximation)
 */

export interface CircularityInput {
  // Core financials (without interest)
  ebit: Decimal; // Earnings Before Interest & Tax
  taxRate: number;
  nonCashCharges: Decimal; // D&A
  changeInNWC: Decimal;
  capex: Decimal;

  // Debt parameters
  termDebt: Decimal;
  termDebtRate: number;
  revolverRate: number;
  revolverCapacity: Decimal;
  minimumCash: Decimal;

  // Existing cash
  beginningCash: Decimal;

  // Other financing
  debtDrawdown?: Decimal;
  debtRepayment?: Decimal;
  dividends?: Decimal;
}

export interface CircularityOutput {
  interest: Decimal;
  netIncome: Decimal;
  operatingCashFlow: Decimal;
  freeCashFlow: Decimal;
  endingCash: Decimal;
  revolverBalance: Decimal;
  result: CircularityResult;
}

/**
 * Solve circularity using iterative method
 */
export function solveCircularityIterative(input: CircularityInput, maxIterations: number = 20, tolerance: number = 1): CircularityOutput {
  console.log('[Circularity] Solving using iterative method...');

  const convergenceLog: CircularityResult['convergenceLog'] = [];

  // Initial guess: zero revolver
  let revolver = new Decimal(0);
  let interest = input.termDebt.times(input.termDebtRate);

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    // Step 1: Calculate Net Income
    const ebt = input.ebit.minus(interest);
    const tax = Decimal.max(ebt.times(input.taxRate), 0); // No negative taxes
    const netIncome = ebt.minus(tax);

    // Step 2: Calculate Operating Cash Flow
    const operatingCashFlow = netIncome.plus(input.nonCashCharges).minus(input.changeInNWC);

    // Step 3: Calculate Free Cash Flow
    const freeCashFlow = operatingCashFlow.minus(input.capex);

    // Step 4: Calculate Financing Cash Flow
    const debtDrawdown = input.debtDrawdown || new Decimal(0);
    const debtRepayment = input.debtRepayment || new Decimal(0);
    const dividends = input.dividends || new Decimal(0);
    const financingCashFlow = debtDrawdown.minus(debtRepayment).minus(dividends);

    // Step 5: Calculate Ending Cash (before revolver adjustment)
    let endingCash = input.beginningCash.plus(freeCashFlow).plus(financingCashFlow);

    // Step 6: Adjust Revolver (PLUG!)
    let newRevolver: Decimal;

    if (endingCash.lt(input.minimumCash)) {
      // Need to draw revolver
      const shortfall = input.minimumCash.minus(endingCash);
      const draw = Decimal.min(shortfall, input.revolverCapacity.minus(revolver));
      newRevolver = revolver.plus(draw);
      endingCash = endingCash.plus(draw);
    } else {
      // Can pay down revolver
      const excess = endingCash.minus(input.minimumCash);
      const paydown = Decimal.min(excess, revolver);
      newRevolver = revolver.minus(paydown);
      endingCash = endingCash.minus(paydown);
    }

    // Step 7: Calculate New Interest
    const avgRevolver = revolver.plus(newRevolver).div(2);
    const revolverInterest = avgRevolver.times(input.revolverRate);
    const termInterest = input.termDebt.times(input.termDebtRate);
    const newInterest = termInterest.plus(revolverInterest);

    // Step 8: Check Convergence
    const error = newInterest.minus(interest).abs();

    convergenceLog.push({
      iteration,
      cash: endingCash,
      revolver: newRevolver,
      interest: newInterest,
      error,
    });

    console.log(
      `[Circularity] Iteration ${iteration}: Interest=${newInterest.toFixed(0)}, ` +
        `Revolver=${newRevolver.toFixed(0)}, Error=${error.toFixed(0)}`
    );

    // Check convergence
    if (error.lt(tolerance)) {
      console.log(`[Circularity] ✅ Converged in ${iteration + 1} iterations`);

      return {
        interest: newInterest,
        netIncome,
        operatingCashFlow,
        freeCashFlow,
        endingCash,
        revolverBalance: newRevolver,
        result: {
          converged: true,
          iterations: iteration + 1,
          finalError: error,
          convergenceLog,
        },
      };
    }

    // Update for next iteration
    interest = newInterest;
    revolver = newRevolver;
  }

  // Failed to converge
  console.warn(`[Circularity] ⚠️  Failed to converge after ${maxIterations} iterations`);

  // Return best attempt
  const ebt = input.ebit.minus(interest);
  const tax = Decimal.max(ebt.times(input.taxRate), 0);
  const netIncome = ebt.minus(tax);
  const operatingCashFlow = netIncome.plus(input.nonCashCharges).minus(input.changeInNWC);
  const freeCashFlow = operatingCashFlow.minus(input.capex);
  const endingCash = input.beginningCash.plus(freeCashFlow);

  return {
    interest,
    netIncome,
    operatingCashFlow,
    freeCashFlow,
    endingCash,
    revolverBalance: revolver,
    result: {
      converged: false,
      iterations: maxIterations,
      finalError: new Decimal(999999),
      convergenceLog,
    },
  };
}

/**
 * Solve circularity using closed-form approximation
 *
 * Assumptions:
 * - Average balance approximation
 * - No min cash constraint (simplified)
 *
 * This is faster but less accurate than iterative
 */
export function solveCircularityClosedForm(input: CircularityInput): CircularityOutput {
  console.log('[Circularity] Solving using closed-form approximation...');

  // Assume average revolver balance ≈ 0 (first approximation)
  // Then interest ≈ term debt interest only
  const termInterest = input.termDebt.times(input.termDebtRate);

  // Calculate Net Income
  const ebt = input.ebit.minus(termInterest);
  const tax = Decimal.max(ebt.times(input.taxRate), 0);
  const netIncome = ebt.minus(tax);

  // Calculate Cash Flow
  const operatingCashFlow = netIncome.plus(input.nonCashCharges).minus(input.changeInNWC);
  const freeCashFlow = operatingCashFlow.minus(input.capex);

  // Financing
  const debtDrawdown = input.debtDrawdown || new Decimal(0);
  const debtRepayment = input.debtRepayment || new Decimal(0);
  const dividends = input.dividends || new Decimal(0);
  const financingCashFlow = debtDrawdown.minus(debtRepayment).minus(dividends);

  // Ending Cash
  let endingCash = input.beginningCash.plus(freeCashFlow).plus(financingCashFlow);

  // Revolver plug
  let revolver = new Decimal(0);
  if (endingCash.lt(input.minimumCash)) {
    const shortfall = input.minimumCash.minus(endingCash);
    revolver = Decimal.min(shortfall, input.revolverCapacity);
    endingCash = endingCash.plus(revolver);
  }

  // Refine interest with revolver (one-pass)
  const revolverInterest = revolver.div(2).times(input.revolverRate); // Avg balance approx
  const totalInterest = termInterest.plus(revolverInterest);

  console.log('[Circularity] ✅ Closed-form solution (single pass)');

  return {
    interest: totalInterest,
    netIncome,
    operatingCashFlow,
    freeCashFlow,
    endingCash,
    revolverBalance: revolver,
    result: {
      converged: true, // Always "converges" in one pass
      iterations: 1,
      finalError: new Decimal(0), // Unknown (approximation)
      convergenceLog: [
        {
          iteration: 0,
          cash: endingCash,
          revolver,
          interest: totalInterest,
          error: new Decimal(0),
        },
      ],
    },
  };
}

/**
 * Choose and run circularity solver
 */
export function solveCircularity(
  input: CircularityInput,
  method: 'ITERATIVE' | 'CLOSED_FORM' = 'ITERATIVE',
  maxIterations: number = 20,
  tolerance: number = 1
): CircularityOutput {
  if (method === 'ITERATIVE') {
    return solveCircularityIterative(input, maxIterations, tolerance);
  } else {
    return solveCircularityClosedForm(input);
  }
}
