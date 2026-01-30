// lib/forecast/types.ts
// Phase 3.5: Full Forecast Engine - Type Definitions

import { Decimal } from '@/lib/math';

// ============================================================================
// Revenue Drivers (명세서 Section 5.3)
// ============================================================================

export interface RevenueDrivers {
  method: 'GROWTH_RATE' | 'PRICE_VOLUME' | 'SEGMENT';

  // Method 1: Simple growth rate
  growthRate?: {
    annual?: number; // e.g., 0.05 = 5% growth
    byPeriod?: Map<number, number>; // Custom per period
    compound?: boolean; // CAGR vs simple
  };

  // Method 2: Price × Volume
  priceVolume?: {
    basePrice: Decimal;
    baseVolume: Decimal;
    priceGrowth: number; // Annual price increase
    volumeGrowth: number; // Annual volume increase
  };

  // Method 3: Segment-based (advanced)
  segments?: {
    name: string;
    baseRevenue: Decimal;
    growthRate: number;
    weight: number; // % of total revenue
  }[];
}

// ============================================================================
// Cost Drivers (명세서 Section 5.3)
// ============================================================================

export interface CostDrivers {
  // COGS (Cost of Goods Sold)
  cogs: {
    method: 'PERCENT_OF_REVENUE' | 'FIXED_PLUS_VARIABLE' | 'UNIT_COST';
    percentOfRevenue?: number; // e.g., 0.60 = 60% of revenue
    fixedCost?: Decimal;
    variableCostPerUnit?: Decimal;
    targetMargin?: number; // Alternative: target gross margin
  };

  // SG&A (Selling, General & Administrative)
  sga: {
    method: 'PERCENT_OF_REVENUE' | 'FIXED_PLUS_VARIABLE' | 'DETAILED';
    percentOfRevenue?: number;
    fixedCost?: Decimal;
    variablePercent?: number;
    // Detailed breakdown
    salesAndMarketing?: Decimal;
    generalAndAdmin?: Decimal;
    rd?: Decimal; // R&D
  };

  // D&A from schedules (computed, not input)
  // Depreciation & Amortization come from PP&E and Intangible schedules
}

// ============================================================================
// Working Capital Drivers (명세서 Section 5.4.1)
// ============================================================================

export interface WorkingCapitalDrivers {
  // Accounts Receivable
  ar: {
    method: 'DSO' | 'PERCENT_OF_REVENUE';
    dso?: number; // Days Sales Outstanding (e.g., 45 days)
    percentOfRevenue?: number;
  };

  // Inventory
  inventory: {
    method: 'DIO' | 'PERCENT_OF_COGS';
    dio?: number; // Days Inventory Outstanding (e.g., 60 days)
    percentOfCogs?: number;
  };

  // Accounts Payable
  ap: {
    method: 'DPO' | 'PERCENT_OF_COGS';
    dpo?: number; // Days Payable Outstanding (e.g., 30 days)
    percentOfCogs?: number;
  };

  // Other Current Assets/Liabilities
  otherCA?: {
    method: 'PERCENT_OF_REVENUE' | 'FIXED';
    percentOfRevenue?: number;
    fixedAmount?: Decimal;
  };

  otherCL?: {
    method: 'PERCENT_OF_REVENUE' | 'FIXED';
    percentOfRevenue?: number;
    fixedAmount?: Decimal;
  };
}

// ============================================================================
// Capex & PP&E Drivers (명세서 Section 5.4.2)
// ============================================================================

export interface CapexDrivers {
  method: 'PERCENT_OF_REVENUE' | 'FIXED' | 'GROWTH_LINKED';

  percentOfRevenue?: number; // e.g., 0.03 = 3% of revenue
  fixedAmount?: Decimal;
  growthLinked?: {
    base: Decimal;
    growthMultiplier: number; // Capex growth = Revenue growth × multiplier
  };
}

export interface PPEDrivers {
  // Depreciation
  depreciationMethod: 'STRAIGHT_LINE' | 'DECLINING_BALANCE' | 'PERCENT_OF_GROSS';
  depreciationRate?: number; // e.g., 0.10 = 10% per year
  usefulLife?: number; // Years

  // For detailed tracking
  trackGrossAndAccum?: boolean; // Separate Gross PP&E and Accumulated Depreciation
}

// ============================================================================
// Debt & Interest Drivers (명세서 Section 5.4.4)
// ============================================================================

export interface DebtDrivers {
  // Term Debt
  termDebt?: {
    openingBalance: Decimal;
    interestRate: number;
    maturityPeriod: number; // Periods until maturity
    amortizationSchedule?: Decimal[]; // Principal repayment per period
  };

  // Revolver (Plug for cash needs)
  revolver?: {
    capacity: Decimal;
    interestRate: number;
    commitmentFee?: number; // % on undrawn
    minimumCash: Decimal; // Draw if cash < this
  };

  // Cash Sweep
  cashSweep?: {
    enabled: boolean;
    excessCashThreshold: Decimal; // Pay down debt if cash > this
    sweepPercent: number; // % of excess to pay down
    priority: 'REVOLVER_FIRST' | 'TERM_FIRST';
  };
}

