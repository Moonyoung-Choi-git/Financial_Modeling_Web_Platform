import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import prisma from '@/lib/db';
import { buildThreeStatementModel } from '@/lib/modeling/builder';
import FinancialStatementsView from '@/components/financial-statements-view';
import { fetchFinancialAll, syncCorpCodes } from '@/lib/dart';
import { transformRawToCurated } from '@/lib/curate';

interface PageProps {
  params: Promise<{ ticker: string }>;
  searchParams?: { market?: string; refresh?: string };
}

export const dynamic = 'force-dynamic';

const REPORT_CODES = ['11011', '11012', '11014', '11013'];
const FS_DIV_PRIORITY: Array<'CFS' | 'OFS'> = ['CFS', 'OFS'];
const MARKET_CLASS_MAP: Record<string, string> = {
  KOSPI: 'Y',
  KOSDAQ: 'K',
  KONEX: 'N',
  OTHER: 'E',
};

const normalizeKey = (value: string) =>
  value
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[()·.,/-]/g, '');

type CorpResolution =
  | {
      corpCode: string;
      stockCode: string | null;
      corpName: string;
      corpCls: string | null;
    }
  | {
      error: string;
      candidates?: Array<{
        corpName: string;
        stockCode: string | null;
        corpCode: string;
        corpCls: string | null;
      }>;
    };

async function resolveCorpIdentity(input: string, market?: string): Promise<CorpResolution> {
  const trimmed = input.trim();
  const marketCls = market && MARKET_CLASS_MAP[market] ? MARKET_CLASS_MAP[market] : undefined;
  const whereMarket = marketCls ? { corpCls: marketCls } : {};

  if (/^\d{6}$/.test(trimmed)) {
    const corp = await prisma.rawDartCorpMaster.findFirst({
      where: { stockCode: trimmed, ...whereMarket },
    });
    if (corp) {
      return {
        corpCode: corp.corpCode,
        stockCode: corp.stockCode,
        corpName: corp.corpName,
        corpCls: corp.corpCls,
      };
    }
  }

  if (/^\d{8}$/.test(trimmed)) {
    const corp = await prisma.rawDartCorpMaster.findFirst({
      where: { corpCode: trimmed, ...whereMarket },
    });
    if (corp) {
      return {
        corpCode: corp.corpCode,
        stockCode: corp.stockCode,
        corpName: corp.corpName,
        corpCls: corp.corpCls,
      };
    }
  }

  if (trimmed.length >= 2) {
    const matches = await prisma.rawDartCorpMaster.findMany({
      where: {
        corpName: { contains: trimmed },
        ...whereMarket,
      },
      take: 5,
    });

    if (matches.length === 1) {
      const corp = matches[0];
      return {
        corpCode: corp.corpCode,
        stockCode: corp.stockCode,
        corpName: corp.corpName,
        corpCls: corp.corpCls,
      };
    }

    if (matches.length > 1) {
      return {
        error: 'Multiple companies matched the name. Please use stock code or corp code.',
        candidates: matches.map((corp) => ({
          corpName: corp.corpName,
          stockCode: corp.stockCode,
          corpCode: corp.corpCode,
          corpCls: corp.corpCls,
        })),
      };
    }
  }

  const marketHint = marketCls ? ' Try changing the market filter.' : '';
  return {
    error: `Company not found in DART corp master.${marketHint} Verify the input or sync corp codes.`,
  };
}

