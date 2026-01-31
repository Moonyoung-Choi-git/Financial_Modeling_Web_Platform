import { NextRequest, NextResponse } from 'next/server';
import { Queue } from 'bullmq';
import { redis } from '@/lib/redis';
import prisma from '@/lib/db';
import { syncCorpCodes } from '@/lib/dart';
import { transformRawToCurated } from '@/lib/curate';

export const dynamic = 'force-dynamic';

const QUEUE_NAME = process.env.QUEUE_NAME || 'fmwp-ingestion';
const REPORT_CODES = ['11011', '11012', '11014', '11013'];
const FS_DIVS: Array<'CFS' | 'OFS'> = ['CFS', 'OFS'];

/**
 * Admin Sync API Endpoint
 *
 * Allows administrators to manually trigger data sync for specific companies or operations.
 *
 * POST /api/admin/sync
 *
 * Actions:
 * - sync-corp-codes: Sync all corporation codes from DART
 * - queue-company: Queue a specific company for financial data ingestion
 * - curate-company: Trigger curation for a specific company
 * - queue-year: Queue all companies for a specific year
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, corpCode, stockCode, years, year } = body;

    // Validate action
    if (!action) {
      return NextResponse.json(
        { error: 'Action is required', validActions: ['sync-corp-codes', 'queue-company', 'curate-company', 'queue-year'] },
        { status: 400 }
      );
    }

    switch (action) {
      case 'sync-corp-codes': {
        const stats = await syncCorpCodes();
        return NextResponse.json({
          success: true,
          action: 'sync-corp-codes',
          stats,
        });
      }

      case 'queue-company': {
        if (!corpCode && !stockCode) {
          return NextResponse.json(
            { error: 'corpCode or stockCode is required' },
            { status: 400 }
          );
        }

        // Resolve corpCode from stockCode if needed
        let resolvedCorpCode = corpCode;
        if (!resolvedCorpCode && stockCode) {
          const corp = await prisma.rawDartCorpMaster.findFirst({
            where: { stockCode },
            select: { corpCode: true, corpName: true },
          });
          if (!corp) {
            return NextResponse.json(
              { error: `Company not found for stockCode: ${stockCode}` },
              { status: 404 }
            );
          }
          resolvedCorpCode = corp.corpCode;
        }

        // Determine years to fetch
        const targetYears = years || [new Date().getFullYear()];

        // Queue the job
        const queue = new Queue(QUEUE_NAME, { connection: redis });

        try {
          const job = await queue.add(
            'FetchMultiYearFinancialsJob',
            {
              corpCode: resolvedCorpCode,
              years: targetYears,
              reportCodes: REPORT_CODES,
              fsDivs: FS_DIVS,
            },
            {
              jobId: `admin-sync-${resolvedCorpCode}-${Date.now()}`,
              attempts: 3,
              backoff: {
                type: 'exponential',
                delay: 5000,
              },
            }
          );

          return NextResponse.json({
            success: true,
            action: 'queue-company',
            corpCode: resolvedCorpCode,
            years: targetYears,
            jobId: job.id,
          });
        } finally {
          await queue.close();
        }
      }

      case 'curate-company': {
        if (!corpCode && !stockCode) {
          return NextResponse.json(
            { error: 'corpCode or stockCode is required' },
            { status: 400 }
          );
        }

        // Resolve corpCode from stockCode if needed
        let resolvedCorpCode = corpCode;
        if (!resolvedCorpCode && stockCode) {
          const corp = await prisma.rawDartCorpMaster.findFirst({
            where: { stockCode },
            select: { corpCode: true },
          });
          if (!corp) {
            return NextResponse.json(
              { error: `Company not found for stockCode: ${stockCode}` },
              { status: 404 }
            );
          }
          resolvedCorpCode = corp.corpCode;
        }

        // Get all raw data combinations for this company
        const combinations = await prisma.rawDartFnlttAllRow.groupBy({
          by: ['bsnsYear', 'reprtCode', 'fsDiv'],
          where: { corpCode: resolvedCorpCode },
        });

        if (combinations.length === 0) {
          return NextResponse.json(
            { error: `No raw data found for corpCode: ${resolvedCorpCode}` },
            { status: 404 }
          );
        }

        // Curate each combination
        const results = [];
        for (const combo of combinations) {
          const result = await transformRawToCurated({
            corpCode: resolvedCorpCode,
            bsnsYear: combo.bsnsYear,
            reprtCode: combo.reprtCode,
            fsDiv: combo.fsDiv,
          });
          results.push({
            year: combo.bsnsYear,
            reportCode: combo.reprtCode,
            fsDiv: combo.fsDiv,
            ...result,
          });
        }

        const totalRowsCreated = results.reduce((sum, r) => sum + r.rowsCreated, 0);

        return NextResponse.json({
          success: true,
          action: 'curate-company',
          corpCode: resolvedCorpCode,
          combinationsCurated: combinations.length,
          totalRowsCreated,
          results,
        });
      }

      case 'queue-year': {
        const targetYear = year || new Date().getFullYear();

        // Get all listed companies
        const companies = await prisma.rawDartCorpMaster.findMany({
          where: {
            stockCode: { not: null },
            corpCls: { in: ['Y', 'K'] },
          },
          select: { corpCode: true },
        });

        const queue = new Queue(QUEUE_NAME, { connection: redis });

        try {
          let jobsQueued = 0;

          for (const company of companies) {
            await queue.add(
              'FetchMultiYearFinancialsJob',
              {
                corpCode: company.corpCode,
                years: [targetYear],
                reportCodes: REPORT_CODES,
                fsDivs: FS_DIVS,
              },
              {
                jobId: `admin-year-${company.corpCode}-${targetYear}-${Date.now()}`,
                delay: jobsQueued * 600, // Rate limiting
                attempts: 3,
                backoff: {
                  type: 'exponential',
                  delay: 5000,
                },
              }
            );
            jobsQueued++;
          }

          return NextResponse.json({
            success: true,
            action: 'queue-year',
            year: targetYear,
            companiesQueued: jobsQueued,
          });
        } finally {
          await queue.close();
        }
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}`, validActions: ['sync-corp-codes', 'queue-company', 'curate-company', 'queue-year'] },
          { status: 400 }
        );
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[Admin Sync API] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * GET /api/admin/sync
 *
 * Returns current sync status and statistics
 */
