'use client';

import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';

export type StatementType = 'IS' | 'BS' | 'CF';

export type StatementItem = {
  name?: string;
  value?: number;
  unit?: string;
  reportedName?: string;
  standardLineId?: string;
};

export type StatementData = Record<string, StatementItem>;

export type StatementYearData = {
  meta?: {
    fsDiv?: string;
    year?: number;
    source?: string;
  };
} & Partial<Record<StatementType, StatementData>>;

export type RowDef = {
  id: string;
  label: string;
  labelKr?: string;
  codes?: string[];
  sumOf?: string[];
  format?: 'number' | 'percent';
  kind?: 'section' | 'value' | 'ratio' | 'total';
  compute?: (year: number, ctx: ComputeCtx) => number | null;
  children?: RowDef[];
};

export type DisplayRow = RowDef & { level: number };

export type ComputeCtx = {
  years: number[];
  statementType: StatementType;
  valueOf: (codes: string | string[], year: number) => number | null;
  sumOf: (codes: string[], year: number) => number | null;
  prevYear: (year: number) => number | null;
};

interface StatementTableProps {
  title: string;
  statementType: StatementType;
  data: Record<number, StatementYearData>;
  years: number[];
  rows: RowDef[];
  defaultShowRatios?: boolean;
}

const numberFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const percentFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const DEFAULT_COL_WIDTH = 88;
const MIN_COL_WIDTH = 56;
const MAX_COL_WIDTH = 180;

const HEADER_TONES: Record<StatementType, string> = {
  IS: 'border-red-700 bg-red-600 text-white',
  BS: 'border-emerald-700 bg-emerald-600 text-white',
  CF: 'border-blue-700 bg-blue-600 text-white',
};

const normalizeKey = (value: string) =>
  value
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[()·.,/-]/g, '');

const collectCodes = (rows: RowDef[], set: Set<string>) => {
  rows.forEach((row) => {
    row.codes?.forEach((code) => set.add(code));
    row.sumOf?.forEach((code) => set.add(code));
    if (row.children) collectCodes(row.children, set);
  });
};

