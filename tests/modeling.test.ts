import test from "node:test";
import assert from "node:assert/strict";
import { computeWacc } from "../lib/modeling/wacc";
import { computeDcf } from "../lib/modeling/dcf";

const approxEqual = (actual: number, expected: number, tolerance = 1e-6) => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `Expected ${actual} to be within ${tolerance} of ${expected}`
  );
};

test("computeWacc returns weighted average cost", () => {
  const result = computeWacc({
    equity: 60,
    debt: 40,
    costOfEquity: 0.12,
    costOfDebt: 0.06,
    taxRate: 0.25,
  });

  approxEqual(result.wacc.toNumber(), 0.09, 1e-10);
});

test("computeDcf uses perpetuity growth when no multiple", () => {
  const result = computeDcf({
    fcf: [100, 110, 120],
    wacc: 0.1,
    terminalGrowth: 0.03,
  });

  approxEqual(result.enterpriseValue.toNumber(), 1598.583234946871, 1e-6);
  assert.equal(result.terminalMethod, "perpetuity");
});

test("computeDcf uses terminal multiple when provided", () => {
  const result = computeDcf({
    fcf: [100, 110, 120],
    wacc: 0.1,
    terminalMultiple: 8,
  });

  approxEqual(result.enterpriseValue.toNumber(), 993.2381667918855, 1e-6);
  assert.equal(result.terminalMethod, "multiple");
});
