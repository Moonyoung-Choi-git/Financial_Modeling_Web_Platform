// lib/forecast/ppe-schedule.ts
// Phase 3.5: PP&E & Capex Schedule with Depreciation

import { Decimal } from '@/lib/math';
import { CapexDrivers, PPEDrivers, PPESchedule } from './types';

/**
 * Build PP&E schedule with Capex and Depreciation
 */
export function buildPPESchedule(params: {
  periods: number[];
  revenue: Map<number, Decimal>;
  capexDrivers: CapexDrivers;
  ppeDrivers: PPEDrivers;
  historicalPPE?: {
    grossPPE: Decimal;
    accumDep: Decimal;
  };
}): PPESchedule {
  const { periods, revenue, capexDrivers, ppeDrivers, historicalPPE } = params;

  console.log('[PPESchedule] Building PP&E schedule...');

  const schedule: PPESchedule = {
    periods,
    beginningGross: [],
    capex: [],
    disposals: [],
    endingGross: [],
    beginningAccumDep: [],
    depExpense: [],
    depOnDisposals: [],
    endingAccumDep: [],
    netPPE: [],
  };

  // Initialize with historical values
  let prevGrossPPE = historicalPPE?.grossPPE || new Decimal(1_000_000_000); // 1B default
  let prevAccumDep = historicalPPE?.accumDep || new Decimal(0);

  // For growth-linked capex, track revenue growth
  let prevRevenue: Decimal | null = null;

  for (const periodIdx of periods) {
    const rev = revenue.get(periodIdx) || new Decimal(0);

    // ========================================================================
    // Capex Calculation
    // ========================================================================
    let capex: Decimal;

    switch (capexDrivers.method) {
      case 'PERCENT_OF_REVENUE':
        const percent = capexDrivers.percentOfRevenue || 0.03; // 3% default
        capex = rev.times(percent);
        break;

      case 'FIXED':
        capex = capexDrivers.fixedAmount || new Decimal(50_000_000); // 50M default
        break;

      case 'GROWTH_LINKED':
        if (!capexDrivers.growthLinked) {
          throw new Error('growthLinked config required');
        }
        if (!prevRevenue || prevRevenue.isZero()) {
          // First period: use base
          capex = capexDrivers.growthLinked.base;
        } else {
          // Capex growth = Revenue growth × multiplier
          const revenueGrowth = rev.minus(prevRevenue).div(prevRevenue);
          const capexGrowth = revenueGrowth.times(capexDrivers.growthLinked.growthMultiplier);
          capex = capexDrivers.growthLinked.base.times(new Decimal(1).plus(capexGrowth));
        }
        break;

      default:
        throw new Error(`Unknown capex method: ${capexDrivers.method}`);
    }

    // ========================================================================
    // Gross PP&E Roll-forward
    // ========================================================================
    const beginningGross = prevGrossPPE;
    const disposals = new Decimal(0); // Simplified: no disposals
    const endingGross = beginningGross.plus(capex).minus(disposals);

    // ========================================================================
    // Depreciation Calculation
    // ========================================================================
    let depExpense: Decimal;

    switch (ppeDrivers.depreciationMethod) {
      case 'STRAIGHT_LINE':
        if (!ppeDrivers.usefulLife) {
          throw new Error('usefulLife required for STRAIGHT_LINE');
        }
        // Simple: Depreciate entire gross PP&E over useful life
        depExpense = beginningGross.div(ppeDrivers.usefulLife);
        break;

      case 'DECLINING_BALANCE':
        // Declining balance: dep = Net PPE × rate
        if (!ppeDrivers.depreciationRate) {
          throw new Error('depreciationRate required for DECLINING_BALANCE');
        }
        const netPPE = beginningGross.minus(prevAccumDep);
        depExpense = netPPE.times(ppeDrivers.depreciationRate);
        break;

      case 'PERCENT_OF_GROSS':
        if (!ppeDrivers.depreciationRate) {
          throw new Error('depreciationRate required for PERCENT_OF_GROSS');
        }
        // Simple: dep = Gross PP&E × rate
        depExpense = beginningGross.times(ppeDrivers.depreciationRate);
        break;

      default:
        throw new Error(`Unknown depreciation method: ${ppeDrivers.depreciationMethod}`);
    }

    // ========================================================================
    // Accumulated Depreciation Roll-forward
    // ========================================================================
    const beginningAccumDep = prevAccumDep;
    const depOnDisposals = new Decimal(0); // Simplified
    const endingAccumDep = beginningAccumDep.plus(depExpense).minus(depOnDisposals);

    // ========================================================================
    // Net PP&E
    // ========================================================================
    const netPPEValue = endingGross.minus(endingAccumDep);

    // Store in schedule
    schedule.beginningGross.push(beginningGross);
    schedule.capex.push(capex);
    schedule.disposals.push(disposals);
    schedule.endingGross.push(endingGross);
    schedule.beginningAccumDep.push(beginningAccumDep);
    schedule.depExpense.push(depExpense);
    schedule.depOnDisposals.push(depOnDisposals);
    schedule.endingAccumDep.push(endingAccumDep);
    schedule.netPPE.push(netPPEValue);

    // Update for next period
    prevGrossPPE = endingGross;
    prevAccumDep = endingAccumDep;
    prevRevenue = rev;
  }

  console.log(
    `[PPESchedule] Net PP&E: Beginning ${schedule.netPPE[0].toFixed(0)}, ` +
      `Ending ${schedule.netPPE[schedule.netPPE.length - 1].toFixed(0)}`
  );
  console.log(
    `[PPESchedule] Total Capex: ${schedule.capex.reduce((sum, c) => sum.plus(c), new Decimal(0)).toFixed(0)}`
  );
  console.log(
    `[PPESchedule] Total D&A: ${schedule.depExpense.reduce((sum, d) => sum.plus(d), new Decimal(0)).toFixed(0)}`
  );

  return schedule;
}

/**
 * Verify PP&E roll-forward consistency
 */
export function verifyPPERollForward(schedule: PPESchedule): { passed: boolean; error: Decimal } {
  let maxError = new Decimal(0);

  for (let i = 0; i < schedule.periods.length; i++) {
    // Check: Ending Gross = Beginning Gross + Capex - Disposals
    const expectedGross = schedule.beginningGross[i].plus(schedule.capex[i]).minus(schedule.disposals[i]);
    const actualGross = schedule.endingGross[i];
    const error = actualGross.minus(expectedGross).abs();

    if (error.gt(maxError)) {
      maxError = error;
    }

    // Check: Ending Accum Dep = Beginning Accum Dep + Dep Expense - Dep on Disposals
    const expectedAccum = schedule.beginningAccumDep[i]
      .plus(schedule.depExpense[i])
      .minus(schedule.depOnDisposals[i]);
    const actualAccum = schedule.endingAccumDep[i];
    const depError = actualAccum.minus(expectedAccum).abs();

    if (depError.gt(maxError)) {
      maxError = depError;
    }

    // Check: Net PPE = Ending Gross - Ending Accum Dep
    const expectedNet = schedule.endingGross[i].minus(schedule.endingAccumDep[i]);
    const actualNet = schedule.netPPE[i];
    const netError = actualNet.minus(expectedNet).abs();

    if (netError.gt(maxError)) {
      maxError = netError;
    }
  }

  const passed = maxError.lt(1); // Tolerance: 1 KRW

  return { passed, error: maxError };
}
