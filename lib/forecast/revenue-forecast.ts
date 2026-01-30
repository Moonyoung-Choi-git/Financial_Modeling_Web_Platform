// lib/forecast/revenue-forecast.ts
// Phase 3.5: Revenue Forecasting Engine

import { Decimal } from '@/lib/math';
import { RevenueDrivers } from './types';

/**
 * Forecast revenue using various driver methods
 */
export function forecastRevenue(params: {
  historicalRevenue: Decimal[]; // Last N periods
  periods: number[]; // Period indices to forecast
  drivers: RevenueDrivers;
}): Map<number, Decimal> {
  const { historicalRevenue, periods, drivers } = params;

  console.log(`[RevenueForecast] Method: ${drivers.method}, Periods: ${periods.length}`);

  // Get last historical revenue as base
  const baseRevenue = historicalRevenue[historicalRevenue.length - 1];

  if (baseRevenue.isZero() || baseRevenue.isNegative()) {
    console.warn('[RevenueForecast] Base revenue is zero or negative, using fallback');
    return createFlatForecast(periods, new Decimal(1_000_000_000)); // 1B fallback
  }

  switch (drivers.method) {
    case 'GROWTH_RATE':
      return forecastByGrowthRate(baseRevenue, periods, drivers.growthRate!);

    case 'PRICE_VOLUME':
      return forecastByPriceVolume(periods, drivers.priceVolume!);

    case 'SEGMENT':
      return forecastBySegments(periods, drivers.segments!);

    default:
      console.warn(`[RevenueForecast] Unknown method: ${drivers.method}, using flat`);
      return createFlatForecast(periods, baseRevenue);
  }
}

/**
 * Method 1: Growth Rate
 */
function forecastByGrowthRate(
  baseRevenue: Decimal,
  periods: number[],
  growthRate: NonNullable<RevenueDrivers['growthRate']>
): Map<number, Decimal> {
  const result = new Map<number, Decimal>();

  let currentRevenue = baseRevenue;

  for (const periodIdx of periods) {
    // Get growth rate for this period
    let rate: number;
    if (growthRate.byPeriod && growthRate.byPeriod.has(periodIdx)) {
      rate = growthRate.byPeriod.get(periodIdx)!;
    } else if (growthRate.annual !== undefined) {
      rate = growthRate.annual;
    } else {
      rate = 0; // No growth
    }

    // Apply growth
    if (growthRate.compound) {
      // Compound growth: Revenue[t] = Revenue[t-1] × (1 + rate)
      currentRevenue = currentRevenue.times(new Decimal(1).plus(rate));
    } else {
      // Simple growth: Revenue[t] = Revenue[0] × (1 + rate × t)
      const periodsFromBase = periodIdx - periods[0] + 1;
      currentRevenue = baseRevenue.times(new Decimal(1).plus(new Decimal(rate).times(periodsFromBase)));
    }

    result.set(periodIdx, currentRevenue);
  }

  console.log(
    `[RevenueForecast] Growth rate forecast: Base ${baseRevenue.toFixed(0)}, ` +
      `Final ${result.get(periods[periods.length - 1])!.toFixed(0)}`
  );

  return result;
}

/**
 * Method 2: Price × Volume
 */
function forecastByPriceVolume(
  periods: number[],
  priceVolume: NonNullable<RevenueDrivers['priceVolume']>
): Map<number, Decimal> {
  const result = new Map<number, Decimal>();

  let currentPrice = priceVolume.basePrice;
  let currentVolume = priceVolume.baseVolume;

  for (const periodIdx of periods) {
    // Grow price and volume
    const priceGrowthFactor = new Decimal(1).plus(priceVolume.priceGrowth);
    const volumeGrowthFactor = new Decimal(1).plus(priceVolume.volumeGrowth);

    currentPrice = currentPrice.times(priceGrowthFactor);
    currentVolume = currentVolume.times(volumeGrowthFactor);

    const revenue = currentPrice.times(currentVolume);
    result.set(periodIdx, revenue);
  }

  console.log(
    `[RevenueForecast] Price×Volume forecast: ` +
      `Base Price ${priceVolume.basePrice.toFixed(0)}, ` +
      `Base Volume ${priceVolume.baseVolume.toFixed(0)}`
  );

  return result;
}

/**
 * Method 3: Segment-based
 */
function forecastBySegments(
  periods: number[],
  segments: NonNullable<RevenueDrivers['segments']>
): Map<number, Decimal> {
  const result = new Map<number, Decimal>();

  // Calculate total base revenue
  const totalBase = segments.reduce((sum, seg) => sum.plus(seg.baseRevenue), new Decimal(0));

  for (const periodIdx of periods) {
    let totalRevenue = new Decimal(0);

    for (const segment of segments) {
      // Grow each segment independently
      const periodsFromBase = periodIdx - periods[0] + 1;
      const growthFactor = new Decimal(1).plus(segment.growthRate).pow(periodsFromBase);
      const segmentRevenue = segment.baseRevenue.times(growthFactor);

      totalRevenue = totalRevenue.plus(segmentRevenue);
    }

    result.set(periodIdx, totalRevenue);
  }

  console.log(
    `[RevenueForecast] Segment forecast: ${segments.length} segments, ` + `Base ${totalBase.toFixed(0)}`
  );

  return result;
}

/**
 * Helper: Create flat forecast
 */
function createFlatForecast(periods: number[], value: Decimal): Map<number, Decimal> {
  const result = new Map<number, Decimal>();
  for (const periodIdx of periods) {
    result.set(periodIdx, value);
  }
  return result;
}

/**
 * Calculate implied growth rate from forecasted revenue
 */
export function calculateImpliedGrowthRates(revenue: Map<number, Decimal>): Map<number, number> {
  const growthRates = new Map<number, number>();

  const sortedPeriods = Array.from(revenue.keys()).sort((a, b) => a - b);

  for (let i = 1; i < sortedPeriods.length; i++) {
    const prevPeriod = sortedPeriods[i - 1];
    const currPeriod = sortedPeriods[i];

    const prevRevenue = revenue.get(prevPeriod)!;
    const currRevenue = revenue.get(currPeriod)!;

    if (prevRevenue.isZero()) {
      growthRates.set(currPeriod, 0);
    } else {
      const growth = currRevenue.minus(prevRevenue).div(prevRevenue).toNumber();
      growthRates.set(currPeriod, growth);
    }
  }

  return growthRates;
}
