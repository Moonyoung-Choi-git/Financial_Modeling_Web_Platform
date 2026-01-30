'use client';

import StatementTable, { ComputeCtx, RowDef, StatementYearData } from '@/components/statement-table';

const NET_INCOME_CODES = ['CF.NI_START', 'IS.NET_INCOME', '당기순이익', '당기순이익(손실)'];
const DA_CODES = ['CF.DA', '감가상각비', '감가상각비및무형자산상각비'];
const AMORT_CODES = ['무형자산상각비'];
const OTHER_NONCASH_CODES = ['CF.OTHER_NONCASH', '기타비현금항목'];
const DELTA_AR_CODES = ['CF.DELTA_AR', '매출채권의 감소(증가)', '매출채권 증감'];
const DELTA_INV_CODES = ['CF.DELTA_INV', '재고자산의 감소(증가)', '재고자산 증감'];
const DELTA_AP_CODES = ['CF.DELTA_AP', '매입채무의 증가(감소)', '매입채무 증감'];
const DELTA_OTHER_WC_CODES = ['CF.DELTA_OTHER_WC', '기타운전자본 증감', '기타운전자본의 감소(증가)'];
const INTEREST_PAID_CODES = ['CF.INTEREST_PAID', '이자지급', '이자지급액', '이자지급현금'];
const INTEREST_RECEIVED_CODES = ['CF.INTEREST_RECEIVED', '이자수취', '이자수취액', '이자수취현금'];
const TAX_PAID_CODES = ['CF.TAXES_PAID', '법인세 납부', '법인세의 납부', '법인세 납부액'];
const CFO_CODES = ['CF.CFO', '영업활동현금흐름', '영업활동으로인한현금흐름'];

const CAPEX_CODES = ['CF.CAPEX', '유형자산의 취득', '유형자산 취득'];
const INTANG_CAPEX_CODES = ['CF.INTANG_CAPEX', '무형자산의 취득', '무형자산 취득'];
const INVEST_PURCHASE_CODES = ['CF.INVEST_PURCHASE', '투자자산의 취득', '금융상품의 취득'];
const INVEST_DISPOSAL_CODES = ['CF.INVEST_DISPOSAL', '투자자산의 처분', '금융상품의 처분'];
const OTHER_INVEST_CODES = ['CF.OTHER_INVESTING', '기타투자활동'];
const CFI_CODES = ['CF.CFI', '투자활동현금흐름', '투자활동으로인한현금흐름'];

const DEBT_ISSUED_CODES = ['CF.DEBT_ISSUED', '차입금의 증가', '차입금 차입'];
const DEBT_REPAY_CODES = ['CF.DEBT_REPAY', '차입금의 감소', '차입금 상환'];
const DIVIDEND_CODES = ['CF.DIVIDENDS', '배당금 지급', '배당금의 지급'];
const EQUITY_ISSUED_CODES = ['CF.EQUITY_ISSUED', '유상증자', '자본금 증가'];
const SHARE_REPURCHASE_CODES = ['CF.EQUITY_REPURCHASED', '자기주식 취득', '자기주식의 취득'];
const OTHER_FINANCE_CODES = ['CF.OTHER_FINANCING', '기타재무활동'];
const CFF_CODES = ['CF.CFF', '재무활동현금흐름', '재무활동으로인한현금흐름'];

const NET_CHANGE_CODES = ['CF.NET_CHANGE', '현금의 증가', '현금의 순증가', '현금및현금성자산의순증가'];
const BEGIN_CASH_CODES = ['CF.BEGIN_CASH', '기초현금', '기초현금및현금성자산'];
const END_CASH_CODES = ['CF.END_CASH', '기말현금', '기말현금및현금성자산'];

const netIncomeValue = (year: number, ctx: ComputeCtx) => ctx.valueOf(NET_INCOME_CODES, year);
const daValue = (year: number, ctx: ComputeCtx) => ctx.valueOf(DA_CODES, year);

