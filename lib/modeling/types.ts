import { Decimal } from "@/lib/math";

export type WaccInputs = {
  equity: Decimal.Value;
  debt: Decimal.Value;
  costOfEquity: Decimal.Value;
  costOfDebt: Decimal.Value;
  taxRate: Decimal.Value;
};

export type WaccResult = {
  wacc: Decimal;
  components: {
    equityWeight: Decimal;
    debtWeight: Decimal;
    costOfEquity: Decimal;
    costOfDebt: Decimal;
    taxRate: Decimal;
  };
};

export type DcfInputs = {
  fcf: Decimal.Value[];
  wacc: Decimal.Value;
  terminalGrowth?: Decimal.Value;
  terminalMultiple?: Decimal.Value;
  netDebt?: Decimal.Value;
  cash?: Decimal.Value;
  sharesOutstanding?: Decimal.Value;
};

export type DcfResult = {
  enterpriseValue: Decimal;
  equityValue: Decimal;
  perShareValue: Decimal | null;
  pvFcf: Decimal[];
  terminalValue: Decimal;
  pvTerminalValue: Decimal;
  discountRate: Decimal;
  terminalMethod: "perpetuity" | "multiple";
};
