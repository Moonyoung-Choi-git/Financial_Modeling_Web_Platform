'use client';

import StatementTable, { ComputeCtx, RowDef, StatementYearData } from '@/components/statement-table';

const CASH_CODES = ['BS.CASH', '현금및현금성자산', '현금및현금등가물'];
const ST_FIN_ASSET_CODES = ['BS.ST_FIN_ASSETS', '단기금융자산', '단기금융상품'];
const AR_CODES = ['BS.AR', '매출채권', '매출채권및기타채권'];
const OTHER_REC_CODES = ['BS.OTHER_REC', '기타채권', '기타수취채권', '기타유동채권'];
const INVENTORY_CODES = ['BS.INVENTORY', '재고자산'];
const PREPAID_CODES = ['BS.PREPAID', '선급비용', '선급금'];
const OTHER_CA_CODES = ['BS.OTHER_CA', '기타유동자산'];
const TOTAL_CA_CODES = ['BS.TOTAL_CA', '유동자산'];

const LT_FIN_ASSET_CODES = ['BS.LT_FIN_ASSETS', '장기금융자산', '장기금융상품'];
const INVEST_ASSOC_CODES = ['BS.INVEST_ASSOC', '관계기업투자', '관계기업및공동기업투자'];
const INVEST_PROPERTY_CODES = ['BS.INVEST_PROP', '투자부동산'];
const PPE_GROSS_CODES = ['BS.PPE_GROSS', '유형자산(총액)'];
const ACC_DEP_CODES = ['BS.ACCUMULATED_DEP', '감가상각누계액'];
const PPE_NET_CODES = ['BS.PPE_NET', '유형자산', '유형자산(순액)'];
const ROU_ASSET_CODES = ['BS.ROU_ASSET', '사용권자산'];
const INTANGIBLE_CODES = ['BS.INTANGIBLES', '무형자산'];
const DEFERRED_TAX_ASSET_CODES = ['BS.DTA', '이연법인세자산'];
const OTHER_NCA_CODES = ['BS.OTHER_NCA', '기타비유동자산'];
const TOTAL_ASSETS_CODES = ['BS.TOTAL_ASSETS', '자산총계'];
const TOTAL_NCA_CODES = ['BS.TOTAL_NCA', '비유동자산'];

const AP_CODES = ['BS.AP', '매입채무', '매입채무및기타채무'];
const OTHER_CL_CODES = ['BS.OTHER_CL', '기타유동부채'];
const SHORT_DEBT_CODES = ['BS.SHORT_DEBT', '단기차입금'];
const CURRENT_PORTION_LTD_CODES = ['BS.CURRENT_PORTION_LTD', '유동성장기부채'];
const TOTAL_CL_CODES = ['BS.TOTAL_CL', '유동부채'];

const LONG_DEBT_CODES = ['BS.LONG_DEBT', '장기차입금'];
const BONDS_CODES = ['BS.BONDS', '사채'];
const LEASE_LIAB_CODES = ['BS.LEASE_LIAB', '리스부채'];
const DEFERRED_TAX_LIAB_CODES = ['BS.DTL', '이연법인세부채'];
const PROVISION_CODES = ['BS.PROVISIONS', '충당부채'];
const OTHER_NCL_CODES = ['BS.OTHER_NCL', '기타비유동부채'];
const TOTAL_NCL_CODES = ['BS.TOTAL_NCL', '비유동부채'];
const TOTAL_LIAB_CODES = ['BS.TOTAL_LIABILITIES', '부채총계'];

const COMMON_STOCK_CODES = ['BS.COMMON_STOCK', '자본금'];
const APIC_CODES = ['BS.APIC', '주식발행초과금'];
const OTHER_EQUITY_CODES = ['BS.OTHER_EQUITY', '기타자본', '자본잉여금', '기타자본잉여금'];
const RETAINED_EARNINGS_CODES = ['BS.RETAINED_EARNINGS', '이익잉여금', '이익잉여금(결손금)'];
const OCI_CODES = ['BS.OCI', '기타포괄손익누계액'];
const TREASURY_STOCK_CODES = ['BS.TREASURY_STOCK', '자기주식'];
const NCI_CODES = ['BS.NCI', '비지배지분'];
const TOTAL_EQUITY_CODES = ['BS.TOTAL_EQUITY', '자본총계'];

