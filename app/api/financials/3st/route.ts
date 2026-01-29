import { NextResponse } from 'next/server';
import prisma from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get('ticker');
  const year = searchParams.get('year');
  const quarter = searchParams.get('quarter');

  if (!ticker || !year) {
    return NextResponse.json(
      { error: 'Missing required query parameters: ticker, year' },
      { status: 400 }
    );
  }

  try {
    const accounts = await prisma.financialAccount.findMany({
      where: {
        ticker,
        fiscalYear: parseInt(year),
        fiscalQuarter: quarter ? parseInt(quarter) : null,
      },
      include: {
        standardAccount: true,
      },
      orderBy: {
        standardAccountCode: 'asc',
      },
    });

    return NextResponse.json({
      IS: accounts.filter((a) => a.statementType === 'IS'),
      BS: accounts.filter((a) => a.statementType === 'BS'),
      CF: accounts.filter((a) => a.statementType === 'CF'),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}