'use client';

import StatementTable, { ComputeCtx, RowDef, StatementYearData } from '@/components/statement-table';

const REVENUE_CODES = ['IS.REVENUE', '매출액', '수익(매출액)', '영업수익'];
const COGS_CODES = ['IS.COGS', '매출원가'];
const GROSS_PROFIT_CODES = ['IS.GROSS_PROFIT', '매출총이익', '매출총이익(손실)'];
const SGA_CODES = ['IS.SGA', '판매비와관리비', '판매비와일반관리비'];
const DA_CODES = ['IS.DA', '감가상각비', '감가상각비및무형자산상각비'];
const EBITDA_CODES = ['IS.EBITDA', 'EBITDA'];
const EBIT_CODES = ['IS.EBIT', '영업이익', '영업이익(손실)'];
const INTEREST_INCOME_CODES = ['IS.INTEREST_INCOME', '이자수익', '금융수익'];
const INTEREST_EXPENSE_CODES = ['IS.INTEREST_EXPENSE', '이자비용', '금융비용'];
const OTHER_INCOME_CODES = ['IS.OTHER_INCOME', '영업외수익', '기타수익'];
const OTHER_EXPENSE_CODES = ['IS.OTHER_EXPENSE', '영업외비용', '기타비용'];
const EBT_CODES = ['IS.EBT', '법인세비용차감전순이익', '법인세비용차감전계속영업이익'];
const TAX_CODES = ['IS.TAXES', '법인세비용'];
const NET_INCOME_CODES = ['IS.NET_INCOME', '당기순이익', '당기순이익(손실)'];

const revenueValue = (year: number, ctx: ComputeCtx) => ctx.valueOf(REVENUE_CODES, year);
const cogsValue = (year: number, ctx: ComputeCtx) => ctx.valueOf(COGS_CODES, year);
const sgaValue = (year: number, ctx: ComputeCtx) => ctx.valueOf(SGA_CODES, year);
const daValue = (year: number, ctx: ComputeCtx) => ctx.valueOf(DA_CODES, year);
const interestIncomeValue = (year: number, ctx: ComputeCtx) =>
  ctx.valueOf(INTEREST_INCOME_CODES, year);
const interestExpenseValue = (year: number, ctx: ComputeCtx) =>
  ctx.valueOf(INTEREST_EXPENSE_CODES, year);

const grossProfitValue = (year: number, ctx: ComputeCtx) => {
  const gp = ctx.valueOf(GROSS_PROFIT_CODES, year);
  if (gp != null) return gp;
  const rev = revenueValue(year, ctx);
  const cogs = cogsValue(year, ctx);
  if (rev == null || cogs == null) return null;
  return rev - cogs;
};

const operatingIncomeValue = (year: number, ctx: ComputeCtx) => {
  const ebit = ctx.valueOf(EBIT_CODES, year);
  if (ebit != null) return ebit;
  const gp = grossProfitValue(year, ctx);
  const sga = sgaValue(year, ctx);
  if (gp == null || sga == null) return null;
  return gp - sga;
};

const ebitdaValue = (year: number, ctx: ComputeCtx) => {
  const ebitda = ctx.valueOf(EBITDA_CODES, year);
  if (ebitda != null) return ebitda;
  const ebit = operatingIncomeValue(year, ctx);
  const da = daValue(year, ctx);
  if (ebit == null || da == null) return null;
  return ebit + Math.abs(da);
};

const ebtValue = (year: number, ctx: ComputeCtx) => {
  const ebt = ctx.valueOf(EBT_CODES, year);
  if (ebt != null) return ebt;
  const op = operatingIncomeValue(year, ctx);
  if (op == null) return null;
  const interestIncome = interestIncomeValue(year, ctx);
  const interestExpense = interestExpenseValue(year, ctx);
  const otherIncome = ctx.valueOf(OTHER_INCOME_CODES, year);
  const otherExpense = ctx.valueOf(OTHER_EXPENSE_CODES, year);
  return (
    op +
    (interestIncome ?? 0) -
    (interestExpense ?? 0) +
    (otherIncome ?? 0) -
    (otherExpense ?? 0)
  );
};

const netIncomeValue = (year: number, ctx: ComputeCtx) => {
  const net = ctx.valueOf(NET_INCOME_CODES, year);
  if (net != null) return net;
  const ebt = ebtValue(year, ctx);
  const taxes = ctx.valueOf(TAX_CODES, year);
  if (ebt == null || taxes == null) return null;
  return ebt - taxes;
};

const growthFrom = (getter: (year: number, ctx: ComputeCtx) => number | null) => {
  return (year: number, ctx: ComputeCtx) => {
    const prev = ctx.prevYear(year);
    if (!prev) return null;
    const currVal = getter(year, ctx);
    const prevVal = getter(prev, ctx);
    if (currVal == null || prevVal == null || prevVal === 0) return null;
    return currVal / prevVal - 1;
  };
};

const pctOf = (
  numerator: (year: number, ctx: ComputeCtx) => number | null,
  denominator: (year: number, ctx: ComputeCtx) => number | null
) => {
  return (year: number, ctx: ComputeCtx) => {
    const num = numerator(year, ctx);
    const den = denominator(year, ctx);
    if (num == null || den == null || den === 0) return null;
    return num / den;
  };
};

