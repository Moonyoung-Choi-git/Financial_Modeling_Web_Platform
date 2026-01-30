import { buildThreeStatementModel } from '@/lib/modeling/builder';
import { createFinancialStatementTask, processIngestionTask } from '@/lib/ingestion';
import { refineFinancialData } from '@/lib/refinement';
import { syncCorpCodes } from '@/lib/corp-code';
import prisma from '@/lib/db';
import FinancialStatementsView from '@/components/financial-statements-view';

interface PageProps {
  params: Promise<{ ticker: string }>;
}

export const dynamic = 'force-dynamic';

// [추가] 데이터가 없을 경우 실행할 자동 수집(Ingestion) 함수
async function triggerAutoIngestion(ticker: string, years: number[]) {
  console.log(`[Auto-Ingest] Starting ingestion for ${ticker} (${years.join(', ')})`);

  // 1) CorpCode가 없으면 동기화 (최초 1회)
  const corpExists = await prisma.corpCode.findFirst({
    where: { stockCode: ticker },
    select: { code: true },
  });
  if (!corpExists) {
    console.log(`[Auto-Ingest] CorpCode missing for ${ticker}. Syncing corp codes...`);
    await syncCorpCodes();
  }

  // 2) 연도별 수집 (기본: CFS -> OFS)
  const fsDivPriority: Array<'CFS' | 'OFS'> = ['CFS', 'OFS'];
  const reportCodes = ['11011']; // 사업보고서 우선 (필요 시 확장 가능)

  let didIngest = false;

  for (const year of years) {
    const alreadyHasData = await prisma.financialAccount.findFirst({
      where: { ticker, fiscalYear: year },
      select: { id: true },
    });
    if (alreadyHasData) continue;

    let yearIngested = false;

    for (const fsDiv of fsDivPriority) {
      for (const reportCode of reportCodes) {
        try {
          const taskId = await createFinancialStatementTask(ticker, year, reportCode, fsDiv);
          const rawArchiveId = await processIngestionTask(taskId);
          if (rawArchiveId) {
            await refineFinancialData(rawArchiveId);
            didIngest = true;
            yearIngested = true;
            console.log(`[Auto-Ingest] Completed ${ticker} ${year} (${fsDiv}, ${reportCode}).`);
            break;
          }
        } catch (err: any) {
          console.warn(
            `[Auto-Ingest] Failed ${ticker} ${year} (${fsDiv}, ${reportCode}): ${err?.message || err}`
          );
          // 다음 우선순위로 계속 시도
        }
      }
      if (yearIngested) break;
    }
  }

  return didIngest;
}

export default async function FinancialsPage({ params }: PageProps) {
  const { ticker } = await params;
  
  // 기준 연도: DB에 데이터가 있으면 가장 최신 연도, 없으면 직전 연도
  // (실제 운영 시에는 DB 캐시를 먼저 조회하고 없으면 생성하는 로직 권장)
  const currentYear = new Date().getFullYear();
  const latestYear = await prisma.financialAccount.aggregate({
    where: { ticker },
    _max: { fiscalYear: true },
  });
  const anchorYear = latestYear._max.fiscalYear ?? currentYear - 1;
  const years = Array.from({ length: 5 }, (_, i) => anchorYear - 4 + i);
  
  let modelData = {};
  let error = null;

  try {
    modelData = await buildThreeStatementModel({
      ticker,
      years,
      fsDivPriority: ['CFS', 'OFS'] // 연결 우선, 없으면 개별
    });
  } catch (e: any) {
    console.warn('Initial modeling failed:', e.message);
    error = e.message;
  }

  const isEmptyModel = Object.keys(modelData).length === 0;
  if (isEmptyModel) {
    try {
      const ingested = await triggerAutoIngestion(ticker, years);
      if (ingested) {
        modelData = await buildThreeStatementModel({
          ticker,
          years,
          fsDivPriority: ['CFS', 'OFS']
        });
        error = null;
      } else if (!error) {
        error = 'No financial data found after auto-ingestion.';
      }
    } catch (retryError: any) {
      console.error('Auto-ingestion and retry failed:', retryError);
      if (!error) error = retryError?.message || 'Auto-ingestion failed';
    }
  }
  // 실제 데이터가 있는 연도를 기준으로 5개 연도 범위 표시
  const availableYears = Object.keys(modelData)
    .map((y) => parseInt(y, 10))
    .filter((y) => Number.isFinite(y))
    .sort((a, b) => a - b);
  const displayAnchor = availableYears.length > 0
    ? Math.max(...availableYears)
    : anchorYear;
  const yearsToDisplay = Array.from({ length: 5 }, (_, i) => displayAnchor - 4 + i);

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Financial Statements: {ticker}</h1>
        <p className="text-gray-500">
          Historical 3-Statement Model (Source: DART Open API)
        </p>
        {error && (
          <div className="mt-4 p-4 bg-red-50 text-red-600 rounded-md">
            Error loading model: {error}
          </div>
        )}
      </div>

      {/* 데이터 뷰어 컴포넌트 */}
      <FinancialStatementsView 
        data={modelData} 
        years={yearsToDisplay}
      />
    </div>
  );
}
