import prisma from './db';
import { computeHash } from './crypto';
import { fetchOpenDart } from './opendart';

/**
 * Step 1: Pre-flight Audit Logging
 * 작업을 시작하기 전에 DB에 기록을 남깁니다.
 */
export async function createIngestionTask(
  provider: string,
  endpoint: string,
  params: Record<string, any>
) {
  const job = await prisma.fetchJob.create({
    data: {
      provider,
      endpoint,
      params,
      status: 'PENDING',
    },
  });
  return job.taskId;
}

/**
 * Ingestion Pipeline Execution
 * 워커가 실행할 실제 로직입니다.
 */
export async function processIngestionTask(taskId: string) {
  // 0. 작업 상태 조회 및 Running 변경
  const job = await prisma.fetchJob.findUnique({ where: { taskId } });
  if (!job) throw new Error(`Job ${taskId} not found`);

  await prisma.fetchJob.update({
    where: { taskId },
    data: { status: 'RUNNING', startedAt: new Date() },
  });

  try {
    // Step 2: Dual-Channel Ingestion (Mocking Fetch for MVP)
    // 실제 구현 시에는 axios/fetch 또는 Playwright 사용
    let fetchedData;
    if (job.provider === 'OPENDART') {
      fetchedData = await fetchOpenDart(job.endpoint, job.params as Record<string, any>);
    } else {
      throw new Error(`Unsupported provider: ${job.provider}`);
    }

    // Step 3: Immutable Raw Blob Storage
    // 원본 데이터를 변형 없이 저장
    const rawArchive = await prisma.sourceRawArchive.create({
      data: {
        taskId: job.taskId,
        provider: job.provider,
        rawPayload: fetchedData.payload, // JSONB
        etag: fetchedData.etag,
        receivedAt: new Date(),
      },
    });

    // Step 4: Integrity Hashing
    // 저장된 데이터의 해시를 계산하여 무결성 로그 기록
    const sha256 = computeHash(fetchedData.payload, 'sha256');

    await prisma.dataIntegrityLog.create({
      data: {
        rawArchiveId: rawArchive.id,
        sha256: sha256,
        hashAlgo: 'SHA-256',
        verifierVersion: 'v1.0.0',
      },
    });

    // Step 5: Meta Indexing (MVP: Basic Info)
    // 검색을 위한 메타 데이터 추출
    const params = job.params as any;
    if (params.ticker && params.year && params.reportCode) {
      await prisma.sourceRawMetaIndex.create({
        data: {
          rawArchiveId: rawArchive.id,
          ticker: params.ticker,
          corpName: params.corpName || 'Unknown',
          reportCode: params.reportCode,
          fiscalYear: parseInt(params.year),
          documentType: 'FS', // Financial Statement
        },
      });
    }

    // 작업 성공 처리
    await prisma.fetchJob.update({
      where: { taskId },
      data: { status: 'SUCCESS', finishedAt: new Date() },
    });

    console.log(`[Ingestion] Task ${taskId} completed successfully.`);
    return rawArchive.id;

  } catch (error: any) {
    // 실패 처리 및 DLQ 로직 (간소화)
    console.error(`[Ingestion] Task ${taskId} failed:`, error);

    await prisma.fetchJob.update({
      where: { taskId },
      data: {
        status: 'FAILED',
        lastError: error.message,
        finishedAt: new Date(),
      },
    });

    // DLQ Record 생성
    await prisma.dlqRecord.create({
      data: {
        taskId: taskId,
        errorType: 'INGESTION_ERROR',
        errorMessage: error.message,
        stackTrace: error.stack,
      },
    });

    throw error; // BullMQ가 재시도 처리를 하도록 에러 전파
  }
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
  const corpInfo = await prisma.corpCode.findFirst({
    where: { stockCode: ticker },
  });

  if (!corpInfo) {
    throw new Error(`CorpCode not found for ticker: ${ticker}. Please ensure syncCorpCodes() has been run.`);
  }

  // 2. 파라미터 구성
  // DART API 파라미터(corp_code 등)와 내부 메타데이터용 파라미터(ticker 등)를 함께 구성
  const params = {
    corp_code: corpInfo.code,
    bsns_year: year.toString(),
    reprt_code: reportCode,
    fs_div: fsDiv, // 연결재무제표(CFS) 우선, 필요 시 개별(OFS)
    
    // 내부 메타데이터용 (processIngestionTask에서 사용)
    ticker: ticker,
    corpName: corpInfo.name,
    year: year.toString(),
    reportCode: reportCode
  };

  // 3. 작업 생성 (fnlttSinglAcntAll: 단일회사 전체 재무제표)
  return createIngestionTask('OPENDART', 'fnlttSinglAcntAll', params);
}
