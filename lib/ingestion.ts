import prisma from './db';
import { fetchFinancialAll } from './dart/financial';

/**
 * Legacy ingestion task APIs (deprecated).
 * The current pipeline uses RawDart* tables via lib/dart and curates via lib/curate.
 */
export async function createIngestionTask(
  provider: string,
  endpoint: string,
  params: Record<string, any>
) {
  throw new Error(
    `[Ingestion] Deprecated task API. Use DartClient or fetchFinancialAll directly. (provider=${provider}, endpoint=${endpoint})`
  );
}

/**
 * Deprecated: task-based ingestion is no longer supported.
 */
export async function processIngestionTask(taskId: string) {
  throw new Error(
    `[Ingestion] Deprecated task API. Use DartClient or fetchFinancialAll directly. (taskId=${taskId})`
  );
}

/**
 * Ticker를 기반으로 DART 재무제표 수집 작업을 생성합니다.
 * CorpCode 테이블에서 고유번호를 조회하여 API 파라미터를 구성합니다.
 * 
 * @param ticker 종목코드 (예: 005930)
 * @param year 사업연도 (예: 2023)
 * @param reportCode 보고서 코드 (기본값: 11011 사업보고서)
 */
export async function createFinancialStatementTask(
  ticker: string,
  year: number,
  reportCode: string = '11011', // 11011: 사업보고서, 11012: 반기, 11013: 1분기, 11014: 3분기
  fsDiv: 'CFS' | 'OFS' = 'CFS' // CFS: 연결, OFS: 개별
) {
  // 1. CorpCode 조회
  const corpInfo = await prisma.rawDartCorpMaster.findFirst({
    where: { stockCode: ticker },
  });

  if (!corpInfo) {
    throw new Error(`CorpCode not found for ticker: ${ticker}. Please ensure syncCorpCodes() has been run.`);
  }

  await fetchFinancialAll({
    corp_code: corpInfo.corpCode,
    bsns_year: year.toString(),
    reprt_code: reportCode,
    fs_div: fsDiv,
  });

  return `${corpInfo.corpCode}:${year}:${reportCode}:${fsDiv}`;
}
