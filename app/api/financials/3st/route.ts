import { NextResponse } from 'next/server';
import { createFinancialStatementTask, processIngestionTask } from '@/lib/ingestion';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { ticker, year, reportCode } = body;

    if (!ticker || !year) {
      return NextResponse.json(
        { error: 'Missing required fields: ticker, year' },
        { status: 400 }
      );
    }

    // 1. 수집 작업 생성 (DB 기록)
    // reportCode가 없으면 기본값(사업보고서) 사용
    const taskId = await createFinancialStatementTask(ticker, Number(year), reportCode);

    // 2. [MVP] 즉시 실행 (별도 워커 없이 API 요청 내에서 처리)
    await processIngestionTask(taskId);

    return NextResponse.json({ 
      message: 'Ingestion task completed successfully',
      taskId, 
      status: 'SUCCESS' 
    });
  } catch (error: any) {
    console.error('[API/Ingest] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}