async function triggerAutoIngestion(params: {
  corpCode: string;
  years: number[];
  reportCodes?: string[];
  fsDivs?: Array<'CFS' | 'OFS'>;
}) {
  const { corpCode, years, reportCodes = REPORT_CODES, fsDivs = FS_DIV_PRIORITY } = params;

  console.log(`[Auto-Ingest] Starting ingestion for ${corpCode} (${years.join(', ')})`);

  let didIngest = false;

  for (const year of years) {
    for (const reportCode of reportCodes) {
      for (const fsDiv of fsDivs) {
        const bsnsYear = String(year);
        const fsScope = fsDiv === 'CFS' ? 'CONSOLIDATED' : 'SEPARATE';

        try {
          const hasRaw = await prisma.rawDartFnlttAllRow.findFirst({
            where: {
              corpCode,
              bsnsYear,
              reprtCode: reportCode,
              fsDiv,
            },
            select: { id: true },
          });

          let hasData = !!hasRaw;
          if (!hasRaw) {
            const result = await fetchFinancialAll({
              corp_code: corpCode,
              bsns_year: bsnsYear,
              reprt_code: reportCode,
              fs_div: fsDiv,
            });

            if (result.rowCount > 0) {
              hasData = true;
              didIngest = true;
            }
          }

          if (!hasData) continue;

          const hasCurated = await prisma.curatedFinFact.findFirst({
            where: {
              corpCode,
              fiscalYear: year,
              reportCode,
              fsScope,
            },
            select: { id: true },
          });

          if (!hasCurated || !hasRaw) {
            await transformRawToCurated({
              corpCode,
              bsnsYear,
              reprtCode: reportCode,
              fsDiv,
            });
            didIngest = true;
          }
        } catch (err: any) {
          console.warn(
            `[Auto-Ingest] Failed ${corpCode} ${year} (${fsDiv}, ${reportCode}): ${err?.message || err}`
          );
        }
      }
    }
  }

  return didIngest;
}

