// test-forecast.ts
// Phase 3.5: Full Forecast Engine Test

import { Decimal } from './lib/math';
import {
  buildFullForecastModel,
  ForecastAssumptions,
  FullForecastInput,
} from './lib/forecast';

const separator = '='.repeat(80);

async function main() {
  console.log(separator);
  console.log('FMWP Phase 3.5: Full Forecast Engine Test');
  console.log(separator);
  console.log();

  // ============================================================================
  // Setup Test Data
  // ============================================================================
  console.log('[Test] Setting up test data...\n');

  // Historical data (5 years)
  const historicalRevenue = [
    new Decimal(236_806_000_000), // 2020
    new Decimal(279_600_000_000), // 2021
    new Decimal(302_231_000_000), // 2022
    new Decimal(258_940_000_000), // 2023
    new Decimal(280_000_000_000), // 2024
  ];

  const historicalCOGS = historicalRevenue.map((r) => r.times(0.6)); // 60% COGS

  // ============================================================================
  // Forecast Assumptions
  // ============================================================================
  const assumptions: ForecastAssumptions = {
    // Revenue: 5% CAGR
    revenue: {
      method: 'GROWTH_RATE',
      growthRate: {
        annual: 0.05, // 5% per year
        compound: true,
      },
    },

    // Costs
    costs: {
      cogs: {
        method: 'PERCENT_OF_REVENUE',
        percentOfRevenue: 0.58, // Target 58% (margin expansion)
      },
      sga: {
        method: 'PERCENT_OF_REVENUE',
        percentOfRevenue: 0.25, // 25% of revenue
      },
    },

    // Working Capital
    workingCapital: {
      ar: {
        method: 'DSO',
        dso: 45, // 45 days
      },
      inventory: {
        method: 'DIO',
        dio: 60, // 60 days
      },
      ap: {
        method: 'DPO',
        dpo: 30, // 30 days
      },
      otherCA: {
        method: 'PERCENT_OF_REVENUE',
        percentOfRevenue: 0.05,
      },
      otherCL: {
        method: 'PERCENT_OF_REVENUE',
        percentOfRevenue: 0.03,
      },
    },

    // Capex: 3% of revenue
    capex: {
      method: 'PERCENT_OF_REVENUE',
      percentOfRevenue: 0.03,
    },

    // PP&E: 10% depreciation rate
    ppe: {
      depreciationMethod: 'PERCENT_OF_GROSS',
      depreciationRate: 0.10,
      trackGrossAndAccum: true,
    },

    // Debt
    debt: {
      termDebt: {
        openingBalance: new Decimal(500_000_000), // 500M
        interestRate: 0.05, // 5%
        maturityPeriod: 10,
        amortizationSchedule: [
          new Decimal(50_000_000),
          new Decimal(50_000_000),
          new Decimal(50_000_000),
          new Decimal(50_000_000),
          new Decimal(50_000_000),
        ],
      },
      revolver: {
        capacity: new Decimal(500_000_000), // 500M capacity
        interestRate: 0.06, // 6%
        minimumCash: new Decimal(100_000_000), // 100M min cash
      },
      cashSweep: {
        enabled: true,
        excessCashThreshold: new Decimal(200_000_000), // 200M
        sweepPercent: 0.5, // Pay down 50% of excess
        priority: 'REVOLVER_FIRST',
      },
    },

    // Tax: 22% effective rate
    tax: {
      method: 'EFFECTIVE_RATE',
      effectiveRate: 0.22,
    },

    // Dividend: 30% payout ratio
    dividend: {
      method: 'PAYOUT_RATIO',
      payoutRatio: 0.30,
    },

    // Circularity: Iterative solver
    circularity: {
      method: 'ITERATIVE',
      maxIterations: 20,
      tolerance: 1, // 1 KRW
    },

    version: '1.0.0',
    createdAt: new Date(),
    notes: 'Test assumptions for Phase 3.5 validation',
  };

  // ============================================================================
  // Build Full Forecast Model
  // ============================================================================
  console.log('[Test] Building Full Forecast Model...\n');

  const input: FullForecastInput = {
    entityId: 'test-entity-phase35',
    baseYear: 2024,
    historicalYears: 5,
    forecastYears: 5,
    assumptions,
    historicalRevenue,
    historicalCOGS,
    historicalWC: {
      ar: new Decimal(35_000_000_000),
      inventory: new Decimal(46_000_000_000),
      otherCA: new Decimal(14_000_000_000),
      ap: new Decimal(14_000_000_000),
      otherCL: new Decimal(8_000_000_000),
    },
    historicalPPE: {
      grossPPE: new Decimal(1_500_000_000_000), // 1.5T
      accumDep: new Decimal(500_000_000_000), // 500B
    },
    historicalDebt: {
      termDebt: new Decimal(500_000_000_000),
      revolver: new Decimal(0),
    },
    historicalCash: new Decimal(200_000_000_000), // 200B
  };

  const forecast = await buildFullForecastModel(input);

  // ============================================================================
  // Display Results
  // ============================================================================
  console.log('\n' + separator);
  console.log('FORECAST RESULTS');
  console.log(separator);
  console.log();

  // Income Statement Summary
  console.log('📊 Income Statement (5-year forecast):');
  console.log();
  console.log('Period   |   Revenue   |    COGS     |    EBIT     | Net Income');
  console.log('---------|-------------|-------------|-------------|-------------');

  for (let i = 0; i < forecast.incomeStatement.periods.length; i++) {
    const year = 2025 + i;
    const rev = forecast.incomeStatement.revenue[i];
    const cogs = forecast.incomeStatement.cogs[i];
    const ebit = forecast.incomeStatement.ebit[i];
    const ni = forecast.incomeStatement.netIncome[i];

    console.log(
      `FY${year}  | ${formatKRW(rev)} | ${formatKRW(cogs)} | ${formatKRW(ebit)} | ${formatKRW(ni)}`
    );
  }
  console.log();

  // Working Capital Summary
  console.log('💼 Working Capital Schedule:');
  console.log();
  console.log('Period   |     AR      |  Inventory  |     AP      |     NWC     | Δ NWC');
  console.log('---------|-------------|-------------|-------------|-------------|-------');

  for (let i = 0; i < forecast.workingCapitalSchedule.periods.length; i++) {
    const year = 2025 + i;
    const ar = forecast.workingCapitalSchedule.ar[i];
    const inv = forecast.workingCapitalSchedule.inventory[i];
    const ap = forecast.workingCapitalSchedule.ap[i];
    const nwc = forecast.workingCapitalSchedule.nwc[i];
    const delta = forecast.workingCapitalSchedule.changeInNwc[i];

    console.log(
      `FY${year}  | ${formatKRW(ar)} | ${formatKRW(inv)} | ${formatKRW(ap)} | ${formatKRW(nwc)} | ${formatKRW(delta)}`
    );
  }
  console.log();

  // PP&E Summary
  console.log('🏢 PP&E Schedule:');
  console.log();
  console.log('Period   |    Capex    | Depreciation |   Net PPE');
  console.log('---------|-------------|--------------|-------------');

  for (let i = 0; i < forecast.ppeSchedule.periods.length; i++) {
    const year = 2025 + i;
    const capex = forecast.ppeSchedule.capex[i];
    const dep = forecast.ppeSchedule.depExpense[i];
    const net = forecast.ppeSchedule.netPPE[i];

    console.log(`FY${year}  | ${formatKRW(capex)} | ${formatKRW(dep)} | ${formatKRW(net)}`);
  }
  console.log();

  // Debt Summary
  console.log('💰 Debt Schedule:');
  console.log();
  console.log('Period   | Term Debt   |  Revolver   | Total Debt  |  Interest');
  console.log('---------|-------------|-------------|-------------|------------');

  for (let i = 0; i < forecast.debtSchedule.periods.length; i++) {
    const year = 2025 + i;
    const term = forecast.debtSchedule.termDebtEnding[i];
    const rev = forecast.debtSchedule.revolverEnding[i];
    const total = forecast.debtSchedule.totalDebt[i];
    const interest = forecast.debtSchedule.totalInterest[i];

    console.log(`FY${year}  | ${formatKRW(term)} | ${formatKRW(rev)} | ${formatKRW(total)} | ${formatKRW(interest)}`);
  }
  console.log();

  // Circularity Results
  console.log('🔄 Circularity Results:');
  console.log(`   Converged: ${forecast.circularityResult?.converged ? '✅ YES' : '❌ NO'}`);
  console.log(`   Total Iterations: ${forecast.circularityResult?.iterations || 0}`);
  console.log(`   Final Error: ${forecast.circularityResult?.finalError.toFixed(0) || 'N/A'} KRW`);
  console.log();

  // Model Checks
  console.log('✅ Model Checks:');
  console.log(`   PP&E Roll-forward: ${forecast.checks.ppeRollForward.passed ? '✅ PASS' : '❌ FAIL'} (error: ${forecast.checks.ppeRollForward.error.toFixed(0)})`);
  console.log(`   Debt Roll-forward: ${forecast.checks.debtRollForward.passed ? '✅ PASS' : '❌ FAIL'} (error: ${forecast.checks.debtRollForward.error.toFixed(0)})`);
  console.log();

  // Performance
  console.log('⚡ Performance:');
  console.log(`   Build Duration: ${forecast.buildDurationMs}ms`);
  console.log();

  console.log(separator);
  console.log('✅ Phase 3.5 Full Forecast Engine Test Complete!');
  console.log(separator);
}

function formatKRW(value: Decimal): string {
  const billions = value.div(1_000_000_000).toNumber();
  return billions.toFixed(1).padStart(10) + 'B';
}

main().catch((error) => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
