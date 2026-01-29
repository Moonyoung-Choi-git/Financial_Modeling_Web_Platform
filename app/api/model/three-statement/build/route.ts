import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { buildThreeStatementModel } from '@/lib/modeling/builder';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { ticker, stockCode, userOptions } = body;
    
    // 1. 유효성 검사
    const targetTicker = ticker || stockCode;
    if (!targetTicker) {
      return NextResponse.json({ error: 'Ticker or StockCode is required' }, { status: 400 });
    }

    // 2. 모델링 옵션 설정 (기본값: 최근 3년)
    const currentYear = new Date().getFullYear();
    const years = userOptions?.years || [currentYear - 3, currentYear - 2, currentYear - 1];

    // 3. 모델링 엔진 실행 (동기 실행 예시, 운영 시에는 BullMQ Job으로 위임 권장)
    const result = await buildThreeStatementModel({
      ticker: targetTicker,
      years,
      fsDivPriority: ['CFS', 'OFS']
    });

    // 4. 결과 저장 (ModelOutput 테이블)
    // 기존 Model이 없으면 생성, 있으면 연결
    // (간소화를 위해 임시 사용자 ID 사용 또는 로직 보강 필요)
    /* const savedModel = await prisma.modelOutput.create({
       data: { ... }
    }); 
    */

    return NextResponse.json({
      status: 'success',
      ticker: targetTicker,
      data: result
    });

  } catch (error: any) {
    console.error('[API/Model/Build] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}