export default function StatementTable({
  title,
  statementType,
  data,
  years,
  rows,
  defaultShowRatios = false,
}: StatementTableProps) {
  const [showRatios, setShowRatios] = useState(defaultShowRatios);
  const [showCodes, setShowCodes] = useState(false);
  const [showUnmapped, setShowUnmapped] = useState(false);
  const [colWidths, setColWidths] = useState<Record<number, number>>({});
  const [resizing, setResizing] = useState<{
    year: number;
    startX: number;
    startWidth: number;
  } | null>(null);

  const hasRatios = useMemo(() => {
    let found = false;
    const walk = (items: RowDef[]) => {
      items.forEach((row) => {
        if (row.kind === 'ratio') found = true;
        if (row.children) walk(row.children);
      });
    };
    walk(rows);
    return found;
  }, [rows]);

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

  const lookups = useMemo(() => {
    const map = new Map<
      number,
      {
        byCode: StatementData;
        byName: Map<string, StatementItem>;
        byNormalizedName: Map<string, StatementItem>;
      }
    >();

    years.forEach((year) => {
      const statement = data?.[year]?.[statementType] || {};
      const byName = new Map<string, StatementItem>();
      const byNormalizedName = new Map<string, StatementItem>();
      const addName = (name: string | undefined, item: StatementItem) => {
        if (!name) return;
        byName.set(name, item);
        const normalized = normalizeKey(name);
        if (normalized && !byNormalizedName.has(normalized)) {
          byNormalizedName.set(normalized, item);
        }
      };
      Object.values(statement).forEach((item) => {
        if (!item) return;
        addName(item.name, item);
        if (item.reportedName && item.reportedName !== item.name) {
          addName(item.reportedName, item);
        }
      });
      map.set(year, { byCode: statement, byName, byNormalizedName });
    });

    return map;
  }, [data, years, statementType]);

  const ctx = useMemo<ComputeCtx>(() => {
    const yearIndex = new Map<number, number>(years.map((y, i) => [y, i]));

    const getItem = (code: string, year: number) => {
      const entry = lookups.get(year);
      if (!entry) return null;
      if (entry.byCode?.[code]) return entry.byCode[code];
      if (entry.byName.has(code)) return entry.byName.get(code) || null;
      const normalized = normalizeKey(code);
      return entry.byNormalizedName.get(normalized) || null;
    };

    const valueOf = (codes: string | string[], year: number) => {
      const list = Array.isArray(codes) ? codes : [codes];
      for (const code of list) {
        const item = getItem(code, year);
        if (item && item.value !== undefined && item.value !== null) return item.value;
      }
      return null;
    };

    const sumOf = (codes: string[], year: number) => {
      let found = false;
      let sum = 0;
      codes.forEach((code) => {
        const item = getItem(code, year);
        if (item && item.value !== undefined && item.value !== null) {
          sum += item.value;
          found = true;
        }
      });
      return found ? sum : null;
    };

    const prevYear = (year: number) => {
      const idx = yearIndex.get(year);
      if (idx == null || idx === 0) return null;
      return years[idx - 1];
    };

    return { years, statementType, valueOf, sumOf, prevYear };
  }, [years, lookups, statementType]);

  const allCodes = useMemo(() => {
    const set = new Set<string>();
    collectCodes(rows, set);
    return set;
  }, [rows]);

  const normalizedCodes = useMemo(() => {
    const set = new Set<string>();
    allCodes.forEach((code) => set.add(normalizeKey(code)));
    return set;
  }, [allCodes]);

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

    if (showUnmapped) {
      const unmappedCodes = new Set<string>();
      years.forEach((year) => {
        const statement = data?.[year]?.[statementType];
        if (!statement) return;
        Object.keys(statement).forEach((code) => {
          const item = statement[code];
          if (allCodes.has(code) || normalizedCodes.has(normalizeKey(code))) return;
          if (item?.name && (allCodes.has(item.name) || normalizedCodes.has(normalizeKey(item.name)))) return;
          if (
            item?.reportedName &&
            (allCodes.has(item.reportedName) ||
              normalizedCodes.has(normalizeKey(item.reportedName)))
          ) {
            return;
          }
          unmappedCodes.add(code);
        });
      });

      if (unmappedCodes.size > 0) {
        output.push({
          id: 'unmapped_section',
          label: 'Other Accounts',
          labelKr: '기타 계정',
          kind: 'section',
          level: 0,
        });
        Array.from(unmappedCodes)
          .sort()
          .forEach((code) => {
            output.push({
              id: `unmapped_${code}`,
              label: data?.[years[0]]?.[statementType]?.[code]?.name || code,
              codes: [code],
              level: 1,
            });
          });
      }
    }

    return output;
  }, [rows, expanded, showRatios, showUnmapped, data, years, statementType, allCodes, normalizedCodes]);

  const getRowValue = (row: RowDef, year: number) => {
    if (row.compute) return row.compute(year, ctx);
    if (row.sumOf) return ctx.sumOf(row.sumOf, year);
    if (row.codes) return ctx.valueOf(row.codes, year);
    return null;
  };

  const formatValue = (row: RowDef, value: number | null) => {
    if (row.kind === 'section') return '';
    if (value == null || Number.isNaN(value)) return '-';
    if (row.format === 'percent') {
      return `${percentFormatter.format(value * 100)}%`;
    }
    const abs = Math.abs(value);
    const formatted = numberFormatter.format(abs);
    return value < 0 ? `(${formatted})` : formatted;
  };

  const headerMeta = useMemo(() => {
    for (let i = years.length - 1; i >= 0; i--) {
      const year = years[i];
      const unit = Object.values(data?.[year]?.[statementType] || {}).find(
        (item) => item?.unit
      )?.unit;
      if (unit) return unit;
    }
    return null;
  }, [data, years, statementType]);

  const cellPadding = 'py-0.5';
  const textSize = 'text-[10px]';
  const headerTone = HEADER_TONES[statementType] || HEADER_TONES.IS;

  return (
    <div className="w-full font-[calibri,arial,sans-serif]">
      <div className={cn('border-b px-3 py-2 text-xs font-semibold uppercase tracking-wide', headerTone)}>
        {title}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-3 py-2">
        <div className="text-[11px] text-gray-500">
          {headerMeta ? `${headerMeta}` : 'Financial Statement'}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-600">
          {hasRatios && (
            <label className="inline-flex items-center gap-1">
              <input
                type="checkbox"
                checked={showRatios}
                onChange={(e) => setShowRatios(e.target.checked)}
              />
              Ratios
            </label>
          )}
          <label className="inline-flex items-center gap-1">
            <input
              type="checkbox"
              checked={showCodes}
              onChange={(e) => setShowCodes(e.target.checked)}
            />
            Codes
          </label>
          <label className="inline-flex items-center gap-1">
            <input
              type="checkbox"
              checked={showUnmapped}
              onChange={(e) => setShowUnmapped(e.target.checked)}
            />
            Other Accounts
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
                  <div className="text-[9px] font-normal text-gray-400">
                    {data?.[year]?.meta?.fsDiv || '-'}
                  </div>
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
                  ? 'bg-gray-100 font-semibold text-gray-700'
                  : row.kind === 'total'
                    ? 'bg-gray-50/70 font-semibold text-gray-800'
                    : row.kind === 'ratio'
                      ? 'bg-amber-50/60 text-gray-600'
                      : 'text-gray-700';
              const leftCellBg =
                row.kind === 'section'
                  ? 'bg-gray-100'
                  : row.kind === 'total'
                    ? 'bg-gray-50/70'
                    : row.kind === 'ratio'
                      ? 'bg-amber-50/60'
                      : 'bg-white';

              const totalBorder = row.kind === 'total' ? 'border-t-2 border-gray-300' : '';

              return (
                <tr key={row.id} className={cn('border-b', rowClasses)}>
                  <td
                    className={cn(
                      'sticky left-0 z-10 border-r px-2',
                      leftCellBg,
                      cellPadding,
                      totalBorder
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
                      <div className="min-w-0">
                        <div className={cn(row.kind === 'section' && 'uppercase tracking-wide')}>
                          {row.label}
                        </div>
                        {row.labelKr && (
                          <div className="text-[9px] text-gray-400">{row.labelKr}</div>
                        )}
                      </div>
                      {showCodes && row.codes && row.codes.length > 0 && (
                        <span className="text-[9px] text-gray-400">{row.codes[0]}</span>
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
                          cellPadding,
                          totalBorder
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