const cfoValue = (year: number, ctx: ComputeCtx) => {
  const direct = ctx.valueOf(CFO_CODES, year);
  if (direct != null) return direct;
  const netIncome = netIncomeValue(year, ctx);
  if (netIncome == null) return null;
  const adjustments = [
    daValue(year, ctx),
    ctx.valueOf(AMORT_CODES, year),
    ctx.valueOf(OTHER_NONCASH_CODES, year),
    ctx.valueOf(DELTA_AR_CODES, year),
    ctx.valueOf(DELTA_INV_CODES, year),
    ctx.valueOf(DELTA_AP_CODES, year),
    ctx.valueOf(DELTA_OTHER_WC_CODES, year),
    ctx.valueOf(INTEREST_PAID_CODES, year),
    ctx.valueOf(INTEREST_RECEIVED_CODES, year),
    ctx.valueOf(TAX_PAID_CODES, year),
  ];
  let sum = netIncome;
  adjustments.forEach((value) => {
    if (value != null) sum += value;
  });
  return sum;
};

const cfiValue = (year: number, ctx: ComputeCtx) => {
  const direct = ctx.valueOf(CFI_CODES, year);
  if (direct != null) return direct;
  const parts = [
    ctx.valueOf(CAPEX_CODES, year),
    ctx.valueOf(INTANG_CAPEX_CODES, year),
    ctx.valueOf(INVEST_PURCHASE_CODES, year),
    ctx.valueOf(INVEST_DISPOSAL_CODES, year),
    ctx.valueOf(OTHER_INVEST_CODES, year),
  ];
  let sum = 0;
  let found = false;
  parts.forEach((value) => {
    if (value != null) {
      sum += value;
      found = true;
    }
  });
  return found ? sum : null;
};

const cffValue = (year: number, ctx: ComputeCtx) => {
  const direct = ctx.valueOf(CFF_CODES, year);
  if (direct != null) return direct;
  const parts = [
    ctx.valueOf(DEBT_ISSUED_CODES, year),
    ctx.valueOf(DEBT_REPAY_CODES, year),
    ctx.valueOf(DIVIDEND_CODES, year),
    ctx.valueOf(EQUITY_ISSUED_CODES, year),
    ctx.valueOf(SHARE_REPURCHASE_CODES, year),
    ctx.valueOf(OTHER_FINANCE_CODES, year),
  ];
  let sum = 0;
  let found = false;
  parts.forEach((value) => {
    if (value != null) {
      sum += value;
      found = true;
    }
  });
  return found ? sum : null;
};

const netChangeValue = (year: number, ctx: ComputeCtx) => {
  const direct = ctx.valueOf(NET_CHANGE_CODES, year);
  if (direct != null) return direct;
  const cfo = cfoValue(year, ctx);
  const cfi = cfiValue(year, ctx);
  const cff = cffValue(year, ctx);
  if (cfo == null || cfi == null || cff == null) return null;
  return cfo + cfi + cff;
};

const endingCashValue = (year: number, ctx: ComputeCtx) => {
  const direct = ctx.valueOf(END_CASH_CODES, year);
  if (direct != null) return direct;
  const begin = ctx.valueOf(BEGIN_CASH_CODES, year);
  const change = netChangeValue(year, ctx);
  if (begin == null || change == null) return null;
  return begin + change;
};

