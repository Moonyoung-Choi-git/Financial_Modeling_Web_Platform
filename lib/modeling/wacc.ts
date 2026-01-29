import { Decimal, toDecimal } from "@/lib/math";
import type { WaccInputs, WaccResult } from "./types";

const ONE = new Decimal(1);

export function computeWacc(inputs: WaccInputs): WaccResult {
  const equity = toDecimal(inputs.equity);
  const debt = toDecimal(inputs.debt);
  const costOfEquity = toDecimal(inputs.costOfEquity);
  const costOfDebt = toDecimal(inputs.costOfDebt);
  const taxRate = toDecimal(inputs.taxRate);

  const total = equity.plus(debt);
  if (total.lte(0)) {
    throw new Error("Capital structure total must be positive");
  }

  const equityWeight = equity.div(total);
  const debtWeight = debt.div(total);
  const wacc = equityWeight
    .mul(costOfEquity)
    .plus(debtWeight.mul(costOfDebt).mul(ONE.minus(taxRate)));

  return {
    wacc,
    components: {
      equityWeight,
      debtWeight,
      costOfEquity,
      costOfDebt,
      taxRate,
    },
  };
}
