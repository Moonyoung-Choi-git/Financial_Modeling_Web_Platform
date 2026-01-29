import { NextResponse } from 'next/server';
import { createFinancialStatementTask } from '@/lib/ingestion';

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

    // reportCode가 없으면 기본값(사업보고서) 사용
    const taskId = await createFinancialStatementTask(ticker, Number(year), reportCode);

    return NextResponse.json({ 
      message: 'Ingestion task created successfully',
      taskId, 
      status: 'PENDING' 
    });
  } catch (error: any) {
    console.error('[API/Ingest] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}