const rows: RowDef[] = [
  {
    id: 'section_revenue',
    label: 'Revenue & Gross Profit',
    labelKr: '매출 및 매출총이익',
    kind: 'section',
    children: [
      {
        id: 'revenue',
        label: 'Revenue',
        labelKr: '매출액',
        codes: REVENUE_CODES,
        kind: 'total',
        children: [
          {
            id: 'revenue_growth',
            label: 'YoY Growth',
            labelKr: '전년비',
            kind: 'ratio',
            format: 'percent',
            compute: growthFrom(revenueValue),
          },
        ],
      },
      {
        id: 'cogs',
        label: 'Cost of Goods Sold',
        labelKr: '매출원가',
        codes: COGS_CODES,
        children: [
          {
            id: 'cogs_pct',
            label: '% of Revenue',
            labelKr: '매출 대비',
            kind: 'ratio',
            format: 'percent',
            compute: pctOf(cogsValue, revenueValue),
          },
        ],
      },
      {
        id: 'gross_profit',
        label: 'Gross Profit',
        labelKr: '매출총이익',
        codes: GROSS_PROFIT_CODES,
        kind: 'total',
        compute: grossProfitValue,
        children: [
          {
            id: 'gross_margin',
            label: 'Gross Margin',
            labelKr: '매출총이익률',
            kind: 'ratio',
            format: 'percent',
            compute: pctOf(grossProfitValue, revenueValue),
          },
        ],
      },
    ],
  },
  {
    id: 'section_operating_expenses',
    label: 'Operating Expenses',
    labelKr: '영업비용',
    kind: 'section',
    children: [
      {
        id: 'sga',
        label: 'SG&A',
        labelKr: '판매비와관리비',
        codes: SGA_CODES,
        children: [
          {
            id: 'sga_pct',
            label: '% of Revenue',
            labelKr: '매출 대비',
            kind: 'ratio',
            format: 'percent',
            compute: pctOf(sgaValue, revenueValue),
          },
        ],
      },
      {
        id: 'da',
        label: 'Depreciation & Amortization',
        labelKr: '감가상각비',
        codes: DA_CODES,
      },
      {
        id: 'ebitda',
        label: 'EBITDA',
        labelKr: 'EBITDA',
        codes: EBITDA_CODES,
        kind: 'total',
        compute: ebitdaValue,
        children: [
          {
            id: 'ebitda_margin',
            label: 'EBITDA Margin',
            labelKr: 'EBITDA 마진',
            kind: 'ratio',
            format: 'percent',
            compute: pctOf(ebitdaValue, revenueValue),
          },
        ],
      },
    ],
  },
  {
    id: 'section_operating_income',
    label: 'Operating Income',
    labelKr: '영업이익',
    kind: 'section',
    children: [
      {
        id: 'ebit',
        label: 'EBIT (Operating Income)',
        labelKr: '영업이익',
        codes: EBIT_CODES,
        kind: 'total',
        compute: operatingIncomeValue,
        children: [
          {
            id: 'ebit_margin',
            label: 'EBIT Margin',
            labelKr: '영업이익률',
            kind: 'ratio',
            format: 'percent',
            compute: pctOf(operatingIncomeValue, revenueValue),
          },
        ],
      },
    ],
  },
  {
    id: 'section_non_operating',
    label: 'Non-operating Items',
    labelKr: '영업외손익',
    kind: 'section',
    children: [
      {
        id: 'interest_income',
        label: 'Interest Income',
        labelKr: '이자수익',
        codes: INTEREST_INCOME_CODES,
      },
      {
        id: 'interest_expense',
        label: 'Interest Expense',
        labelKr: '이자비용',
        codes: INTEREST_EXPENSE_CODES,
      },
      {
        id: 'other_income',
        label: 'Other Income',
        labelKr: '기타수익',
        codes: OTHER_INCOME_CODES,
      },
      {
        id: 'other_expense',
        label: 'Other Expense',
        labelKr: '기타비용',
        codes: OTHER_EXPENSE_CODES,
      },
    ],
  },
  {
    id: 'section_pretax',
    label: 'Pre-tax & Net Income',
    labelKr: '세전/순이익',
    kind: 'section',
    children: [
      {
        id: 'ebt',
        label: 'EBT',
        labelKr: '법인세비용차감전순이익',
        codes: EBT_CODES,
        kind: 'total',
        compute: ebtValue,
        children: [
          {
            id: 'ebt_margin',
            label: 'EBT Margin',
            labelKr: '세전이익률',
            kind: 'ratio',
            format: 'percent',
            compute: pctOf(ebtValue, revenueValue),
          },
        ],
      },
      {
        id: 'taxes',
        label: 'Income Tax Expense',
        labelKr: '법인세비용',
        codes: TAX_CODES,
      },
      {
        id: 'net_income',
        label: 'Net Income',
        labelKr: '당기순이익',
        codes: NET_INCOME_CODES,
        kind: 'total',
        compute: netIncomeValue,
        children: [
          {
            id: 'net_margin',
            label: 'Net Margin',
            labelKr: '순이익률',
            kind: 'ratio',
            format: 'percent',
            compute: pctOf(netIncomeValue, revenueValue),
          },
        ],
      },
    ],
  },
];

interface IncomeStatementTableProps {
  data: Record<number, StatementYearData>;
  years: number[];
}

export default function IncomeStatementTable({ data, years }: IncomeStatementTableProps) {
  return (
    <StatementTable
      title="Income Statement"
      statementType="IS"
      data={data}
      years={years}
      rows={rows}
      defaultShowRatios
    />
  );
}
