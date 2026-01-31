import { NextResponse } from 'next/server';
import prisma from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const ticker = searchParams.get('ticker');
    const year = searchParams.get('year');

    if (!ticker || !year) {
      return NextResponse.json(
        { error: 'Missing required query parameters: ticker, year' },
        { status: 400 }
      );
    }

    const fiscalYear = parseInt(year, 10);

    // 1. DB에서 계정 데이터 조회
    const facts = await prisma.curatedFinFact.findMany({
      where: {
        stockCode: ticker,
        fiscalYear: fiscalYear,
      },
      include: {
        standardCoa: true,
      },
      orderBy: {
        standardLineId: 'asc',
      },
    });

    // 2. 데이터가 없는 경우 처리
    if (facts.length === 0) {
      // 원본 데이터(Raw Data)가 있는지 확인
      const corp = await prisma.rawDartCorpMaster.findFirst({
        where: { stockCode: ticker },
        select: { corpCode: true },
      });

      const rawExists = corp
        ? await prisma.rawDartFnlttAllRow.findFirst({
            where: {
              corpCode: corp.corpCode,
              bsnsYear: fiscalYear.toString(),
            },
            select: { id: true },
          })
        : null;

      if (!rawExists) {
        return NextResponse.json(
          { error: `No raw data found for ticker ${ticker} and year ${year}.` },
          { status: 404 }
        );
      }
    }

    // 3. 3-Statement 형태로 변환
    const response = {
      IS: facts.filter((a) => a.statementType === 'IS').map(formatFact),
      BS: facts.filter((a) => a.statementType === 'BS').map(formatFact),
      CF: facts.filter((a) => a.statementType === 'CF').map(formatFact),
    };

    return NextResponse.json(response);
  } catch (error: any) {
    console.error('[API/Financials/3st] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}

function formatFact(fact: any) {
  const standardCode =
    fact.standardLineId || fact.accountSourceId || fact.accountNameKr;
  const standardName =
    fact.standardCoa?.displayNameEn ||
    fact.standardCoa?.displayNameKr ||
    fact.accountNameKr;

  return {
    id: fact.id,
    standardAccountCode: standardCode,
    standardAccountName: standardName,
    reportedAccountName: fact.accountNameKr,
    value: fact.amount.toString(),
    unit: fact.currency,
    statementType: fact.statementType,
  };
}