// ============================================================================
// Other Assumptions (명세서 Section 5.3, 5.4.6)
// ============================================================================

export interface TaxAssumptions {
  method: 'EFFECTIVE_RATE' | 'STATUTORY_WITH_DTL';
  effectiveRate?: number; // e.g., 0.22 = 22%
  statutoryRate?: number;
  // Deferred Tax Liabilities (DTL) - advanced
  deferredTaxes?: boolean;
}

export interface DividendAssumptions {
  method: 'PAYOUT_RATIO' | 'FIXED_DPS' | 'NONE';
  payoutRatio?: number; // e.g., 0.30 = 30% of Net Income
  fixedDPS?: Decimal; // Dividend per share
}

export interface SharesAssumptions {
  method: 'FIXED' | 'BUYBACK' | 'ISSUANCE';
  baseShares: Decimal;
  buybackPerPeriod?: Decimal;
  issuancePerPeriod?: Decimal;
}

// ============================================================================
// Comprehensive Forecast Assumptions (통합)
// ============================================================================

export interface ForecastAssumptions {
  // Core drivers
  revenue: RevenueDrivers;
  costs: CostDrivers;
  workingCapital: WorkingCapitalDrivers;
  capex: CapexDrivers;
  ppe: PPEDrivers;
  debt: DebtDrivers;

  // Other assumptions
  tax: TaxAssumptions;
  dividend: DividendAssumptions;
  shares?: SharesAssumptions;

  // Circularity (명세서 Section 5.6)
  circularity?: {
    method: 'ITERATIVE' | 'CLOSED_FORM';
    maxIterations?: number;
    tolerance?: number; // Convergence tolerance
  };

  // Metadata
  version: string;
  createdAt: Date;
  notes?: string;
}

// ============================================================================
// Supporting Schedules Output (명세서 Section 5.4)
// ============================================================================

export interface WorkingCapitalSchedule {
  periods: number[];

  // Assets
  ar: Decimal[];
  inventory: Decimal[];
  otherCA: Decimal[];

  // Liabilities
  ap: Decimal[];
  otherCL: Decimal[];

  // Net Working Capital
  nwc: Decimal[];
  changeInNwc: Decimal[]; // For Cash Flow
}

export interface PPESchedule {
  periods: number[];

  // Gross PP&E
  beginningGross: Decimal[];
  capex: Decimal[];
  disposals: Decimal[];
  endingGross: Decimal[];

  // Accumulated Depreciation
  beginningAccumDep: Decimal[];
  depExpense: Decimal[];
  depOnDisposals: Decimal[];
  endingAccumDep: Decimal[];

  // Net PP&E
  netPPE: Decimal[];
}

export interface DebtSchedule {
  periods: number[];

  // Term Debt
  termDebtBeginning: Decimal[];
  termDebtDrawdown: Decimal[];
  termDebtRepayment: Decimal[];
  termDebtEnding: Decimal[];
  termDebtInterest: Decimal[];

  // Revolver
  revolverBeginning: Decimal[];
  revolverDrawdown: Decimal[];
  revolverRepayment: Decimal[];
  revolverEnding: Decimal[];
  revolverInterest: Decimal[];

  // Total
  totalDebt: Decimal[];
  totalInterest: Decimal[];
}

export interface EquitySchedule {
  periods: number[];

  retainedEarningsBeginning: Decimal[];
  netIncome: Decimal[];
  dividends: Decimal[];
  otherAdjustments: Decimal[];
  retainedEarningsEnding: Decimal[];

  commonStock: Decimal[];
  apic: Decimal[]; // Additional Paid-In Capital
  totalEquity: Decimal[];
}

// ============================================================================
// Circularity Tracking (명세서 Section 5.6)
// ============================================================================

export interface CircularityResult {
  converged: boolean;
  iterations: number;
  finalError: Decimal;
  convergenceLog: {
    iteration: number;
    cash: Decimal;
    revolver: Decimal;
    interest: Decimal;
    error: Decimal;
  }[];
}

// ============================================================================
// Full Forecast Output (확장된 모델)
// ============================================================================

export interface FullForecastOutput {
  // Core statements (existing)
  incomeStatement: any; // From Phase 3
  balanceSheet: any;
  cashFlowStatement: any;

  // Supporting schedules (new!)
  workingCapitalSchedule: WorkingCapitalSchedule;
  ppeSchedule: PPESchedule;
  debtSchedule: DebtSchedule;
  equitySchedule: EquitySchedule;

  // Circularity
  circularityResult?: CircularityResult;

  // Checks (enhanced)
  checks: {
    bsBalance: { passed: boolean; error: Decimal };
    cfTieOut: { passed: boolean; error: Decimal };
    ppeRollForward: { passed: boolean; error: Decimal };
    debtRollForward: { passed: boolean; error: Decimal };
    reRollForward: { passed: boolean; error: Decimal };
  };

  // Metadata
  assumptions: ForecastAssumptions;
  buildTimestamp: Date;
  buildDurationMs: number;
}
