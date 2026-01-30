// lib/forecast/debt-schedule.ts
// Phase 3.5: Debt Schedule with Interest & Cash Sweep (Circularity Core)

import { Decimal } from '@/lib/math';
import { DebtDrivers, DebtSchedule } from './types';

/**
 * Build Debt schedule with Revolver as plug
 * NOTE: This creates circularity: Interest depends on Debt, Debt depends on Cash, Cash depends on Interest
 */
export function buildDebtSchedule(params: {
  periods: number[];
  drivers: DebtDrivers;
  freeCashFlow: Map<number, Decimal>; // From operations & investing
  cashBalance: Map<number, Decimal>; // Will be updated iteratively
}): DebtSchedule {
  const { periods, drivers, freeCashFlow, cashBalance } = params;

  console.log('[DebtSchedule] Building Debt schedule with circularity...');

  const schedule: DebtSchedule = {
    periods,
    termDebtBeginning: [],
    termDebtDrawdown: [],
    termDebtRepayment: [],
    termDebtEnding: [],
    termDebtInterest: [],
    revolverBeginning: [],
    revolverDrawdown: [],
    revolverRepayment: [],
    revolverEnding: [],
    revolverInterest: [],
    totalDebt: [],
    totalInterest: [],
  };

  // Initialize
  let prevTermDebt = drivers.termDebt?.openingBalance || new Decimal(0);
  let prevRevolver = new Decimal(0); // Revolver starts at 0

  for (const periodIdx of periods) {
    const fcf = freeCashFlow.get(periodIdx) || new Decimal(0);
    const cash = cashBalance.get(periodIdx) || new Decimal(0);

    // ========================================================================
    // Term Debt Roll-forward
    // ========================================================================
    const termDebtBeginning = prevTermDebt;
    let termDebtDrawdown = new Decimal(0); // No new term debt (simplified)
    let termDebtRepayment = new Decimal(0);

    // Calculate scheduled repayment
    if (drivers.termDebt?.amortizationSchedule) {
      const periodOffset = periodIdx - periods[0];
      if (periodOffset < drivers.termDebt.amortizationSchedule.length) {
        termDebtRepayment = drivers.termDebt.amortizationSchedule[periodOffset];
      }
    }

    const termDebtEnding = termDebtBeginning.plus(termDebtDrawdown).minus(termDebtRepayment);

    // Term debt interest (average balance × rate)
    const avgTermDebt = termDebtBeginning.plus(termDebtEnding).div(2);
    const termRate = drivers.termDebt?.interestRate || 0.05;
    const termDebtInterest = avgTermDebt.times(termRate);

    // ========================================================================
    // Revolver Roll-forward (PLUG!)
    // ========================================================================
    const revolverBeginning = prevRevolver;
    const minCash = drivers.revolver?.minimumCash || new Decimal(100_000_000); // 100M default
    const capacity = drivers.revolver?.capacity || new Decimal(500_000_000); // 500M default

    let revolverDrawdown = new Decimal(0);
    let revolverRepayment = new Decimal(0);

    // Check if need to draw (cash < min cash)
    if (cash.lt(minCash)) {
      const shortfall = minCash.minus(cash);
      revolverDrawdown = Decimal.min(shortfall, capacity.minus(revolverBeginning));
    }

    // Check if can sweep (cash > threshold)
    if (drivers.cashSweep?.enabled) {
      const threshold = drivers.cashSweep.excessCashThreshold;
      if (cash.gt(threshold)) {
        const excess = cash.minus(threshold);
        const sweepAmount = excess.times(drivers.cashSweep.sweepPercent || 1.0);

        // Pay down revolver first (typical priority)
        if (revolverBeginning.gt(0)) {
          revolverRepayment = Decimal.min(sweepAmount, revolverBeginning);
        } else if (termDebtEnding.gt(0)) {
          // Pay down term debt (advanced)
          termDebtRepayment = termDebtRepayment.plus(Decimal.min(sweepAmount, termDebtEnding));
        }
      }
    }

    const revolverEnding = revolverBeginning.plus(revolverDrawdown).minus(revolverRepayment);

    // Revolver interest
    const avgRevolver = revolverBeginning.plus(revolverEnding).div(2);
    const revolverRate = drivers.revolver?.interestRate || 0.06;
    const revolverInterest = avgRevolver.times(revolverRate);

    // Commitment fee on undrawn (optional)
    const commitmentFee = drivers.revolver?.commitmentFee
      ? capacity.minus(avgRevolver).times(drivers.revolver.commitmentFee)
      : new Decimal(0);

    // ========================================================================
    // Totals
    // ========================================================================
    const totalDebt = termDebtEnding.plus(revolverEnding);
    const totalInterest = termDebtInterest.plus(revolverInterest).plus(commitmentFee);

    // Store in schedule
    schedule.termDebtBeginning.push(termDebtBeginning);
    schedule.termDebtDrawdown.push(termDebtDrawdown);
    schedule.termDebtRepayment.push(termDebtRepayment);
    schedule.termDebtEnding.push(termDebtEnding);
    schedule.termDebtInterest.push(termDebtInterest);

    schedule.revolverBeginning.push(revolverBeginning);
    schedule.revolverDrawdown.push(revolverDrawdown);
    schedule.revolverRepayment.push(revolverRepayment);
    schedule.revolverEnding.push(revolverEnding);
    schedule.revolverInterest.push(revolverInterest);

    schedule.totalDebt.push(totalDebt);
    schedule.totalInterest.push(totalInterest);

    // Update for next period
    prevTermDebt = termDebtEnding;
    prevRevolver = revolverEnding;
  }

  console.log(
    `[DebtSchedule] Total Debt: Beginning ${schedule.totalDebt[0].toFixed(0)}, ` +
      `Ending ${schedule.totalDebt[schedule.totalDebt.length - 1].toFixed(0)}`
  );
  console.log(
    `[DebtSchedule] Total Interest: ${schedule.totalInterest.reduce((sum, i) => sum.plus(i), new Decimal(0)).toFixed(0)}`
  );

  return schedule;
}

