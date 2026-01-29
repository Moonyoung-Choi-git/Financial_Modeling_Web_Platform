import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/db';
import { refineFinancialData } from '@/lib/refinement';

export const dynamic = 'force-dynamic';

const isMissingTableError = (error: unknown) => {
  const err = error as { code?: string; message?: string };
  return (
    err?.code === 'P2021' ||
    (typeof err?.message === 'string' &&
      err.message.includes('does not exist'))
  );
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get('ticker')?.trim();
  const yearParam = searchParams.get('year')?.trim();
  const quarterParam = searchParams.get('quarter')?.trim();

  if (!ticker || !yearParam) {
    return NextResponse.json(
      { error: 'Missing required query parameters: ticker, year' },
      { status: 400 }
    );
  }

  try {
    const fiscalYear = Number.parseInt(yearParam, 10);
    if (!Number.isFinite(fiscalYear)) {
      return NextResponse.json({ error: 'Invalid year' }, { status: 400 });
    }

    let fiscalQuarter: number | undefined;
    if (quarterParam) {
      const parsedQuarter = Number.parseInt(quarterParam, 10);
      if (!Number.isFinite(parsedQuarter)) {
        return NextResponse.json({ error: 'Invalid quarter' }, { status: 400 });
      }
      fiscalQuarter = parsedQuarter;
    }

    const where: {
      ticker: string;
      fiscalYear: number;
      fiscalQuarter?: number;
    } = {
      ticker,
      fiscalYear,
    };
    if (fiscalQuarter !== undefined) {
      where.fiscalQuarter = fiscalQuarter;
    }

    const findOptions = {
      where,
      include: {
        standardAccount: true,
      },
      orderBy: {
        standardAccountCode: 'asc' as const,
      },
    };

    let accounts = await prisma.financialAccount.findMany(findOptions);

    if (accounts.length === 0) {
      const rawWhere: {
        ticker: string;
        fiscalYear: number;
        fiscalQuarter?: number;
      } = {
        ticker,
        fiscalYear,
      };
      if (fiscalQuarter !== undefined) {
        rawWhere.fiscalQuarter = fiscalQuarter;
      }

      const latestRaw = await prisma.sourceRawMetaIndex.findFirst({
        where: rawWhere,
        orderBy: { createdAt: 'desc' },
        select: { rawArchiveId: true },
      });

      if (latestRaw?.rawArchiveId) {
        await refineFinancialData(latestRaw.rawArchiveId);
        accounts = await prisma.financialAccount.findMany(findOptions);
      }
    }

    return NextResponse.json({
      IS: accounts.filter((a) => a.statementType === 'IS'),
      BS: accounts.filter((a) => a.statementType === 'BS'),
      CF: accounts.filter((a) => a.statementType === 'CF'),
    });
  } catch (error: any) {
    if (
      (error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2021') ||
      isMissingTableError(error)
    ) {
      return NextResponse.json(
        {
          error:
            'Database schema not initialized. Run: npm run db:push (or npm run db:migrate) and restart the app.',
        },
        { status: 503 }
      );
    }
    console.error('[financials/3st] Failed to load data:', error);
    return NextResponse.json(
      { error: error?.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
