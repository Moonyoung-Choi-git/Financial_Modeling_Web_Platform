import { Decimal, toDecimal } from "@/lib/math";
import type { DcfInputs, DcfResult } from "./types";

const ONE = new Decimal(1);

function discountFactor(rate: Decimal, period: number) {
  return ONE.plus(rate).pow(period);
}

export function computeDcf(inputs: DcfInputs): DcfResult {
  if (!inputs.fcf || inputs.fcf.length === 0) {
    throw new Error("FCF series is required");
  }

  const fcfSeries = inputs.fcf.map((value) => toDecimal(value));
  const discountRate = toDecimal(inputs.wacc);

  if (discountRate.lt(0)) {
    throw new Error("WACC must be non-negative");
  }

  const pvFcf = fcfSeries.map((value, index) =>
    value.div(discountFactor(discountRate, index + 1))
  );

  const lastFcf = fcfSeries[fcfSeries.length - 1];

  let terminalValue: Decimal;
  let terminalMethod: DcfResult["terminalMethod"] = "perpetuity";

  if (inputs.terminalMultiple !== undefined && inputs.terminalMultiple !== null) {
    const multiple = toDecimal(inputs.terminalMultiple);
    if (multiple.lte(0)) {
      throw new Error("Terminal multiple must be positive");
    }
    terminalValue = lastFcf.mul(multiple);
    terminalMethod = "multiple";
  } else {
    const growth = toDecimal(inputs.terminalGrowth ?? 0);
    if (discountRate.lte(growth)) {
      throw new Error("WACC must be greater than terminal growth");
    }
    terminalValue = lastFcf.mul(ONE.plus(growth)).div(discountRate.minus(growth));
  }

  const pvTerminalValue = terminalValue.div(
    discountFactor(discountRate, fcfSeries.length)
  );

  const enterpriseValue = pvFcf.reduce(
    (acc, value) => acc.plus(value),
    new Decimal(0)
  ).plus(pvTerminalValue);

  const netDebt =
    inputs.netDebt !== undefined && inputs.netDebt !== null
      ? toDecimal(inputs.netDebt)
      : new Decimal(0);
  const cash =
    inputs.cash !== undefined && inputs.cash !== null
      ? toDecimal(inputs.cash)
      : new Decimal(0);

  const equityValue = enterpriseValue.minus(netDebt).plus(cash);
  const perShareValue =
    inputs.sharesOutstanding !== undefined &&
    inputs.sharesOutstanding !== null
      ? equityValue.div(toDecimal(inputs.sharesOutstanding))
      : null;

  return {
    enterpriseValue,
    equityValue,
    perShareValue,
    pvFcf,
    terminalValue,
    pvTerminalValue,
    discountRate,
    terminalMethod,
  };
}