export async function GET() {
  try {
    // Get counts
    const [totalCompanies, listedCompanies, rawRows, curatedFacts] = await Promise.all([
      prisma.rawDartCorpMaster.count(),
      prisma.rawDartCorpMaster.count({
        where: { stockCode: { not: null }, corpCls: { in: ['Y', 'K'] } },
      }),
      prisma.rawDartFnlttAllRow.count(),
      prisma.curatedFinFact.count(),
    ]);

    // Get coverage by year
    const coverageByYear = await prisma.curatedFinFact.groupBy({
      by: ['fiscalYear'],
      _count: { id: true },
      orderBy: { fiscalYear: 'desc' },
      take: 15,
    });

    // Get companies with curated data
    const companiesWithData = await prisma.curatedFinFact.groupBy({
      by: ['corpCode'],
    });

    // Get market breakdown
    const marketBreakdown = await prisma.rawDartCorpMaster.groupBy({
      by: ['corpCls'],
      where: { stockCode: { not: null } },
      _count: { corpCode: true },
    });

    const marketLabels: Record<string, string> = {
      Y: 'KOSPI',
      K: 'KOSDAQ',
      N: 'KONEX',
      E: 'OTHER',
    };

    return NextResponse.json({
      status: 'ok',
      stats: {
        totalCompanies,
        listedCompanies,
        rawRows,
        curatedFacts,
        companiesWithCuratedData: companiesWithData.length,
        coveragePercent: listedCompanies > 0
          ? ((companiesWithData.length / listedCompanies) * 100).toFixed(1)
          : '0',
      },
      coverageByYear: coverageByYear.map((row) => ({
        year: row.fiscalYear,
        facts: row._count.id,
      })),
      marketBreakdown: marketBreakdown.map((row) => ({
        market: marketLabels[row.corpCls || ''] || row.corpCls,
        count: row._count.corpCode,
      })),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[Admin Sync API] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
