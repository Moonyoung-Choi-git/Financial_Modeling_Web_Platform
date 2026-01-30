// lib/forecast/cost-forecast.ts
// Phase 3.5: Cost Forecasting Engine (COGS, SG&A)

import { Decimal } from '@/lib/math';
import { CostDrivers } from './types';

/**
 * Forecast COGS (Cost of Goods Sold)
 */
export function forecastCOGS(params: {
  revenue: Map<number, Decimal>;
  drivers: CostDrivers['cogs'];
  volume?: Map<number, Decimal>; // Optional for unit cost method
}): Map<number, Decimal> {
  const { revenue, drivers, volume } = params;

  console.log(`[COGSForecast] Method: ${drivers.method}`);

  const result = new Map<number, Decimal>();

  for (const [periodIdx, rev] of revenue.entries()) {
    let cogs: Decimal;

    switch (drivers.method) {
      case 'PERCENT_OF_REVENUE':
        if (drivers.percentOfRevenue === undefined) {
          throw new Error('percentOfRevenue is required for PERCENT_OF_REVENUE method');
        }
        cogs = rev.times(drivers.percentOfRevenue);
        break;

      case 'FIXED_PLUS_VARIABLE':
        if (drivers.fixedCost === undefined || drivers.variableCostPerUnit === undefined) {
          throw new Error('fixedCost and variableCostPerUnit required for FIXED_PLUS_VARIABLE');
        }
        const variableCost = volume
          ? drivers.variableCostPerUnit.times(volume.get(periodIdx) || 0)
          : rev.times(0.5); // Fallback: assume 50% variable
        cogs = drivers.fixedCost.plus(variableCost);
        break;

      case 'UNIT_COST':
        if (drivers.variableCostPerUnit === undefined || !volume) {
          throw new Error('variableCostPerUnit and volume required for UNIT_COST');
        }
        cogs = drivers.variableCostPerUnit.times(volume.get(periodIdx) || 0);
        break;

      default:
        throw new Error(`Unknown COGS method: ${drivers.method}`);
    }

    result.set(periodIdx, cogs);
  }

  // Calculate average COGS %
  const avgCogsPercent =
    Array.from(result.entries())
      .map(([idx, cogs]) => cogs.div(revenue.get(idx)!).toNumber())
      .reduce((sum, pct) => sum + pct, 0) / result.size;

  console.log(`[COGSForecast] Average COGS %: ${(avgCogsPercent * 100).toFixed(1)}%`);

  return result;
}

/**
 * Forecast SG&A (Selling, General & Administrative)
 */
export function forecastSGA(params: { revenue: Map<number, Decimal>; drivers: CostDrivers['sga'] }): Map<
  number,
  Decimal
> {
  const { revenue, drivers } = params;

  console.log(`[SGAForecast] Method: ${drivers.method}`);

  const result = new Map<number, Decimal>();

  for (const [periodIdx, rev] of revenue.entries()) {
    let sga: Decimal;

    switch (drivers.method) {
      case 'PERCENT_OF_REVENUE':
        if (drivers.percentOfRevenue === undefined) {
          throw new Error('percentOfRevenue is required');
        }
        sga = rev.times(drivers.percentOfRevenue);
        break;

      case 'FIXED_PLUS_VARIABLE':
        if (drivers.fixedCost === undefined || drivers.variablePercent === undefined) {
          throw new Error('fixedCost and variablePercent required');
        }
        const variableSGA = rev.times(drivers.variablePercent);
        sga = drivers.fixedCost.plus(variableSGA);
        break;

      case 'DETAILED':
        if (!drivers.salesAndMarketing || !drivers.generalAndAdmin) {
          throw new Error('Detailed breakdown required');
        }
        sga = drivers.salesAndMarketing
          .plus(drivers.generalAndAdmin)
          .plus(drivers.rd || new Decimal(0));
        break;

      default:
        throw new Error(`Unknown SG&A method: ${drivers.method}`);
    }

    result.set(periodIdx, sga);
  }

  // Calculate average SG&A %
  const avgSgaPercent =
    Array.from(result.entries())
      .map(([idx, sgaVal]) => sgaVal.div(revenue.get(idx)!).toNumber())
      .reduce((sum, pct) => sum + pct, 0) / result.size;

  console.log(`[SGAForecast] Average SG&A %: ${(avgSgaPercent * 100).toFixed(1)}%`);

  return result;
}

/**
 * Calculate Operating Margin
 */
export function calculateOperatingMargin(params: {
  revenue: Map<number, Decimal>;
  cogs: Map<number, Decimal>;
  sga: Map<number, Decimal>;
  da?: Map<number, Decimal>; // Depreciation & Amortization
}): Map<number, number> {
  const { revenue, cogs, sga, da } = params;
  const margins = new Map<number, number>();

  for (const [periodIdx, rev] of revenue.entries()) {
    const cogsVal = cogs.get(periodIdx) || new Decimal(0);
    const sgaVal = sga.get(periodIdx) || new Decimal(0);
    const daVal = da?.get(periodIdx) || new Decimal(0);

    const operatingIncome = rev.minus(cogsVal).minus(sgaVal).minus(daVal);
    const margin = rev.isZero() ? 0 : operatingIncome.div(rev).toNumber();

    margins.set(periodIdx, margin);
  }

  return margins;
}

/**
 * Calculate EBITDA Margin
 */
export function calculateEBITDAMargin(params: {
  revenue: Map<number, Decimal>;
  cogs: Map<number, Decimal>;
  sga: Map<number, Decimal>;
}): Map<number, number> {
  const { revenue, cogs, sga } = params;
  const margins = new Map<number, number>();

  for (const [periodIdx, rev] of revenue.entries()) {
    const cogsVal = cogs.get(periodIdx) || new Decimal(0);
    const sgaVal = sga.get(periodIdx) || new Decimal(0);

    const ebitda = rev.minus(cogsVal).minus(sgaVal);
    const margin = rev.isZero() ? 0 : ebitda.div(rev).toNumber();

    margins.set(periodIdx, margin);
  }

  return margins;
}