const sumFirstAvailable = (year: number, ctx: ComputeCtx, groups: string[][]) => {
  let found = false;
  let sum = 0;
  groups.forEach((codes) => {
    const value = ctx.valueOf(codes, year);
    if (value != null) {
      sum += value;
      found = true;
    }
  });
  return found ? sum : null;
};

const ppeNetValue = (year: number, ctx: ComputeCtx) => {
  const net = ctx.valueOf(PPE_NET_CODES, year);
  if (net != null) return net;
  const gross = ctx.valueOf(PPE_GROSS_CODES, year);
  const acc = ctx.valueOf(ACC_DEP_CODES, year);
  if (gross == null || acc == null) return null;
  return gross - Math.abs(acc);
};

const totalCurrentAssetsValue = (year: number, ctx: ComputeCtx) => {
  const total = ctx.valueOf(TOTAL_CA_CODES, year);
  if (total != null) return total;
  return sumFirstAvailable(year, ctx, [
    CASH_CODES,
    ST_FIN_ASSET_CODES,
    AR_CODES,
    OTHER_REC_CODES,
    INVENTORY_CODES,
    PREPAID_CODES,
    OTHER_CA_CODES,
  ]);
};

const totalNonCurrentAssetsValue = (year: number, ctx: ComputeCtx) => {
  const total = ctx.valueOf(TOTAL_NCA_CODES, year);
  if (total != null) return total;
  let sum = 0;
  let found = false;
  const ppeNet = ppeNetValue(year, ctx);
  if (ppeNet != null) {
    sum += ppeNet;
    found = true;
  }
  [
    LT_FIN_ASSET_CODES,
    INVEST_ASSOC_CODES,
    INVEST_PROPERTY_CODES,
    ROU_ASSET_CODES,
    INTANGIBLE_CODES,
    DEFERRED_TAX_ASSET_CODES,
    OTHER_NCA_CODES,
  ].forEach((codes) => {
    const value = ctx.valueOf(codes, year);
    if (value != null) {
      sum += value;
      found = true;
    }
  });
  return found ? sum : null;
};

const totalAssetsValue = (year: number, ctx: ComputeCtx) => {
  const total = ctx.valueOf(TOTAL_ASSETS_CODES, year);
  if (total != null) return total;
  const ca = totalCurrentAssetsValue(year, ctx);
  const nca = totalNonCurrentAssetsValue(year, ctx);
  if (ca == null || nca == null) return null;
  return ca + nca;
};

const totalCurrentLiabValue = (year: number, ctx: ComputeCtx) => {
  const total = ctx.valueOf(TOTAL_CL_CODES, year);
  if (total != null) return total;
  return sumFirstAvailable(year, ctx, [
    AP_CODES,
    OTHER_CL_CODES,
    SHORT_DEBT_CODES,
    CURRENT_PORTION_LTD_CODES,
  ]);
};

const totalNonCurrentLiabValue = (year: number, ctx: ComputeCtx) => {
  const total = ctx.valueOf(TOTAL_NCL_CODES, year);
  if (total != null) return total;
  return sumFirstAvailable(year, ctx, [
    LONG_DEBT_CODES,
    BONDS_CODES,
    LEASE_LIAB_CODES,
    DEFERRED_TAX_LIAB_CODES,
    PROVISION_CODES,
    OTHER_NCL_CODES,
  ]);
};

const totalLiabilitiesValue = (year: number, ctx: ComputeCtx) => {
  const total = ctx.valueOf(TOTAL_LIAB_CODES, year);
  if (total != null) return total;
  const cl = totalCurrentLiabValue(year, ctx);
  const ncl = totalNonCurrentLiabValue(year, ctx);
  if (cl == null || ncl == null) return null;
  return cl + ncl;
};

const totalEquityValue = (year: number, ctx: ComputeCtx) => {
  const total = ctx.valueOf(TOTAL_EQUITY_CODES, year);
  if (total != null) return total;
  return sumFirstAvailable(year, ctx, [
    COMMON_STOCK_CODES,
    APIC_CODES,
    OTHER_EQUITY_CODES,
    RETAINED_EARNINGS_CODES,
    OCI_CODES,
    TREASURY_STOCK_CODES,
    NCI_CODES,
  ]);
};

