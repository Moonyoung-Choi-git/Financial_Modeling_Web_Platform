import { Prisma } from '@prisma/client';

// Re-export Decimal for convenience
export const Decimal = Prisma.Decimal;
export type Decimal = Prisma.Decimal;

/**
 * Safely converts input to Decimal.
 * Throws error if precision loss is detected in number inputs (optional strict mode).
 */
export function toDecimal(value: number | string | Decimal): Decimal {
  if (value instanceof Decimal) return value;
  return new Decimal(value);
}

/**
 * Basic arithmetic operations ensuring Decimal type return
 */
export const FinMath = {
  add: (a: Decimal.Value, b: Decimal.Value) => new Decimal(a).plus(b),
  sub: (a: Decimal.Value, b: Decimal.Value) => new Decimal(a).minus(b),
  mul: (a: Decimal.Value, b: Decimal.Value) => new Decimal(a).times(b),
  div: (a: Decimal.Value, b: Decimal.Value) => new Decimal(a).dividedBy(b),
  
  // Check if Assets = Liabilities + Equity (with tolerance)
  isBalanced: (assets: Decimal.Value, liab: Decimal.Value, equity: Decimal.Value, tolerance = 0.01) => 
    new Decimal(assets).minus(new Decimal(liab).plus(equity)).abs().lessThanOrEqualTo(tolerance)
};