'use client';

import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';

type StatementItem = {
  name?: string;
  value?: number;
  unit?: string;
};

type StatementData = Record<string, StatementItem>;

interface IncomeStatementTableProps {
  data: Record<number, { IS?: StatementData }>;
  years: number[];
}

type RowDef = {
  id: string;
  label: string;
  code?: string;
  format?: 'number' | 'percent';
  kind?: 'section' | 'value' | 'ratio' | 'total';
  compute?: (year: number, ctx: ComputeCtx) => number | null;
  children?: RowDef[];
};

type DisplayRow = RowDef & { level: number };

type ComputeCtx = {
  years: number[];
  valueOf: (code: string, year: number) => number | null;
  prevYear: (year: number) => number | null;
};

const numberFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const percentFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const DEFAULT_COL_WIDTH = 72;
const MIN_COL_WIDTH = 48;
const MAX_COL_WIDTH = 180;

const calcGrossSales = (ctx: ComputeCtx, year: number) => {
  const gross = ctx.valueOf('IS_GROSS_SALES', year);
  if (gross != null) return gross;
  const net = ctx.valueOf('IS_1000', year);
  const discounts = ctx.valueOf('IS_DISCOUNTS_REBATES', year);
  if (net != null && discounts != null) return net + Math.abs(discounts);
  return null;
};

const calcNetSales = (ctx: ComputeCtx, year: number) => ctx.valueOf('IS_1000', year);

const calcSgaTotal = (ctx: ComputeCtx, year: number) => {
  const selling = ctx.valueOf('IS_SELLING_EXPENSES', year);
  const ga = ctx.valueOf('IS_GA_EXPENSES', year);
  if (selling != null || ga != null) {
    return (selling ?? 0) + (ga ?? 0);
  }
  const combined = ctx.valueOf('IS_1300', year);
  return combined ?? null;
};

const calcGrossProfit = (ctx: ComputeCtx, year: number) => {
  const gp = ctx.valueOf('IS_1200', year);
  if (gp != null) return gp;
  const net = calcNetSales(ctx, year);
  const cogs = ctx.valueOf('IS_1100', year);
  if (net == null || cogs == null) return null;
  return net - cogs;
};

const calcOperatingIncome = (ctx: ComputeCtx, year: number) => {
  const op = ctx.valueOf('IS_2000', year);
  if (op != null) return op;
  const gp = calcGrossProfit(ctx, year);
  const sga = calcSgaTotal(ctx, year);
  if (gp == null || sga == null) return null;
  return gp - sga;
};

const calcEbitda = (ctx: ComputeCtx, year: number) => {
  const ebitda = ctx.valueOf('IS_EBITDA', year);
  if (ebitda != null) return ebitda;
  const op = calcOperatingIncome(ctx, year);
  const da = ctx.valueOf('IS_DA', year);
  if (op == null || da == null) return null;
  return op + Math.abs(da);
};

const growthFrom = (getter: (ctx: ComputeCtx, year: number) => number | null) => {
  return (year: number, ctx: ComputeCtx) => {
    const prev = ctx.prevYear(year);
    if (!prev) return null;
    const currVal = getter(ctx, year);
    const prevVal = getter(ctx, prev);
    if (currVal == null || prevVal == null || prevVal === 0) return null;
    return currVal / prevVal - 1;
  };
};

const pctOf = (
  numerator: (ctx: ComputeCtx, year: number) => number | null,
  denominator: (ctx: ComputeCtx, year: number) => number | null
) => {
  return (year: number, ctx: ComputeCtx) => {
    const num = numerator(ctx, year);
    const den = denominator(ctx, year);
    if (num == null || den == null || den === 0) return null;
    return num / den;
  };
};

const valueOfCode = (code: string) => (ctx: ComputeCtx, year: number) =>
  ctx.valueOf(code, year);