const totalLiabilitiesAndEquityValue = (year: number, ctx: ComputeCtx) => {
  const liab = totalLiabilitiesValue(year, ctx);
  const equity = totalEquityValue(year, ctx);
  if (liab == null || equity == null) return null;
  return liab + equity;
};

const balanceCheckValue = (year: number, ctx: ComputeCtx) => {
  const assets = totalAssetsValue(year, ctx);
  const liabEquity = totalLiabilitiesAndEquityValue(year, ctx);
  if (assets == null || liabEquity == null) return null;
  return assets - liabEquity;
};

const rows: RowDef[] = [
  {
    id: 'assets',
    label: 'Assets',
    labelKr: '자산',
    kind: 'section',
    children: [
      {
        id: 'current_assets',
        label: 'Current Assets',
        labelKr: '유동자산',
        kind: 'section',
        children: [
          { id: 'cash', label: 'Cash & Equivalents', labelKr: '현금및현금성자산', codes: CASH_CODES },
          { id: 'st_fin', label: 'Short-term Financial Assets', labelKr: '단기금융자산', codes: ST_FIN_ASSET_CODES },
          { id: 'ar', label: 'Accounts Receivable', labelKr: '매출채권', codes: AR_CODES },
          { id: 'other_rec', label: 'Other Receivables', labelKr: '기타채권', codes: OTHER_REC_CODES },
          { id: 'inventory', label: 'Inventory', labelKr: '재고자산', codes: INVENTORY_CODES },
          { id: 'prepaid', label: 'Prepaid Expenses', labelKr: '선급비용', codes: PREPAID_CODES },
          { id: 'other_ca', label: 'Other Current Assets', labelKr: '기타유동자산', codes: OTHER_CA_CODES },
          {
            id: 'total_ca',
            label: 'Total Current Assets',
            labelKr: '유동자산',
            codes: TOTAL_CA_CODES,
            kind: 'total',
            compute: totalCurrentAssetsValue,
          },
        ],
      },
      {
        id: 'non_current_assets',
        label: 'Non-current Assets',
        labelKr: '비유동자산',
        kind: 'section',
        children: [
          { id: 'lt_fin', label: 'Long-term Financial Assets', labelKr: '장기금융자산', codes: LT_FIN_ASSET_CODES },
          { id: 'invest_assoc', label: 'Investments in Associates', labelKr: '관계기업투자', codes: INVEST_ASSOC_CODES },
          { id: 'invest_property', label: 'Investment Property', labelKr: '투자부동산', codes: INVEST_PROPERTY_CODES },
          {
            id: 'ppe_gross',
            label: 'PP&E (Gross)',
            labelKr: '유형자산(총액)',
            codes: PPE_GROSS_CODES,
          },
          {
            id: 'acc_dep',
            label: 'Accumulated Depreciation',
            labelKr: '감가상각누계액',
            codes: ACC_DEP_CODES,
          },
          {
            id: 'ppe_net',
            label: 'PP&E (Net)',
            labelKr: '유형자산(순액)',
            codes: PPE_NET_CODES,
            compute: ppeNetValue,
          },
          { id: 'rou', label: 'Right-of-Use Assets', labelKr: '사용권자산', codes: ROU_ASSET_CODES },
          { id: 'intangibles', label: 'Intangible Assets', labelKr: '무형자산', codes: INTANGIBLE_CODES },
          { id: 'dta', label: 'Deferred Tax Assets', labelKr: '이연법인세자산', codes: DEFERRED_TAX_ASSET_CODES },
          { id: 'other_nca', label: 'Other Non-current Assets', labelKr: '기타비유동자산', codes: OTHER_NCA_CODES },
          {
            id: 'total_nca',
            label: 'Total Non-current Assets',
            labelKr: '비유동자산',
            codes: TOTAL_NCA_CODES,
            kind: 'total',
            compute: totalNonCurrentAssetsValue,
          },
        ],
      },
      {
        id: 'total_assets',
        label: 'Total Assets',
        labelKr: '자산총계',
        codes: TOTAL_ASSETS_CODES,
        kind: 'total',
        compute: totalAssetsValue,
      },
    ],
  },
  {
    id: 'liabilities',
    label: 'Liabilities',
    labelKr: '부채',
    kind: 'section',
    children: [
      {
        id: 'current_liab',
        label: 'Current Liabilities',
        labelKr: '유동부채',
        kind: 'section',
        children: [
          { id: 'ap', label: 'Accounts Payable', labelKr: '매입채무', codes: AP_CODES },
          { id: 'other_cl', label: 'Other Current Liabilities', labelKr: '기타유동부채', codes: OTHER_CL_CODES },
          { id: 'short_debt', label: 'Short-term Debt', labelKr: '단기차입금', codes: SHORT_DEBT_CODES },
          {
            id: 'current_portion',
            label: 'Current Portion of LT Debt',
            labelKr: '유동성장기부채',
            codes: CURRENT_PORTION_LTD_CODES,
          },
          {
            id: 'total_cl',
            label: 'Total Current Liabilities',
            labelKr: '유동부채',
            codes: TOTAL_CL_CODES,
            kind: 'total',
            compute: totalCurrentLiabValue,
          },
        ],
      },
      {
        id: 'non_current_liab',
        label: 'Non-current Liabilities',
        labelKr: '비유동부채',
        kind: 'section',
        children: [
          { id: 'long_debt', label: 'Long-term Debt', labelKr: '장기차입금', codes: LONG_DEBT_CODES },
          { id: 'bonds', label: 'Bonds Payable', labelKr: '사채', codes: BONDS_CODES },
          { id: 'lease_liab', label: 'Lease Liabilities', labelKr: '리스부채', codes: LEASE_LIAB_CODES },
          { id: 'dTL', label: 'Deferred Tax Liabilities', labelKr: '이연법인세부채', codes: DEFERRED_TAX_LIAB_CODES },
          { id: 'provisions', label: 'Provisions', labelKr: '충당부채', codes: PROVISION_CODES },
          { id: 'other_ncl', label: 'Other Non-current Liabilities', labelKr: '기타비유동부채', codes: OTHER_NCL_CODES },
          {
            id: 'total_ncl',
            label: 'Total Non-current Liabilities',
            labelKr: '비유동부채',
            codes: TOTAL_NCL_CODES,
            kind: 'total',
            compute: totalNonCurrentLiabValue,
          },
        ],
      },
      {
        id: 'total_liabilities',
        label: 'Total Liabilities',
        labelKr: '부채총계',
        codes: TOTAL_LIAB_CODES,
        kind: 'total',
        compute: totalLiabilitiesValue,
      },
    ],
  },
  {
    id: 'equity',
    label: 'Equity',
    labelKr: '자본',
    kind: 'section',
    children: [
      { id: 'common_stock', label: 'Common Stock', labelKr: '자본금', codes: COMMON_STOCK_CODES },
      { id: 'apic', label: 'Additional Paid-in Capital', labelKr: '주식발행초과금', codes: APIC_CODES },
      { id: 'other_equity', label: 'Other Equity', labelKr: '기타자본', codes: OTHER_EQUITY_CODES },
      { id: 'retained_earnings', label: 'Retained Earnings', labelKr: '이익잉여금', codes: RETAINED_EARNINGS_CODES },
      { id: 'oci', label: 'Accumulated OCI', labelKr: '기타포괄손익누계액', codes: OCI_CODES },
      { id: 'treasury', label: 'Treasury Stock', labelKr: '자기주식', codes: TREASURY_STOCK_CODES },
      { id: 'nci', label: 'Non-controlling Interests', labelKr: '비지배지분', codes: NCI_CODES },
      {
        id: 'total_equity',
        label: 'Total Equity',
        labelKr: '자본총계',
        codes: TOTAL_EQUITY_CODES,
        kind: 'total',
        compute: totalEquityValue,
      },
    ],
  },
  {
    id: 'total_liab_equity',
    label: 'Total Liabilities & Equity',
    labelKr: '부채와자본총계',
    kind: 'total',
    compute: totalLiabilitiesAndEquityValue,
  },
  {
    id: 'balance_check',
    label: 'Balance Check',
    labelKr: '밸런스 체크',
    kind: 'total',
    compute: balanceCheckValue,
  },
];

interface BalanceSheetTableProps {
  data: Record<number, StatementYearData>;
  years: number[];
}

export default function BalanceSheetTable({ data, years }: BalanceSheetTableProps) {
  return (
    <StatementTable
      title="Balance Sheet"
      statementType="BS"
      data={data}
      years={years}
      rows={rows}
    />
  );
}
