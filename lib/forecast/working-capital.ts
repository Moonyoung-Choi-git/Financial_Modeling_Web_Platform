// lib/forecast/working-capital.ts
// Phase 3.5: Working Capital Schedule (DSO/DIO/DPO)

import { Decimal } from '@/lib/math';
import { WorkingCapitalDrivers, WorkingCapitalSchedule } from './types';

/**
 * Build Working Capital schedule based on drivers
 */
export function buildWorkingCapitalSchedule(params: {
  periods: number[];
  revenue: Map<number, Decimal>;
  cogs: Map<number, Decimal>;
  drivers: WorkingCapitalDrivers;
  historicalWC?: {
    ar: Decimal;
    inventory: Decimal;
    otherCA: Decimal;
    ap: Decimal;
    otherCL: Decimal;
  };
}): WorkingCapitalSchedule {
  const { periods, revenue, cogs, drivers, historicalWC } = params;

  console.log('[WCSchedule] Building Working Capital schedule...');

  const schedule: WorkingCapitalSchedule = {
    periods,
    ar: [],
    inventory: [],
    otherCA: [],
    ap: [],
    otherCL: [],
    nwc: [],
    changeInNwc: [],
  };

  // Previous period values (for ΔNW calculation)
  let prevAR = historicalWC?.ar || new Decimal(0);
  let prevInventory = historicalWC?.inventory || new Decimal(0);
  let prevOtherCA = historicalWC?.otherCA || new Decimal(0);
  let prevAP = historicalWC?.ap || new Decimal(0);
  let prevOtherCL = historicalWC?.otherCL || new Decimal(0);

  for (const periodIdx of periods) {
    const rev = revenue.get(periodIdx) || new Decimal(0);
    const cogsVal = cogs.get(periodIdx) || new Decimal(0);

    // ========================================================================
    // Accounts Receivable (AR)
    // ========================================================================
    let ar: Decimal;
    if (drivers.ar.method === 'DSO') {
      // DSO = (AR / Revenue) × 365
      // AR = (Revenue / 365) × DSO
      const dso = drivers.ar.dso || 45;
      ar = rev.div(365).times(dso);
    } else {
      // PERCENT_OF_REVENUE
      const percent = drivers.ar.percentOfRevenue || 0.1;
      ar = rev.times(percent);
    }

    // ========================================================================
    // Inventory
    // ========================================================================
    let inventory: Decimal;
    if (drivers.inventory.method === 'DIO') {
      // DIO = (Inventory / COGS) × 365
      // Inventory = (COGS / 365) × DIO
      const dio = drivers.inventory.dio || 60;
      inventory = cogsVal.div(365).times(dio);
    } else {
      // PERCENT_OF_COGS
      const percent = drivers.inventory.percentOfCogs || 0.15;
      inventory = cogsVal.times(percent);
    }

    // ========================================================================
    // Other Current Assets
    // ========================================================================
    let otherCA: Decimal;
    if (drivers.otherCA?.method === 'PERCENT_OF_REVENUE') {
      const percent = drivers.otherCA.percentOfRevenue || 0.05;
      otherCA = rev.times(percent);
    } else {
      otherCA = drivers.otherCA?.fixedAmount || new Decimal(0);
    }

    // ========================================================================
    // Accounts Payable (AP)
    // ========================================================================
    let ap: Decimal;
    if (drivers.ap.method === 'DPO') {
      // DPO = (AP / COGS) × 365
      // AP = (COGS / 365) × DPO
      const dpo = drivers.ap.dpo || 30;
      ap = cogsVal.div(365).times(dpo);
    } else {
      // PERCENT_OF_COGS
      const percent = drivers.ap.percentOfCogs || 0.08;
      ap = cogsVal.times(percent);
    }

    // ========================================================================
    // Other Current Liabilities
    // ========================================================================
    let otherCL: Decimal;
    if (drivers.otherCL?.method === 'PERCENT_OF_REVENUE') {
      const percent = drivers.otherCL.percentOfRevenue || 0.03;
      otherCL = rev.times(percent);
    } else {
      otherCL = drivers.otherCL?.fixedAmount || new Decimal(0);
    }

    // ========================================================================
    // Net Working Capital (NWC)
    // ========================================================================
    const nwc = ar.plus(inventory).plus(otherCA).minus(ap).minus(otherCL);

    // ========================================================================
    // Change in NWC (for Cash Flow)
    // ========================================================================
    const prevNWC = prevAR.plus(prevInventory).plus(prevOtherCA).minus(prevAP).minus(prevOtherCL);
    const changeInNwc = nwc.minus(prevNWC);

    // Store in schedule
    schedule.ar.push(ar);
    schedule.inventory.push(inventory);
    schedule.otherCA.push(otherCA);
    schedule.ap.push(ap);
    schedule.otherCL.push(otherCL);
    schedule.nwc.push(nwc);
    schedule.changeInNwc.push(changeInNwc);

    // Update previous values
    prevAR = ar;
    prevInventory = inventory;
    prevOtherCA = otherCA;
    prevAP = ap;
    prevOtherCL = otherCL;
  }

  console.log(
    `[WCSchedule] NWC: Beginning ${schedule.nwc[0].toFixed(0)}, ` +
      `Ending ${schedule.nwc[schedule.nwc.length - 1].toFixed(0)}`
  );

  return schedule;
}

/**
 * Calculate average DSO from AR and Revenue
 */
export function calculateDSO(ar: Decimal, revenue: Decimal): number {
  if (revenue.isZero()) return 0;
  return ar.div(revenue).times(365).toNumber();
}

/**
 * Calculate average DIO from Inventory and COGS
 */
export function calculateDIO(inventory: Decimal, cogs: Decimal): number {
  if (cogs.isZero()) return 0;
  return inventory.div(cogs).times(365).toNumber();
}

/**
 * Calculate average DPO from AP and COGS
 */
export function calculateDPO(ap: Decimal, cogs: Decimal): number {
  if (cogs.isZero()) return 0;
  return ap.div(cogs).times(365).toNumber();
}

/**
 * Calculate Cash Conversion Cycle (CCC)
 * CCC = DSO + DIO - DPO
 */
export function calculateCashConversionCycle(dso: number, dio: number, dpo: number): number {
  return dso + dio - dpo;
}