export default async function FinancialsPage({ params, searchParams }: PageProps) {
  const { ticker: rawTicker } = await params;
  const market = searchParams?.market;
  const forceRefresh = searchParams?.refresh === '1' || searchParams?.refresh === 'true';
  let ticker = rawTicker;
  try {
    ticker = decodeURIComponent(rawTicker);
  } catch {
    ticker = rawTicker;
  }

  if (!prisma) {
    return (
      <div className="container mx-auto py-8 px-4">
        <div className="p-4 bg-red-50 text-red-600 rounded-md">
          <h2 className="font-bold mb-2">Database Connection Error</h2>
          <p>
            Prisma client is not initialized. Please check your DATABASE_URL environment variable and
            restart the development server.
          </p>
        </div>
      </div>
    );
  }

  let corpInfo: Extract<CorpResolution, { corpCode: string }> | null = null;
  let error: string | null = null;

  let resolution = await resolveCorpIdentity(ticker, market);
  if ('error' in resolution) {
    try {
      await syncCorpCodes();
      resolution = await resolveCorpIdentity(ticker, market);
    } catch (syncError: any) {
      error = syncError?.message || 'Failed to sync corp codes from DART.';
    }
  }

  if (!error && 'error' in resolution) {
    error = resolution.error;
    if (resolution.candidates?.length) {
      const suggestions = resolution.candidates
        .map((corp) => `${corp.corpName} (${corp.stockCode || corp.corpCode})`)
        .join(', ');
      error = `${resolution.error} Top matches: ${suggestions}`;
    }
  }

  if (!error && 'corpCode' in resolution) {
    corpInfo = resolution;
  }

  const identifier = corpInfo?.stockCode || corpInfo?.corpCode || ticker;
  const corpWhere = corpInfo?.stockCode
    ? { OR: [{ stockCode: corpInfo.stockCode }, { corpCode: corpInfo.corpCode }] }
    : corpInfo?.corpCode
      ? { corpCode: corpInfo.corpCode }
      : { stockCode: ticker };

  const currentYear = new Date().getFullYear();
  const latestYear = corpInfo
    ? await prisma.curatedFinFact.aggregate({
        where: corpWhere,
        _max: { fiscalYear: true },
      })
    : { _max: { fiscalYear: null } };

  const anchorYear = latestYear._max.fiscalYear ?? currentYear - 1;
  const years = Array.from({ length: 5 }, (_, i) => anchorYear - 4 + i);

  let modelData: Record<string, any> = {};

  if (!error) {
    try {
      modelData = await buildThreeStatementModel({
        ticker: identifier,
        corpCode: corpInfo?.corpCode,
        years,
        fsDivPriority: FS_DIV_PRIORITY,
        reportPriority: REPORT_CODES,
      });
    } catch (e: any) {
      console.warn('Initial modeling failed:', e.message);
      error = e.message;
    }
  }

  const isEmptyModel = Object.keys(modelData).length === 0;
  const AUTO_INGESTION_ENABLED = process.env.AUTO_INGESTION_ENABLED !== 'false';

  if (!error && corpInfo && AUTO_INGESTION_ENABLED) {
    const coverageFacts = await prisma.curatedFinFact.findMany({
      where: {
        ...corpWhere,
        fiscalYear: { in: years },
      },
      select: {
        fiscalYear: true,
        statementType: true,
        standardLineId: true,
        accountNameKr: true,
      },
    });

    const factsByYear = new Map<number, typeof coverageFacts>();
    coverageFacts.forEach((fact) => {
      const list = factsByYear.get(fact.fiscalYear) || [];
      list.push(fact);
      factsByYear.set(fact.fiscalYear, list);
    });

    const keyLines: Record<string, string[]> = {
      IS: ['IS.REVENUE', '매출액'],
      BS: ['BS.TOTAL_ASSETS', '자산총계'],
      CF: ['CF.CFO', '영업활동현금흐름'],
    };

    const yearsNeedingIngest = years.filter((year) => {
      const facts = factsByYear.get(year) || [];
      if (facts.length === 0) return true;

      return ['BS', 'IS', 'CF'].some((statementType) => {
        const keys = keyLines[statementType];
        return !facts.some((fact) => {
          if (fact.statementType !== statementType && !(statementType === 'IS' && fact.statementType === 'CIS')) {
            return false;
          }
          const standardMatch = fact.standardLineId && keys.includes(fact.standardLineId);
          const nameMatch = keys.some((key) => normalizeKey(key) === normalizeKey(fact.accountNameKr));
          return standardMatch || nameMatch;
        });
      });
    });

    const targetYears = forceRefresh ? years : yearsNeedingIngest;

    if (targetYears.length > 0) {
      try {
        const ingested = await triggerAutoIngestion({
          corpCode: corpInfo.corpCode,
          years: targetYears,
          reportCodes: REPORT_CODES,
          fsDivs: FS_DIV_PRIORITY,
        });

        if (ingested) {
          modelData = await buildThreeStatementModel({
            ticker: identifier,
            corpCode: corpInfo.corpCode,
            years,
            fsDivPriority: FS_DIV_PRIORITY,
            reportPriority: REPORT_CODES,
          });
        } else if (isEmptyModel) {
          error = 'No financial data found after auto-ingestion.';
        }
      } catch (retryError: any) {
        console.error('Auto-ingestion and retry failed:', retryError);
        error = retryError?.message || 'Auto-ingestion failed';
      }
    }
  }

  if (isEmptyModel && !error) {
    error = `No financial data found for ${identifier}. Try a different report year or verify the corp code.`;
  }

  const availableYears = Object.keys(modelData)
    .map((y) => parseInt(y, 10))
    .filter((y) => Number.isFinite(y))
    .sort((a, b) => a - b);
  const displayAnchor = availableYears.length > 0 ? Math.max(...availableYears) : anchorYear;
  const yearsToDisplay = Array.from({ length: 5 }, (_, i) => displayAnchor - 4 + i);

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-8 space-y-4">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="rounded-full border p-2 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold">
              Financial Statements: {corpInfo?.corpName || identifier}
            </h1>
            <p className="text-gray-500">
              {corpInfo?.corpName
                ? `${identifier} • Historical 3-Statement Model (Source: DART Open API)`
                : 'Historical 3-Statement Model (Source: DART Open API)'}
            </p>
          </div>
        </div>

        {error && (
          <div className="mt-2 p-4 bg-red-50 text-red-600 rounded-md">
            Error loading model: {error}
          </div>
        )}
      </div>

      <FinancialStatementsView data={modelData} years={yearsToDisplay} />
    </div>
  );
}
