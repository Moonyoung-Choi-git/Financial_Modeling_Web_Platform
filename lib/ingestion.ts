import prisma from './db';
import { computeHash } from './crypto';

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
    const fetchedData = await mockFetch(job.provider, job.endpoint, job.params);

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

// Mock Fetch Function
async function mockFetch(provider: string, endpoint: string, params: any) {
  // 실제 API 호출을 시뮬레이션
  await new Promise((resolve) => setTimeout(resolve, 500));
  
  return {
    payload: {
      status: 'OK',
      data: {
        ...params,
        revenue: 100000000,
        netIncome: 20000000,
      },
    },
    etag: 'mock-etag-12345',
  };
}