const buildRows = (): RowDef[] => [
  {
    id: 'gross_sales',
    label: 'Gross Sales',
    code: 'IS_GROSS_SALES',
    kind: 'total',
    compute: (year, ctx) => calcGrossSales(ctx, year),
    children: [
      {
        id: 'gross_sales_growth',
        label: '% Growth',
        kind: 'ratio',
        format: 'percent',
        compute: growthFrom(calcGrossSales),
      },
      {
        id: 'beverages',
        label: 'Beverages',
        code: 'IS_BEVERAGES',
        children: [
          {
            id: 'beverages_pct',
            label: '% of Gross Sales',
            kind: 'ratio',
            format: 'percent',
            compute: pctOf(valueOfCode('IS_BEVERAGES'), calcGrossSales),
          },
          {
            id: 'beverages_growth',
            label: '% Growth',
            kind: 'ratio',
            format: 'percent',
            compute: growthFrom(valueOfCode('IS_BEVERAGES')),
          },
          {
            id: 'juices',
            label: 'Juices/Sports Energy Drinks',
            code: 'IS_JUICES',
            children: [
              {
                id: 'juices_pct',
                label: '% of Beverage Sales',
                kind: 'ratio',
                format: 'percent',
                compute: pctOf(valueOfCode('IS_JUICES'), valueOfCode('IS_BEVERAGES')),
              },
              {
                id: 'juices_growth',
                label: '% Growth',
                kind: 'ratio',
                format: 'percent',
                compute: growthFrom(valueOfCode('IS_JUICES')),
              },
              {
                id: 'juices_vol',
                label: 'Juices/Sports Energy Drinks Volumes (mLtrs)',
                code: 'IS_JUICES_VOLUME',
                children: [
                  {
                    id: 'juices_vol_growth',
                    label: '% Growth',
                    kind: 'ratio',
                    format: 'percent',
                    compute: growthFrom(valueOfCode('IS_JUICES_VOLUME')),
                  },
                ],
              },
              {
                id: 'juices_price',
                label: 'Price per litre ($)',
                code: 'IS_JUICES_PRICE',
                children: [
                  {
                    id: 'juices_price_growth',
                    label: '% Growth',
                    kind: 'ratio',
                    format: 'percent',
                    compute: growthFrom(valueOfCode('IS_JUICES_PRICE')),
                  },
                ],
              },
            ],
          },
          {
            id: 'water',
            label: 'Water',
            code: 'IS_WATER',
            children: [
              {
                id: 'water_pct',
                label: '% of Beverage Sales',
                kind: 'ratio',
                format: 'percent',
                compute: pctOf(valueOfCode('IS_WATER'), valueOfCode('IS_BEVERAGES')),
              },
              {
                id: 'water_growth',
                label: '% Growth',
                kind: 'ratio',
                format: 'percent',
                compute: growthFrom(valueOfCode('IS_WATER')),
              },
              {
                id: 'water_vol',
                label: 'Water Volumes (mLtrs)',
                code: 'IS_WATER_VOLUME',
                children: [
                  {
                    id: 'water_vol_growth',
                    label: '% Growth',
                    kind: 'ratio',
                    format: 'percent',
                    compute: growthFrom(valueOfCode('IS_WATER_VOLUME')),
                  },
                ],
              },
              {
                id: 'water_price',
                label: 'Price per litre ($)',
                code: 'IS_WATER_PRICE',
                children: [
                  {
                    id: 'water_price_growth',
                    label: '% Growth',
                    kind: 'ratio',
                    format: 'percent',
                    compute: growthFrom(valueOfCode('IS_WATER_PRICE')),
                  },
                ],
              },
            ],
          },
          {
            id: 'carbonates',
            label: 'Carbonates',
            code: 'IS_CARBONATES',
            children: [
              {
                id: 'carbonates_pct',
                label: '% of Beverage Sales',
                kind: 'ratio',
                format: 'percent',
                compute: pctOf(valueOfCode('IS_CARBONATES'), valueOfCode('IS_BEVERAGES')),
              },
              {
                id: 'carbonates_growth',
                label: '% Growth',
                kind: 'ratio',
                format: 'percent',
                compute: growthFrom(valueOfCode('IS_CARBONATES')),
              },
              {
                id: 'carbonates_vol',
                label: 'Carbonates Volumes (mLtrs)',
                code: 'IS_CARBONATES_VOLUME',
                children: [
                  {
                    id: 'carbonates_vol_growth',
                    label: '% Growth',
                    kind: 'ratio',
                    format: 'percent',
                    compute: growthFrom(valueOfCode('IS_CARBONATES_VOLUME')),
                  },
                ],
              },
              {
                id: 'carbonates_price',
                label: 'Price per litre ($)',
                code: 'IS_CARBONATES_PRICE',
                children: [
                  {
                    id: 'carbonates_price_growth',
                    label: '% Growth',
                    kind: 'ratio',
                    format: 'percent',
                    compute: growthFrom(valueOfCode('IS_CARBONATES_PRICE')),
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        id: 'confectionery',
        label: 'Confectionery',
        code: 'IS_CONFECTIONERY',
        children: [
          {
            id: 'confectionery_pct',
            label: '% of Gross Sales',
            kind: 'ratio',
            format: 'percent',
            compute: pctOf(valueOfCode('IS_CONFECTIONERY'), calcGrossSales),
          },
          {
            id: 'confectionery_growth',
            label: '% Growth',
            kind: 'ratio',
            format: 'percent',
            compute: growthFrom(valueOfCode('IS_CONFECTIONERY')),
          },
          {
            id: 'confectionery_vol',
            label: 'Confectionery Volumes (mKgs)',
            code: 'IS_CONFECTIONERY_VOLUME',
            children: [
              {
                id: 'confectionery_vol_growth',
                label: '% Growth',
                kind: 'ratio',
                format: 'percent',
                compute: growthFrom(valueOfCode('IS_CONFECTIONERY_VOLUME')),
              },
            ],
          },
          {
            id: 'confectionery_price',
            label: 'Price per KG ($)',
            code: 'IS_CONFECTIONERY_PRICE',
            children: [
              {
                id: 'confectionery_price_growth',
                label: '% Growth',
                kind: 'ratio',
                format: 'percent',
                compute: growthFrom(valueOfCode('IS_CONFECTIONERY_PRICE')),
              },
            ],
          },
          {
            id: 'confectionery_market_size',
            label: 'Market Size',
            code: 'IS_CONFECTIONERY_MARKET_SIZE',
            children: [
              {
                id: 'confectionery_market_growth',
                label: '% Growth',
                kind: 'ratio',
                format: 'percent',
                compute: growthFrom(valueOfCode('IS_CONFECTIONERY_MARKET_SIZE')),
              },
            ],
          },
          {
            id: 'confectionery_market_share',
            label: 'Market Share in Confectionery Ind. (%)',
            code: 'IS_CONFECTIONERY_MARKET_SHARE',
            format: 'percent',
          },
        ],
      },
      {
        id: 'discounts',
        label: 'Discounts and Rebates',
        code: 'IS_DISCOUNTS_REBATES',
        children: [
          {
            id: 'discounts_pct',
            label: '% of Gross Sales',
            kind: 'ratio',
            format: 'percent',
            compute: pctOf(valueOfCode('IS_DISCOUNTS_REBATES'), calcGrossSales),
          },
        ],
      },
    ],
  },
  {
    id: 'net_sales',
    label: 'Net Sales',
    code: 'IS_1000',
    kind: 'total',
    children: [
      {
        id: 'net_sales_growth',
        label: '% Growth',
        kind: 'ratio',
        format: 'percent',
        compute: growthFrom(calcNetSales),
      },
    ],
  },
  {
    id: 'cogs',
    label: 'Cost of Goods Sold',
    code: 'IS_1100',
    children: [
      {
        id: 'cogs_pct',
        label: '% of Gross Sales',
        kind: 'ratio',
        format: 'percent',
        compute: pctOf(valueOfCode('IS_1100'), calcGrossSales),
      },
    ],
  },
  {
    id: 'gross_profit',
    label: 'Gross Profit',
    code: 'IS_1200',
    kind: 'total',
    compute: (year, ctx) => calcGrossProfit(ctx, year),
    children: [
      {
        id: 'gross_margin',
        label: '% of Net Sales',
        kind: 'ratio',
        format: 'percent',
        compute: pctOf(calcGrossProfit, calcNetSales),
      },
    ],
  },
  {
    id: 'selling_expenses',
    label: 'Selling Expenses',
    code: 'IS_SELLING_EXPENSES',
    children: [
      {
        id: 'selling_pct',
        label: '% of Net Sales',
        kind: 'ratio',
        format: 'percent',
        compute: pctOf(valueOfCode('IS_SELLING_EXPENSES'), calcNetSales),
      },
    ],
  },
  {
    id: 'ga_expenses',
    label: 'General & Administrative Expenses',
    code: 'IS_GA_EXPENSES',
    children: [
      {
        id: 'ga_pct',
        label: '% of Net Sales',
        kind: 'ratio',
        format: 'percent',
        compute: pctOf(valueOfCode('IS_GA_EXPENSES'), calcNetSales),
      },
    ],
  },
  {
    id: 'sga_total',
    label: 'Selling, General & Admin (Total)',
    code: 'IS_1300',
    kind: 'total',
    compute: (year, ctx) => calcSgaTotal(ctx, year),
    children: [
      {
        id: 'sga_pct',
        label: '% of Net Sales',
        kind: 'ratio',
        format: 'percent',
        compute: pctOf(calcSgaTotal, calcNetSales),
      },
    ],
  },
  {
    id: 'ebit',
    label: 'EBIT',
    code: 'IS_2000',
    kind: 'total',
    compute: (year, ctx) => calcOperatingIncome(ctx, year),
    children: [
      {
        id: 'ebit_margin',
        label: '% margin',
        kind: 'ratio',
        format: 'percent',
        compute: pctOf(calcOperatingIncome, calcNetSales),
      },
    ],
  },
  {
    id: 'da',
    label: 'Depreciation & Amortisation',
    code: 'IS_DA',
    children: [
      {
        id: 'da_pct',
        label: '% of Gross Sales',
        kind: 'ratio',
        format: 'percent',
        compute: pctOf(valueOfCode('IS_DA'), calcGrossSales),
      },
    ],
  },
  {
    id: 'capex',
    label: 'Capital Expenditure',
    code: 'IS_CAPEX',
    children: [
      {
        id: 'capex_pct',
        label: '% of Gross Sales',
        kind: 'ratio',
        format: 'percent',
        compute: pctOf(valueOfCode('IS_CAPEX'), calcGrossSales),
      },
    ],
  },
  {
    id: 'ebitda',
    label: 'EBITDA',
    code: 'IS_EBITDA',
    kind: 'total',
    compute: (year, ctx) => calcEbitda(ctx, year),
    children: [
      {
        id: 'ebitda_margin',
        label: '% margin',
        kind: 'ratio',
        format: 'percent',
        compute: pctOf(calcEbitda, calcNetSales),
      },
    ],
  },
  {
    id: 'interest_expense',
    label: 'Interest Expense',
    code: 'IS_INTEREST_EXPENSE',
  },
  {
    id: 'ebt',
    label: 'EBT',
    code: 'IS_2100',
    kind: 'total',
    children: [
      {
        id: 'ebt_margin',
        label: '% margin',
        kind: 'ratio',
        format: 'percent',
        compute: pctOf(valueOfCode('IS_2100'), calcNetSales),
      },
    ],
  },
  {
    id: 'taxes',
    label: 'Taxes',
    code: 'IS_TAXES',
  },
  {
    id: 'net_income',
    label: 'Net Income',
    code: 'IS_3000',
    kind: 'total',
    children: [
      {
        id: 'net_margin',
        label: '% margin',
        kind: 'ratio',
        format: 'percent',
        compute: pctOf(valueOfCode('IS_3000'), calcNetSales),
      },
    ],
  },
];

const collectCodes = (rows: RowDef[], set: Set<string>) => {
  rows.forEach((row) => {
    if (row.code) set.add(row.code);
    if (row.children) collectCodes(row.children, set);
  });
};

export default function IncomeStatementTable({ data, years }: IncomeStatementTableProps) {
  const [showRatios, setShowRatios] = useState(true);
  const [showCodes, setShowCodes] = useState(false);
  const [colWidths, setColWidths] = useState<Record<number, number>>({});
  const [resizing, setResizing] = useState<{
    year: number;
    startX: number;
    startWidth: number;
  } | null>(null);

  useEffect(() => {
    setColWidths((prev) => {
      const next = { ...prev };
      years.forEach((year) => {
        if (!next[year]) next[year] = DEFAULT_COL_WIDTH;
      });
      return next;
    });
  }, [years]);

  useEffect(() => {
    if (!resizing) return;
    const handleMove = (e: MouseEvent) => {
      const delta = e.clientX - resizing.startX;
      const nextWidth = Math.max(
        MIN_COL_WIDTH,
        Math.min(MAX_COL_WIDTH, resizing.startWidth + delta)
      );
      setColWidths((prev) => ({ ...prev, [resizing.year]: nextWidth }));
    };
    const handleUp = () => setResizing(null);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [resizing]);

  const ctx = useMemo<ComputeCtx>(() => {
    const yearIndex = new Map<number, number>(years.map((y, i) => [y, i]));
    const valueOf = (code: string, year: number) =>
      data?.[year]?.IS?.[code]?.value ?? null;
    const prevYear = (year: number) => {
      const idx = yearIndex.get(year);
      if (idx == null || idx === 0) return null;
      return years[idx - 1];
    };
    return { years, valueOf, prevYear };
  }, [data, years]);

  const rows = useMemo(() => buildRows(), []);

  const defaultExpanded = useMemo(() => {
    const expanded: Record<string, boolean> = {};
    const walk = (items: RowDef[]) => {
      items.forEach((row) => {
        if (row.children && row.children.length > 0) {
          expanded[row.id] = true;
          walk(row.children);
        }
      });
    };
    walk(rows);
    return expanded;
  }, [rows]);

  const [expanded, setExpanded] = useState<Record<string, boolean>>(defaultExpanded);

  useEffect(() => {
    setExpanded((prev) => ({ ...defaultExpanded, ...prev }));
  }, [defaultExpanded]);

  const flattenedRows = useMemo<DisplayRow[]>(() => {
    const output: DisplayRow[] = [];
    const walk = (items: RowDef[], level: number) => {
      items.forEach((row) => {
        if (!showRatios && row.kind === 'ratio') return;
        output.push({ ...row, level });
        if (row.children && expanded[row.id]) {
          walk(row.children, level + 1);
        }
      });
    };
    walk(rows, 0);

    const allCodes = new Set<string>();
    collectCodes(rows, allCodes);

    const unmappedCodes = new Set<string>();
    years.forEach((year) => {
      const statement = data?.[year]?.IS;
      if (!statement) return;
      Object.keys(statement).forEach((code) => {
        if (!allCodes.has(code)) unmappedCodes.add(code);
      });
    });

    if (unmappedCodes.size > 0) {
      output.push({
        id: 'unmapped_section',
        label: 'Unmapped Accounts',
        kind: 'section',
        level: 0,
      });
      Array.from(unmappedCodes)
        .sort()
        .forEach((code) => {
          output.push({
            id: `unmapped_${code}`,
            label: data?.[years[0]]?.IS?.[code]?.name || code,
            code,
            level: 1,
          });
        });
    }

    return output;
  }, [rows, expanded, showRatios, data, years]);

  const getRowValue = (row: RowDef, year: number) => {
    if (row.compute) return row.compute(year, ctx);
    if (row.code) return ctx.valueOf(row.code, year);
    return null;
  };

  const formatValue = (row: RowDef, value: number | null) => {
    if (value == null || Number.isNaN(value)) return '-';
    if (row.format === 'percent') {
      return `${percentFormatter.format(value * 100)}%`;
    }
    const abs = Math.abs(value);
    const formatted = numberFormatter.format(abs);
    return value < 0 ? `(${formatted})` : formatted;
  };

  const cellPadding = 'py-0.5';
  const textSize = 'text-[10px]';

  return (
    <div className="w-full">
      <div className="border-b border-red-700 bg-red-600 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white">
        Income Statement
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-3 py-2">
        <div className="text-[11px] text-gray-500">YE 31-Dec • USDm</div>
        <div className="flex items-center gap-3 text-xs text-gray-600">
          <label className="inline-flex items-center gap-1">
            <input
              type="checkbox"
              checked={showRatios}
              onChange={(e) => setShowRatios(e.target.checked)}
            />
            Ratios
          </label>
          <label className="inline-flex items-center gap-1">
            <input
              type="checkbox"
              checked={showCodes}
              onChange={(e) => setShowCodes(e.target.checked)}
            />
            Codes
          </label>
        </div>
      </div>

      <div className="overflow-auto">
        <table className={cn('min-w-full border-collapse', textSize)} style={{ tableLayout: 'fixed' }}>
          <thead className="sticky top-0 z-20 bg-slate-50">
            <tr>
              <th
                className={cn(
                  'sticky left-0 z-30 border-b border-r bg-slate-50 px-2 py-1 text-left font-semibold text-gray-600'
                )}
                style={{ width: 230 }}
              >
                Account
              </th>
              {years.map((year) => (
                <th
                  key={year}
                  className="relative border-b border-r bg-slate-50 px-1 py-1 text-right font-semibold text-gray-600"
                  style={{ width: colWidths[year] || DEFAULT_COL_WIDTH }}
                >
                  {year}
                  <span
                    className="absolute right-0 top-0 h-full w-1 cursor-col-resize"
                    onMouseDown={(e) =>
                      setResizing({
                        year,
                        startX: e.clientX,
                        startWidth: colWidths[year] || DEFAULT_COL_WIDTH,
                      })
                    }
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {flattenedRows.map((row) => {
              const hasChildren = !!row.children && row.children.length > 0;
              const rowClasses =
                row.kind === 'section'
                  ? 'bg-gray-50 font-semibold text-gray-700'
                  : row.kind === 'total'
                    ? 'bg-gray-50/60 font-semibold text-gray-700'
                    : row.kind === 'ratio'
                      ? 'bg-amber-50/60 text-gray-600'
                      : 'text-gray-700';
              const leftCellBg =
                row.kind === 'section'
                  ? 'bg-gray-50'
                  : row.kind === 'total'
                    ? 'bg-gray-50/60'
                    : row.kind === 'ratio'
                      ? 'bg-amber-50/60'
                      : 'bg-white';
              return (
                <tr key={row.id} className={cn('border-b', rowClasses)}>
                  <td
                    className={cn(
                      'sticky left-0 z-10 border-r px-2',
                      leftCellBg,
                      cellPadding
                    )}
                    style={{ paddingLeft: 10 + row.level * 12 }}
                  >
                    <div className="flex items-center gap-2">
                      {hasChildren && (
                        <button
                          className="h-4 w-4 rounded border text-[10px] leading-none text-gray-500"
                          onClick={() =>
                            setExpanded((prev) => ({ ...prev, [row.id]: !prev[row.id] }))
                          }
                        >
                          {expanded[row.id] ? '−' : '+'}
                        </button>
                      )}
                      <span className={cn(row.kind === 'section' && 'uppercase tracking-wide')}>
                        {row.label}
                      </span>
                      {showCodes && row.code && (
                        <span className="text-[9px] text-gray-400">{row.code}</span>
                      )}
                    </div>
                  </td>
                  {years.map((year) => {
                    const value = getRowValue(row, year);
                    return (
                      <td
                        key={year}
                        className={cn(
                          'border-r px-1 text-right font-mono text-[10px] tabular-nums text-gray-800',
                          cellPadding
                        )}
                      >
                        {formatValue(row, value)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {flattenedRows.length === 0 && (
              <tr>
                <td colSpan={years.length + 1} className="px-6 py-12 text-center text-gray-500">
                  No data available for this view.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