/**
 * Verify Debt roll-forward consistency
 */
export function verifyDebtRollForward(schedule: DebtSchedule): { passed: boolean; error: Decimal } {
  let maxError = new Decimal(0);

  for (let i = 0; i < schedule.periods.length; i++) {
    // Check: Term Debt Ending = Beginning + Drawdown - Repayment
    const expectedTerm = schedule.termDebtBeginning[i]
      .plus(schedule.termDebtDrawdown[i])
      .minus(schedule.termDebtRepayment[i]);
    const actualTerm = schedule.termDebtEnding[i];
    const termError = actualTerm.minus(expectedTerm).abs();

    if (termError.gt(maxError)) {
      maxError = termError;
    }

    // Check: Revolver Ending = Beginning + Drawdown - Repayment
    const expectedRevolver = schedule.revolverBeginning[i]
      .plus(schedule.revolverDrawdown[i])
      .minus(schedule.revolverRepayment[i]);
    const actualRevolver = schedule.revolverEnding[i];
    const revolverError = actualRevolver.minus(expectedRevolver).abs();

    if (revolverError.gt(maxError)) {
      maxError = revolverError;
    }

    // Check: Total Debt = Term + Revolver
    const expectedTotal = schedule.termDebtEnding[i].plus(schedule.revolverEnding[i]);
    const actualTotal = schedule.totalDebt[i];
    const totalError = actualTotal.minus(expectedTotal).abs();

    if (totalError.gt(maxError)) {
      maxError = totalError;
    }
  }

  const passed = maxError.lt(1); // Tolerance: 1 KRW

  return { passed, error: maxError };
}

/**
 * Calculate Debt Service Coverage Ratio (DSCR)
 * DSCR = (EBITDA - Capex - Taxes) / (Interest + Principal Repayment)
 */
export function calculateDSCR(params: {
  ebitda: Decimal;
  capex: Decimal;
  taxes: Decimal;
  interest: Decimal;
  principalRepayment: Decimal;
}): number {
  const { ebitda, capex, taxes, interest, principalRepayment } = params;

  const numerator = ebitda.minus(capex).minus(taxes);
  const denominator = interest.plus(principalRepayment);

  if (denominator.isZero()) return 999; // Infinite (no debt service)

  return numerator.div(denominator).toNumber();
}

/**
 * Calculate Net Debt
 * Net Debt = Total Debt - Cash
 */
export function calculateNetDebt(totalDebt: Decimal, cash: Decimal): Decimal {
  return totalDebt.minus(cash);
}

/**
 * Calculate Net Debt / EBITDA ratio
 */
export function calculateNetDebtToEBITDA(netDebt: Decimal, ebitda: Decimal): number {
  if (ebitda.isZero()) return 999; // Undefined
  return netDebt.div(ebitda).toNumber();
}