const rows: RowDef[] = [
  {
    id: 'operating',
    label: 'Operating Activities',
    labelKr: '영업활동',
    kind: 'section',
    children: [
      { id: 'net_income', label: 'Net Income', labelKr: '당기순이익', codes: NET_INCOME_CODES },
      { id: 'da', label: 'Depreciation & Amortization', labelKr: '감가상각비', codes: DA_CODES },
      { id: 'amort', label: 'Amortization of Intangibles', labelKr: '무형자산상각비', codes: AMORT_CODES },
      { id: 'other_noncash', label: 'Other Non-cash Items', labelKr: '기타비현금항목', codes: OTHER_NONCASH_CODES },
      { id: 'delta_ar', label: '(Increase)/Decrease in AR', labelKr: '매출채권 증감', codes: DELTA_AR_CODES },
      { id: 'delta_inv', label: '(Increase)/Decrease in Inventory', labelKr: '재고자산 증감', codes: DELTA_INV_CODES },
      { id: 'delta_ap', label: 'Increase/(Decrease) in AP', labelKr: '매입채무 증감', codes: DELTA_AP_CODES },
      { id: 'delta_other_wc', label: 'Other Working Capital Changes', labelKr: '기타운전자본 증감', codes: DELTA_OTHER_WC_CODES },
      { id: 'interest_paid', label: 'Interest Paid', labelKr: '이자지급', codes: INTEREST_PAID_CODES },
      { id: 'interest_received', label: 'Interest Received', labelKr: '이자수취', codes: INTEREST_RECEIVED_CODES },
      { id: 'tax_paid', label: 'Taxes Paid', labelKr: '법인세 납부', codes: TAX_PAID_CODES },
      {
        id: 'cfo',
        label: 'Cash Flow from Operations',
        labelKr: '영업활동현금흐름',
        codes: CFO_CODES,
        kind: 'total',
        compute: cfoValue,
      },
    ],
  },
  {
    id: 'investing',
    label: 'Investing Activities',
    labelKr: '투자활동',
    kind: 'section',
    children: [
      { id: 'capex', label: 'Capital Expenditures', labelKr: '유형자산 취득', codes: CAPEX_CODES },
      { id: 'intang_capex', label: 'Intangible Asset Purchases', labelKr: '무형자산 취득', codes: INTANG_CAPEX_CODES },
      { id: 'invest_purchase', label: 'Investments Purchased', labelKr: '투자자산 취득', codes: INVEST_PURCHASE_CODES },
      { id: 'invest_disposal', label: 'Investments Sold', labelKr: '투자자산 처분', codes: INVEST_DISPOSAL_CODES },
      { id: 'other_investing', label: 'Other Investing Activities', labelKr: '기타투자활동', codes: OTHER_INVEST_CODES },
      {
        id: 'cfi',
        label: 'Cash Flow from Investing',
        labelKr: '투자활동현금흐름',
        codes: CFI_CODES,
        kind: 'total',
        compute: cfiValue,
      },
    ],
  },
  {
    id: 'financing',
    label: 'Financing Activities',
    labelKr: '재무활동',
    kind: 'section',
    children: [
      { id: 'debt_issued', label: 'Debt Issuance', labelKr: '차입금 차입', codes: DEBT_ISSUED_CODES },
      { id: 'debt_repay', label: 'Debt Repayment', labelKr: '차입금 상환', codes: DEBT_REPAY_CODES },
      { id: 'dividends', label: 'Dividends Paid', labelKr: '배당금 지급', codes: DIVIDEND_CODES },
      { id: 'equity_issued', label: 'Equity Issuance', labelKr: '자본금 증가', codes: EQUITY_ISSUED_CODES },
      { id: 'share_repurchase', label: 'Share Repurchases', labelKr: '자기주식 취득', codes: SHARE_REPURCHASE_CODES },
      { id: 'other_financing', label: 'Other Financing Activities', labelKr: '기타재무활동', codes: OTHER_FINANCE_CODES },
      {
        id: 'cff',
        label: 'Cash Flow from Financing',
        labelKr: '재무활동현금흐름',
        codes: CFF_CODES,
        kind: 'total',
        compute: cffValue,
      },
    ],
  },
  {
    id: 'summary',
    label: 'Cash Summary',
    labelKr: '현금 요약',
    kind: 'section',
    children: [
      {
        id: 'net_change',
        label: 'Net Change in Cash',
        labelKr: '현금의순증감',
        codes: NET_CHANGE_CODES,
        kind: 'total',
        compute: netChangeValue,
      },
      { id: 'begin_cash', label: 'Beginning Cash', labelKr: '기초현금', codes: BEGIN_CASH_CODES },
      {
        id: 'end_cash',
        label: 'Ending Cash',
        labelKr: '기말현금',
        codes: END_CASH_CODES,
        kind: 'total',
        compute: endingCashValue,
      },
    ],
  },
];

interface CashFlowTableProps {
  data: Record<number, StatementYearData>;
  years: number[];
}

export default function CashFlowTable({ data, years }: CashFlowTableProps) {
  return (
    <StatementTable
      title="Cash Flow Statement"
      statementType="CF"
      data={data}
      years={years}
      rows={rows}
    />
  );
}
